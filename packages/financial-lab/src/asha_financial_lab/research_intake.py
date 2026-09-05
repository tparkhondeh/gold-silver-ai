"""Versioned research-candidate intake with permanent no-selection locks."""

from __future__ import annotations

from copy import deepcopy
from datetime import date
import re
from typing import Any

from .contracts import ContractViolation, fingerprint
from .methodology_evidence import build_methodology_evaluation_rubric
from .methodology_gaps import validate_methodology_evidence_gap_report


RESEARCH_CANDIDATE_INTAKE_SCHEMA_VERSION = (
    "asha.methodology.research_candidate_intake.v1"
)

_INTAKE_ID = re.compile(r"ASHA_RESEARCH_CANDIDATE_INTAKE_[a-f0-9]{64}\Z")
_CANDIDATE_ID = re.compile(
    r"ASHA_RESEARCH_CANDIDATE_[A-Z0-9_]{3,80}_V([1-9][0-9]*)\Z"
)
_SOURCE_ID = re.compile(r"ASHA_METHODOLOGY_SOURCE_[A-Z0-9_]{3,80}_V([1-9][0-9]*)\Z")
_REFERENCE_ID = re.compile(r"[A-Z][A-Za-z0-9_.:-]{2,160}\Z")

_INTAKE_KEYS = {
    "schemaVersion", "intakeId", "intakeVersion", "status",
    "financialUseAllowed", "executionAllowed", "implementationAllowed",
    "selectionAllowed", "methodologyApprovalState", "gapReportReference",
    "candidates", "summary", "intakePolicy", "reasonCodes",
}
_GAP_REFERENCE_KEYS = {"reportId", "schemaVersion"}
_CANDIDATE_KEYS = {
    "candidateId", "candidateVersion", "displayName", "researchQuestion",
    "searchRecord", "authoritativeSources", "candidateScope",
    "nonEquivalenceLimits", "criterionGaps", "implementationStatus",
    "iranFitnessStatus", "selectionEligibility",
}
_SEARCH_KEYS = {"searchedOn", "searchMethod", "searchScope", "reviewedByRole"}
_SOURCE_KEYS = {
    "sourceId", "sourceVersion", "sourceType", "title", "authoringBody",
    "locator", "publishedOrRevisedOn", "reviewedOn", "currencyStatus",
}
_SCOPE_KEYS = {"mechanismClaim", "comparisonBoundary", "excludedClaims"}
_CRITERION_GAP_KEYS = {
    "criterionId", "evidenceStatus", "evidenceReferences",
    "unresolvedRequirements",
}
_SUMMARY_KEYS = {"candidateCount", "implementedCount", "selectionEligibleCount"}

_EXCLUDED_CLAIMS = [
    "CURRENT_BEST_METHOD",
    "IRAN_FITNESS",
    "OPERATIONAL_PERFORMANCE",
    "SELECTION_OR_APPROVAL",
]
_REASON_CODES = [
    "CANDIDATE_LIST_IS_NOT_A_RANKING",
    "CURRENT_BEST_NOT_ESTABLISHED",
    "IMPLEMENTATION_NOT_AUTHORIZED",
    "IRAN_FITNESS_NOT_ESTABLISHED",
    "OWNER_METHODOLOGY_DECISION_REQUIRED",
    "PRIMARY_SOURCE_REVIEW_REQUIRED",
]


def _exact_mapping(value: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} has unexpected fields")
    return value


def _text(value: object, label: str, maximum: int = 500) -> str:
    if (
        not isinstance(value, str)
        or not 1 <= len(value) <= maximum
        or value != value.strip()
    ):
        raise ContractViolation(f"{label} must be bounded normalized text")
    return value


