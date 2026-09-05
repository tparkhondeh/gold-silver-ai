"""Dated, evidence-linked engineering-fit selection for the synthetic laboratory."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import re
from typing import Any

from .contracts import ContractViolation, fingerprint
from .transparent_decision import TRANSPARENT_DECISION_METHOD_ID


METHODOLOGY_SELECTION_SCHEMA_VERSION = "asha.synthetic.methodology_selection.v1"
METHODOLOGY_SELECTION_REVIEWED_ON = "2026-09-05"
_SELECTION_ID = re.compile(r"ASHA_METHODOLOGY_SELECTION_[a-f0-9]{64}\Z")

_CRITERIA = (
    ("AUTHORITATIVE_SOURCE_SUPPORT", "Primary or official source support"),
    ("EXPLAINABILITY", "Plain-language trace from inputs to action"),
    ("DETERMINISTIC_REPLAY", "Exact reproducible calculation"),
    ("DATA_PARSIMONY", "Can be evaluated without a large estimation sample"),
    ("ESTIMATION_ROBUSTNESS", "Avoids unstable mean/covariance inversion"),
    ("OVERFIT_RESISTANCE", "Limits tunable parameters and selection bias"),
    ("TRANSACTION_COST_AWARENESS", "Makes turnover and conversion costs explicit"),
    ("CONSTRAINT_SUPPORT", "Supports cash, concentration and turnover limits"),
    ("COMPUTATIONAL_SIMPLICITY", "Low-cost inspectable implementation"),
    ("IRAN_RECALIBRATION_VISIBILITY", "Makes local-market assumptions and gaps visible"),
)


def _source(
    source_id: str, title: str, authors: str, venue: str, year: int, locator: str,
    source_type: str, assumption: str, limitation: str,
) -> dict[str, Any]:
    return {
        "sourceId": source_id,
        "title": title,
        "authorsOrInstitution": authors,
        "venue": venue,
        "year": year,
        "locator": locator,
        "sourceType": source_type,
        "reviewedOn": METHODOLOGY_SELECTION_REVIEWED_ON,
        "assumption": assumption,
        "limitation": limitation,
    }


def _sources() -> list[dict[str, Any]]:
    return [
        _source(
            "AMIHUD_ILLIQUIDITY_2002",
            "Illiquidity and stock returns: cross-section and time-series effects",
            "Yakov Amihud", "Journal of Financial Markets", 2002,
            "https://doi.org/10.1016/S1386-4181(01)00024-6",
            "peer_reviewed_primary_research",
            "Price impact can proxy liquidity when richer microstructure data are unavailable.",
            "NYSE evidence and dollar volume do not establish a calibrated Iranian measure.",
        ),
        _source(
            "BAILEY_BACKTEST_OVERFITTING_2016",
            "The probability of backtest overfitting",
            "David H. Bailey, Jonathan M. Borwein, Marcos Lopez de Prado, Qiji Jim Zhu",
            "Journal of Computational Finance", 2016,
            "https://doi.org/10.21314/JCF.2016.322",
            "peer_reviewed_primary_research",
            "Repeated strategy selection can turn a backtest into an overfit selection exercise.",
            "Synthetic mechanics cannot estimate real probability of backtest overfitting.",
        ),
        _source(
            "BIS_MARKET_RISK_2019",
            "Minimum capital requirements for market risk",
            "Basel Committee on Banking Supervision", "Bank for International Settlements", 2019,
            "https://www.bis.org/bcbs/publ/d457.htm",
            "official_standard",
            "Expected shortfall and liquidity horizons are relevant to stressed loss measurement.",
            "A bank capital standard is not a personal-portfolio threshold or Iranian calibration.",
        ),
        _source(
            "BLANCHET_WASSERSTEIN_MV_2022",
            "Distributionally Robust Mean-Variance Portfolio Selection with Wasserstein Distances",
            "Jose Blanchet, Lin Chen, Xun Yu Zhou", "Management Science", 2022,
            "https://doi.org/10.1287/mnsc.2021.4155",
            "peer_reviewed_primary_research",
            "An ambiguity set can make distributional uncertainty explicit.",
            "Ambiguity radius, return target and constraints require data-dependent selection.",
        ),
        _source(
            "BOYD_MULTI_PERIOD_TRADING_2017",
            "Multi-Period Trading via Convex Optimization",
            "Stephen Boyd, Enzo Busseti, Steven Diamond, Ronald Kahn, Kwangmoo Koh, Peter Nystrup, Jan Speth",
            "Foundations and Trends in Optimization", 2017,
            "https://stanford.edu/~boyd/papers/cvx_portfolio.html",
            "peer_reviewed_primary_research",
            "Return, risk, transaction and holding costs can be represented in one constrained process.",
            "The framework depends on forecasts it does not itself provide.",
        ),
        _source(
            "COSTA_KWON_GENERALIZED_RISK_PARITY_2020",
            "Generalized risk parity portfolio optimization: an ADMM approach",
            "Giorgio Costa, Roy H. Kwon", "Journal of Global Optimization", 2020,
            "https://doi.org/10.1007/s10898-020-00915-x",
            "peer_reviewed_primary_research",
            "Risk dispersion, return and uncertainty can be optimized jointly.",
            "Non-convex relaxation and parameter choices reduce transparency for the first owner-facing method.",
        ),
        _source(
            "DEMIGUEL_NAIVE_DIVERSIFICATION_2009",
            "Optimal Versus Naive Diversification: How Inefficient is the 1/N Portfolio Strategy?",
            "Victor DeMiguel, Lorenzo Garlappi, Raman Uppal",
            "Review of Financial Studies", 2009,
            "https://doi.org/10.1093/rfs/hhm075",
            "peer_reviewed_primary_research",
            "Simple equal weighting is a necessary benchmark against estimation-heavy allocation.",
            "The foreign datasets and asset universes do not establish Iranian performance.",
        ),
        _source(
            "LEDOIT_WOLF_SHRINKAGE_2004",
            "A well-conditioned estimator for large-dimensional covariance matrices",
            "Olivier Ledoit, Michael Wolf", "Journal of Multivariate Analysis", 2004,
            "https://doi.org/10.1016/S0047-259X(03)00096-4",
            "peer_reviewed_primary_research",
            "Shrinkage can reduce covariance-conditioning and estimation problems.",
            "The current small synthetic universe does not prove a shrinkage benefit.",
        ),
        _source(
            "KIM_TSE_WALD_TSMOM_CRITIQUE_2016",
            "Time series momentum and volatility scaling",
            "Abby Y. Kim, Yiuman Tse, John K. Wald", "Journal of Financial Markets", 2016,
            "https://doi.org/10.1016/j.finmar.2016.05.003",
            "peer_reviewed_primary_research",
            "Volatility scaling can materially affect apparent time-series-momentum results.",
            "International futures evidence does not quantify an Iranian trend signal.",
        ),
        _source(
            "LOPEZ_DE_PRADO_HRP_2016",
            "Building Diversified Portfolios that Outperform Out-of-Sample",
            "Marcos Lopez de Prado", "Journal of Portfolio Management", 2016,
            "https://doi.org/10.3905/jpm.2016.42.4.059",
            "peer_reviewed_primary_research",
            "Hierarchical allocation can avoid direct covariance inversion.",
            "Clustering, distance and bisection variants still require local validation.",
        ),
        _source(
            "MAILLARD_RONCALLI_TEILETCHE_ERC_2010",
            "The Properties of Equally Weighted Risk Contribution Portfolios",
            "Sebastien Maillard, Thierry Roncalli, Jerome Teiletche",
            "Journal of Portfolio Management", 2010,
            "https://doi.org/10.3905/jpm.2010.36.4.060",
            "peer_reviewed_primary_research",
            "Risk contributions provide a comparison to capital-only weighting.",
            "Inverse volatility is not full equal-risk contribution when correlations differ.",
        ),
        _source(
            "MOREIRA_MUIR_VOLATILITY_MANAGED_2017",
            "Volatility-Managed Portfolios",
            "Alan Moreira, Tyler Muir", "Journal of Finance", 2017,
            "https://doi.org/10.1111/jofi.12513",
            "peer_reviewed_primary_research",
            "Reducing exposure in high-volatility periods is a testable risk-control hypothesis.",
            "Foreign factor evidence cannot set a volatility rule for Iranian assets.",
        ),
        _source(
            "MOSKOWITZ_OOI_PEDERSEN_TSMOM_2012",
            "Time Series Momentum",
            "Tobias J. Moskowitz, Yao Hua Ooi, Lasse Heje Pedersen",
            "Journal of Financial Economics", 2012,
            "https://doi.org/10.1016/j.jfineco.2011.11.003",
            "peer_reviewed_primary_research",
            "An asset's own past return can define a transparent trend input.",
            "Futures evidence is contested and does not establish Iranian predictability.",
        ),
        _source(
            "HUANG_LI_WANG_ZHOU_TSMOM_CRITIQUE_2020",
            "Time series momentum: Is it there?",
            "Dashan Huang, Jiangyuan Li, Liyao Wang, Guofu Zhou", "Journal of Financial Economics", 2020,
            "https://doi.org/10.1016/j.jfineco.2019.08.004",
            "peer_reviewed_primary_research",
            "A fixed past-return rule must be tested against plausible nulls and alternative constructions.",
            "The critique does not prove that every locally calibrated trend feature is useless.",
        ),
        _source(
            "RAFFINOT_HCAA_2018",
            "Hierarchical Clustering-Based Asset Allocation",
            "Thomas Raffinot", "Journal of Portfolio Management", 2018,
            "https://doi.org/10.3905/jpm.2018.44.2.089",
            "peer_reviewed_primary_research",
            "Within-cluster and across-cluster allocation can be separated.",
            "The mechanism is not equivalent to the laboratory's existing HRP control.",
        ),
        _source(
            "ROCKAFELLAR_URYASEV_CVAR_2000",
            "Optimization of Conditional Value-at-Risk",
            "R. Tyrrell Rockafellar, Stanislav Uryasev", "Journal of Risk", 2000,
            "https://doi.org/10.21314/JOR.2000.038",
            "peer_reviewed_primary_research",
            "Average tail loss can be represented and optimized explicitly.",
            "Tail probability, sample size and optimization constraints require calibration.",
        ),
        _source(
            "SALAS_MOLINA_NIN_FAST_HRP_2026",
            "Fast hierarchical risk parity methods for portfolio selection",
            "Francisco Salas-Molina, Jordi Nin", "Annals of Operations Research", 2026,
            "https://doi.org/10.1007/s10479-026-07149-2",
            "peer_reviewed_primary_research",
            "Correlation ranking can reduce HRP computation in very large universes.",
            "Its reported speed motivation is not material for this project's small universe.",
        ),
        _source(
            "TRUCIOS_HIERARCHICAL_COMPARISON_2026",
            "Hierarchical risk clustering versus traditional risk-based portfolios: an empirical out-of-sample comparison",
            "Carlos Trucios", "Empirical Economics", 2026,
            "https://doi.org/10.1007/s00181-026-02900-x",
            "peer_reviewed_primary_research",
            "Modern hierarchical methods still require out-of-sample comparison to traditional controls.",
            "Recent foreign-market evidence remains non-transferable to Iran without testing.",
        ),
    ]


_SCORES = {
    "ASHA_BENCHMARK_EQUAL_WEIGHT_CONTROL_V1": (2, 2, 2, 2, 2, 2, 0, 1, 2, 1),
    "ASHA_BENCHMARK_HRP_CONTROL_V1": (2, 1, 2, 1, 1, 1, 0, 1, 1, 1),
    "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1": (2, 2, 2, 2, 1, 2, 0, 1, 2, 1),
    "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1": (2, 1, 2, 0, 0, 0, 1, 2, 0, 1),
    "ASHA_RESEARCH_CANDIDATE_FAST_HRP_V1": (2, 1, 2, 1, 1, 1, 0, 1, 2, 1),
    "ASHA_RESEARCH_CANDIDATE_GENERALIZED_RISK_PARITY_V1": (2, 1, 2, 0, 1, 0, 1, 2, 0, 1),
    "ASHA_RESEARCH_CANDIDATE_HCAA_V1": (2, 1, 2, 1, 1, 1, 0, 1, 1, 1),
    "ASHA_RESEARCH_CANDIDATE_WASSERSTEIN_ROBUST_MV_V1": (2, 0, 2, 0, 1, 1, 1, 2, 0, 1),
    TRANSPARENT_DECISION_METHOD_ID: (1, 2, 2, 2, 2, 2, 2, 2, 2, 2),
}

_CANDIDATE_DETAILS = {
    "ASHA_BENCHMARK_EQUAL_WEIGHT_CONTROL_V1": (
        "Equal weight 1/N", ["DEMIGUEL_NAIVE_DIVERSIFICATION_2009"],
        ["Very transparent", "Low estimation burden"],
        ["Ignores valuation, risk differences and conversion cost"],
    ),
    "ASHA_BENCHMARK_HRP_CONTROL_V1": (
        "Hierarchical risk parity", ["LOPEZ_DE_PRADO_HRP_2016", "TRUCIOS_HIERARCHICAL_COMPARISON_2026"],
        ["Avoids covariance inversion", "Captures correlation structure"],
        ["Tree choices add complexity", "No native transaction-cost decision rule"],
    ),
    "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1": (
        "Inverse volatility", ["MAILLARD_RONCALLI_TEILETCHE_ERC_2010", "MOREIRA_MUIR_VOLATILITY_MANAGED_2017"],
        ["Simple risk scaling", "Low computation"],
        ["Ignores correlation", "No native valuation or transaction-cost rule"],
    ),
    "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1": (
        "Minimum CVaR", ["ROCKAFELLAR_URYASEV_CVAR_2000", "BIS_MARKET_RISK_2019"],
        ["Explicit tail-loss objective", "Supports constraints"],
        ["Tail and grid choices need substantial data", "Can overfit limited history"],
    ),
    "ASHA_RESEARCH_CANDIDATE_FAST_HRP_V1": (
        "Fast HRP", ["SALAS_MOLINA_NIN_FAST_HRP_2026"],
        ["Recent primary research", "Lower large-universe computation"],
        ["Speed benefit is immaterial for a small universe", "Not yet implemented here"],
    ),
    "ASHA_RESEARCH_CANDIDATE_GENERALIZED_RISK_PARITY_V1": (
        "Generalized risk parity", ["COSTA_KWON_GENERALIZED_RISK_PARITY_2020"],
        ["Joint return-risk formulation", "Supports uncertainty and bounds"],
        ["More parameters and solver complexity", "Expected-return input is fragile"],
    ),
    "ASHA_RESEARCH_CANDIDATE_HCAA_V1": (
        "HCAA", ["RAFFINOT_HCAA_2018"],
        ["Separates within- and across-cluster allocation"],
        ["Clustering choices need validation", "No native cost-aware action rule"],
    ),
    "ASHA_RESEARCH_CANDIDATE_WASSERSTEIN_ROBUST_MV_V1": (
        "Wasserstein robust mean-variance", ["BLANCHET_WASSERSTEIN_MV_2022"],
        ["Makes distribution uncertainty explicit", "Supports robust constraints"],
        ["Ambiguity radius is data-dependent", "Harder to explain and reproduce without a solver"],
    ),
    TRANSPARENT_DECISION_METHOD_ID: (
        "Transparent guarded factor-to-target", [
            "AMIHUD_ILLIQUIDITY_2002", "BAILEY_BACKTEST_OVERFITTING_2016",
            "BIS_MARKET_RISK_2019", "BOYD_MULTI_PERIOD_TRADING_2017",
            "DEMIGUEL_NAIVE_DIVERSIFICATION_2009", "MOREIRA_MUIR_VOLATILITY_MANAGED_2017",
            "MOSKOWITZ_OOI_PEDERSEN_TSMOM_2012", "KIM_TSE_WALD_TSMOM_CRITIQUE_2016",
            "HUANG_LI_WANG_ZHOU_TSMOM_CRITIQUE_2020",
        ],
        ["Eight equally weighted visible factors", "Explicit cash, cap, turnover and no-trade rules"],
        ["Composite is a new synthesis", "Every band and weight needs Iranian validation"],
    ),
}


def _build_unsigned() -> dict[str, Any]:
    criteria = [
        {"criterionId": criterion_id, "weight": "0.100000", "description": description}
        for criterion_id, description in _CRITERIA
    ]
    candidates = []
    for method_id in sorted(_SCORES):
        display_name, source_ids, strengths, limitations = _CANDIDATE_DETAILS[method_id]
        scores = _SCORES[method_id]
        total = sum(Decimal(score) * Decimal("0.1") for score in scores)
        candidates.append({
            "methodId": method_id,
            "displayName": display_name,
            "sourceIds": sorted(source_ids),
            "criterionScores": [
                {"criterionId": criterion_id, "score": score}
                for (criterion_id, _), score in zip(_CRITERIA, scores, strict=True)
            ],
            "engineeringFitScore": f"{total:.6f}",
            "strengths": strengths,
            "limitations": limitations,
            "iranCalibrationStatus": "not_evaluated",
            "financialPerformanceStatus": "not_evaluated",
        })
    return {
        "schemaVersion": METHODOLOGY_SELECTION_SCHEMA_VERSION,
        "status": "laboratory_selection_only",
        "reviewedOn": METHODOLOGY_SELECTION_REVIEWED_ON,
        "financialUseAllowed": False,
        "executionAllowed": False,
        "comparisonPurpose": "engineering_fit_not_financial_performance",
        "scoreScale": {"minimum": 0, "maximum": 2, "meaning": "poor_partial_strong_engineering_fit"},
        "criteria": criteria,
        "sources": _sources(),
        "candidates": candidates,
        "selectedMethodId": TRANSPARENT_DECISION_METHOD_ID,
        "selectionState": "owner_authorized_laboratory_proposal",
        "selectionRationale": [
            "HIGHEST_EQUAL_WEIGHT_ENGINEERING_FIT_SCORE",
            "NO_EXPECTED_RETURN_OR_COVARIANCE_INVERSION_REQUIRED",
            "OWNER_PRIORITY_EXPLAINABILITY_AND_EXACT_AMOUNTS",
            "TRANSACTION_COST_AND_PORTFOLIO_CONSTRAINTS_EXPLICIT",
        ],
        "rejectedClaims": [
            "BEST_FINANCIAL_PERFORMANCE",
            "CURRENT_BEST_METHOD_IN_LITERATURE",
            "FIT_FOR_IRAN",
            "PRODUCTION_APPROVAL",
        ],
    }


def build_methodology_selection_record() -> dict[str, Any]:
    unsigned = _build_unsigned()
    record = {
        **unsigned,
        "selectionId": f"ASHA_METHODOLOGY_SELECTION_{fingerprint(unsigned)}",
    }
    return validate_methodology_selection_record(record)


def validate_methodology_selection_record(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ContractViolation("methodology selection must be an object")
    value = deepcopy(payload)
    selection_id = value.get("selectionId")
    if not isinstance(selection_id, str) or not _SELECTION_ID.fullmatch(selection_id):
        raise ContractViolation("methodology selection ID is invalid")
    unsigned = {key: item for key, item in value.items() if key != "selectionId"}
    if selection_id != f"ASHA_METHODOLOGY_SELECTION_{fingerprint(unsigned)}":
        raise ContractViolation("methodology selection fingerprint mismatch")
    expected = _build_unsigned()
    if unsigned != expected:
        raise ContractViolation("methodology selection does not match the reviewed record")
    return value
