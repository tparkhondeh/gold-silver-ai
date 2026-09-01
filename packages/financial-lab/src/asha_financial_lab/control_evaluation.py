"""Evaluate frozen synthetic comparison weights on one test fold."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .comparison_weights import validate_inverse_volatility_control_weights
from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .features import validate_point_in_time_return_matrix
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION = "asha.synthetic.weighted_control_evaluation.v1"
_EVALUATION_ID = re.compile(r"ASHA_WEIGHTED_CONTROL_EVAL_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_EVALUATION_KEYS = {
    "schemaVersion", "evaluationId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "weightSetReference",
    "methodologyReference", "foldIndex", "testStartIndex", "testEndIndex",
    "periodResults", "metrics", "reasonCodes",
}
_PERIOD_KEYS = {"periodIndex", "weightedReturn", "wealthIndex"}
_METRIC_KEYS = {"periodCount", "cumulativeChangePercent", "maximumDrawdownPercent"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _build_unsigned(
    matrix: dict[str, Any],
    plan: dict[str, Any],
    weight_set: dict[str, Any],
) -> dict[str, Any]:
    fold = plan["folds"][weight_set["foldIndex"]]
    test_start = fold["testStartIndex"]
    test_end = fold["testEndIndex"]
    if matrix["startIndex"] > test_start or matrix["endIndex"] < test_end:
        raise ContractViolation("return matrix does not cover the weighted-control test interval")
    test_rows = [row for row in matrix["rows"] if test_start <= row["periodIndex"] <= test_end]
    if [row["periodIndex"] for row in test_rows] != list(range(test_start, test_end + 1)):
        raise ContractViolation("weighted-control test rows are not contiguous")
    weights = {item["instrumentId"]: Decimal(item["weight"]) for item in weight_set["weights"]}
    if set(weights) != set(matrix["instrumentIds"]):
        raise ContractViolation("weight set and return matrix instrument sets differ")

    wealth = Decimal("1")
    peak = wealth
    maximum_drawdown = Decimal("0")
    period_results = []
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for row in test_rows:
            returns = {item["instrumentId"]: Decimal(item["value"]) for item in row["returns"]}
            if set(returns) != set(weights):
                raise ContractViolation("weighted-control row has a different instrument set")
            weighted_return = sum(weights[instrument_id] * returns[instrument_id] for instrument_id in matrix["instrumentIds"])
            wealth *= Decimal("1") + weighted_return
            peak = max(peak, wealth)
            maximum_drawdown = max(maximum_drawdown, (peak - wealth) / peak)
            period_results.append({
                "periodIndex": row["periodIndex"],
                "weightedReturn": _decimal_string(weighted_return),
                "wealthIndex": _decimal_string(wealth),
            })

    return {
        "schemaVersion": WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": weight_set["benchmarkId"],
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "returnMatrixReference": deepcopy(weight_set["returnMatrixReference"]),
        "walkForwardPlanReference": deepcopy(weight_set["walkForwardPlanReference"]),
        "weightSetReference": {
            "weightSetId": weight_set["weightSetId"],
            "schemaVersion": weight_set["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "foldIndex": weight_set["foldIndex"],
        "testStartIndex": test_start,
        "testEndIndex": test_end,
        "periodResults": period_results,
        "metrics": {
            "periodCount": len(period_results),
            "cumulativeChangePercent": _decimal_string((wealth - Decimal("1")) * Decimal("100")),
            "maximumDrawdownPercent": _decimal_string(maximum_drawdown * Decimal("100")),
        },
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TEST_FOLD_EVALUATION_ONLY",
        ],
    }


def evaluate_inverse_volatility_control_fold(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Evaluate frozen train-only weights on the exact associated synthetic test fold."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    weight_set = validate_inverse_volatility_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer
    )
    unsigned = _build_unsigned(matrix, plan, weight_set)
    evaluation = {**unsigned, "evaluationId": f"ASHA_WEIGHTED_CONTROL_EVAL_{fingerprint(unsigned)}"}
    return validate_inverse_volatility_control_evaluation(
        evaluation, dataset, matrix, plan, standardizer, weight_set
    )


def validate_inverse_volatility_control_evaluation(
    evaluation_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    """Recompute the complete test path and reject provenance drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    weight_set = validate_inverse_volatility_control_weights(
        weight_set_payload, dataset, matrix, plan, standardizer
    )
    if not isinstance(evaluation_payload, dict) or set(evaluation_payload) != _EVALUATION_KEYS:
        raise ContractViolation("weighted-control evaluation has unexpected fields")
    evaluation = deepcopy(evaluation_payload)
    if evaluation["schemaVersion"] != WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION:
        raise ContractViolation("unsupported weighted-control evaluation schema version")
    if (
        evaluation["status"] != "evaluation_only"
        or evaluation["financialUseAllowed"] is not False
        or evaluation["executionAllowed"] is not False
        or evaluation["decisionState"] != "no_decision"
        or evaluation["benchmarkId"] != weight_set["benchmarkId"]
    ):
        raise ContractViolation("weighted-control evaluation crossed its safety boundary")
    if evaluation["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("weighted-control evaluation cannot approve a methodology")
    if evaluation["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "METHODOLOGY_NOT_APPROVED", "NO_FINANCIAL_DECISION",
        "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY", "TEST_FOLD_EVALUATION_ONLY",
    ]:
        raise ContractViolation("weighted-control evaluation is missing permanent safety reasons")
    if not isinstance(evaluation["periodResults"], list) or any(
        not isinstance(item, dict) or set(item) != _PERIOD_KEYS for item in evaluation["periodResults"]
    ):
        raise ContractViolation("weighted-control period results have unexpected fields")
    if not isinstance(evaluation["metrics"], dict) or set(evaluation["metrics"]) != _METRIC_KEYS:
        raise ContractViolation("weighted-control metrics have unexpected fields")
    evaluation_id = evaluation["evaluationId"]
    unsigned = {key: value for key, value in evaluation.items() if key != "evaluationId"}
    if not isinstance(evaluation_id, str) or not _EVALUATION_ID.fullmatch(evaluation_id):
        raise ContractViolation("weighted-control evaluation ID is invalid")
    if evaluation_id != f"ASHA_WEIGHTED_CONTROL_EVAL_{fingerprint(unsigned)}":
        raise ContractViolation("weighted-control evaluation fingerprint mismatch")
    if unsigned != _build_unsigned(matrix, plan, weight_set):
        raise ContractViolation("weighted-control evaluation does not match exact test-fold replay")
    return evaluation
