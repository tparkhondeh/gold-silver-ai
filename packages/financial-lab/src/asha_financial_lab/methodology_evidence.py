"""Versioned research evidence and a no-selection methodology rubric."""

from __future__ import annotations

from copy import deepcopy
from datetime import date
import re
from typing import Any

from .contracts import ContractViolation, fingerprint


METHODOLOGY_RUBRIC_SCHEMA_VERSION = "asha.methodology.evaluation_rubric.v1"
METHODOLOGY_EVIDENCE_REGISTRY_SCHEMA_VERSION = (
    "asha.methodology.evidence_registry.v1"
)

_RUBRIC_ID = re.compile(r"ASHA_METHODOLOGY_RUBRIC_[a-f0-9]{64}\Z")
_REGISTRY_ID = re.compile(r"ASHA_METHODOLOGY_EVIDENCE_REGISTRY_[a-f0-9]{64}\Z")
_METHODOLOGY_ID = re.compile(
    r"ASHA_(?:BENCHMARK|METHOD)_[A-Z0-9_]{3,80}_V([1-9][0-9]*)\Z"
)
_SOURCE_ID = re.compile(r"ASHA_METHODOLOGY_SOURCE_[A-Z0-9_]{3,80}_V([1-9][0-9]*)\Z")
_ASSUMPTION_ID = re.compile(r"ASHA_METHOD_ASSUMPTION_[A-Z0-9_]{3,80}\Z")
_REQUIREMENT_ID = re.compile(r"[A-Z][A-Z0-9_]{2,80}\Z")
_REFERENCE_ID = re.compile(r"[A-Z][A-Za-z0-9_.:-]{2,160}\Z")

_RUBRIC_KEYS = {
    "schemaVersion", "rubricId", "status", "financialUseAllowed",
    "executionAllowed", "selectionAllowed", "methodologyApprovalState",
    "criteria", "scoringPolicy", "thresholdPolicy", "aggregationPolicy",
    "reasonCodes",
}
_CRITERION_KEYS = {
    "criterionId", "plainLanguageQuestion", "requiredEvidenceKinds",
    "iranSpecific",
}
_REGISTRY_KEYS = {
    "schemaVersion", "registryId", "registryVersion", "status",
    "financialUseAllowed", "executionAllowed", "selectionAllowed",
    "methodologyApprovalState", "rubricReference", "entries", "summary",
    "evidencePolicy", "reasonCodes",
}
_ENTRY_KEYS = {
    "methodologyId", "methodologyVersion", "displayName", "role",
    "implementationStatus", "authoritativeSources", "assumptions",
    "explainability", "dataRequirements", "iranSpecificValidation",
    "robustness", "criterionEvidence", "selectionEligibility",
}
_SOURCE_KEYS = {
    "sourceId", "sourceVersion", "sourceType", "title", "authoringBody",
    "locator", "publishedOrRevisedOn", "reviewedOn", "currencyStatus",
}
_ASSUMPTION_KEYS = {
    "assumptionId", "statement", "evidenceStatus", "sourceReferences",
}
_EXPLAINABILITY_KEYS = {
    "mechanismSummary", "requiredDisclosures", "knownFailureModes",
}
_DATA_REQUIREMENT_KEYS = {
    "requirementId", "description", "minimumEvidenceRule", "iranDataStatus",
}
_IRAN_VALIDATION_KEYS = {"status", "requiredEvidence", "gapCodes"}
_ROBUSTNESS_KEYS = {"status", "requiredChecks", "evidenceArtifactReferences"}
_CRITERION_EVIDENCE_KEYS = {
    "criterionId", "evidenceStatus", "evidenceReferences", "limitations",
}
_SUMMARY_KEYS = {
    "methodologyCount", "sourceReferenceCount", "criterionCellCount",
    "selectionEligibleCount",
}

