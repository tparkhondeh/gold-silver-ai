"""Replay synthetic stress suites across every train-only walk-forward fold."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Callable

from .cluster_order import build_train_only_cluster_leaf_order
from .comparison_weights import (
    INVERSE_VOLATILITY_CONTROL_ID,
    build_inverse_volatility_control_weights,
)
from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .correlation import build_train_only_correlation
from .correlation_distance import build_train_only_correlation_distance
from .covariance import build_train_only_covariance
from .features import validate_point_in_time_return_matrix
from .hierarchical_clustering import build_train_only_single_linkage_clustering
from .hrp_control import HRP_CONTROL_ID, build_hrp_comparison_control_weights
from .minimum_cvar_control import (
    MINIMUM_CVAR_CONTROL_ID,
    build_minimum_cvar_comparison_control_weights,
)
from .normalization import fit_train_only_standardizer
from .stress_suite import (
    build_hrp_stress_suite,
    build_inverse_volatility_stress_suite,
    build_minimum_cvar_stress_suite,
)
from .walk_forward import validate_walk_forward_plan


STRESS_WALK_FORWARD_SCHEMA_VERSION = "asha.synthetic.stress_walk_forward_report.v1"
_REPORT_ID = re.compile(r"ASHA_STRESS_WALK_FORWARD_REPORT_[a-f0-9]{64}\Z")
_REPORT_KEYS = {
    "schemaVersion", "reportId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "methodologyReference",
    "parameters", "summary", "foldResults", "reasonCodes",
}
_PARAMETER_KEYS = {"foldPolicy", "tailCount", "weightStep"}
_SUMMARY_KEYS = {
    "foldCount", "scenarioCellCount", "firstTestIndex", "lastTestIndex",
    "aggregationPolicy",
}
_FOLD_KEYS = {
    "foldIndex", "trainStartIndex", "trainEndIndex", "testStartIndex",
    "testEndIndex", "weightSetReference", "stressSuiteReference",
    "scenarioCount", "scenarioResults",
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
_REASON_CODES = [
    "COMPARISON_CONTROL_ONLY",
    "EXPLICIT_SYNTHETIC_SCENARIOS_ONLY",
    "METHODOLOGY_NOT_APPROVED",
    "NO_FINANCIAL_DECISION",
    "NO_FOLD_OR_SCENARIO_AGGREGATION",
    "NO_RANKING_OR_THRESHOLD",
    "REAL_FINANCIAL_USE_DISABLED",
    "SYNTHETIC_DATA_ONLY",
    "WALK_FORWARD_STRESS_EVALUATION_ONLY",
]


def _fold_parameters(policy: str, tail_count: int | None, weight_step: str | None) -> dict:
    return {"foldPolicy": policy, "tailCount": tail_count, "weightStep": weight_step}


def _validate_fold_scenario_sets(
    plan: dict[str, Any], payload: object
) -> list[list[dict[str, Any]]]:
    if not isinstance(payload, list) or len(payload) != len(plan["folds"]):
        raise ContractViolation("walk-forward stress report needs one scenario set per fold")
    result = []
    for fold, item in zip(plan["folds"], payload, strict=True):
        if not isinstance(item, dict) or set(item) != {"foldIndex", "scenarios"}:
            raise ContractViolation("walk-forward stress scenario set has unexpected fields")
        if item["foldIndex"] != fold["foldIndex"] or not isinstance(item["scenarios"], list):
            raise ContractViolation("walk-forward stress scenario sets must follow exact fold order")
        result.append(deepcopy(item["scenarios"]))
    return result


def _build_unsigned(
    matrix: dict[str, Any],
    plan: dict[str, Any],
    benchmark_id: str,
    parameters: dict[str, Any],
    fold_scenarios: list[list[dict[str, Any]]],
    fold_builder: Callable[[int, list[dict[str, Any]]], tuple[dict[str, Any], dict[str, Any]]],
) -> dict[str, Any]:
    fold_results = []
    for fold, scenarios in zip(plan["folds"], fold_scenarios, strict=True):
        weights, suite = fold_builder(fold["foldIndex"], scenarios)
        fold_results.append({
            "foldIndex": fold["foldIndex"],
            "trainStartIndex": fold["trainStartIndex"],
            "trainEndIndex": fold["trainEndIndex"],
            "testStartIndex": fold["testStartIndex"],
            "testEndIndex": fold["testEndIndex"],
            "weightSetReference": {
                "weightSetId": weights["weightSetId"],
                "schemaVersion": weights["schemaVersion"],
            },
            "stressSuiteReference": {
                "stressSuiteId": suite["stressSuiteId"],
                "schemaVersion": suite["schemaVersion"],
            },
            "scenarioCount": suite["summary"]["scenarioCount"],
            "scenarioResults": deepcopy(suite["scenarioResults"]),
        })
    return {
        "schemaVersion": STRESS_WALK_FORWARD_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": benchmark_id,
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "returnMatrixReference": {
            "matrixId": matrix["matrixId"], "schemaVersion": matrix["schemaVersion"],
        },
        "walkForwardPlanReference": {
            "planId": plan["planId"], "schemaVersion": plan["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
        },
        "parameters": deepcopy(parameters),
        "summary": {
            "foldCount": len(fold_results),
            "scenarioCellCount": sum(item["scenarioCount"] for item in fold_results),
            "firstTestIndex": fold_results[0]["testStartIndex"],
            "lastTestIndex": fold_results[-1]["testEndIndex"],
            "aggregationPolicy": "none_fold_or_scenario_metrics_only",
        },
        "foldResults": fold_results,
        "reasonCodes": deepcopy(_REASON_CODES),
    }


def _seal_and_validate(
    matrix: dict[str, Any],
    plan: dict[str, Any],
    benchmark_id: str,
    parameters: dict[str, Any],
    fold_scenarios: list[list[dict[str, Any]]],
    fold_builder: Callable[[int, list[dict[str, Any]]], tuple[dict[str, Any], dict[str, Any]]],
) -> dict[str, Any]:
    unsigned = _build_unsigned(
        matrix, plan, benchmark_id, parameters, fold_scenarios, fold_builder
    )
    report = {
        **unsigned,
        "reportId": f"ASHA_STRESS_WALK_FORWARD_REPORT_{fingerprint(unsigned)}",
    }
    return _validate_payload(
        report, matrix, plan, benchmark_id, parameters, fold_scenarios, fold_builder
    )


def _validate_payload(
    payload: object,
    matrix: dict[str, Any],
    plan: dict[str, Any],
    benchmark_id: str,
    parameters: dict[str, Any],
    fold_scenarios: list[list[dict[str, Any]]],
    fold_builder: Callable[[int, list[dict[str, Any]]], tuple[dict[str, Any], dict[str, Any]]],
) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != _REPORT_KEYS:
        raise ContractViolation("walk-forward stress report has unexpected fields")
    report = deepcopy(payload)
    if report["schemaVersion"] != STRESS_WALK_FORWARD_SCHEMA_VERSION:
        raise ContractViolation("unsupported walk-forward stress-report schema version")
    if (
        report["status"] != "evaluation_only"
        or report["financialUseAllowed"] is not False
        or report["executionAllowed"] is not False
        or report["decisionState"] != "no_decision"
        or report["benchmarkId"] != benchmark_id
    ):
        raise ContractViolation("walk-forward stress report crossed its safety boundary")
    if report["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("walk-forward stress report cannot approve a methodology")
    if report["parameters"] != parameters or set(report["parameters"]) != _PARAMETER_KEYS:
        raise ContractViolation("walk-forward stress parameters are not exact")
    if report["reasonCodes"] != _REASON_CODES:
        raise ContractViolation("walk-forward stress report is missing safety reasons")
    if not isinstance(report["summary"], dict) or set(report["summary"]) != _SUMMARY_KEYS:
        raise ContractViolation("walk-forward stress summary has unexpected fields")
    if not isinstance(report["foldResults"], list) or any(
        not isinstance(item, dict) or set(item) != _FOLD_KEYS
        for item in report["foldResults"]
    ):
        raise ContractViolation("walk-forward stress fold results have unexpected fields")
    if any(
        not isinstance(fold["scenarioResults"], list)
        or type(fold["scenarioCount"]) is not int
        or fold["scenarioCount"] != len(fold["scenarioResults"])
        for fold in report["foldResults"]
    ):
        raise ContractViolation("walk-forward stress scenario counts are invalid")
    if any(
        not isinstance(result, dict) or set(result) != _SCENARIO_RESULT_KEYS
        for fold in report["foldResults"]
        for result in fold["scenarioResults"]
    ):
        raise ContractViolation("walk-forward stress scenario results have unexpected fields")
    if any(
        not isinstance(result["metrics"], dict) or set(result["metrics"]) != _METRIC_KEYS
        for fold in report["foldResults"]
        for result in fold["scenarioResults"]
    ):
        raise ContractViolation("walk-forward stress metrics have unexpected fields")
    report_id = report["reportId"]
    unsigned = {key: value for key, value in report.items() if key != "reportId"}
    if not isinstance(report_id, str) or not _REPORT_ID.fullmatch(report_id):
        raise ContractViolation("walk-forward stress-report ID is invalid")
    if report_id != f"ASHA_STRESS_WALK_FORWARD_REPORT_{fingerprint(unsigned)}":
        raise ContractViolation("walk-forward stress-report fingerprint mismatch")
    expected = _build_unsigned(
        matrix, plan, benchmark_id, parameters, fold_scenarios, fold_builder
    )
    if unsigned != expected:
        raise ContractViolation("walk-forward stress report does not match exact replay")
    return report


def _inverse_builder(dataset: dict, matrix: dict, plan: dict):
    def build(fold_index: int, scenarios: list[dict]) -> tuple[dict, dict]:
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, fold_index)
        weights = build_inverse_volatility_control_weights(
            dataset, matrix, plan, standardizer
        )
        suite = build_inverse_volatility_stress_suite(
            dataset, matrix, plan, standardizer, weights, scenarios
        )
        return weights, suite
    return build


def _minimum_cvar_builder(
    dataset: dict, matrix: dict, plan: dict, tail_count: int, weight_step: str
):
    def build(fold_index: int, scenarios: list[dict]) -> tuple[dict, dict]:
        weights = build_minimum_cvar_comparison_control_weights(
            dataset, matrix, plan, fold_index=fold_index,
            tail_count=tail_count, weight_step=weight_step,
        )
        suite = build_minimum_cvar_stress_suite(
            dataset, matrix, plan, weights, scenarios
        )
        return weights, suite
    return build


def _hrp_builder(dataset: dict, matrix: dict, plan: dict):
    def build(fold_index: int, scenarios: list[dict]) -> tuple[dict, dict]:
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, fold_index)
        covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
        correlation = build_train_only_correlation(
            dataset, matrix, plan, standardizer, covariance
        )
        distance = build_train_only_correlation_distance(
            dataset, matrix, plan, standardizer, covariance, correlation
        )
        clustering = build_train_only_single_linkage_clustering(
            dataset, matrix, plan, standardizer, covariance, correlation, distance
        )
        order = build_train_only_cluster_leaf_order(
            dataset, matrix, plan, standardizer, covariance, correlation, distance,
            clustering,
        )
        weights = build_hrp_comparison_control_weights(
            dataset, matrix, plan, standardizer, covariance, correlation, distance,
            clustering, order,
        )
        suite = build_hrp_stress_suite(
            dataset, matrix, plan, standardizer, covariance, correlation, distance,
            clustering, order, weights, scenarios,
        )
        return weights, suite
    return build


def build_inverse_volatility_stress_walk_forward_report(
    dataset_payload: object, matrix_payload: object, plan_payload: object,
    fold_scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    scenarios = _validate_fold_scenario_sets(plan, fold_scenario_payloads)
    parameters = _fold_parameters(
        "refit_inverse_volatility_train_only_then_freeze_v1", None, None
    )
    return _seal_and_validate(
        matrix, plan, INVERSE_VOLATILITY_CONTROL_ID, parameters, scenarios,
        _inverse_builder(dataset, matrix, plan),
    )


def validate_inverse_volatility_stress_walk_forward_report(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    scenarios = _validate_fold_scenario_sets(plan, fold_scenario_payloads)
    parameters = _fold_parameters(
        "refit_inverse_volatility_train_only_then_freeze_v1", None, None
    )
    return _validate_payload(
        payload, matrix, plan, INVERSE_VOLATILITY_CONTROL_ID, parameters, scenarios,
        _inverse_builder(dataset, matrix, plan),
    )


def build_minimum_cvar_stress_walk_forward_report(
    dataset_payload: object, matrix_payload: object, plan_payload: object,
    fold_scenario_payloads: object, *, tail_count: int, weight_step: str,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    scenarios = _validate_fold_scenario_sets(plan, fold_scenario_payloads)
    first_weights = build_minimum_cvar_comparison_control_weights(
        dataset, matrix, plan, fold_index=0, tail_count=tail_count,
        weight_step=weight_step,
    )
    normalized_step = first_weights["parameters"]["weightStep"]
    builder = _minimum_cvar_builder(dataset, matrix, plan, tail_count, normalized_step)
    parameters = _fold_parameters(
        "refit_minimum_cvar_grid_train_only_then_freeze_v1", tail_count, normalized_step
    )
    return _seal_and_validate(
        matrix, plan, MINIMUM_CVAR_CONTROL_ID, parameters, scenarios, builder
    )


def validate_minimum_cvar_stress_walk_forward_report(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    scenarios = _validate_fold_scenario_sets(plan, fold_scenario_payloads)
    if not isinstance(payload, dict) or not isinstance(payload.get("parameters"), dict):
        raise ContractViolation("walk-forward stress parameters are missing")
    raw_parameters = payload["parameters"]
    if set(raw_parameters) != _PARAMETER_KEYS:
        raise ContractViolation("walk-forward stress parameters are not exact")
    tail_count = raw_parameters["tailCount"]
    weight_step = raw_parameters["weightStep"]
    if type(tail_count) is not int or not isinstance(weight_step, str):
        raise ContractViolation("minimum-CVaR stress parameters are invalid")
    try:
        first_weights = build_minimum_cvar_comparison_control_weights(
            dataset, matrix, plan, fold_index=0, tail_count=tail_count,
            weight_step=weight_step,
        )
    except (TypeError, ValueError) as error:
        raise ContractViolation("minimum-CVaR stress parameters are invalid") from error
    normalized_step = first_weights["parameters"]["weightStep"]
    if weight_step != normalized_step:
        raise ContractViolation("minimum-CVaR stress parameters are not canonical")
    parameters = _fold_parameters(
        "refit_minimum_cvar_grid_train_only_then_freeze_v1", tail_count, normalized_step
    )
    builder = _minimum_cvar_builder(dataset, matrix, plan, tail_count, normalized_step)
    return _validate_payload(
        payload, matrix, plan, MINIMUM_CVAR_CONTROL_ID, parameters, scenarios, builder
    )


def build_hrp_stress_walk_forward_report(
    dataset_payload: object, matrix_payload: object, plan_payload: object,
    fold_scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    scenarios = _validate_fold_scenario_sets(plan, fold_scenario_payloads)
    parameters = _fold_parameters(
        "refit_exact_hrp_chain_train_only_then_freeze_v1", None, None
    )
    return _seal_and_validate(
        matrix, plan, HRP_CONTROL_ID, parameters, scenarios,
        _hrp_builder(dataset, matrix, plan),
    )


def validate_hrp_stress_walk_forward_report(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> dict[str, Any]:
    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    scenarios = _validate_fold_scenario_sets(plan, fold_scenario_payloads)
    parameters = _fold_parameters(
        "refit_exact_hrp_chain_train_only_then_freeze_v1", None, None
    )
    return _validate_payload(
        payload, matrix, plan, HRP_CONTROL_ID, parameters, scenarios,
        _hrp_builder(dataset, matrix, plan),
    )