def _integer(value: object, label: str, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise ContractViolation(f"{label} must be an integer >= {minimum}")
    return value


def _date(value: object, label: str) -> date:
    text = _text(value, label, 10)
    try:
        parsed = date.fromisoformat(text)
    except ValueError as error:
        raise ContractViolation(f"{label} must be an ISO date") from error
    if parsed.isoformat() != text:
        raise ContractViolation(f"{label} must use canonical ISO date form")
    return parsed


def _sorted_texts(
    value: object, label: str, *, minimum: int = 1, maximum: int = 32
) -> list[str]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ContractViolation(f"{label} must be a bounded list")
    texts = [_text(item, label, 500) for item in value]
    if texts != sorted(set(texts)):
        raise ContractViolation(f"{label} must be unique and sorted")
    return texts


def _validate_source(
    payload: object, searched_on: date, label: str
) -> dict[str, Any]:
    source = _exact_mapping(payload, _SOURCE_KEYS, label)
    source_id = source["sourceId"]
    match = _SOURCE_ID.fullmatch(source_id) if isinstance(source_id, str) else None
    if match is None:
        raise ContractViolation("candidate source ID is invalid")
    version = _integer(source["sourceVersion"], "sourceVersion", 1)
    if version != int(match.group(1)):
        raise ContractViolation("candidate source ID and version disagree")
    if source["sourceType"] not in {
        "official_method_documentation", "peer_reviewed_primary_research",
        "regulatory_or_standards_guidance",
    }:
        raise ContractViolation("candidate source type is not authoritative")
    for key in ("title", "authoringBody", "locator"):
        _text(source[key], f"candidate source {key}")
    published = _date(source["publishedOrRevisedOn"], "publishedOrRevisedOn")
    reviewed = _date(source["reviewedOn"], "reviewedOn")
    if reviewed < published or reviewed < searched_on:
        raise ContractViolation("candidate source review chronology is invalid")
    if source["currencyStatus"] not in {
        "current_at_review_date", "superseded", "unknown_requires_review",
    }:
        raise ContractViolation("candidate source currency status is invalid")
    return source


def _validate_candidate(
    payload: object, criterion_ids: list[str], label: str
) -> dict[str, Any]:
    candidate = _exact_mapping(payload, _CANDIDATE_KEYS, label)
    candidate_id = candidate["candidateId"]
    match = (
        _CANDIDATE_ID.fullmatch(candidate_id)
        if isinstance(candidate_id, str)
        else None
    )
    if match is None:
        raise ContractViolation("research candidate ID is invalid")
    version = _integer(candidate["candidateVersion"], "candidateVersion", 1)
    if version != int(match.group(1)):
        raise ContractViolation("research candidate ID and version disagree")
    if not _text(candidate["displayName"], "candidate displayName", 160).startswith(
        "[RESEARCH ONLY] "
    ):
        raise ContractViolation("candidate displayName must carry the research label")
    _text(candidate["researchQuestion"], "candidate researchQuestion")

    search = _exact_mapping(candidate["searchRecord"], _SEARCH_KEYS, "searchRecord")
    searched_on = _date(search["searchedOn"], "searchedOn")
    if search["searchMethod"] != "manual_recorded_no_network_automation":
        raise ContractViolation("candidate search cannot be automated by this contract")
    _text(search["searchScope"], "searchScope")
    if search["reviewedByRole"] not in {
        "human_researcher", "human_researcher_with_ai_discovery_support",
    }:
        raise ContractViolation("candidate review role is invalid")

    sources = candidate["authoritativeSources"]
    if not isinstance(sources, list) or not 1 <= len(sources) <= 16:
        raise ContractViolation("candidate needs authoritative source records")
    source_ids = []
    currency_statuses = []
    for index, source_payload in enumerate(sources):
        source = _validate_source(
            source_payload, searched_on, f"authoritativeSources[{index}]"
        )
        source_ids.append(source["sourceId"])
        currency_statuses.append(source["currencyStatus"])
    if source_ids != sorted(set(source_ids)):
        raise ContractViolation("candidate sources must be unique and sorted")
    if all(status == "superseded" for status in currency_statuses):
        raise ContractViolation("candidate cannot rely only on superseded sources")

    scope = _exact_mapping(candidate["candidateScope"], _SCOPE_KEYS, "candidateScope")
    _text(scope["mechanismClaim"], "mechanismClaim")
    _text(scope["comparisonBoundary"], "comparisonBoundary")
    if _sorted_texts(scope["excludedClaims"], "excludedClaims") != _EXCLUDED_CLAIMS:
        raise ContractViolation("candidate scope must exclude every prohibited claim")
    _sorted_texts(candidate["nonEquivalenceLimits"], "nonEquivalenceLimits")

    cells = candidate["criterionGaps"]
    if not isinstance(cells, list) or len(cells) != len(criterion_ids):
        raise ContractViolation("candidate needs every criterion gap")
    for index, cell_payload in enumerate(cells):
        cell = _exact_mapping(
            cell_payload, _CRITERION_GAP_KEYS, f"criterionGaps[{index}]"
        )
        criterion_id = criterion_ids[index]
        if cell["criterionId"] != criterion_id:
            raise ContractViolation("candidate criterion gaps must follow rubric order")
        references = _sorted_texts(
            cell["evidenceReferences"], "criterion evidenceReferences", minimum=0
        )
        _sorted_texts(cell["unresolvedRequirements"], "unresolvedRequirements")
        if criterion_id == "SOURCE_AUTHORITY_AND_CURRENCY":
            if cell["evidenceStatus"] != "documented_only" or references != source_ids:
                raise ContractViolation("candidate source evidence must be explicit")
        elif cell["evidenceStatus"] != "not_evaluated" or references:
            raise ContractViolation("new candidate evidence must remain not evaluated")

    if candidate["implementationStatus"] != "not_implemented":
        raise ContractViolation("research intake cannot authorize implementation")
    if candidate["iranFitnessStatus"] != "not_evaluated":
        raise ContractViolation("research intake cannot claim Iranian fitness")
    if candidate["selectionEligibility"] != (
        "blocked_owner_methodology_decision_required"
    ):
        raise ContractViolation("research intake cannot enable candidate selection")
    return candidate


def _unsigned(
    intake_version: int, gap_report: dict[str, Any], candidates: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "schemaVersion": RESEARCH_CANDIDATE_INTAKE_SCHEMA_VERSION,
        "intakeVersion": intake_version,
        "status": "research_intake_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "implementationAllowed": False,
        "selectionAllowed": False,
        "methodologyApprovalState": "unapproved",
        "gapReportReference": {
            "reportId": gap_report["reportId"],
            "schemaVersion": gap_report["schemaVersion"],
        },
        "candidates": deepcopy(candidates),
        "summary": {
            "candidateCount": len(candidates),
            "implementedCount": 0,
            "selectionEligibleCount": 0,
        },
        "intakePolicy": (
            "manual_primary_source_intake_no_score_rank_selection_or_implementation"
        ),
        "reasonCodes": deepcopy(_REASON_CODES),
    }


def build_research_candidate_intake(
    intake_version: int, gap_report_payload: object, candidate_payloads: object
) -> dict[str, Any]:
    """Admit fully documented candidates to research, never to implementation."""

    version = _integer(intake_version, "intakeVersion", 1)
    gap_report = validate_methodology_evidence_gap_report(gap_report_payload)
    if not isinstance(candidate_payloads, list) or not 1 <= len(candidate_payloads) <= 32:
        raise ContractViolation("research intake needs a bounded candidate list")
    rubric = build_methodology_evaluation_rubric()
    criterion_ids = [criterion["criterionId"] for criterion in rubric["criteria"]]
    candidates = [
        deepcopy(_validate_candidate(payload, criterion_ids, f"candidates[{index}]"))
        for index, payload in enumerate(candidate_payloads)
    ]
    identities = [
        (candidate["candidateId"], candidate["candidateVersion"])
        for candidate in candidates
    ]
    if identities != sorted(set(identities)):
        raise ContractViolation("research candidates must be unique and sorted")
    unsigned = _unsigned(version, gap_report, candidates)
    return validate_research_candidate_intake(
        {
            **unsigned,
            "intakeId": f"ASHA_RESEARCH_CANDIDATE_INTAKE_{fingerprint(unsigned)}",
        },
        gap_report,
    )


def validate_research_candidate_intake(
    payload: object, gap_report_payload: object
) -> dict[str, Any]:
    gap_report = validate_methodology_evidence_gap_report(gap_report_payload)
    intake = deepcopy(_exact_mapping(payload, _INTAKE_KEYS, "research intake"))
    if intake["schemaVersion"] != RESEARCH_CANDIDATE_INTAKE_SCHEMA_VERSION:
        raise ContractViolation("unsupported research-intake schema version")
    intake_id = intake["intakeId"]
    if not isinstance(intake_id, str) or not _INTAKE_ID.fullmatch(intake_id):
        raise ContractViolation("research intake ID is invalid")
    version = _integer(intake["intakeVersion"], "intakeVersion", 1)
    unsigned = {key: value for key, value in intake.items() if key != "intakeId"}
    if intake_id != f"ASHA_RESEARCH_CANDIDATE_INTAKE_{fingerprint(unsigned)}":
        raise ContractViolation("research intake fingerprint mismatch")
    if intake["status"] != "research_intake_only":
        raise ContractViolation("research intake cannot claim operational status")
    if any(
        intake[key] is not False
        for key in (
            "financialUseAllowed", "executionAllowed", "implementationAllowed",
            "selectionAllowed",
        )
    ):
        raise ContractViolation("research intake cannot enable downstream action")
    if intake["methodologyApprovalState"] != "unapproved":
        raise ContractViolation("research intake cannot approve a methodology")
    reference = _exact_mapping(
        intake["gapReportReference"], _GAP_REFERENCE_KEYS, "gapReportReference"
    )
    if reference != {
        "reportId": gap_report["reportId"],
        "schemaVersion": gap_report["schemaVersion"],
    }:
        raise ContractViolation("research intake references a foreign gap report")

    candidates = intake["candidates"]
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 32:
        raise ContractViolation("research intake needs a bounded candidate list")
    rubric = build_methodology_evaluation_rubric()
    criterion_ids = [criterion["criterionId"] for criterion in rubric["criteria"]]
    identities = []
    for index, candidate in enumerate(candidates):
        reviewed = _validate_candidate(
            candidate, criterion_ids, f"candidates[{index}]"
        )
        identities.append((reviewed["candidateId"], reviewed["candidateVersion"]))
    if identities != sorted(set(identities)):
        raise ContractViolation("research candidates must be unique and sorted")

    summary = _exact_mapping(intake["summary"], _SUMMARY_KEYS, "intake summary")
    if summary != {
        "candidateCount": len(candidates),
        "implementedCount": 0,
        "selectionEligibleCount": 0,
    }:
        raise ContractViolation("research intake summary cannot imply advancement")
    if intake["intakePolicy"] != (
        "manual_primary_source_intake_no_score_rank_selection_or_implementation"
    ):
        raise ContractViolation("research intake policy is invalid")
    if intake["reasonCodes"] != _REASON_CODES:
        raise ContractViolation("research intake reason codes changed")
    if intake != {
        **_unsigned(version, gap_report, candidates),
        "intakeId": intake_id,
    }:
        raise ContractViolation("research intake is not exact")
    return intake