_RUBRIC_REASON_CODES = [
    "AGGREGATE_SCORE_NOT_DEFINED",
    "IRAN_VALIDATION_REQUIRED",
    "METHODOLOGY_NOT_APPROVED",
    "OWNER_APPROVAL_REQUIRED",
    "PERFORMANCE_ALONE_INSUFFICIENT",
    "RUBRIC_PREDECLARED_BEFORE_EVALUATION",
    "WEIGHTS_AND_THRESHOLDS_NOT_DEFINED",
]
_REGISTRY_REASON_CODES = [
    "AUTHORITATIVE_SOURCE_IDENTITY_REQUIRED",
    "CURRENTNESS_REVIEW_RECORDED_NOT_VERIFIED_BY_CONTRACT",
    "IRAN_VALIDATION_REQUIRED",
    "METHODOLOGY_NOT_APPROVED",
    "NO_SCORING_RANKING_OR_SELECTION",
    "OWNER_APPROVAL_REQUIRED",
    "SYNTHETIC_PERFORMANCE_CANNOT_PROVE_SUPERIORITY",
]

_CRITERIA = [
    {
        "criterionId": "SOURCE_AUTHORITY_AND_CURRENCY",
        "plainLanguageQuestion": "آیا منبع اصلی، نسخه و تازگی بررسی آن روشن است؟",
        "requiredEvidenceKinds": ["publication_identity", "supersession_review"],
        "iranSpecific": False,
    },
    {
        "criterionId": "MATHEMATICAL_DEFINITION_AND_REPLAY",
        "plainLanguageQuestion": "آیا تعریف روش دقیق است و نتیجه عیناً تکرار می‌شود؟",
        "requiredEvidenceKinds": ["canonical_replay", "formal_definition"],
        "iranSpecific": False,
    },
    {
        "criterionId": "POINT_IN_TIME_INTEGRITY",
        "plainLanguageQuestion": "آیا روش فقط اطلاعات واقعاً در دسترس همان زمان را می‌بیند؟",
        "requiredEvidenceKinds": ["availability_proof", "future_leakage_test"],
        "iranSpecific": False,
    },
    {
        "criterionId": "DATA_SUFFICIENCY_AND_QUALITY",
        "plainLanguageQuestion": "آیا کیفیت، پوشش و مقدار داده برای این روش کافی است؟",
        "requiredEvidenceKinds": ["data_quality_report", "sample_sufficiency_rule"],
        "iranSpecific": True,
    },
    {
        "criterionId": "IRAN_SPECIFIC_VALIDATION",
        "plainLanguageQuestion": "آیا کارایی و فرض‌های روش با دادهٔ ایران جداگانه سنجیده شده است؟",
        "requiredEvidenceKinds": ["iran_dataset_reference", "iran_validation_report"],
        "iranSpecific": True,
    },
    {
        "criterionId": "OUT_OF_SAMPLE_ROBUSTNESS",
        "plainLanguageQuestion": "آیا روش در بازه‌هایی که با آن‌ها تنظیم نشده پایدار است؟",
        "requiredEvidenceKinds": ["holdout_result", "walk_forward_result"],
        "iranSpecific": True,
    },
    {
        "criterionId": "STRESS_AND_REGIME_ROBUSTNESS",
        "plainLanguageQuestion": "آیا رفتار روش در بحران‌ها و وضعیت‌های متفاوت جداگانه روشن است؟",
        "requiredEvidenceKinds": ["regime_result", "stress_result"],
        "iranSpecific": True,
    },
    {
        "criterionId": "COST_LIQUIDITY_AND_CONSTRAINTS",
        "plainLanguageQuestion": "آیا هزینه، نقدشوندگی و محدودیت‌های واقعی در آزمون لحاظ شده‌اند؟",
        "requiredEvidenceKinds": ["constraint_definition", "cost_sensitivity_result"],
        "iranSpecific": True,
    },
    {
        "criterionId": "EXPLAINABILITY_AND_AUDITABILITY",
        "plainLanguageQuestion": "آیا دلیل هر خروجی برای مالک و ممیز قابل فهم و بازسازی است؟",
        "requiredEvidenceKinds": ["decision_trace", "plain_language_explanation"],
        "iranSpecific": False,
    },
    {
        "criterionId": "FAILURE_MODES_AND_SAFE_MODE",
        "plainLanguageQuestion": "آیا شکست‌های شناخته‌شده و شرایط توقف امن مشخص‌اند؟",
        "requiredEvidenceKinds": ["failure_mode_catalog", "safe_mode_test"],
        "iranSpecific": False,
    },
]


