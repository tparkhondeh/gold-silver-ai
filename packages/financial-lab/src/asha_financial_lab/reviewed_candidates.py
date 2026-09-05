"""Exact, dated candidate-discovery catalog with no implementation or selection."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .contracts import ContractViolation
from .methodology_evidence import build_methodology_evaluation_rubric
from .methodology_gaps import build_methodology_evidence_gap_report
from .research_intake import (
    build_research_candidate_intake,
    validate_research_candidate_intake,
)


REVIEWED_CANDIDATE_CATALOG_VERSION = 1
REVIEWED_CANDIDATE_SEARCHED_ON = "2026-09-05"


def _source(
    source_id: str,
    title: str,
    authoring_body: str,
    locator: str,
    published_on: str,
) -> dict[str, Any]:
    return {
        "sourceId": source_id,
        "sourceVersion": 1,
        "sourceType": "peer_reviewed_primary_research",
        "title": title,
        "authoringBody": authoring_body,
        "locator": locator,
        "publishedOrRevisedOn": published_on,
        "reviewedOn": REVIEWED_CANDIDATE_SEARCHED_ON,
        "currencyStatus": "unknown_requires_review",
    }


def _criterion_gaps(source_id: str) -> list[dict[str, Any]]:
    rubric = build_methodology_evaluation_rubric()
    cells = []
    for criterion in rubric["criteria"]:
        criterion_id = criterion["criterionId"]
        is_source = criterion_id == "SOURCE_AUTHORITY_AND_CURRENCY"
        cells.append({
            "criterionId": criterion_id,
            "evidenceStatus": "documented_only" if is_source else "not_evaluated",
            "evidenceReferences": [source_id] if is_source else [],
            "unresolvedRequirements": [
                "POST_REVIEW_DATE_SUPERSESSION_MONITORING_REQUIRED"
                if is_source else f"{criterion_id}_EVIDENCE_NOT_EVALUATED"
            ],
        })
    return cells


def _candidate(
    *, candidate_id: str, display_name: str, research_question: str,
    source: dict[str, Any], mechanism_claim: str, comparison_boundary: str,
    non_equivalence_limits: list[str],
) -> dict[str, Any]:
    return {
        "candidateId": candidate_id,
        "candidateVersion": 1,
        "displayName": f"[RESEARCH ONLY] {display_name}",
        "researchQuestion": research_question,
        "searchRecord": {
            "searchedOn": REVIEWED_CANDIDATE_SEARCHED_ON,
            "searchMethod": "manual_recorded_no_network_automation",
            "searchScope": (
                "Bounded primary-literature review of portfolio allocation methods published from 2017 through 2026"
            ),
            "reviewedByRole": "human_researcher_with_ai_discovery_support",
        },
        "authoritativeSources": [deepcopy(source)],
        "candidateScope": {
            "mechanismClaim": mechanism_claim,
            "comparisonBoundary": comparison_boundary,
            "excludedClaims": [
                "CURRENT_BEST_METHOD",
                "IRAN_FITNESS",
                "OPERATIONAL_PERFORMANCE",
                "SELECTION_OR_APPROVAL",
            ],
        },
        "nonEquivalenceLimits": sorted(non_equivalence_limits),
        "criterionGaps": _criterion_gaps(source["sourceId"]),
        "implementationStatus": "not_implemented",
        "iranFitnessStatus": "not_evaluated",
        "selectionEligibility": "blocked_owner_methodology_decision_required",
    }


def _reviewed_candidates() -> list[dict[str, Any]]:
    hcaa = _source(
        "ASHA_METHODOLOGY_SOURCE_RAFFINOT_HCAA_V1",
        "Hierarchical Clustering-Based Asset Allocation",
        "Thomas Raffinot / The Journal of Portfolio Management",
        "https://doi.org/10.3905/jpm.2018.44.2.089",
        "2017-12-22",
    )
    generalized_risk_parity = _source(
        "ASHA_METHODOLOGY_SOURCE_COSTA_KWON_GENERALIZED_RISK_PARITY_V1",
        "Generalized risk parity portfolio optimization: an ADMM approach",
        "Giorgio Costa and Roy H. Kwon / Journal of Global Optimization",
        "https://doi.org/10.1007/s10898-020-00915-x",
        "2020-06-19",
    )
    robust_mean_variance = _source(
        "ASHA_METHODOLOGY_SOURCE_BLANCHET_CHEN_ZHOU_WASSERSTEIN_MV_V1",
        "Distributionally Robust Mean-Variance Portfolio Selection with Wasserstein Distances",
        "Jose Blanchet, Lin Chen and Xun Yu Zhou / Management Science",
        "https://doi.org/10.1287/mnsc.2021.4155",
        "2021-12-30",
    )
    fast_hrp = _source(
        "ASHA_METHODOLOGY_SOURCE_SALAS_MOLINA_NIN_FAST_HRP_V1",
        "Fast hierarchical risk parity methods for portfolio selection",
        "Francisco Salas-Molina and Jordi Nin / Annals of Operations Research",
        "https://doi.org/10.1007/s10479-026-07149-2",
        "2026-03-09",
    )

    candidates = [
        _candidate(
            candidate_id="ASHA_RESEARCH_CANDIDATE_FAST_HRP_V1",
            display_name="fast hierarchical risk parity",
            research_question=(
                "Could correlation-based ordering reduce HRP computation without weakening a later governed comparison?"
            ),
            source=fast_hrp,
            mechanism_claim=(
                "Replaces hierarchical clustering with correlation-based asset ranking before HRP-style allocation"
            ),
            comparison_boundary=(
                "Computational mechanics only after a separate implementation gate"
            ),
            non_equivalence_limits=[
                "Correlation-based ranking is not the existing single-linkage HRP control",
                "Reported efficiency motivation may not be material for this project's small asset universe",
            ],
        ),
        _candidate(
            candidate_id="ASHA_RESEARCH_CANDIDATE_GENERALIZED_RISK_PARITY_V1",
            display_name="generalized risk parity with ADMM",
            research_question=(
                "Could bounded risk dispersion and explicit uncertainty broaden a later risk-budget comparison?"
            ),
            source=generalized_risk_parity,
            mechanism_claim=(
                "Combines return and risk objectives with bounded risk dispersion and an uncertainty set"
            ),
            comparison_boundary=(
                "Requires separate governance of expected returns risk bounds uncertainty and short-selling constraints"
            ),
            non_equivalence_limits=[
                "ADMM and non-convex relaxation mechanics are not implemented in the laboratory",
                "Generalized risk parity is not inverse volatility or full equal-risk contribution",
            ],
        ),
        _candidate(
            candidate_id="ASHA_RESEARCH_CANDIDATE_HCAA_V1",
            display_name="hierarchical clustering-based asset allocation",
            research_question=(
                "Could explicit within-cluster and across-cluster allocation merit a later synthetic comparison?"
            ),
            source=hcaa,
            mechanism_claim=(
                "Builds hierarchical clusters then allocates capital within and across cluster levels"
            ),
            comparison_boundary=(
                "Clustering and allocation mechanics only after a separate implementation gate"
            ),
            non_equivalence_limits=[
                "HCAA cluster selection and allocation are not the existing ordered-half HRP control",
                "Published foreign-market evidence cannot establish Iranian suitability",
            ],
        ),
        _candidate(
            candidate_id="ASHA_RESEARCH_CANDIDATE_WASSERSTEIN_ROBUST_MV_V1",
            display_name="Wasserstein distributionally robust mean-variance",
            research_question=(
                "Could an explicit distributional-uncertainty set merit a later robust-allocation comparison?"
            ),
            source=robust_mean_variance,
            mechanism_claim=(
                "Places a Wasserstein ambiguity set around empirical returns and regularizes mean-variance selection"
            ),
            comparison_boundary=(
                "Requires separate governance of target return ambiguity radius constraints and estimation procedure"
            ),
            non_equivalence_limits=[
                "Mean-variance ambiguity optimization is not the existing minimum-CVaR grid control",
                "Published United States equity evidence cannot establish Iranian suitability",
            ],
        ),
    ]
    return sorted(
        candidates, key=lambda item: (item["candidateId"], item["candidateVersion"])
    )


def build_reviewed_candidate_discovery_catalog() -> dict[str, Any]:
    """Build the exact bounded catalog without ranking or advancing candidates."""

    return build_research_candidate_intake(
        REVIEWED_CANDIDATE_CATALOG_VERSION,
        build_methodology_evidence_gap_report(),
        _reviewed_candidates(),
    )


def validate_reviewed_candidate_discovery_catalog(payload: object) -> dict[str, Any]:
    gap_report = build_methodology_evidence_gap_report()
    catalog = validate_research_candidate_intake(payload, gap_report)
    expected = build_reviewed_candidate_discovery_catalog()
    if catalog != expected:
        raise ContractViolation("reviewed candidate-discovery catalog is not exact")
    return catalog
