"""Replay discrete minimum-CVaR comparison mechanics across synthetic folds."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .control_evaluation import evaluate_minimum_cvar_comparison_control_fold
from .features import validate_point_in_time_return_matrix
from .minimum_cvar_control import build_minimum_cvar_comparison_control_weights
from .walk_forward import validate_walk_forward_plan


MINIMUM_CVAR_WALK_FORWARD_SCHEMA_VERSION = (
    "asha.synthetic.minimum_cvar_walk_forward_report.v1"
)
_REPORT_ID = re.compile(r"ASHA_MIN_CVAR_WALK_FORWARD_REPORT_[a-f0-9]{64}\Z")
_REPORT_KEYS = {
    "schemaVersion", "reportId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "methodologyReference",
    "parameters", "summary", "foldResults", "reasonCodes",
}
_PARAMETER_KEYS = {"tailCount", "weightStep", "foldPolicy"}
_SUMMARY_KEYS = {
    "foldCount", "evaluatedPeriodCount", "firstTestIndex", "lastTestIndex",
    "aggregationPolicy",
}
_FOLD_RESULT_KEYS = {
    "foldIndex", "trainStartIndex", "trainEndIndex", "scenarioCount",
    "candidateCount", "testStartIndex", "testEndIndex", "weightSetId",
    "evaluationId", "metrics",
}
_METRIC_KEYS = {"periodCount", "cumulativeChangePercent", "maximumDrawdownPercent"}


def _build_unsigned(
    dataset: dict[str, Any],
    matrix: dict[str, Any],
    plan: dict[str, Any],
    tail_count: int,
    weight_step: str,
) -> dict[str, Any]:
    fold_results = []
    normalized_step: str | None = None
    for fold in plan["folds"]:
        weights = build_minimum_cvar_comparison_control_weights(
            dataset,
            matrix,
            plan,
            fold_index=fold["foldIndex"],
            tail_count=tail_count,
            weight_step=weight_step,
        )
        if normalized_step is None:
            normalized_step = weights["parameters"]["weightStep"]
        elif normalized_step != weights["parameters"]["weightStep"]:
            raise ContractViolation("minimum-CVaR fold weight steps are inconsistent")
        evaluation = evaluate_minimum_cvar_comparison_control_fold(
            dataset, matrix, plan, weights
        )
        fold_results.append({
            "foldIndex": fold["foldIndex"],
            "trainStartIndex": weights["trainStartIndex"],
            "trainEndIndex": weights["trainEndIndex"],
            "scenarioCount": weights["scenarioCount"],
            "candidateCount": weights["candidateCount"],
            "testStartIndex": evaluation["testStartIndex"],
            "testEndIndex": evaluation["testEndIndex"],
            "weightSetId": weights["weightSetId"],
            "evaluationId": evaluation["evaluationId"],
            "metrics": deepcopy(evaluation["metrics"]),
        })
    if normalized_step is None:
        raise ContractViolation("minimum-CVaR walk-forward report needs at least one fold")

    return {
        "schemaVersion": MINIMUM_CVAR_WALK_FORWARD_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1",
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "returnMatrixReference": {
            "matrixId": matrix["matrixId"],
            "schemaVersion": matrix["schemaVersion"],
        },
        "walkForwardPlanReference": {
            "planId": plan["planId"],
            "schemaVersion": plan["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "parameters": {
            "tailCount": tail_count,
            "weightStep": normalized_step,
            "foldPolicy": "refit_train_only_grid_then_freeze_for_test_v1",
        },
        "summary": {
            "foldCount": len(fold_results),
            "evaluatedPeriodCount": sum(
                item["metrics"]["periodCount"] for item in fold_results
            ),
            "firstTestIndex": fold_results[0]["testStartIndex"],
            "lastTestIndex": fold_results[-1]["testEndIndex"],
            "aggregationPolicy": "none_fold_metrics_only",
        },
        "foldResults": fold_results,
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "DISCRETE_GRID_EXPERIMENT_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_AGGREGATED_PERFORMANCE_CLAIM",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "WALK_FORWARD_EVALUATION_ONLY",
        ],
    }


def build_minimum_cvar_walk_forward_report(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    *,
    tail_count: int,
    weight_step: str,
) -> dict[str, Any]:
    """Refit each train fold and evaluate its frozen grid weights separately."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    unsigned = _build_unsigned(dataset, matrix, plan, tail_count, weight_step)
    report = {
        **unsigned,
        "reportId": f"ASHA_MIN_CVAR_WALK_FORWARD_REPORT_{fingerprint(unsigned)}",
    }
    return validate_minimum_cvar_walk_forward_report(report, dataset, matrix, plan)