def _exact_mapping(value: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} has unexpected fields")
    return value


def _bounded_text(value: object, label: str, maximum: int = 500) -> str:
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


def _sorted_texts(
    value: object, label: str, *, minimum: int = 1, maximum: int = 32
) -> list[str]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ContractViolation(f"{label} must be a bounded list")
    texts = [_bounded_text(item, label, 240) for item in value]
    if texts != sorted(set(texts)):
        raise ContractViolation(f"{label} must be unique and sorted")
    return texts


def _iso_date(value: object, label: str) -> date:
    text = _bounded_text(value, label, 10)
    try:
        parsed = date.fromisoformat(text)
    except ValueError as error:
        raise ContractViolation(f"{label} must be an ISO date") from error
    if parsed.isoformat() != text:
        raise ContractViolation(f"{label} must use canonical ISO date form")
    return parsed


def _rubric_unsigned() -> dict[str, Any]:
    return {
        "schemaVersion": METHODOLOGY_RUBRIC_SCHEMA_VERSION,
        "status": "research_governance_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "selectionAllowed": False,
        "methodologyApprovalState": "unapproved",
        "criteria": deepcopy(_CRITERIA),
        "scoringPolicy": "not_defined_owner_approval_required",
        "thresholdPolicy": "not_defined_owner_approval_required",
        "aggregationPolicy": "none_criterion_evidence_only",
        "reasonCodes": deepcopy(_RUBRIC_REASON_CODES),
    }


def build_methodology_evaluation_rubric() -> dict[str, Any]:
    """Build the fixed v1 rubric without scores, thresholds, ranking or selection."""

    unsigned = _rubric_unsigned()
    rubric = {
        **unsigned,
        "rubricId": f"ASHA_METHODOLOGY_RUBRIC_{fingerprint(unsigned)}",
    }
    return validate_methodology_evaluation_rubric(rubric)


def validate_methodology_evaluation_rubric(payload: object) -> dict[str, Any]:
    rubric = deepcopy(_exact_mapping(payload, _RUBRIC_KEYS, "methodology rubric"))
    if rubric["schemaVersion"] != METHODOLOGY_RUBRIC_SCHEMA_VERSION:
        raise ContractViolation("unsupported methodology-rubric schema version")
    rubric_id = rubric["rubricId"]
    if not isinstance(rubric_id, str) or not _RUBRIC_ID.fullmatch(rubric_id):
        raise ContractViolation("methodology rubric ID is invalid")
    unsigned = {key: value for key, value in rubric.items() if key != "rubricId"}
    if rubric_id != f"ASHA_METHODOLOGY_RUBRIC_{fingerprint(unsigned)}":
        raise ContractViolation("methodology rubric fingerprint mismatch")
    if unsigned != _rubric_unsigned():
        raise ContractViolation("methodology rubric cannot add scoring or alter criteria")
    return rubric


