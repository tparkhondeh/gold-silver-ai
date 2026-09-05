"""Evaluate reviewed frozen comparison weights under explicit synthetic shocks."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .comparison_weights import (
    INVERSE_VOLATILITY_CONTROL_ID,
    validate_inverse_volatility_control_weights,
)
from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .features import validate_point_in_time_return_matrix
from .hrp_control import HRP_CONTROL_ID, validate_hrp_comparison_control_weights
from .minimum_cvar_control import (
    MINIMUM_CVAR_CONTROL_ID,
    validate_minimum_cvar_comparison_control_weights,
)
from .normalization import validate_train_only_standardizer
from .synthetic_stress import (
    validate_stressed_return_matrix,
    validate_synthetic_stress_scenario,
)
from .walk_forward import validate_walk_forward_plan


STRESS_EVALUATION_SCHEMA_VERSION = "asha.synthetic.stress_evaluation.v1"
_EVALUATION_ID = re.compile(r"ASHA_STRESS_EVALUATION_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_EVALUATION_KEYS = {
    "schemaVersion", "stressEvaluationId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "baseReturnMatrixReference", "stressedReturnMatrixReference",
    "walkForwardPlanReference", "weightSetReference", "stressScenarioReference",
    "methodologyReference", "foldIndex", "testStartIndex", "testEndIndex",
    "comparisonPolicy", "periodResults", "metrics", "reasonCodes",
}
_PERIOD_KEYS = {
    "periodIndex", "baseWeightedReturn", "stressedWeightedReturn",
    "baseWealthIndex", "stressedWealthIndex",
}
_METRIC_KEYS = {
    "periodCount", "stressCellCount", "baseCumulativeChangePercent",
    "stressedCumulativeChangePercent", "baseMaximumDrawdownPercent",
    "stressedMaximumDrawdownPercent",
}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _build_unsigned(
    matrix: dict[str, Any],
    stressed_matrix: dict[str, Any],
    scenario: dict[str, Any],
    plan: dict[str, Any],
    weight_set: dict[str, Any],
) -> dict[str, Any]:
    fold = plan["folds"][weight_set["foldIndex"]]
    test_start = fold["testStartIndex"]
    test_end = fold["testEndIndex"]
    shock_periods = {item["periodIndex"] for item in scenario["shocks"]}
    if not shock_periods or any(period < test_start or period > test_end for period in shock_periods):
        raise ContractViolation("every stress shock must fall inside the associated test fold")

    weights = {item["instrumentId"]: Decimal(item["weight"]) for item in weight_set["weights"]}
    if set(weights) != set(matrix["instrumentIds"]):
        raise ContractViolation("stress evaluation weights and matrix instruments differ")
    base_rows = {
        row["periodIndex"]: row for row in matrix["rows"]
        if test_start <= row["periodIndex"] <= test_end
    }
    stressed_rows = {
        row["periodIndex"]: row for row in stressed_matrix["rows"]
        if test_start <= row["periodIndex"] <= test_end
    }
    expected_periods = list(range(test_start, test_end + 1))
    if sorted(base_rows) != expected_periods or sorted(stressed_rows) != expected_periods:
        raise ContractViolation("stress evaluation requires the complete associated test fold")

    base_wealth = Decimal("1")
    stressed_wealth = Decimal("1")
    base_peak = base_wealth
    stressed_peak = stressed_wealth
    base_drawdown = Decimal("0")
    stressed_drawdown = Decimal("0")
    stress_cell_count = 0
    period_results = []
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for period_index in expected_periods:
            base_values = {
                item["instrumentId"]: Decimal(item["value"])
                for item in base_rows[period_index]["returns"]
            }
            stressed_values = {
                item["instrumentId"]: Decimal(item["stressedReturn"])
                for item in stressed_rows[period_index]["returns"]
            }
            shocks = {
                item["instrumentId"]: Decimal(item["additiveReturnShock"])
                for item in stressed_rows[period_index]["returns"]
            }
            if set(base_values) != set(weights) or set(stressed_values) != set(weights):
                raise ContractViolation("stress evaluation row has a different instrument set")
            stress_cell_count += sum(value != 0 for value in shocks.values())
            base_return = sum(weights[item] * base_values[item] for item in matrix["instrumentIds"])
            stressed_return = sum(weights[item] * stressed_values[item] for item in matrix["instrumentIds"])
            base_wealth *= Decimal("1") + base_return
            stressed_wealth *= Decimal("1") + stressed_return
            base_peak = max(base_peak, base_wealth)
            stressed_peak = max(stressed_peak, stressed_wealth)
            base_drawdown = max(base_drawdown, (base_peak - base_wealth) / base_peak)
            stressed_drawdown = max(
                stressed_drawdown, (stressed_peak - stressed_wealth) / stressed_peak
            )
            period_results.append({
                "periodIndex": period_index,
                "baseWeightedReturn": _decimal_string(base_return),
                "stressedWeightedReturn": _decimal_string(stressed_return),
                "baseWealthIndex": _decimal_string(base_wealth),
                "stressedWealthIndex": _decimal_string(stressed_wealth),
            })
    if stress_cell_count != len(scenario["shocks"]):
        raise ContractViolation("stress evaluation did not apply every explicit shock exactly once")

    return {
        "schemaVersion": STRESS_EVALUATION_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": weight_set["benchmarkId"],
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "baseReturnMatrixReference": {
            "matrixId": matrix["matrixId"], "schemaVersion": matrix["schemaVersion"],
        },
        "stressedReturnMatrixReference": {
            "stressedMatrixId": stressed_matrix["stressedMatrixId"],
            "schemaVersion": stressed_matrix["schemaVersion"],
        },
        "walkForwardPlanReference": deepcopy(weight_set["walkForwardPlanReference"]),
        "weightSetReference": {
            "weightSetId": weight_set["weightSetId"],
            "schemaVersion": weight_set["schemaVersion"],
        },
        "stressScenarioReference": deepcopy(stressed_matrix["stressScenarioReference"]),
        "methodologyReference": {
            "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
        },
        "foldIndex": weight_set["foldIndex"],
        "testStartIndex": test_start,
        "testEndIndex": test_end,
        "comparisonPolicy": "side_by_side_no_ranking",
        "periodResults": period_results,
        "metrics": {
            "periodCount": len(period_results),
            "stressCellCount": stress_cell_count,
            "baseCumulativeChangePercent": _decimal_string(
                (base_wealth - Decimal("1")) * Decimal("100")
            ),
            "stressedCumulativeChangePercent": _decimal_string(
                (stressed_wealth - Decimal("1")) * Decimal("100")
            ),
            "baseMaximumDrawdownPercent": _decimal_string(base_drawdown * Decimal("100")),
            "stressedMaximumDrawdownPercent": _decimal_string(
                stressed_drawdown * Decimal("100")
            ),
        },
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "EXPLICIT_SYNTHETIC_SHOCKS_ONLY",
            "FROZEN_WEIGHTS_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "NO_RANKING_OR_THRESHOLD",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


def _validate_stress_evaluation_payload(
    payload: object,
    matrix: dict[str, Any],
    stressed_matrix: dict[str, Any],
    scenario: dict[str, Any],
    plan: dict[str, Any],
    weight_set: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != _EVALUATION_KEYS:
        raise ContractViolation("stress evaluation has unexpected fields")
    evaluation = deepcopy(payload)
    if evaluation["schemaVersion"] != STRESS_EVALUATION_SCHEMA_VERSION:
        raise ContractViolation("unsupported stress-evaluation schema version")
    if (
        evaluation["status"] != "evaluation_only"
        or evaluation["financialUseAllowed"] is not False
        or evaluation["executionAllowed"] is not False
        or evaluation["decisionState"] != "no_decision"
        or evaluation["benchmarkId"] != weight_set["benchmarkId"]
        or evaluation["comparisonPolicy"] != "side_by_side_no_ranking"
    ):
        raise ContractViolation("stress evaluation crossed its comparison-only boundary")
    if evaluation["benchmarkId"] not in {
        INVERSE_VOLATILITY_CONTROL_ID, HRP_CONTROL_ID, MINIMUM_CVAR_CONTROL_ID,
    }:
        raise ContractViolation("stress evaluation benchmark is not a reviewed control")
    if evaluation["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("stress evaluation cannot approve a methodology")
    if evaluation["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "EXPLICIT_SYNTHETIC_SHOCKS_ONLY",
        "FROZEN_WEIGHTS_ONLY", "METHODOLOGY_NOT_APPROVED", "NO_FINANCIAL_DECISION",
        "NO_RANKING_OR_THRESHOLD", "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY",
    ]:
        raise ContractViolation("stress evaluation is missing permanent safety reasons")
    if not isinstance(evaluation["periodResults"], list) or any(
        not isinstance(item, dict) or set(item) != _PERIOD_KEYS
        for item in evaluation["periodResults"]
    ):
        raise ContractViolation("stress evaluation period results have unexpected fields")
    if not isinstance(evaluation["metrics"], dict) or set(evaluation["metrics"]) != _METRIC_KEYS:
        raise ContractViolation("stress evaluation metrics have unexpected fields")
    evaluation_id = evaluation["stressEvaluationId"]
    unsigned = {key: value for key, value in evaluation.items() if key != "stressEvaluationId"}
    if not isinstance(evaluation_id, str) or not _EVALUATION_ID.fullmatch(evaluation_id):
        raise ContractViolation("stress evaluation ID is invalid")
    if evaluation_id != f"ASHA_STRESS_EVALUATION_{fingerprint(unsigned)}":
        raise ContractViolation("stress evaluation fingerprint mismatch")
    if unsigned != _build_unsigned(matrix, stressed_matrix, scenario, plan, weight_set):
        raise ContractViolation("stress evaluation does not match exact side-by-side replay")
    return evaluation


def evaluate_inverse_volatility_stress_fold(
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Apply frozen inverse-volatility weights to one explicit synthetic stress fold."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    stressed_matrix = validate_stressed_return_matrix(
        stressed_matrix_payload, dataset, matrix, scenario
    )
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(
        standardizer_payload, dataset, matrix, plan
    )
    weight_set = validate_inverse_volatility_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer
    )
    unsigned = _build_unsigned(matrix, stressed_matrix, scenario, plan, weight_set)
    evaluation = {
        **unsigned,
        "stressEvaluationId": f"ASHA_STRESS_EVALUATION_{fingerprint(unsigned)}",
    }
    return validate_inverse_volatility_stress_evaluation(
        evaluation, dataset, matrix, stressed_matrix, scenario, plan, standardizer, weight_set
    )


def validate_inverse_volatility_stress_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Recompute both paths and reject provenance drift, ranking, or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    stressed_matrix = validate_stressed_return_matrix(
        stressed_matrix_payload, dataset, matrix, scenario
    )
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(
        standardizer_payload, dataset, matrix, plan
    )
    weight_set = validate_inverse_volatility_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer
    )
    return _validate_stress_evaluation_payload(
        payload, matrix, stressed_matrix, scenario, plan, weight_set
    )


def evaluate_minimum_cvar_stress_fold(
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Apply frozen minimum-CVaR comparison weights to one synthetic stress fold."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    stressed_matrix = validate_stressed_return_matrix(
        stressed_matrix_payload, dataset, matrix, scenario
    )
    plan = validate_walk_forward_plan(plan_payload, dataset)
    weight_set = validate_minimum_cvar_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan
    )
    unsigned = _build_unsigned(matrix, stressed_matrix, scenario, plan, weight_set)
    evaluation = {
        **unsigned,
        "stressEvaluationId": f"ASHA_STRESS_EVALUATION_{fingerprint(unsigned)}",
    }
    return _validate_stress_evaluation_payload(
        evaluation, matrix, stressed_matrix, scenario, plan, weight_set
    )


def validate_minimum_cvar_stress_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Recompute a minimum-CVaR stress comparison and reject drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    stressed_matrix = validate_stressed_return_matrix(
        stressed_matrix_payload, dataset, matrix, scenario
    )
    plan = validate_walk_forward_plan(plan_payload, dataset)
    weight_set = validate_minimum_cvar_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan
    )
    return _validate_stress_evaluation_payload(
        payload, matrix, stressed_matrix, scenario, plan, weight_set
    )


def evaluate_hrp_stress_fold(
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Apply frozen HRP comparison weights to one explicit synthetic stress fold."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    stressed_matrix = validate_stressed_return_matrix(
        stressed_matrix_payload, dataset, matrix, scenario
    )
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(
        standardizer_payload, dataset, matrix, plan
    )
    weight_set = validate_hrp_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer, covariance_payload,
        correlation_payload, distance_payload, clustering_payload, order_payload,
    )
    unsigned = _build_unsigned(matrix, stressed_matrix, scenario, plan, weight_set)
    evaluation = {
        **unsigned,
        "stressEvaluationId": f"ASHA_STRESS_EVALUATION_{fingerprint(unsigned)}",
    }
    return _validate_stress_evaluation_payload(
        evaluation, matrix, stressed_matrix, scenario, plan, weight_set
    )


def validate_hrp_stress_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Recompute an HRP stress comparison and reject provenance drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    stressed_matrix = validate_stressed_return_matrix(
        stressed_matrix_payload, dataset, matrix, scenario
    )
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(
        standardizer_payload, dataset, matrix, plan
    )
    weight_set = validate_hrp_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer, covariance_payload,
        correlation_payload, distance_payload, clustering_payload, order_payload,
    )
    return _validate_stress_evaluation_payload(
        payload, matrix, stressed_matrix, scenario, plan, weight_set
    )
