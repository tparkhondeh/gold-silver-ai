"""Replay the complete HRP-style comparison chain across synthetic folds."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .cluster_order import build_train_only_cluster_leaf_order
from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .control_evaluation import evaluate_hrp_comparison_control_fold
from .correlation import build_train_only_correlation
from .correlation_distance import build_train_only_correlation_distance
from .covariance import build_train_only_covariance
from .features import validate_point_in_time_return_matrix
from .hierarchical_clustering import build_train_only_single_linkage_clustering
from .hrp_control import build_hrp_comparison_control_weights
from .normalization import fit_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


HRP_WALK_FORWARD_SCHEMA_VERSION = "asha.synthetic.hrp_walk_forward_report.v1"
_REPORT_ID = re.compile(r"ASHA_HRP_WALK_FORWARD_REPORT_[a-f0-9]{64}\Z")
_REPORT_KEYS = {
    "schemaVersion", "reportId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "methodologyReference",
    "parameters", "summary", "foldResults", "reasonCodes",
}
_SUMMARY_KEYS = {
    "foldCount", "evaluatedPeriodCount", "firstTestIndex", "lastTestIndex",
    "aggregationPolicy",
}
_FOLD_RESULT_KEYS = {
    "foldIndex", "trainingFeatureStartIndex", "trainingFeatureEndIndex",
    "testStartIndex", "testEndIndex", "standardizerId", "covarianceId",
    "correlationId", "distanceId", "clusteringId", "orderId", "weightSetId",
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
            dataset, matrix, plan, fold["foldIndex"]
        )
        covariance = build_train_only_covariance(
            dataset, matrix, plan, standardizer
        )
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
            dataset,
            matrix,
            plan,
            standardizer,
            covariance,
            correlation,
            distance,
            clustering,
        )
        weights = build_hrp_comparison_control_weights(
            dataset,
            matrix,
            plan,
            standardizer,
            covariance,
            correlation,
            distance,
            clustering,
            order,
        )
        evaluation = evaluate_hrp_comparison_control_fold(
            dataset,
            matrix,
            plan,
            standardizer,
            covariance,
            correlation,
            distance,
            clustering,
            order,
            weights,
        )
        fold_results.append({
            "foldIndex": fold["foldIndex"],
            "trainingFeatureStartIndex": standardizer["trainingFeatureStartIndex"],
            "trainingFeatureEndIndex": standardizer["trainingFeatureEndIndex"],
            "testStartIndex": evaluation["testStartIndex"],
            "testEndIndex": evaluation["testEndIndex"],
            "standardizerId": standardizer["standardizerId"],
            "covarianceId": covariance["covarianceId"],
            "correlationId": correlation["correlationId"],
            "distanceId": distance["distanceId"],
            "clusteringId": clustering["clusteringId"],
            "orderId": order["orderId"],
            "weightSetId": weights["weightSetId"],
            "evaluationId": evaluation["evaluationId"],
            "metrics": deepcopy(evaluation["metrics"]),
        })

    return {
        "schemaVersion": HRP_WALK_FORWARD_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": "ASHA_BENCHMARK_HRP_CONTROL_V1",
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
        "parameters": {
            "foldPolicy": "refit_exact_hrp_chain_then_freeze_for_test_v1",
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
            "HRP_STYLE_BENCHMARK_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_AGGREGATED_PERFORMANCE_CLAIM",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "WALK_FORWARD_EVALUATION_ONLY",
        ],
    }


def build_hrp_walk_forward_report(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    """Refit the complete HRP chain per fold and keep test metrics separate."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    unsigned = _build_unsigned(dataset, matrix, plan)
    report = {
        **unsigned,
        "reportId": f"ASHA_HRP_WALK_FORWARD_REPORT_{fingerprint(unsigned)}",
    }
    return validate_hrp_walk_forward_report(report, dataset, matrix, plan)


def validate_hrp_walk_forward_report(
    report_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    """Recompute every HRP fold and reject omitted provenance or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    if not isinstance(report_payload, dict) or set(report_payload) != _REPORT_KEYS:
        raise ContractViolation("HRP walk-forward report has unexpected fields")
    report = deepcopy(report_payload)
    if report["schemaVersion"] != HRP_WALK_FORWARD_SCHEMA_VERSION:
        raise ContractViolation("unsupported HRP walk-forward schema version")
    if (
        report["status"] != "evaluation_only"
        or report["financialUseAllowed"] is not False
        or report["executionAllowed"] is not False
        or report["decisionState"] != "no_decision"
        or report["benchmarkId"] != "ASHA_BENCHMARK_HRP_CONTROL_V1"
    ):
        raise ContractViolation("HRP walk-forward report crossed its safety boundary")
    if report["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("HRP walk-forward cannot approve a methodology")
    if report["parameters"] != {
        "foldPolicy": "refit_exact_hrp_chain_then_freeze_for_test_v1",
    }:
        raise ContractViolation("HRP walk-forward fold policy is not exact")
    if report["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "HRP_STYLE_BENCHMARK_ONLY",
        "METHODOLOGY_NOT_APPROVED", "NO_AGGREGATED_PERFORMANCE_CLAIM",
        "NO_FINANCIAL_DECISION", "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY", "WALK_FORWARD_EVALUATION_ONLY",
    ]:
        raise ContractViolation("HRP walk-forward report is missing safety reasons")
    if not isinstance(report["summary"], dict) or set(report["summary"]) != _SUMMARY_KEYS:
        raise ContractViolation("HRP walk-forward summary has unexpected fields")
    if not isinstance(report["foldResults"], list) or not report["foldResults"]:
        raise ContractViolation("HRP walk-forward report needs fold results")
    if any(
        not isinstance(item, dict) or set(item) != _FOLD_RESULT_KEYS
        for item in report["foldResults"]
    ):
        raise ContractViolation("HRP walk-forward fold has unexpected fields")
    if any(
        not isinstance(item["metrics"], dict) or set(item["metrics"]) != _METRIC_KEYS
        for item in report["foldResults"]
    ):
        raise ContractViolation("HRP walk-forward metrics have unexpected fields")
    report_id = report["reportId"]
    unsigned = {key: value for key, value in report.items() if key != "reportId"}
    if not isinstance(report_id, str) or not _REPORT_ID.fullmatch(report_id):
        raise ContractViolation("HRP walk-forward report ID is invalid")
    if report_id != f"ASHA_HRP_WALK_FORWARD_REPORT_{fingerprint(unsigned)}":
        raise ContractViolation("HRP walk-forward report fingerprint mismatch")
    if unsigned != _build_unsigned(dataset, matrix, plan):
        raise ContractViolation("HRP walk-forward report does not match exact replay")
    return report