def _validate_source(payload: object, label: str) -> dict[str, Any]:
    source = _exact_mapping(payload, _SOURCE_KEYS, label)
    source_id = source["sourceId"]
    match = _SOURCE_ID.fullmatch(source_id) if isinstance(source_id, str) else None
    if match is None:
        raise ContractViolation("methodology source ID is invalid")
    version = _integer(source["sourceVersion"], "sourceVersion", 1)
    if version != int(match.group(1)):
        raise ContractViolation("source ID and version disagree")
    if source["sourceType"] not in {
        "official_method_documentation", "peer_reviewed_primary_research",
        "regulatory_or_standards_guidance",
    }:
        raise ContractViolation("methodology source type is not authoritative")
    for key in ("title", "authoringBody", "locator"):
        _bounded_text(source[key], f"source {key}")
    published = _iso_date(source["publishedOrRevisedOn"], "publishedOrRevisedOn")
    reviewed = _iso_date(source["reviewedOn"], "reviewedOn")
    if reviewed < published:
        raise ContractViolation("source review cannot precede publication")
    if source["currencyStatus"] not in {
        "current_at_review_date", "superseded", "unknown_requires_review",
    }:
        raise ContractViolation("source currency status is invalid")
    return source


def _validate_entry(
    payload: object, criterion_ids: list[str], label: str
) -> dict[str, Any]:
    entry = _exact_mapping(payload, _ENTRY_KEYS, label)
    methodology_id = entry["methodologyId"]
    match = (
        _METHODOLOGY_ID.fullmatch(methodology_id)
        if isinstance(methodology_id, str)
        else None
    )
    if match is None:
        raise ContractViolation("methodology ID is invalid")
    methodology_version = _integer(
        entry["methodologyVersion"], "methodologyVersion", 1
    )
    if methodology_version != int(match.group(1)):
        raise ContractViolation("methodology ID and version disagree")
    display_name = _bounded_text(entry["displayName"], "methodology displayName", 160)
    if not display_name.startswith("[LAB ONLY] "):
        raise ContractViolation("methodology displayName must carry the laboratory label")
    if entry["role"] not in {"comparison_control", "research_candidate"}:
        raise ContractViolation("methodology role is invalid")
    if entry["implementationStatus"] not in {
        "not_implemented", "contract_only", "comparison_control_implemented",
    }:
        raise ContractViolation("methodology implementation status is invalid")

    sources = entry["authoritativeSources"]
    if not isinstance(sources, list) or not 1 <= len(sources) <= 16:
        raise ContractViolation("methodology needs authoritative source records")
    source_ids = []
    for index, source_payload in enumerate(sources):
        source = _validate_source(source_payload, f"authoritativeSources[{index}]")
        source_ids.append(source["sourceId"])
    if source_ids != sorted(set(source_ids)):
        raise ContractViolation("methodology sources must be unique and sorted")

    assumptions = entry["assumptions"]
    if not isinstance(assumptions, list) or not 1 <= len(assumptions) <= 32:
        raise ContractViolation("methodology assumptions must be recorded")
    assumption_ids = []
    for index, assumption_payload in enumerate(assumptions):
        assumption = _exact_mapping(
            assumption_payload, _ASSUMPTION_KEYS, f"assumptions[{index}]"
        )
        assumption_id = assumption["assumptionId"]
        if not isinstance(assumption_id, str) or not _ASSUMPTION_ID.fullmatch(assumption_id):
            raise ContractViolation("methodology assumption ID is invalid")
        _bounded_text(assumption["statement"], "assumption statement")
        if assumption["evidenceStatus"] not in {
            "documented_only", "requires_iran_validation", "synthetic_mechanics_only",
        }:
            raise ContractViolation("assumption evidence status is invalid")
        references = _sorted_texts(
            assumption["sourceReferences"], "assumption sourceReferences"
        )
        if any(reference not in source_ids for reference in references):
            raise ContractViolation("assumption references an unknown source")
        assumption_ids.append(assumption_id)
    if assumption_ids != sorted(set(assumption_ids)):
        raise ContractViolation("methodology assumptions must be unique and sorted")

    explainability = _exact_mapping(
        entry["explainability"], _EXPLAINABILITY_KEYS, "explainability"
    )
    _bounded_text(explainability["mechanismSummary"], "mechanismSummary")
    _sorted_texts(explainability["requiredDisclosures"], "requiredDisclosures")
    _sorted_texts(explainability["knownFailureModes"], "knownFailureModes")

    requirements = entry["dataRequirements"]
    if not isinstance(requirements, list) or not 1 <= len(requirements) <= 32:
        raise ContractViolation("methodology data requirements must be recorded")
    requirement_ids = []
    for index, requirement_payload in enumerate(requirements):
        requirement = _exact_mapping(
            requirement_payload, _DATA_REQUIREMENT_KEYS,
            f"dataRequirements[{index}]",
        )
        requirement_id = requirement["requirementId"]
        if not isinstance(requirement_id, str) or not _REQUIREMENT_ID.fullmatch(requirement_id):
            raise ContractViolation("data requirement ID is invalid")
        _bounded_text(requirement["description"], "data requirement description")
        if requirement["minimumEvidenceRule"] != "STATUS_TBD_OWNER_APPROVAL":
            raise ContractViolation("minimum evidence rule cannot be selected yet")
        if requirement["iranDataStatus"] not in {
            "not_assessed", "not_available", "synthetic_only",
        }:
            raise ContractViolation("Iran data status is invalid")
        requirement_ids.append(requirement_id)
    if requirement_ids != sorted(set(requirement_ids)):
        raise ContractViolation("data requirements must be unique and sorted")

    iran = _exact_mapping(
        entry["iranSpecificValidation"], _IRAN_VALIDATION_KEYS,
        "iranSpecificValidation",
    )
    if iran["status"] not in {"not_started", "requirements_documented"}:
        raise ContractViolation("Iran validation cannot be claimed in this laboratory")
    _sorted_texts(iran["requiredEvidence"], "Iran requiredEvidence")
    _sorted_texts(iran["gapCodes"], "Iran gapCodes")

    robustness = _exact_mapping(entry["robustness"], _ROBUSTNESS_KEYS, "robustness")
    if robustness["status"] not in {"not_evaluated", "synthetic_mechanics_only"}:
        raise ContractViolation("robustness cannot be promoted beyond synthetic mechanics")
    _sorted_texts(robustness["requiredChecks"], "robustness requiredChecks")
    references = _sorted_texts(
        robustness["evidenceArtifactReferences"],
        "robustness evidenceArtifactReferences", minimum=0,
    )
    if any(not _REFERENCE_ID.fullmatch(reference) for reference in references):
        raise ContractViolation("robustness evidence reference is invalid")

    cells = entry["criterionEvidence"]
    if not isinstance(cells, list) or len(cells) != len(criterion_ids):
        raise ContractViolation("every rubric criterion needs one evidence cell")
    cell_ids = []
    for index, cell_payload in enumerate(cells):
        cell = _exact_mapping(
            cell_payload, _CRITERION_EVIDENCE_KEYS, f"criterionEvidence[{index}]"
        )
        if cell["criterionId"] != criterion_ids[index]:
            raise ContractViolation("criterion evidence must follow exact rubric order")
        if cell["evidenceStatus"] not in {
            "not_evaluated", "documented_only", "synthetic_mechanics_only",
        }:
            raise ContractViolation("criterion evidence status is invalid")
        refs = _sorted_texts(
            cell["evidenceReferences"], "criterion evidenceReferences", minimum=0
        )
        if any(not _REFERENCE_ID.fullmatch(reference) for reference in refs):
            raise ContractViolation("criterion evidence reference is invalid")
        _sorted_texts(cell["limitations"], "criterion limitations")
        cell_ids.append(cell["criterionId"])
    if cell_ids != criterion_ids:
        raise ContractViolation("criterion evidence coverage is incomplete")
    if entry["selectionEligibility"] != "blocked_owner_methodology_decision_required":
        raise ContractViolation("methodology selection must remain blocked")
    return entry


