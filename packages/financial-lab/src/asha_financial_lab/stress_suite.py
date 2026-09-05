"""Replay several explicit synthetic stress scenarios without aggregating them."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Callable

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
from .stress_evaluation import (
    evaluate_hrp_stress_fold,
    evaluate_inverse_volatility_stress_fold,
    evaluate_minimum_cvar_stress_fold,
)
from .synthetic_stress import (
    build_stressed_return_matrix,
    validate_synthetic_stress_scenario,
)
from .walk_forward import validate_walk_forward_plan


STRESS_SUITE_SCHEMA_VERSION = "asha.synthetic.stress_suite.v1"
_SUITE_ID = re.compile(r"ASHA_STRESS_SUITE_[a-f0-9]{64}\Z")
_SUITE_KEYS = {
    "schemaVersion", "stressSuiteId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "baseReturnMatrixReference", "walkForwardPlanReference", "weightSetReference",
    "methodologyReference", "foldIndex", "summary", "scenarioResults", "reasonCodes",
}
_SUMMARY_KEYS = {
    "scenarioCount", "testStartIndex", "testEndIndex", "aggregationPolicy",
}
_SCENARIO_RESULT_KEYS = {
    "stressScenarioReference", "stressedReturnMatrixReference",
    "stressEvaluationReference", "metrics",
}
_METRIC_KEYS = {
    "periodCount", "stressCellCount", "baseCumulativeChangePercent",
    "stressedCumulativeChangePercent", "baseMaximumDrawdownPercent",
    "stressedMaximumDrawdownPercent",
}
_BENCHMARK_IDS = {
    INVERSE_VOLATILITY_CONTROL_ID, HRP_CONTROL_ID, MINIMUM_CVAR_CONTROL_ID,
}


def _validate_scenarios(payload: object) -> list[dict[str, Any]]:
    if not isinstance(payload, list) or not 2 <= len(payload) <= 16:
        raise ContractViolation("stress suite needs between 2 and 16 explicit scenarios")
    scenarios = [validate_synthetic_stress_scenario(item) for item in payload]
    order = [(item["scenarioId"], item["scenarioVersion"]) for item in scenarios]
    if order != sorted(set(order)):
        raise ContractViolation("stress-suite scenarios must be unique and sorted")
    return scenarios


def _build_unsigned(
    dataset: dict[str, Any],
    matrix: dict[str, Any],
    plan: dict[str, Any],
    weight_set: dict[str, Any],
    scenarios: list[dict[str, Any]],
    evaluator: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    scenario_results = []
    for scenario in scenarios:
        stressed_matrix = build_stressed_return_matrix(dataset, matrix, scenario)
        evaluation = evaluator(stressed_matrix, scenario)
        scenario_results.append({
            "stressScenarioReference": deepcopy(stressed_matrix["stressScenarioReference"]),
            "stressedReturnMatrixReference": {
                "stressedMatrixId": stressed_matrix["stressedMatrixId"],
                "schemaVersion": stressed_matrix["schemaVersion"],
            },
            "stressEvaluationReference": {
                "stressEvaluationId": evaluation["stressEvaluationId"],
                "schemaVersion": evaluation["schemaVersion"],
            },
            "metrics": deepcopy(evaluation["metrics"]),
        })
    fold = plan["folds"][weight_set["foldIndex"]]
    return {
        "schemaVersion": STRESS_SUITE_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": weight_set["benchmarkId"],
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "baseReturnMatrixReference": {
            "matrixId": matrix["matrixId"], "schemaVersion": matrix["schemaVersion"],
        },
        "walkForwardPlanReference": deepcopy(weight_set["walkForwardPlanReference"]),
        "weightSetReference": {
            "weightSetId": weight_set["weightSetId"],
            "schemaVersion": weight_set["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
        },
        "foldIndex": weight_set["foldIndex"],
        "summary": {
            "scenarioCount": len(scenario_results),
            "testStartIndex": fold["testStartIndex"],
            "testEndIndex": fold["testEndIndex"],
            "aggregationPolicy": "none_scenario_metrics_only",
        },
        "scenarioResults": scenario_results,
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "EXPLICIT_SYNTHETIC_SCENARIOS_ONLY",
            "FROZEN_WEIGHTS_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_CROSS_SCENARIO_AGGREGATION",
            "NO_FINANCIAL_DECISION",
            "NO_RANKING_OR_THRESHOLD",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


def _seal_and_validate(
    dataset: dict[str, Any],
    matrix: dict[str, Any],
    plan: dict[str, Any],
    weight_set: dict[str, Any],
    scenarios: list[dict[str, Any]],
    evaluator: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    unsigned = _build_unsigned(dataset, matrix, plan, weight_set, scenarios, evaluator)
    suite = {
        **unsigned,
        "stressSuiteId": f"ASHA_STRESS_SUITE_{fingerprint(unsigned)}",
    }
    return _validate_payload(suite, dataset, matrix, plan, weight_set, scenarios, evaluator)


def _validate_payload(
    payload: object,
    dataset: dict[str, Any],
    matrix: dict[str, Any],
    plan: dict[str, Any],
    weight_set: dict[str, Any],
    scenarios: list[dict[str, Any]],
    evaluator: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != _SUITE_KEYS:
        raise ContractViolation("stress suite has unexpected fields")
    suite = deepcopy(payload)
    if suite["schemaVersion"] != STRESS_SUITE_SCHEMA_VERSION:
        raise ContractViolation("unsupported stress-suite schema version")
    if (
        suite["status"] != "evaluation_only"
        or suite["financialUseAllowed"] is not False
        or suite["executionAllowed"] is not False
        or suite["decisionState"] != "no_decision"
        or suite["benchmarkId"] != weight_set["benchmarkId"]
        or suite["benchmarkId"] not in _BENCHMARK_IDS
    ):
        raise ContractViolation("stress suite crossed its comparison-only boundary")
    if suite["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("stress suite cannot approve a methodology")
    if suite["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "EXPLICIT_SYNTHETIC_SCENARIOS_ONLY",
        "FROZEN_WEIGHTS_ONLY", "METHODOLOGY_NOT_APPROVED",
        "NO_CROSS_SCENARIO_AGGREGATION", "NO_FINANCIAL_DECISION",
        "NO_RANKING_OR_THRESHOLD", "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY",
    ]:
        raise ContractViolation("stress suite is missing permanent safety reasons")
    if not isinstance(suite["summary"], dict) or set(suite["summary"]) != _SUMMARY_KEYS:
        raise ContractViolation("stress-suite summary has unexpected fields")
    if not isinstance(suite["scenarioResults"], list) or any(
        not isinstance(item, dict) or set(item) != _SCENARIO_RESULT_KEYS
        for item in suite["scenarioResults"]
    ):
        raise ContractViolation("stress-suite scenario results have unexpected fields")
    if any(
        not isinstance(item["metrics"], dict) or set(item["metrics"]) != _METRIC_KEYS
        for item in suite["scenarioResults"]
    ):
        raise ContractViolation("stress-suite metrics have unexpected fields")
    suite_id = suite["stressSuiteId"]
    unsigned = {key: value for key, value in suite.items() if key != "stressSuiteId"}
    if not isinstance(suite_id, str) or not _SUITE_ID.fullmatch(suite_id):
        raise ContractViolation("stress-suite ID is invalid")
    if suite_id != f"ASHA_STRESS_SUITE_{fingerprint(unsigned)}":
        raise ContractViolation("stress-suite fingerprint mismatch")
    if unsigned != _build_unsigned(dataset, matrix, plan, weight_set, scenarios, evaluator):
        raise ContractViolation("stress suite does not match exact multi-scenario replay")
    return suite


def build_inverse_volatility_stress_suite(
    dataset_payload: object, matrix_payload: object, plan_payload: object,
    standardizer_payload: object, weight_set_payload: object,
    scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    weights = validate_inverse_volatility_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer
    )
    scenarios = _validate_scenarios(scenario_payloads)
    evaluator = lambda stressed, scenario: evaluate_inverse_volatility_stress_fold(
        dataset, matrix, stressed, scenario, plan, standardizer, weights
    )
    return _seal_and_validate(dataset, matrix, plan, weights, scenarios, evaluator)


def validate_inverse_volatility_stress_suite(
    payload: object, dataset_payload: object, matrix_payload: object, plan_payload: object,
    standardizer_payload: object, weight_set_payload: object, scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    weights = validate_inverse_volatility_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer
    )
    scenarios = _validate_scenarios(scenario_payloads)
    evaluator = lambda stressed, scenario: evaluate_inverse_volatility_stress_fold(
        dataset, matrix, stressed, scenario, plan, standardizer, weights
    )
    return _validate_payload(payload, dataset, matrix, plan, weights, scenarios, evaluator)


def build_minimum_cvar_stress_suite(
    dataset_payload: object, matrix_payload: object, plan_payload: object,
    weight_set_payload: object, scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    weights = validate_minimum_cvar_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan
    )
    scenarios = _validate_scenarios(scenario_payloads)
    evaluator = lambda stressed, scenario: evaluate_minimum_cvar_stress_fold(
        dataset, matrix, stressed, scenario, plan, weights
    )
    return _seal_and_validate(dataset, matrix, plan, weights, scenarios, evaluator)


def validate_minimum_cvar_stress_suite(
    payload: object, dataset_payload: object, matrix_payload: object, plan_payload: object,
    weight_set_payload: object, scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    weights = validate_minimum_cvar_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan
    )
    scenarios = _validate_scenarios(scenario_payloads)
    evaluator = lambda stressed, scenario: evaluate_minimum_cvar_stress_fold(
        dataset, matrix, stressed, scenario, plan, weights
    )
    return _validate_payload(payload, dataset, matrix, plan, weights, scenarios, evaluator)


def build_hrp_stress_suite(
    dataset_payload: object, matrix_payload: object, plan_payload: object,
    standardizer_payload: object, covariance_payload: object,
    correlation_payload: object, distance_payload: object, clustering_payload: object,
    order_payload: object, weight_set_payload: object, scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    weights = validate_hrp_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer, covariance_payload,
        correlation_payload, distance_payload, clustering_payload, order_payload,
    )
    scenarios = _validate_scenarios(scenario_payloads)
    evaluator = lambda stressed, scenario: evaluate_hrp_stress_fold(
        dataset, matrix, stressed, scenario, plan, standardizer, covariance_payload,
        correlation_payload, distance_payload, clustering_payload, order_payload, weights,
    )
    return _seal_and_validate(dataset, matrix, plan, weights, scenarios, evaluator)


def validate_hrp_stress_suite(
    payload: object, dataset_payload: object, matrix_payload: object, plan_payload: object,
    standardizer_payload: object, covariance_payload: object,
    correlation_payload: object, distance_payload: object, clustering_payload: object,
    order_payload: object, weight_set_payload: object, scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    weights = validate_hrp_comparison_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer, covariance_payload,
        correlation_payload, distance_payload, clustering_payload, order_payload,
    )
    scenarios = _validate_scenarios(scenario_payloads)
    evaluator = lambda stressed, scenario: evaluate_hrp_stress_fold(
        dataset, matrix, stressed, scenario, plan, standardizer, covariance_payload,
        correlation_payload, distance_payload, clustering_payload, order_payload, weights,
    )
    return _validate_payload(payload, dataset, matrix, plan, weights, scenarios, evaluator)