def validate_minimum_cvar_walk_forward_report(
    report_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    """Recompute every minimum-CVaR fold and reject omissions or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    if not isinstance(report_payload, dict) or set(report_payload) != _REPORT_KEYS:
        raise ContractViolation("minimum-CVaR walk-forward report has unexpected fields")
    report = deepcopy(report_payload)
    if report["schemaVersion"] != MINIMUM_CVAR_WALK_FORWARD_SCHEMA_VERSION:
        raise ContractViolation("unsupported minimum-CVaR walk-forward schema version")
    if (
        report["status"] != "evaluation_only"
        or report["financialUseAllowed"] is not False
        or report["executionAllowed"] is not False
        or report["decisionState"] != "no_decision"
        or report["benchmarkId"] != "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1"
    ):
        raise ContractViolation("minimum-CVaR walk-forward report crossed its safety boundary")
    if report["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("minimum-CVaR walk-forward cannot approve a methodology")
    if report["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "DISCRETE_GRID_EXPERIMENT_ONLY",
        "METHODOLOGY_NOT_APPROVED", "NO_AGGREGATED_PERFORMANCE_CLAIM",
        "NO_FINANCIAL_DECISION", "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY", "WALK_FORWARD_EVALUATION_ONLY",
    ]:
        raise ContractViolation("minimum-CVaR walk-forward is missing safety reasons")
    if not isinstance(report["parameters"], dict) or set(report["parameters"]) != _PARAMETER_KEYS:
        raise ContractViolation("minimum-CVaR walk-forward parameters have unexpected fields")
    if not isinstance(report["summary"], dict) or set(report["summary"]) != _SUMMARY_KEYS:
        raise ContractViolation("minimum-CVaR walk-forward summary has unexpected fields")
    if not isinstance(report["foldResults"], list) or not report["foldResults"]:
        raise ContractViolation("minimum-CVaR walk-forward report needs fold results")
    if any(
        not isinstance(item, dict) or set(item) != _FOLD_RESULT_KEYS
        for item in report["foldResults"]
    ):
        raise ContractViolation("minimum-CVaR walk-forward fold has unexpected fields")
    if any(
        not isinstance(item["metrics"], dict) or set(item["metrics"]) != _METRIC_KEYS
        for item in report["foldResults"]
    ):
        raise ContractViolation("minimum-CVaR walk-forward metrics have unexpected fields")
    report_id = report["reportId"]
    unsigned = {key: value for key, value in report.items() if key != "reportId"}
    if not isinstance(report_id, str) or not _REPORT_ID.fullmatch(report_id):
        raise ContractViolation("minimum-CVaR walk-forward report ID is invalid")
    if report_id != f"ASHA_MIN_CVAR_WALK_FORWARD_REPORT_{fingerprint(unsigned)}":
        raise ContractViolation("minimum-CVaR walk-forward fingerprint mismatch")
    try:
        expected = _build_unsigned(
            dataset,
            matrix,
            plan,
            report["parameters"]["tailCount"],
            report["parameters"]["weightStep"],
        )
    except (TypeError, ValueError) as error:
        raise ContractViolation("minimum-CVaR walk-forward parameters are invalid") from error
    if unsigned != expected:
        raise ContractViolation("minimum-CVaR walk-forward does not match exact replay")
    return report