def _registry_unsigned(
    registry_version: int, rubric: dict[str, Any], entries: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "schemaVersion": METHODOLOGY_EVIDENCE_REGISTRY_SCHEMA_VERSION,
        "registryVersion": registry_version,
        "status": "research_governance_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "selectionAllowed": False,
        "methodologyApprovalState": "unapproved",
        "rubricReference": {
            "rubricId": rubric["rubricId"],
            "schemaVersion": rubric["schemaVersion"],
        },
        "entries": deepcopy(entries),
        "summary": {
            "methodologyCount": len(entries),
            "sourceReferenceCount": sum(
                len(entry["authoritativeSources"]) for entry in entries
            ),
            "criterionCellCount": sum(
                len(entry["criterionEvidence"]) for entry in entries
            ),
            "selectionEligibleCount": 0,
        },
        "evidencePolicy": "separate_criterion_cells_no_scoring_ranking_or_selection",
        "reasonCodes": deepcopy(_REGISTRY_REASON_CODES),
    }


def build_methodology_evidence_registry(
    registry_version: int, rubric_payload: object, entry_payloads: object
) -> dict[str, Any]:
    """Seal evidence records while keeping every methodology selection blocked."""

    version = _integer(registry_version, "registryVersion", 1)
    rubric = validate_methodology_evaluation_rubric(rubric_payload)
    if not isinstance(entry_payloads, list) or not 1 <= len(entry_payloads) <= 32:
        raise ContractViolation("methodology registry must contain between 1 and 32 entries")
    criterion_ids = [item["criterionId"] for item in rubric["criteria"]]
    entries = [
        deepcopy(_validate_entry(entry, criterion_ids, f"entries[{index}]"))
        for index, entry in enumerate(entry_payloads)
    ]
    identities = [
        (entry["methodologyId"], entry["methodologyVersion"]) for entry in entries
    ]
    if identities != sorted(set(identities)):
        raise ContractViolation("methodology entries must be unique and sorted")
    unsigned = _registry_unsigned(version, rubric, entries)
    registry = {
        **unsigned,
        "registryId": f"ASHA_METHODOLOGY_EVIDENCE_REGISTRY_{fingerprint(unsigned)}",
    }
    return validate_methodology_evidence_registry(registry, rubric)


