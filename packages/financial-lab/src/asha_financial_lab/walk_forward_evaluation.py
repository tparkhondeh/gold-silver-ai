"""Replay inverse-volatility comparison mechanics across every synthetic fold."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .comparison_weights import build_inverse_volatility_control_weights
from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .control_evaluation import evaluate_inverse_volatility_control_fold
from .features import validate_point_in_time_return_matrix
from .normalization import fit_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


WALK_FORWARD_EVALUATION_SCHEMA_VERSION = "asha.synthetic.walk_forward_control_report.v1"
_REPORT_ID = re.compile(r"ASHA_WALK_FORWARD_CONTROL_REPORT_[a-f0-9]{64}\Z")
_REPORT_KEYS = {
    "schemaVersion", "reportId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "methodologyReference",
    "summary", "foldResults", "reasonCodes",
}
_SUMMARY_KEYS = {
    "foldCount", "evaluatedPeriodCount", "firstTestIndex", "lastTestIndex",
    "aggregationPolicy",
}
_FOLD_RESULT_KEYS = {
    "foldIndex", "trainingFeatureStartIndex", "trainingFeatureEndIndex",
    "testStartIndex", "testEndIndex", "standardizerId", "weightSetId",
    "evaluationId", "metrics",
}
_METRIC_KEYS = {"periodCount", "cumulativeChangePercent", "maximumDrawdownPercent"}


def _build_unsigned(
    dataset: dict[str, Any],
    matrix: dict[str, Any],
    plan: dict[str, Any],
) -> dict[str, Any]:
    fold_results = []
    for fold in plan["folds"]:
        standardizer = fit_train_only_standardizer(
            dataset,
            matrix,
            plan,
            fold["foldIndex"],
        )
        weights = build_inverse_volatility_control_weights(
            dataset,
            matrix,
            plan,
            standardizer,
        )
        evaluation = evaluate_inverse_volatility_control_fold(
            dataset,
            matrix,
            plan,
            standardizer,
            weights,
        )
        fold_results.append({
            "foldIndex": fold["foldIndex"],
            "trainingFeatureStartIndex": standardizer["trainingFeatureStartIndex"],
            "trainingFeatureEndIndex": standardizer["trainingFeatureEndIndex"],
            "testStartIndex": evaluation["testStartIndex"],
            "testEndIndex": evaluation["testEndIndex"],
            "standardizerId": standardizer["standardizerId"],
            "weightSetId": weights["weightSetId"],
            "evaluationId": evaluation["evaluationId"],
            "metrics": deepcopy(evaluation["metrics"]),
        })

    return {
        "schemaVersion": WALK_FORWARD_EVALUATION_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1",
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
        "summary": {
            "foldCount": len(fold_results),
            "evaluatedPeriodCount": sum(item["metrics"]["periodCount"] for item in fold_results),
            "firstTestIndex": fold_results[0]["testStartIndex"],
            "lastTestIndex": fold_results[-1]["testEndIndex"],
            "aggregationPolicy": "none_fold_metrics_only",
        },
        "foldResults": fold_results,
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_AGGREGATED_PERFORMANCE_CLAIM",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "WALK_FORWARD_EVALUATION_ONLY",
        ],
    }


def build_inverse_volatility_walk_forward_report(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    """Evaluate every plan fold without selecting or approving a methodology."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    unsigned = _build_unsigned(dataset, matrix, plan)
    report = {
        **unsigned,
        "reportId": f"ASHA_WALK_FORWARD_CONTROL_REPORT_{fingerprint(unsigned)}",
    }
    return validate_inverse_volatility_walk_forward_report(report, dataset, matrix, plan)


def validate_inverse_volatility_walk_forward_report(
    report_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    """Recompute every fold and reject omitted folds, drift, or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    if not isinstance(report_payload, dict) or set(report_payload) != _REPORT_KEYS:
        raise ContractViolation("walk-forward control report has unexpected fields")
    report = deepcopy(report_payload)
    if report["schemaVersion"] != WALK_FORWARD_EVALUATION_SCHEMA_VERSION:
        raise ContractViolation("unsupported walk-forward control-report schema version")
    if (
        report["status"] != "evaluation_only"
        or report["financialUseAllowed"] is not False
        or report["executionAllowed"] is not False
        or report["decisionState"] != "no_decision"
        or report["benchmarkId"] != "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1"
    ):
        raise ContractViolation("walk-forward control report crossed its safety boundary")
    if report["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("walk-forward control report cannot approve a methodology")
    if report["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "METHODOLOGY_NOT_APPROVED",
        "NO_AGGREGATED_PERFORMANCE_CLAIM", "NO_FINANCIAL_DECISION",
        "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY",
        "WALK_FORWARD_EVALUATION_ONLY",
    ]:
        raise ContractViolation("walk-forward control report is missing permanent safety reasons")
    if not isinstance(report["summary"], dict) or set(report["summary"]) != _SUMMARY_KEYS:
        raise ContractViolation("walk-forward control-report summary has unexpected fields")
    if not isinstance(report["foldResults"], list) or not report["foldResults"]:
        raise ContractViolation("walk-forward control report needs fold results")
    if any(
        not isinstance(item, dict) or set(item) != _FOLD_RESULT_KEYS
        for item in report["foldResults"]
    ):
        raise ContractViolation("walk-forward fold result has unexpected fields")
    if any(
        not isinstance(item["metrics"], dict) or set(item["metrics"]) != _METRIC_KEYS
        for item in report["foldResults"]
    ):
        raise ContractViolation("walk-forward fold metrics have unexpected fields")
    report_id = report["reportId"]
    unsigned = {key: value for key, value in report.items() if key != "reportId"}
    if not isinstance(report_id, str) or not _REPORT_ID.fullmatch(report_id):
        raise ContractViolation("walk-forward control-report ID is invalid")
    if report_id != f"ASHA_WALK_FORWARD_CONTROL_REPORT_{fingerprint(unsigned)}":
        raise ContractViolation("walk-forward control-report fingerprint mismatch")
    if unsigned != _build_unsigned(dataset, matrix, plan):
        raise ContractViolation("walk-forward control report does not match exact multi-fold replay")
    return report
