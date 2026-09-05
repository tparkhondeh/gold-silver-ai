"""Reviewed primary-source records for the three synthetic comparison controls."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .comparison_weights import INVERSE_VOLATILITY_CONTROL_ID
from .contracts import ContractViolation
from .hrp_control import HRP_CONTROL_ID
from .methodology_evidence import (
    build_methodology_evaluation_rubric,
    build_methodology_evidence_registry,
    validate_methodology_evidence_registry,
)
from .minimum_cvar_control import MINIMUM_CVAR_CONTROL_ID


REVIEWED_COMPARISON_REGISTRY_VERSION = 1
REVIEWED_ON = "2026-09-05"

_HRP_REPORT_ID = (
    "ASHA_STRESS_WALK_FORWARD_REPORT_"
    "8d747ea614c5c775d51d0ef40dc2224eacfe387afe683110e850eab3a4c7e87b"
)
_INVERSE_VOLATILITY_REPORT_ID = (
    "ASHA_STRESS_WALK_FORWARD_REPORT_"
    "9ce0d5f2718b210c6306c0a86cc9596128b9c278703ae6486d25966996669c40"
)
_MINIMUM_CVAR_REPORT_ID = (
    "ASHA_STRESS_WALK_FORWARD_REPORT_"
    "b2f15ee0be0a2394a7434f769bd0d777a2d77563a736d8c18aac71a003830d4a"
)


def _source(
    source_id: str,
    title: str,
    authoring_body: str,
    locator: str,
    published_or_revised_on: str,
) -> dict[str, Any]:
    return {
        "sourceId": source_id,
        "sourceVersion": 1,
        "sourceType": "peer_reviewed_primary_research",
        "title": title,
        "authoringBody": authoring_body,
        "locator": locator,
        "publishedOrRevisedOn": published_or_revised_on,
        "reviewedOn": REVIEWED_ON,
        "currencyStatus": "current_at_review_date",
    }


def _criterion_cells(
    criterion_ids: list[str], source_id: str, artifact_id: str,
    method_limitation: str,
) -> list[dict[str, Any]]:
    no_real_data = {
        "DATA_SUFFICIENCY_AND_QUALITY": (
            "Minimum licensed Iranian sample and quality rules remain owner-approved TBD"
        ),
        "IRAN_SPECIFIC_VALIDATION": (
            "No licensed Iranian history has been admitted to the laboratory"
        ),
        "COST_LIQUIDITY_AND_CONSTRAINTS": (
            "Real Iranian costs liquidity and owner constraints have not been evaluated"
        ),
    }
    cells = []
    for criterion_id in criterion_ids:
        if criterion_id in no_real_data:
            cells.append({
                "criterionId": criterion_id,
                "evidenceStatus": "not_evaluated",
                "evidenceReferences": [],
                "limitations": [no_real_data[criterion_id]],
            })
        elif criterion_id == "SOURCE_AUTHORITY_AND_CURRENCY":
            cells.append({
                "criterionId": criterion_id,
                "evidenceStatus": "documented_only",
                "evidenceReferences": [source_id],
                "limitations": [
                    "Source identity was reviewed but newer alternatives were not ranked"
                ],
            })
        elif criterion_id == "EXPLAINABILITY_AND_AUDITABILITY":
            cells.append({
                "criterionId": criterion_id,
                "evidenceStatus": "documented_only",
                "evidenceReferences": sorted([source_id, artifact_id]),
                "limitations": [method_limitation],
            })
        else:
            cells.append({
                "criterionId": criterion_id,
                "evidenceStatus": "synthetic_mechanics_only",
                "evidenceReferences": [artifact_id],
                "limitations": [
                    "Synthetic replay proves mechanics only not real financial performance"
                ],
            })
    return cells


def _entry(
    *, methodology_id: str, display_name: str, source: dict[str, Any],
    artifact_id: str, assumptions: list[dict[str, Any]],
    mechanism_summary: str, required_disclosures: list[str],
    known_failure_modes: list[str], data_requirements: list[dict[str, Any]],
    method_limitation: str, criterion_ids: list[str],
) -> dict[str, Any]:
    return {
        "methodologyId": methodology_id,
        "methodologyVersion": 1,
        "displayName": f"[LAB ONLY] {display_name}",
        "role": "comparison_control",
        "implementationStatus": "comparison_control_implemented",
        "authoritativeSources": [deepcopy(source)],
        "assumptions": deepcopy(assumptions),
        "explainability": {
            "mechanismSummary": mechanism_summary,
            "requiredDisclosures": sorted(required_disclosures),
            "knownFailureModes": sorted(known_failure_modes),
        },
        "dataRequirements": deepcopy(data_requirements),
        "iranSpecificValidation": {
            "status": "requirements_documented",
            "requiredEvidence": [
                "Licensed Iranian point-in-time history",
                "Separate Iranian out-of-sample validation",
            ],
            "gapCodes": [
                "IRAN_CALIBRATION_NOT_STARTED",
                "IRAN_HISTORY_NOT_AUTHORIZED",
            ],
        },
        "robustness": {
            "status": "synthetic_mechanics_only",
            "requiredChecks": [
                "Point-in-time walk-forward evaluation",
                "Separate stress and regime evaluation",
            ],
            "evidenceArtifactReferences": [artifact_id],
        },
        "criterionEvidence": _criterion_cells(
            criterion_ids, source["sourceId"], artifact_id, method_limitation
        ),
        "selectionEligibility": "blocked_owner_methodology_decision_required",
    }


def _reviewed_entries(criterion_ids: list[str]) -> list[dict[str, Any]]:
    hrp_source = _source(
        "ASHA_METHODOLOGY_SOURCE_LOPEZ_DE_PRADO_HRP_V1",
        "Building Diversified Portfolios that Outperform Out-of-Sample",
        "Marcos Lopez de Prado / The Journal of Portfolio Management",
        "https://doi.org/10.3905/jpm.2016.42.4.059",
        "2016-05-24",
    )
    inverse_source = _source(
        "ASHA_METHODOLOGY_SOURCE_MAILLARD_RONCALLI_TEILETCHE_ERC_V1",
        "The Properties of Equally Weighted Risk Contribution Portfolios",
        "Sebastien Maillard, Thierry Roncalli and Jerome Teiletche / The Journal of Portfolio Management",
        "https://doi.org/10.3905/jpm.2010.36.4.060",
        "2010-07-31",
    )
    cvar_source = _source(
        "ASHA_METHODOLOGY_SOURCE_ROCKAFELLAR_URYASEV_CVAR_V1",
        "Optimization of Conditional Value-at-Risk",
        "R. Tyrrell Rockafellar and Stanislav Uryasev / The Journal of Risk",
        "https://doi.org/10.21314/JOR.2000.038",
        "2000-01-01",
    )

    entries = [
        _entry(
            methodology_id=HRP_CONTROL_ID,
            display_name="HRP-style comparison control",
            source=hrp_source,
            artifact_id=_HRP_REPORT_ID,
            assumptions=[
                {
                    "assumptionId": "ASHA_METHOD_ASSUMPTION_HRP_CLUSTER_STRUCTURE",
                    "statement": "Training dependence structure contains useful hierarchical information",
                    "evidenceStatus": "requires_iran_validation",
                    "sourceReferences": [hrp_source["sourceId"]],
                },
                {
                    "assumptionId": "ASHA_METHOD_ASSUMPTION_HRP_COVARIANCE_STABILITY",
                    "statement": "Training covariance estimates remain informative during the test interval",
                    "evidenceStatus": "synthetic_mechanics_only",
                    "sourceReferences": [hrp_source["sourceId"]],
                },
            ],
            mechanism_summary=(
                "Clusters train-only dependence then allocates by deterministic recursive bisection"
            ),
            required_disclosures=[
                "Clustering linkage and tie rules",
                "Covariance estimation window and exclusions",
                "No real financial use is allowed",
            ],
            known_failure_modes=[
                "Cluster order may be unstable under small data changes",
                "Covariance estimates may not persist out of sample",
                "Synthetic results may not transfer to Iran",
            ],
            data_requirements=[
                {
                    "requirementId": "HRP_POINT_IN_TIME_RETURN_HISTORY",
                    "description": "Licensed synchronized Iranian return history with availability times",
                    "minimumEvidenceRule": "STATUS_TBD_OWNER_APPROVAL",
                    "iranDataStatus": "not_available",
                },
            ],
            method_limitation=(
                "The laboratory uses one explicit HRP-style linkage and bisection variant not every published extension"
            ),
            criterion_ids=criterion_ids,
        ),
        _entry(
            methodology_id=INVERSE_VOLATILITY_CONTROL_ID,
            display_name="inverse-volatility comparison control",
            source=inverse_source,
            artifact_id=_INVERSE_VOLATILITY_REPORT_ID,
            assumptions=[
                {
                    "assumptionId": "ASHA_METHOD_ASSUMPTION_INVERSE_VOLATILITY_CORRELATION_OMISSION",
                    "statement": "Standalone volatility is used while cross-asset correlations are ignored",
                    "evidenceStatus": "requires_iran_validation",
                    "sourceReferences": [inverse_source["sourceId"]],
                },
                {
                    "assumptionId": "ASHA_METHOD_ASSUMPTION_INVERSE_VOLATILITY_STABILITY",
                    "statement": "Training volatility ordering remains informative during the test interval",
                    "evidenceStatus": "synthetic_mechanics_only",
                    "sourceReferences": [inverse_source["sourceId"]],
                },
            ],
            mechanism_summary=(
                "Assigns normalized weights inverse to train-only standalone volatility"
            ),
            required_disclosures=[
                "Correlation is deliberately ignored",
                "No real financial use is allowed",
                "Volatility estimation window and zero-variance exclusions",
            ],
            known_failure_modes=[
                "Correlation shifts can invalidate standalone-risk balance",
                "Low measured volatility can reflect stale or illiquid prices",
                "Synthetic results may not transfer to Iran",
            ],
            data_requirements=[
                {
                    "requirementId": "INVERSE_VOLATILITY_POINT_IN_TIME_RETURN_HISTORY",
                    "description": "Licensed Iranian return history with staleness and liquidity evidence",
                    "minimumEvidenceRule": "STATUS_TBD_OWNER_APPROVAL",
                    "iranDataStatus": "not_available",
                },
            ],
            method_limitation=(
                "Inverse volatility is a standalone-risk heuristic and is not full equal risk contribution when correlations differ"
            ),
            criterion_ids=criterion_ids,
        ),
        _entry(
            methodology_id=MINIMUM_CVAR_CONTROL_ID,
            display_name="minimum-CVaR grid comparison control",
            source=cvar_source,
            artifact_id=_MINIMUM_CVAR_REPORT_ID,
            assumptions=[
                {
                    "assumptionId": "ASHA_METHOD_ASSUMPTION_CVAR_GRID_RESOLUTION",
                    "statement": "The declared finite weight grid is adequate only for a mechanics comparison",
                    "evidenceStatus": "synthetic_mechanics_only",
                    "sourceReferences": [cvar_source["sourceId"]],
                },
                {
                    "assumptionId": "ASHA_METHOD_ASSUMPTION_CVAR_TAIL_REPRESENTATION",
                    "statement": "Training tail scenarios are informative about later downside behavior",
                    "evidenceStatus": "requires_iran_validation",
                    "sourceReferences": [cvar_source["sourceId"]],
                },
            ],
            mechanism_summary=(
                "Searches a declared bounded weight grid for minimum average training-tail loss"
            ),
            required_disclosures=[
                "Grid step and candidate count",
                "No real financial use is allowed",
                "Tail scenario count and loss definition",
            ],
            known_failure_modes=[
                "Coarse grids can miss better feasible weights",
                "Small tail samples can produce unstable estimates",
                "Synthetic results may not transfer to Iran",
            ],
            data_requirements=[
                {
                    "requirementId": "CVAR_POINT_IN_TIME_TAIL_HISTORY",
                    "description": "Licensed Iranian history sufficient for separately governed tail estimation",
                    "minimumEvidenceRule": "STATUS_TBD_OWNER_APPROVAL",
                    "iranDataStatus": "not_available",
                },
            ],
            method_limitation=(
                "The bounded discrete grid tests CVaR mechanics and is not the full continuous optimizer from the paper"
            ),
            criterion_ids=criterion_ids,
        ),
    ]
    return sorted(entries, key=lambda item: (item["methodologyId"], item["methodologyVersion"]))


def build_reviewed_comparison_methodology_registry() -> dict[str, Any]:
    """Build exact research records without ranking or approving a method."""

    rubric = build_methodology_evaluation_rubric()
    criterion_ids = [item["criterionId"] for item in rubric["criteria"]]
    return build_methodology_evidence_registry(
        REVIEWED_COMPARISON_REGISTRY_VERSION,
        rubric,
        _reviewed_entries(criterion_ids),
    )


def validate_reviewed_comparison_methodology_registry(
    payload: object,
) -> dict[str, Any]:
    rubric = build_methodology_evaluation_rubric()
    registry = validate_methodology_evidence_registry(payload, rubric)
    expected = build_reviewed_comparison_methodology_registry()
    if registry != expected:
        raise ContractViolation("reviewed comparison-methodology registry is not exact")
    return registry