def validate_methodology_evidence_registry(
    payload: object, rubric_payload: object
) -> dict[str, Any]:
    rubric = validate_methodology_evaluation_rubric(rubric_payload)
    registry = deepcopy(_exact_mapping(payload, _REGISTRY_KEYS, "methodology registry"))
    if registry["schemaVersion"] != METHODOLOGY_EVIDENCE_REGISTRY_SCHEMA_VERSION:
        raise ContractViolation("unsupported methodology-registry schema version")
    version = _integer(registry["registryVersion"], "registryVersion", 1)
    if not isinstance(registry["entries"], list) or not 1 <= len(registry["entries"]) <= 32:
        raise ContractViolation("methodology registry entries are invalid")
    criterion_ids = [item["criterionId"] for item in rubric["criteria"]]
    entries = [
        deepcopy(_validate_entry(entry, criterion_ids, f"entries[{index}]"))
        for index, entry in enumerate(registry["entries"])
    ]
    identities = [
        (entry["methodologyId"], entry["methodologyVersion"]) for entry in entries
    ]
    if identities != sorted(set(identities)):
        raise ContractViolation("methodology entries must be unique and sorted")
    expected = _registry_unsigned(version, rubric, entries)
    registry_id = registry["registryId"]
    if not isinstance(registry_id, str) or not _REGISTRY_ID.fullmatch(registry_id):
        raise ContractViolation("methodology registry ID is invalid")
    unsigned = {key: value for key, value in registry.items() if key != "registryId"}
    if registry_id != f"ASHA_METHODOLOGY_EVIDENCE_REGISTRY_{fingerprint(unsigned)}":
        raise ContractViolation("methodology registry fingerprint mismatch")
    if unsigned != expected:
        raise ContractViolation("methodology registry violates its no-selection contract")
    return registry
