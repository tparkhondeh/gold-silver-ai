"""Freeze-aware synthetic preflight for calibration gate G07."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .calibration_gate_evaluator import (
    evaluate_synthetic_calibration_evidence,
    validate_synthetic_calibration_evidence,
)
from .contracts import ContractViolation, fingerprint
from .iran_calibration_manifest import validate_iran_calibration_manifest
from .parameter_freeze import validate_parameter_freeze_bundle


CALIBRATION_PREFLIGHT_SCHEMA_VERSION = "asha.synthetic.calibration_preflight.v1"
_PREFLIGHT_ID = re.compile(r"ASHA_SYNTHETIC_CALIBRATION_PREFLIGHT_[a-f0-9]{64}\Z")
_G07_ID = "G07_PARAMETER_FREEZE"

_TOP_KEYS = {
    "schemaVersion", "preflightId", "status", "manifestReference",
    "freezeReference", "evidenceReference", "gateEvaluationReference",
    "checks", "summary", "financialUseAllowed", "executionAllowed",
    "parameterMutationAllowed",
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


def _state_reason(state: str, passed: str, failed: str, blocked: str) -> list[str]:
    return [passed if state == "passed" else failed if state == "failed" else blocked]


def _unsigned_preflight(
    freeze: dict[str, Any],
    evidence: dict[str, Any],
    gate_result: dict[str, Any],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    g07_result = next(item for item in gate_result["gateResults"] if item["gateId"] == _G07_ID)

    evidence_state = g07_result["evidenceState"]
    evidence_check_state = (
        "passed" if evidence_state == "satisfied"
        else "failed" if evidence_state == "failed"
        else "blocked"
    )
    g07_state = g07_result["mechanicalState"]

    checks = [
        {
            "checkId": "EXACT_PARAMETER_FREEZE_REPLAYS",
            "state": "passed",
            "reasonCodes": ["CANONICAL_FREEZE_IDENTITY_CONFIRMED"],
        },
        {
            "checkId": "FREEZE_PRECEDES_EVALUATION_LINKS",
            "state": "passed",
            "reasonCodes": ["NO_EVIDENCE_OR_TEST_RESULT_LINKS_IN_FREEZE"],
        },
        {
            "checkId": "FREEZE_NOT_OUTCOME_DERIVED",
            "state": "passed",
            "reasonCodes": ["SYNTHETIC_OUTCOMES_DID_NOT_SET_PARAMETERS"],
        },
        {
            "checkId": "REAL_THRESHOLDS_REMAIN_UNSET",
            "state": "passed",
            "reasonCodes": ["ALL_REAL_ACCEPTANCE_VALUES_AND_UNITS_ARE_NULL"],
        },
        {
            "checkId": "REAL_STRESS_VALUES_REMAIN_UNSET",
            "state": "passed",
            "reasonCodes": ["ALL_REAL_STRESS_MAGNITUDES_AND_PROBABILITIES_ARE_NULL"],
        },
        {
            "checkId": "G07_EVIDENCE_CHECKS_SATISFIED",
            "state": evidence_check_state,
            "reasonCodes": _state_reason(
                evidence_check_state,
                "BOTH_SYNTHETIC_G07_CHECKS_SATISFIED",
                "SYNTHETIC_G07_CHECK_FAILED",
                "SYNTHETIC_G07_EVIDENCE_MISSING",
            ),
        },
        {
            "checkId": "G07_DEPENDENCY_ORDER_PASSED",
            "state": g07_state,
            "reasonCodes": _state_reason(
                g07_state,
                "G07_SYNTHETIC_MECHANICS_PASSED_IN_ORDER",
                "G07_SYNTHETIC_MECHANICS_FAILED",
                "G07_BLOCKED_BY_MISSING_OR_PRIOR_GATE",
            ),
        },
    ]

    preflight_state = (
        "failed" if any(item["state"] == "failed" for item in checks)
        else "blocked" if any(item["state"] == "blocked" for item in checks)
        else "passed"
    )
    return {
        "schemaVersion": CALIBRATION_PREFLIGHT_SCHEMA_VERSION,
        "status": "synthetic_parameter_freeze_preflight_only",
        "manifestReference": _manifest_reference(manifest),
        "freezeReference": {
            "bundleId": freeze["bundleId"],
            "bundleVersion": freeze["bundleVersion"],
            "schemaVersion": freeze["schemaVersion"],
        },
        "evidenceReference": {
            "bundleId": evidence["bundleId"],
            "scenarioId": evidence["scenarioId"],
            "schemaVersion": evidence["schemaVersion"],
        },
        "gateEvaluationReference": {
            "resultId": gate_result["resultId"],
            "schemaVersion": gate_result["schemaVersion"],
        },
        "checks": checks,
        "summary": {
            "preflightMechanicalState": preflight_state,
            "freezeMechanicalState": "passed",
            "g07EvidenceState": evidence_state,
            "g07MechanicalState": g07_state,
            "g07RealWorldState": "not_evaluated",
            "linkedGateEvaluationState": gate_result["summary"]["mechanicalState"],
            "firstBlockingGateId": gate_result["summary"]["firstBlockingGateId"],
            "realCalibrationState": "not_evaluated",
            "promotionState": "blocked_in_synthetic_preflight",
            "reasonCodes": [
                "SYNTHETIC_PREFLIGHT_IS_NOT_IRAN_VALIDATION",
                "REAL_IRAN_THRESHOLDS_REMAIN_UNSET",
                "SYNTHETIC_RESULTS_CANNOT_AUTHORIZE_FINANCIAL_USE",
                "LATER_REAL_EVIDENCE_AND_OWNER_ADR_REQUIRED",
            ],
        },
        "financialUseAllowed": False,
        "executionAllowed": False,
        "parameterMutationAllowed": False,
    }


def build_synthetic_calibration_preflight(
    freeze_payload: object,
    evidence_payload: object,
    manifest_payload: object,
) -> dict[str, Any]:
    """Link the exact freeze to G07 without promoting any real-world state."""

    manifest = validate_iran_calibration_manifest(manifest_payload)
    freeze = validate_parameter_freeze_bundle(freeze_payload, manifest)
    evidence = validate_synthetic_calibration_evidence(evidence_payload, manifest)
    gate_result = evaluate_synthetic_calibration_evidence(evidence, manifest)
    unsigned = _unsigned_preflight(freeze, evidence, gate_result, manifest)
    preflight = {
        **unsigned,
        "preflightId": f"ASHA_SYNTHETIC_CALIBRATION_PREFLIGHT_{fingerprint(unsigned)}",
    }
    return validate_synthetic_calibration_preflight(
        preflight, freeze, evidence, manifest
    )


def validate_synthetic_calibration_preflight(
    payload: object,
    freeze_payload: object,
    evidence_payload: object,
    manifest_payload: object,
) -> dict[str, Any]:
    manifest = validate_iran_calibration_manifest(manifest_payload)
    freeze = validate_parameter_freeze_bundle(freeze_payload, manifest)
    evidence = validate_synthetic_calibration_evidence(evidence_payload, manifest)
    gate_result = evaluate_synthetic_calibration_evidence(evidence, manifest)
    preflight = deepcopy(_exact_mapping(payload, _TOP_KEYS, "calibration preflight"))
    if (
        preflight["schemaVersion"] != CALIBRATION_PREFLIGHT_SCHEMA_VERSION
        or not isinstance(preflight["preflightId"], str)
        or not _PREFLIGHT_ID.fullmatch(preflight["preflightId"])
    ):
        raise ContractViolation("calibration-preflight identity is invalid")

    expected_unsigned = _unsigned_preflight(freeze, evidence, gate_result, manifest)
    expected = {
        **expected_unsigned,
        "preflightId": (
            f"ASHA_SYNTHETIC_CALIBRATION_PREFLIGHT_{fingerprint(expected_unsigned)}"
        ),
    }
    if preflight != expected:
        raise ContractViolation("calibration preflight does not exactly replay")
    return preflight
