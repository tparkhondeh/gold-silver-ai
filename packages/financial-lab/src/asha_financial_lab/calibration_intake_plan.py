"""Empty evidence collection slots, bound to the exact validated readiness chain."""

from __future__ import annotations

from typing import Any

from .calibration_readiness_report import validate_calibration_readiness_report
from .contracts import ContractViolation, canonical_json, fingerprint


CALIBRATION_INTAKE_PLAN_SCHEMA_VERSION = "asha.synthetic.calibration_intake_plan.v1"


def build_calibration_intake_plan(
    report_payload: object,
    manifest_payload: object,
    freeze_payload: object,
    evidence_payload: object,
    preflight_payload: object,
) -> dict[str, Any]:
    report = validate_calibration_readiness_report(
        report_payload, manifest_payload, freeze_payload, evidence_payload, preflight_payload
    )
    slots = [
        {
            "gateId": gate["gateId"],
            "evidenceId": item["evidenceId"],
            "ownerLabelFa": item["ownerLabelFa"],
            "state": "not_collected",
            "content": None,
        }
        for gate in report["gateReadiness"]
        for item in gate["remainingEvidence"]
    ]
    if len(slots) != 64 or len({slot["evidenceId"] for slot in slots}) != 64:
        raise ContractViolation("intake v1 requires exactly 64 unique ordered requirements")
    unsigned = {
        "schemaVersion": CALIBRATION_INTAKE_PLAN_SCHEMA_VERSION,
        "status": "synthetic_empty_intake_plan_only",
        "readinessReportId": report["reportId"],
        "slots": slots,
        "summary": {"requiredCount": len(slots), "collectedCount": 0},
        "realWorldState": "not_evaluated",
        "realDataRequestCreated": False,
        "financialUseAllowed": False,
        "executionAllowed": False,
        "parameterMutationAllowed": False,
    }
    return {**unsigned, "planId": f"ASHA_SYNTHETIC_CALIBRATION_INTAKE_{fingerprint(unsigned)}"}


def validate_calibration_intake_plan(
    payload: object,
    report_payload: object,
    manifest_payload: object,
    freeze_payload: object,
    evidence_payload: object,
    preflight_payload: object,
) -> dict[str, Any]:
    expected = build_calibration_intake_plan(
        report_payload, manifest_payload, freeze_payload, evidence_payload, preflight_payload
    )
    # Canonical comparison also rejects bool/int type confusion (False == 0 in Python).
    if not isinstance(payload, dict) or canonical_json(payload) != canonical_json(expected):
        raise ContractViolation("calibration intake plan does not exactly replay")
    return expected
