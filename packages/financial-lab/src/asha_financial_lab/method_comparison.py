"""Same-fold synthetic comparison of the proposed method and six controls."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
from functools import lru_cache
import json
import re
from typing import Any

from .cluster_order import build_train_only_cluster_leaf_order
from .comparison_weights import build_inverse_volatility_control_weights
from .contracts import ContractViolation, canonical_json, fingerprint
from .correlation import build_train_only_correlation
from .correlation_distance import build_train_only_correlation_distance
from .covariance import build_train_only_covariance
from .features import build_point_in_time_return_matrix
from .hierarchical_clustering import build_train_only_single_linkage_clustering
from .hrp_control import build_hrp_comparison_control_weights
from .minimum_cvar_control import build_minimum_cvar_comparison_control_weights
from .normalization import fit_train_only_standardizer
from .synthetic import build_reference_dataset
from .transparent_decision import (
    TRANSPARENT_DECISION_METHOD_ID,
    build_transparent_decision_reference_input,
    build_transparent_guarded_decision,
    seal_transparent_decision_input,
)
from .walk_forward import build_walk_forward_plan


METHOD_COMPARISON_SCHEMA_VERSION = "asha.synthetic.method_comparison.v1"
_REPORT_ID = re.compile(r"ASHA_METHOD_COMPARISON_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")

_CONTROL_IDS = (
    "ASHA_BENCHMARK_CASH_CONTROL_V1",
    "ASHA_BENCHMARK_EQUAL_WEIGHT_CONTROL_V1",
    "ASHA_BENCHMARK_HRP_CONTROL_V1",
    "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1",
    "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1",
    "ASHA_BENCHMARK_NO_TRADE_CONTROL_V1",
    TRANSPARENT_DECISION_METHOD_ID,
)


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _training_metrics(
    matrix: dict[str, Any], fold: dict[str, Any], instrument_id: str
) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal]:
    rows = [
        row for row in matrix["rows"]
        if max(matrix["startIndex"], fold["trainStartIndex"]) <= row["periodIndex"] <= fold["trainEndIndex"]
    ]
    returns = [
        next(Decimal(item["value"]) for item in row["returns"] if item["instrumentId"] == instrument_id)
        for row in rows
    ]
    if len(returns) < 20:
        raise ContractViolation("method comparison needs at least 20 train-only returns")

    def compounded(values: list[Decimal]) -> Decimal:
        wealth = Decimal("1")
        for item in values:
            wealth *= Decimal("1") + item
        return wealth - Decimal("1")

    recent = returns[-20:]
    mean = sum(recent) / Decimal(len(recent))
    volatility = (
        sum((item - mean) ** 2 for item in recent) / Decimal(len(recent))
    ).sqrt()
    wealth = Decimal("1")
    peak = wealth
    maximum_drawdown = Decimal("0")
    path = []
    for item in returns:
        wealth *= Decimal("1") + item
        path.append(wealth)
        peak = max(peak, wealth)
        maximum_drawdown = min(maximum_drawdown, wealth / peak - Decimal("1"))
    percentile = Decimal(sum(1 for item in path if item <= path[-1])) / Decimal(len(path))
    return compounded(recent), compounded(returns), max(volatility, Decimal("0.000001")), maximum_drawdown, percentile


def _decision_input_for_fold(
    matrix: dict[str, Any], fold: dict[str, Any]
) -> dict[str, Any]:
    base = build_transparent_decision_reference_input("short")
    unsigned = {key: value for key, value in base.items() if key != "contentFingerprint"}
    unsigned["datasetId"] = f"ASHA_SYNTHETIC_DECISION_FOLD_{fold['foldIndex']:02d}_V1"
    for asset in unsigned["assets"]:
        short, long, volatility, drawdown, percentile = _training_metrics(
            matrix, fold, asset["instrumentId"]
        )
        asset["shortTrendReturn"] = _decimal_string(short)
        asset["longTrendReturn"] = _decimal_string(long)
        asset["volatilityRate"] = _decimal_string(volatility)
        asset["maximumDrawdownRate"] = _decimal_string(drawdown)
        asset["valuationPercentile"] = _decimal_string(percentile)
    return seal_transparent_decision_input(unsigned)


def _evaluate_weights(
    matrix: dict[str, Any], fold: dict[str, Any], weights: dict[str, Decimal]
) -> dict[str, Any]:
    if set(weights) != set(matrix["instrumentIds"]) or sum(weights.values()) != Decimal("1"):
        raise ContractViolation("comparison weights must cover all instruments and sum to one")
    rows = [
        row for row in matrix["rows"]
        if fold["testStartIndex"] <= row["periodIndex"] <= fold["testEndIndex"]
    ]
    wealth = Decimal("1")
    peak = wealth
    maximum_drawdown = Decimal("0")
    for row in rows:
        returns = {item["instrumentId"]: Decimal(item["value"]) for item in row["returns"]}
        weighted_return = sum(weights[item] * returns[item] for item in matrix["instrumentIds"])
        wealth *= Decimal("1") + weighted_return
        peak = max(peak, wealth)
        maximum_drawdown = max(maximum_drawdown, (peak - wealth) / peak)
    return {
        "periodCount": len(rows),
        "cumulativeChangePercent": _decimal_string((wealth - Decimal("1")) * Decimal("100")),
        "maximumDrawdownPercent": _decimal_string(maximum_drawdown * Decimal("100")),
    }


def _artifact_weights(weight_set: dict[str, Any]) -> dict[str, Decimal]:
    return {item["instrumentId"]: Decimal(item["weight"]) for item in weight_set["weights"]}


def _fold_weight_sets(
    dataset: dict[str, Any], matrix: dict[str, Any], plan: dict[str, Any], fold: dict[str, Any]
) -> tuple[dict[str, dict[str, Decimal]], dict[str, Any]]:
    instrument_ids = matrix["instrumentIds"]
    decision_input = _decision_input_for_fold(matrix, fold)
    decision = build_transparent_guarded_decision(decision_input)
    proposed_percent = {
        item["instrumentId"]: Decimal(item["proposedWeightPercent"]) / Decimal("100")
        for item in decision["assetDecisions"]
    }
    proposed_total = sum(proposed_percent.values())
    proposed = {
        item: proposed_percent[item] / proposed_total for item in instrument_ids
    }
    proposed[instrument_ids[-1]] += Decimal("1") - sum(proposed.values())
    current = {
        asset["instrumentId"]: Decimal(asset["currentValueToman"]) / Decimal(decision_input["totalValueToman"])
        for asset in decision_input["assets"]
    }
    equal = {item: Decimal("1") / Decimal(len(instrument_ids)) for item in instrument_ids}
    cash = {item: Decimal("1") if item == "SYNTH_CASH" else Decimal("0") for item in instrument_ids}

    standardizer = fit_train_only_standardizer(dataset, matrix, plan, fold["foldIndex"])
    inverse = build_inverse_volatility_control_weights(dataset, matrix, plan, standardizer)
    covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
    correlation = build_train_only_correlation(dataset, matrix, plan, standardizer, covariance)
    distance = build_train_only_correlation_distance(
        dataset, matrix, plan, standardizer, covariance, correlation
    )
    clustering = build_train_only_single_linkage_clustering(
        dataset, matrix, plan, standardizer, covariance, correlation, distance
    )
    order = build_train_only_cluster_leaf_order(
        dataset, matrix, plan, standardizer, covariance, correlation, distance, clustering
    )
    hrp = build_hrp_comparison_control_weights(
        dataset, matrix, plan, standardizer, covariance, correlation, distance, clustering, order
    )
    minimum_cvar = build_minimum_cvar_comparison_control_weights(
        dataset, matrix, plan, fold_index=fold["foldIndex"], tail_count=5, weight_step="0.25"
    )
    return {
        "ASHA_BENCHMARK_CASH_CONTROL_V1": cash,
        "ASHA_BENCHMARK_EQUAL_WEIGHT_CONTROL_V1": equal,
        "ASHA_BENCHMARK_HRP_CONTROL_V1": _artifact_weights(hrp),
        "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1": _artifact_weights(inverse),
        "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1": _artifact_weights(minimum_cvar),
        "ASHA_BENCHMARK_NO_TRADE_CONTROL_V1": current,
        TRANSPARENT_DECISION_METHOD_ID: proposed,
    }, {
        "inputId": decision_input["datasetId"],
        "inputFingerprint": decision_input["contentFingerprint"],
        "decisionId": decision["decisionId"],
    }


def _scenario_checks() -> list[dict[str, Any]]:
    base_input = build_transparent_decision_reference_input("short")
    base = build_transparent_guarded_decision(base_input)
    long_input = build_transparent_decision_reference_input("long")
    long_result = build_transparent_guarded_decision(long_input)
    stressed_unsigned = {
        key: deepcopy(value) for key, value in base_input.items() if key != "contentFingerprint"
    }
    stressed_unsigned["datasetId"] = "ASHA_SYNTHETIC_DECISION_CRISIS_V1"
    for asset in stressed_unsigned["assets"]:
        if asset["instrumentId"] == "SYNTH_DEFENSIVE":
            asset["worstStressReturn"] = "-0.50"
    stressed_input = seal_transparent_decision_input(stressed_unsigned)
    stressed = build_transparent_guarded_decision(stressed_input)
    cheaper_unsigned = {
        key: deepcopy(value) for key, value in base_input.items() if key != "contentFingerprint"
    }
    cheaper_unsigned["datasetId"] = "ASHA_SYNTHETIC_DECISION_SENSITIVITY_V1"
    for asset in cheaper_unsigned["assets"]:
        if asset["instrumentId"] == "SYNTH_VOLATILE":
            asset["valuationPercentile"] = "0.10"
    cheaper_input = seal_transparent_decision_input(cheaper_unsigned)
    cheaper = build_transparent_guarded_decision(cheaper_input)

    def action(result: dict[str, Any], instrument_id: str) -> dict[str, str]:
        item = next(entry for entry in result["assetDecisions"] if entry["instrumentId"] == instrument_id)
        return {
            "decisionId": result["decisionId"],
            "instrumentId": instrument_id,
            "action": item["action"],
            "decisionScore": item["decisionScore"],
            "changePercentPoint": item["changePercentPoint"],
        }

    return [
        {"checkId": "BASE_SHORT", **action(base, "SYNTH_VOLATILE")},
        {"checkId": "HORIZON_LONG", **action(long_result, "SYNTH_VOLATILE")},
        {"checkId": "CRISIS_WORSENED", **action(stressed, "SYNTH_DEFENSIVE")},
        {"checkId": "VALUATION_ONE_FACTOR", **action(cheaper, "SYNTH_VOLATILE")},
    ]


def _build_unsigned() -> dict[str, Any]:
    dataset = build_reference_dataset()
    matrix = build_point_in_time_return_matrix(dataset, 2, 119)
    plan = build_walk_forward_plan(
        dataset,
        minimum_train_periods=60,
        test_periods=20,
        step_periods=20,
        purge_periods=1,
        embargo_periods=0,
        mode="rolling",
    )
    fold_results = []
    for fold in plan["folds"]:
        weight_sets, proposed_refs = _fold_weight_sets(dataset, matrix, plan, fold)
        method_results = []
        for method_id in _CONTROL_IDS:
            weights = weight_sets[method_id]
            method_results.append({
                "methodId": method_id,
                "weights": [
                    {"instrumentId": item, "weight": _decimal_string(weights[item])}
                    for item in matrix["instrumentIds"]
                ],
                "metrics": _evaluate_weights(matrix, fold, weights),
            })
        fold_results.append({
            "foldIndex": fold["foldIndex"],
            "trainStartIndex": fold["trainStartIndex"],
            "trainEndIndex": fold["trainEndIndex"],
            "testStartIndex": fold["testStartIndex"],
            "testEndIndex": fold["testEndIndex"],
            "proposedMethodReferences": proposed_refs,
            "methodResults": method_results,
        })
    return {
        "schemaVersion": METHOD_COMPARISON_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "synthetic_comparison_only",
        "datasetReference": {
            "datasetId": dataset["datasetId"],
            "version": dataset["datasetVersion"],
            "contentFingerprint": dataset["contentFingerprint"],
        },
        "returnMatrixReference": {
            "matrixId": matrix["matrixId"],
            "schemaVersion": matrix["schemaVersion"],
        },
        "walkForwardPlanReference": {
            "planId": plan["planId"],
            "schemaVersion": plan["schemaVersion"],
        },
        "selectedMethodId": TRANSPARENT_DECISION_METHOD_ID,
        "selectionBasis": "engineering_fit_only_not_synthetic_performance",
        "comparisonMethodIds": list(_CONTROL_IDS),
        "summary": {
            "foldCount": len(fold_results),
            "methodCount": len(_CONTROL_IDS),
            "aggregationPolicy": "none_fold_or_method_metrics_only",
            "rankingPolicy": "none_synthetic_performance_cannot_select",
        },
        "foldResults": fold_results,
        "scenarioAndSensitivityChecks": _scenario_checks(),
        "reasonCodes": [
            "CONTROL_AND_PROPOSAL_METRICS_KEPT_SEPARATE",
            "IRAN_VALIDATION_REQUIRED",
            "NO_AGGREGATED_PERFORMANCE_CLAIM",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


@lru_cache(maxsize=1)
def _reference_unsigned_canonical() -> str:
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        return canonical_json(_build_unsigned())


def build_method_comparison_report() -> dict[str, Any]:
    unsigned = json.loads(_reference_unsigned_canonical())
    report = {**unsigned, "reportId": f"ASHA_METHOD_COMPARISON_{fingerprint(unsigned)}"}
    return validate_method_comparison_report(report)


def validate_method_comparison_report(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ContractViolation("method comparison report must be an object")
    value = deepcopy(payload)
    report_id = value.get("reportId")
    if not isinstance(report_id, str) or not _REPORT_ID.fullmatch(report_id):
        raise ContractViolation("method comparison report ID is invalid")
    unsigned = {key: item for key, item in value.items() if key != "reportId"}
    if report_id != f"ASHA_METHOD_COMPARISON_{fingerprint(unsigned)}":
        raise ContractViolation("method comparison fingerprint mismatch")
    expected = json.loads(_reference_unsigned_canonical())
    if unsigned != expected:
        raise ContractViolation("method comparison does not match exact replay")
    return value
