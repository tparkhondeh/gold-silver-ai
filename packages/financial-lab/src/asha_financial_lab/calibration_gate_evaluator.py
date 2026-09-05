"""Deterministic gate mechanics over explicitly synthetic calibration evidence."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .contracts import ContractViolation, fingerprint
from .iran_calibration_manifest import validate_iran_calibration_manifest


CALIBRATION_EVIDENCE_SCHEMA_VERSION = "asha.synthetic.calibration_gate_evidence.v1"
CALIBRATION_GATE_RESULT_SCHEMA_VERSION = "asha.synthetic.calibration_gate_result.v1"
_BUNDLE_ID = re.compile(r"ASHA_SYNTHETIC_CALIBRATION_EVIDENCE_[a-f0-9]{64}\Z")
_RESULT_ID = re.compile(r"ASHA_SYNTHETIC_CALIBRATION_GATE_RESULT_[a-f0-9]{64}\Z")
_SYNTHETIC_EVIDENCE_ID = re.compile(r"ASHA_SYNTHETIC_GATE_EVIDENCE_[A-Z0-9_]{3,180}_V1\Z")

_REQUIRED_CHECK_IDS = {
    "G01_SYNTHETIC_REAL_ISOLATION": (
        "DATASET_BOUNDARY_DECLARED",
        "SYNTHETIC_AND_REAL_NAMESPACES_SEPARATED",
    ),
    "G02_LICENSE_AND_PROVENANCE": (
        "LICENSE_REFERENCE_PRESENT",
        "SOURCE_CONTRACT_LINEAGE_COMPLETE",
    ),
    "G03_POINT_IN_TIME_INTEGRITY": (
        "AVAILABLE_AT_CUTOFF_ENFORCED",
        "FUTURE_INFORMATION_EXCLUDED",
    ),
    "G04_HISTORY_AND_COVERAGE": (
        "FACTOR_COVERAGE_FLOORS_MET",
        "MINIMUM_VALID_OBSERVATIONS_MET",
    ),
    "G05_IRAN_MARKET_EVIDENCE": (
        "ALL_IRAN_SPECIFIC_CHECKS_EVIDENCED",
        "REGIME_AND_CRISIS_LABELS_COMPLETE",
    ),
    "G06_TRAIN_VALIDATION_TEST_ISOLATION": (
        "CHRONOLOGICAL_SPLITS_NON_OVERLAPPING",
        "PURGE_AND_EMBARGO_ENFORCED",
    ),
    "G07_PARAMETER_FREEZE": (
        "ACCEPTANCE_THRESHOLDS_PREDECLARED",
        "PARAMETER_BUNDLE_FINGERPRINTED_BEFORE_TEST",
    ),
    "G08_OUT_OF_SAMPLE_REPLAY": (
        "REQUIRED_WALK_FORWARD_FOLDS_COMPLETE",
        "UNTOUCHED_TEST_REPLAY_EXACT",
    ),
    "G09_PREDECLARED_ACCEPTANCE": (
        "ALL_PREDECLARED_THRESHOLDS_EVALUATED",
        "NO_POST_TEST_THRESHOLD_CHANGES",
    ),
    "G10_SHADOW_AND_OWNER_APPROVAL": (
        "OWNER_ADR_PRESENT",
        "SHADOW_REVIEW_COMPLETE",
    ),
}

_BOUNDARY = {
    "datasetKind": "synthetic_gate_evidence_fixture",
    "containsMarketObservations": False,
    "containsProviderCredentials": False,
    "realDataIngestionAllowed": False,
    "financialUseAllowed": False,
    "executionAllowed": False,
}

_BUNDLE_KEYS = {
    "schemaVersion", "bundleId", "scenarioId", "manifestReference", "boundary",
    "gateEvidence",
}
_RESULT_KEYS = {
    "schemaVersion", "resultId", "status", "manifestReference", "evidenceReference",
    "financialUseAllowed", "executionAllowed", "parameterMutationAllowed",
    "gateResults", "summary",
}


def _exact_mapping(value: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} has unexpected fields")
    return value


def _manifest_reference(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "manifestId": manifest["manifestId"],
        "manifestVersion": manifest["manifestVersion"],
        "schemaVersion": manifest["schemaVersion"],
    }


def _synthetic_evidence_id(gate_id: str, check_id: str) -> str:
    return f"ASHA_SYNTHETIC_GATE_EVIDENCE_{gate_id}_{check_id}_V1"


def build_synthetic_calibration_evidence(
    manifest_payload: object,
    scenario_id: str = "ALL_SYNTHETIC_CHECKS_SATISFIED",
) -> dict[str, Any]:
    """Build a mechanics fixture; no state means that a real gate has passed."""

    manifest = validate_iran_calibration_manifest(manifest_payload)
    if scenario_id not in {
        "ALL_SYNTHETIC_CHECKS_SATISFIED",
        "FAILED_POINT_IN_TIME_CHECK",
        "MISSING_HISTORY_CHECK",
    }:
        raise ContractViolation("unsupported synthetic calibration-evidence scenario")

    state_overrides = {
        "FAILED_POINT_IN_TIME_CHECK": {
            ("G03_POINT_IN_TIME_INTEGRITY", "AVAILABLE_AT_CUTOFF_ENFORCED"): "failed",
        },
        "MISSING_HISTORY_CHECK": {
            ("G04_HISTORY_AND_COVERAGE", "MINIMUM_VALID_OBSERVATIONS_MET"): "missing",
        },
    }.get(scenario_id, {})
    gate_evidence = []
    for gate in manifest["validationGates"]:
        gate_id = gate["gateId"]
        checks = []
        for check_id in _REQUIRED_CHECK_IDS[gate_id]:
            state = state_overrides.get((gate_id, check_id), "satisfied")
            checks.append({
                "checkId": check_id,
                "state": state,
                "syntheticEvidenceId": (
                    None if state == "missing" else _synthetic_evidence_id(gate_id, check_id)
                ),
            })
        gate_evidence.append({"gateId": gate_id, "checks": checks})

    unsigned = {
        "schemaVersion": CALIBRATION_EVIDENCE_SCHEMA_VERSION,
        "scenarioId": scenario_id,
        "manifestReference": _manifest_reference(manifest),
        "boundary": deepcopy(_BOUNDARY),
        "gateEvidence": gate_evidence,
    }
    bundle = {
        **unsigned,
        "bundleId": f"ASHA_SYNTHETIC_CALIBRATION_EVIDENCE_{fingerprint(unsigned)}",
    }
    return validate_synthetic_calibration_evidence(bundle, manifest)


def validate_synthetic_calibration_evidence(
    payload: object,
    manifest_payload: object,
) -> dict[str, Any]:
    manifest = validate_iran_calibration_manifest(manifest_payload)
    bundle = deepcopy(_exact_mapping(payload, _BUNDLE_KEYS, "calibration evidence bundle"))
    if (
        bundle["schemaVersion"] != CALIBRATION_EVIDENCE_SCHEMA_VERSION
        or not isinstance(bundle["bundleId"], str)
        or not _BUNDLE_ID.fullmatch(bundle["bundleId"])
        or not isinstance(bundle["scenarioId"], str)
        or not re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}", bundle["scenarioId"])
        or bundle["manifestReference"] != _manifest_reference(manifest)
        or bundle["boundary"] != _BOUNDARY
    ):
        raise ContractViolation("synthetic calibration evidence identity or boundary is invalid")

    gate_evidence = bundle["gateEvidence"]
    manifest_gate_ids = [gate["gateId"] for gate in manifest["validationGates"]]
    if (
        not isinstance(gate_evidence, list)
        or [item.get("gateId") for item in gate_evidence if isinstance(item, dict)]
        != manifest_gate_ids
        or set(manifest_gate_ids) != set(_REQUIRED_CHECK_IDS)
    ):
        raise ContractViolation("evidence must cover every manifest gate in declared order")
    for entry in gate_evidence:
        gate = _exact_mapping(entry, {"gateId", "checks"}, "gateEvidence")
        checks = gate["checks"]
        expected_ids = list(_REQUIRED_CHECK_IDS[gate["gateId"]])
        if (
            not isinstance(checks, list)
            or [item.get("checkId") for item in checks if isinstance(item, dict)] != expected_ids
        ):
            raise ContractViolation("gate evidence must cover exact check IDs in order")
        for item in checks:
            check = _exact_mapping(
                item,
                {"checkId", "state", "syntheticEvidenceId"},
                "gate evidence check",
            )
            if check["state"] not in {"satisfied", "failed", "missing"}:
                raise ContractViolation("synthetic evidence check state is invalid")
            expected_id = _synthetic_evidence_id(gate["gateId"], check["checkId"])
            if check["state"] == "missing":
                if check["syntheticEvidenceId"] is not None:
                    raise ContractViolation("missing evidence cannot carry a reference")
            elif (
                check["syntheticEvidenceId"] != expected_id
                or not _SYNTHETIC_EVIDENCE_ID.fullmatch(check["syntheticEvidenceId"])
            ):
                raise ContractViolation("gate evidence must use the exact synthetic namespace")

    unsigned = {key: value for key, value in bundle.items() if key != "bundleId"}
    if bundle["bundleId"] != f"ASHA_SYNTHETIC_CALIBRATION_EVIDENCE_{fingerprint(unsigned)}":
        raise ContractViolation("synthetic calibration evidence fingerprint mismatch")
    return bundle


def _unsigned_result(bundle: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    prior_blocking_gate_id: str | None = None
    results = []
    for gate in bundle["gateEvidence"]:
        failed = [item["checkId"] for item in gate["checks"] if item["state"] == "failed"]
        missing = [item["checkId"] for item in gate["checks"] if item["state"] == "missing"]
        if failed:
            evidence_state = "failed"
        elif missing:
            evidence_state = "missing"
        else:
            evidence_state = "satisfied"

        if prior_blocking_gate_id is not None:
            mechanical_state = "blocked"
            reason_codes = ["PRIOR_GATE_NOT_PASSED"]
        elif failed:
            mechanical_state = "failed"
            reason_codes = ["SYNTHETIC_CHECK_FAILED"]
            prior_blocking_gate_id = gate["gateId"]
        elif missing:
            mechanical_state = "blocked"
            reason_codes = ["SYNTHETIC_EVIDENCE_MISSING"]
            prior_blocking_gate_id = gate["gateId"]
        else:
            mechanical_state = "passed"
            reason_codes = ["SYNTHETIC_MECHANICS_CHECKS_SATISFIED"]
        results.append({
            "gateId": gate["gateId"],
            "evidenceState": evidence_state,
            "mechanicalState": mechanical_state,
            "failedCheckIds": failed,
            "missingCheckIds": missing,
            "reasonCodes": reason_codes,
            "realWorldState": "not_evaluated",
        })

    pass_count = sum(item["mechanicalState"] == "passed" for item in results)
    has_failure = any(item["mechanicalState"] == "failed" for item in results)
    overall = "passed" if pass_count == len(results) else "failed" if has_failure else "blocked"
    return {
        "schemaVersion": CALIBRATION_GATE_RESULT_SCHEMA_VERSION,
        "status": "synthetic_gate_mechanics_only",
        "manifestReference": _manifest_reference(manifest),
        "evidenceReference": {
            "bundleId": bundle["bundleId"],
            "schemaVersion": bundle["schemaVersion"],
        },
        "financialUseAllowed": False,
        "executionAllowed": False,
        "parameterMutationAllowed": False,
        "gateResults": results,
        "summary": {
            "mechanicalState": overall,
            "passedGateCount": pass_count,
            "totalGateCount": len(results),
            "firstBlockingGateId": prior_blocking_gate_id,
            "realCalibrationState": "not_evaluated",
            "promotionState": "blocked_in_synthetic_evaluator",
            "reasonCodes": [
                "REAL_IRAN_EVIDENCE_NOT_EVALUATED",
                "SYNTHETIC_RESULTS_CANNOT_AUTHORIZE_FINANCIAL_USE",
                "LATER_OWNER_ADR_REQUIRED",
            ],
        },
    }


def evaluate_synthetic_calibration_evidence(
    evidence_payload: object,
    manifest_payload: object,
) -> dict[str, Any]:
    manifest = validate_iran_calibration_manifest(manifest_payload)
    bundle = validate_synthetic_calibration_evidence(evidence_payload, manifest)
    unsigned = _unsigned_result(bundle, manifest)
    result = {
        **unsigned,
        "resultId": f"ASHA_SYNTHETIC_CALIBRATION_GATE_RESULT_{fingerprint(unsigned)}",
    }
    return validate_calibration_gate_result(result, bundle, manifest)


def validate_calibration_gate_result(
    payload: object,
    evidence_payload: object,
    manifest_payload: object,
) -> dict[str, Any]:
    manifest = validate_iran_calibration_manifest(manifest_payload)
    bundle = validate_synthetic_calibration_evidence(evidence_payload, manifest)
    result = deepcopy(_exact_mapping(payload, _RESULT_KEYS, "calibration gate result"))
    if (
        result["schemaVersion"] != CALIBRATION_GATE_RESULT_SCHEMA_VERSION
        or not isinstance(result["resultId"], str)
        or not _RESULT_ID.fullmatch(result["resultId"])
    ):
        raise ContractViolation("calibration gate-result identity is invalid")
    expected_unsigned = _unsigned_result(bundle, manifest)
    expected = {
        **expected_unsigned,
        "resultId": f"ASHA_SYNTHETIC_CALIBRATION_GATE_RESULT_{fingerprint(expected_unsigned)}",
    }
    if result != expected:
        raise ContractViolation("calibration gate result does not exactly replay")
    return result
