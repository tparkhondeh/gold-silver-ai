"""Exact evidence-gap inventory for the reviewed synthetic comparison controls."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .contracts import ContractViolation, fingerprint
from .methodology_evidence import build_methodology_evaluation_rubric
from .reviewed_methodologies import (
    build_reviewed_comparison_methodology_registry,
    validate_reviewed_comparison_methodology_registry,
)


METHODOLOGY_EVIDENCE_GAP_REPORT_SCHEMA_VERSION = (
    "asha.methodology.evidence_gap_report.v1"
)
METHODOLOGY_EVIDENCE_GAP_REPORT_VERSION = 1

_REPORT_ID = re.compile(r"ASHA_METHODOLOGY_EVIDENCE_GAP_REPORT_[a-f0-9]{64}\Z")
_REPORT_KEYS = {
    "schemaVersion", "reportId", "reportVersion", "status",
    "financialUseAllowed", "executionAllowed", "selectionAllowed",
    "methodologyApprovalState", "registryReference", "methods", "summary",
    "reportPolicy", "reasonCodes",
}
_REGISTRY_REFERENCE_KEYS = {"registryId", "registryVersion", "rubricId"}
_METHOD_KEYS = {
    "methodologyId", "methodologyVersion", "displayName",
    "selectionEligibility", "sourceIdentityMeaning", "criterionGaps",
    "unresolvedDataRequirements", "iranSpecificGaps",
    "requiredRobustnessChecks", "knownFailureModes",
}
_GAP_KEYS = {
    "criterionId", "plainLanguageQuestion", "iranSpecific",
    "evidenceStatus", "evidenceReferences", "requiredEvidenceKinds",
    "unresolvedRequirements", "limitations",
}
_SUMMARY_KEYS = {
    "methodologyCount", "criterionCellCount", "completenessScoreProduced",
    "rankingProduced", "selectionProduced",
}

_STATUS_MAP = {
    "documented_only": "documented",
    "synthetic_mechanics_only": "synthetic_only",
    "not_evaluated": "not_evaluated",
}
_REASON_CODES = [
    "ALL_METHODS_REMAIN_UNAPPROVED",
    "IRAN_VALIDATION_REQUIRED",
    "NO_COMPLETENESS_SCORE",
    "NO_METHOD_RANKING",
    "NO_METHOD_SELECTION",
    "REAL_DATA_EVIDENCE_REQUIRED",
]


def _exact_mapping(value: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} has unexpected fields")
    return value


def _unresolved_requirements(
    criterion: dict[str, Any], evidence_status: str
) -> list[str]:
    if evidence_status == "documented":
        return ["DOCUMENTATION_DOES_NOT_ESTABLISH_OPERATIONAL_PERFORMANCE"]

    scope = "IRAN" if criterion["iranSpecific"] else "REAL_WORLD"
    suffix = (
        "NOT_EVALUATED" if evidence_status == "not_evaluated"
        else "VALIDATION_REQUIRED"
    )
    return sorted(
        f"{scope}_{kind.upper()}_{suffix}"
        for kind in criterion["requiredEvidenceKinds"]
    )


def _build_exact_report(registry: dict[str, Any]) -> dict[str, Any]:
    rubric = build_methodology_evaluation_rubric()
    criteria = {
        criterion["criterionId"]: criterion for criterion in rubric["criteria"]
    }
    methods = []
    for entry in registry["entries"]:
        criterion_gaps = []
        for cell in entry["criterionEvidence"]:
            criterion = criteria[cell["criterionId"]]
            status = _STATUS_MAP[cell["evidenceStatus"]]
            criterion_gaps.append({
                "criterionId": cell["criterionId"],
                "plainLanguageQuestion": criterion["plainLanguageQuestion"],
                "iranSpecific": criterion["iranSpecific"],
                "evidenceStatus": status,
                "evidenceReferences": deepcopy(cell["evidenceReferences"]),
                "requiredEvidenceKinds": deepcopy(
                    criterion["requiredEvidenceKinds"]
                ),
                "unresolvedRequirements": _unresolved_requirements(
                    criterion, status
                ),
                "limitations": deepcopy(cell["limitations"]),
            })
        methods.append({
            "methodologyId": entry["methodologyId"],
            "methodologyVersion": entry["methodologyVersion"],
            "displayName": entry["displayName"],
            "selectionEligibility": entry["selectionEligibility"],
            "sourceIdentityMeaning": (
                "documented_context_only_not_real_or_iranian_performance_evidence"
            ),
            "criterionGaps": criterion_gaps,
            "unresolvedDataRequirements": deepcopy(entry["dataRequirements"]),
            "iranSpecificGaps": deepcopy(entry["iranSpecificValidation"]),
            "requiredRobustnessChecks": deepcopy(
                entry["robustness"]["requiredChecks"]
            ),
            "knownFailureModes": deepcopy(
                entry["explainability"]["knownFailureModes"]
            ),
        })

    unsigned = {
        "schemaVersion": METHODOLOGY_EVIDENCE_GAP_REPORT_SCHEMA_VERSION,
        "reportVersion": METHODOLOGY_EVIDENCE_GAP_REPORT_VERSION,
        "status": "research_gap_inventory_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "selectionAllowed": False,
        "methodologyApprovalState": "unapproved",
        "registryReference": {
            "registryId": registry["registryId"],
            "registryVersion": registry["registryVersion"],
            "rubricId": registry["rubricReference"]["rubricId"],
        },
        "methods": methods,
        "summary": {
            "methodologyCount": len(methods),
            "criterionCellCount": sum(
                len(method["criterionGaps"]) for method in methods
            ),
            "completenessScoreProduced": False,
            "rankingProduced": False,
            "selectionProduced": False,
        },
        "reportPolicy": (
            "separate_method_and_criterion_gaps_no_score_rank_or_selection"
        ),
        "reasonCodes": deepcopy(_REASON_CODES),
    }
    return {
        **unsigned,
        "reportId": (
            f"ASHA_METHODOLOGY_EVIDENCE_GAP_REPORT_{fingerprint(unsigned)}"
        ),
    }


def _validate_structure(
    payload: object, registry: dict[str, Any]
) -> dict[str, Any]:
    report = deepcopy(_exact_mapping(payload, _REPORT_KEYS, "evidence-gap report"))
    if report["schemaVersion"] != METHODOLOGY_EVIDENCE_GAP_REPORT_SCHEMA_VERSION:
        raise ContractViolation("unsupported evidence-gap report schema version")
    if report["reportVersion"] != METHODOLOGY_EVIDENCE_GAP_REPORT_VERSION:
        raise ContractViolation("unsupported evidence-gap report version")
    report_id = report["reportId"]
    if not isinstance(report_id, str) or not _REPORT_ID.fullmatch(report_id):
        raise ContractViolation("evidence-gap report ID is invalid")
    unsigned = {key: value for key, value in report.items() if key != "reportId"}
    if report_id != f"ASHA_METHODOLOGY_EVIDENCE_GAP_REPORT_{fingerprint(unsigned)}":
        raise ContractViolation("evidence-gap report fingerprint mismatch")
    if report["status"] != "research_gap_inventory_only":
        raise ContractViolation("evidence-gap report cannot claim operational status")
    if any(
        report[key] is not False
        for key in ("financialUseAllowed", "executionAllowed", "selectionAllowed")
    ):
        raise ContractViolation("evidence-gap report cannot enable financial use")
    if report["methodologyApprovalState"] != "unapproved":
        raise ContractViolation("evidence-gap report cannot approve a methodology")

    reference = _exact_mapping(
        report["registryReference"], _REGISTRY_REFERENCE_KEYS,
        "evidence-gap registry reference",
    )
    if reference != {
        "registryId": registry["registryId"],
        "registryVersion": registry["registryVersion"],
        "rubricId": registry["rubricReference"]["rubricId"],
    }:
        raise ContractViolation("evidence-gap report references a foreign registry")

    methods = report["methods"]
    if not isinstance(methods, list) or len(methods) != len(registry["entries"]):
        raise ContractViolation("evidence-gap report methodology coverage is incomplete")
    for method in methods:
        _exact_mapping(method, _METHOD_KEYS, "evidence-gap methodology")
        cells = method["criterionGaps"]
        if not isinstance(cells, list):
            raise ContractViolation("criterion gaps must be a list")
        for cell in cells:
            _exact_mapping(cell, _GAP_KEYS, "criterion gap")
            if cell["evidenceStatus"] not in set(_STATUS_MAP.values()):
                raise ContractViolation("criterion gap status is invalid")
            if not isinstance(cell["unresolvedRequirements"], list) or not cell[
                "unresolvedRequirements"
            ]:
                raise ContractViolation("criterion gap must remain explicit")

    summary = _exact_mapping(report["summary"], _SUMMARY_KEYS, "gap summary")
    if any(
        summary[key] is not False
        for key in (
            "completenessScoreProduced", "rankingProduced", "selectionProduced"
        )
    ):
        raise ContractViolation("evidence-gap report cannot score rank or select")
    if report["reportPolicy"] != (
        "separate_method_and_criterion_gaps_no_score_rank_or_selection"
    ):
        raise ContractViolation("evidence-gap report policy is invalid")
    if report["reasonCodes"] != _REASON_CODES:
        raise ContractViolation("evidence-gap report reason codes changed")
    return report


def build_methodology_evidence_gap_report(
    registry_payload: object | None = None,
) -> dict[str, Any]:
    """List exact open evidence without scoring, ranking or selecting a method."""

    registry = (
        build_reviewed_comparison_methodology_registry()
        if registry_payload is None
        else validate_reviewed_comparison_methodology_registry(registry_payload)
    )
    return _validate_structure(_build_exact_report(registry), registry)


def validate_methodology_evidence_gap_report(payload: object) -> dict[str, Any]:
    registry = build_reviewed_comparison_methodology_registry()
    report = _validate_structure(payload, registry)
    if report != _build_exact_report(registry):
        raise ContractViolation("reviewed methodology evidence-gap report is not exact")
    return report
