"""Train-only synthetic feature statistics bound to one walk-forward fold."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .controls import known_levels
from .features import validate_point_in_time_return_matrix
from .walk_forward import validate_walk_forward_plan


STANDARDIZER_SCHEMA_VERSION = "asha.synthetic.standardizer.v1"
NORMALIZED_FOLD_SCHEMA_VERSION = "asha.synthetic.normalized_fold.v1"
_STANDARDIZER_ID = re.compile(r"ASHA_STANDARDIZER_[a-f0-9]{64}\Z")
_NORMALIZED_FOLD_ID = re.compile(r"ASHA_NORMALIZED_FOLD_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_STANDARDIZER_KEYS = {
    "schemaVersion",
    "standardizerId",
    "status",
    "financialUseAllowed",
    "datasetReference",
    "returnMatrixReference",
    "walkForwardPlanReference",
    "methodologyReference",
    "foldIndex",
    "trainingFeatureStartIndex",
    "trainingFeatureEndIndex",
    "parameters",
    "instrumentStatistics",
    "reasonCodes",
}
_STATISTIC_KEYS = {"instrumentId", "observationCount", "mean", "standardDeviation"}
_NORMALIZED_KEYS = {
    "schemaVersion",
    "normalizedFoldId",
    "status",
    "financialUseAllowed",
    "datasetReference",
    "returnMatrixReference",
    "walkForwardPlanReference",
    "standardizerReference",
    "methodologyReference",
    "foldIndex",
    "testStartIndex",
    "testEndIndex",
    "rows",
    "reasonCodes",
}
_NORMALIZED_ROW_KEYS = {"periodIndex", "values"}
_NORMALIZED_VALUE_KEYS = {"instrumentId", "value"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _earliest_return_index(dataset: dict[str, Any]) -> int:
    maximum_period = max(row["periodIndex"] for row in dataset["observations"])
    for period_index in range(1, maximum_period + 1):
        try:
            known_levels(dataset, period_index - 1)
            known_levels(dataset, period_index)
        except ContractViolation:
            continue
        return period_index
    raise ContractViolation("dataset has no point-in-time-computable return period")


def _fold(plan: dict[str, Any], fold_index: object) -> dict[str, Any]:
    if type(fold_index) is not int or not 0 <= fold_index < len(plan["folds"]):
        raise ValueError("fold_index must identify a walk-forward fold")
    return plan["folds"][fold_index]


def _build_unsigned(
    dataset: dict[str, Any],
    matrix: dict[str, Any],
    plan: dict[str, Any],
    fold_index: int,
) -> dict[str, Any]:
    fold = plan["folds"][fold_index]
    training_start = max(_earliest_return_index(dataset), fold["trainStartIndex"] + 1)
    training_end = fold["trainEndIndex"]
    if matrix["startIndex"] > training_start or matrix["endIndex"] < training_end:
        raise ContractViolation("return matrix does not cover the complete training-feature interval")
    training_rows = [
        row for row in matrix["rows"]
        if training_start <= row["periodIndex"] <= training_end
    ]
    if [row["periodIndex"] for row in training_rows] != list(range(training_start, training_end + 1)):
        raise ContractViolation("training-feature rows are not contiguous")

    values_by_instrument = {instrument_id: [] for instrument_id in matrix["instrumentIds"]}
    for row in training_rows:
        for item in row["returns"]:
            values_by_instrument[item["instrumentId"]].append(Decimal(item["value"]))

    statistics = []
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for instrument_id in matrix["instrumentIds"]:
            values = values_by_instrument[instrument_id]
            if not values:
                raise ContractViolation("every instrument needs train-only feature values")
            count = Decimal(len(values))
            mean = sum(values) / count
            variance = sum((value - mean) ** 2 for value in values) / count
            statistics.append({
                "instrumentId": instrument_id,
                "observationCount": len(values),
                "mean": _decimal_string(mean),
                "standardDeviation": _decimal_string(variance.sqrt()),
            })

    return {
        "schemaVersion": STANDARDIZER_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
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
        "foldIndex": fold_index,
        "trainingFeatureStartIndex": training_start,
        "trainingFeatureEndIndex": training_end,
        "parameters": {
            "kind": "zscore_population_v1",
            "zeroVariancePolicy": "emit_zero_when_applied",
        },
        "instrumentStatistics": statistics,
        "reasonCodes": [
            "METHODOLOGY_NOT_APPROVED",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
        ],
    }


def fit_train_only_standardizer(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    fold_index: object,
) -> dict[str, Any]:
    """Fit population z-score statistics using one fold's training rows only."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    fold = _fold(plan, fold_index)
    unsigned = _build_unsigned(dataset, matrix, plan, fold["foldIndex"])
    standardizer = {**unsigned, "standardizerId": f"ASHA_STANDARDIZER_{fingerprint(unsigned)}"}
    return validate_train_only_standardizer(standardizer, dataset, matrix, plan)


def validate_train_only_standardizer(
    standardizer_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    """Recompute every statistic and reject any test-influenced or altered value."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    if not isinstance(standardizer_payload, dict) or set(standardizer_payload) != _STANDARDIZER_KEYS:
        raise ContractViolation("standardizer has unexpected fields")
    standardizer = deepcopy(standardizer_payload)
    if standardizer["schemaVersion"] != STANDARDIZER_SCHEMA_VERSION:
        raise ContractViolation("unsupported standardizer schema version")
    if standardizer["status"] != "evaluation_only" or standardizer["financialUseAllowed"] is not False:
        raise ContractViolation("standardizer must remain evaluation-only")
    if standardizer["methodologyReference"] != {
        "entityId": "STATUS_TBD",
        "version": 0,
        "approvalState": "unapproved",
    }:
        raise ContractViolation("standardizer cannot approve a methodology")
    if standardizer["parameters"] != {
        "kind": "zscore_population_v1",
        "zeroVariancePolicy": "emit_zero_when_applied",
    }:
        raise ContractViolation("standardizer parameters are not the reviewed exact mechanics")
    if standardizer["reasonCodes"] != [
        "METHODOLOGY_NOT_APPROVED",
        "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY",
        "TRAIN_ONLY_FIT",
    ]:
        raise ContractViolation("standardizer is missing permanent safety reasons")
    if not isinstance(standardizer["instrumentStatistics"], list) or any(
        not isinstance(item, dict) or set(item) != _STATISTIC_KEYS
        for item in standardizer["instrumentStatistics"]
    ):
        raise ContractViolation("standardizer statistics have unexpected fields")
    try:
        fold = _fold(plan, standardizer["foldIndex"])
    except ValueError as error:
        raise ContractViolation("standardizer fold is invalid") from error
    standardizer_id = standardizer["standardizerId"]
    unsigned = {key: value for key, value in standardizer.items() if key != "standardizerId"}
    if not isinstance(standardizer_id, str) or not _STANDARDIZER_ID.fullmatch(standardizer_id):
        raise ContractViolation("standardizer ID is invalid")
    if standardizer_id != f"ASHA_STANDARDIZER_{fingerprint(unsigned)}":
        raise ContractViolation("standardizer fingerprint mismatch")
    if unsigned != _build_unsigned(dataset, matrix, plan, fold["foldIndex"]):
        raise ContractViolation("standardizer does not match exact train-only replay")
    return standardizer


def _build_normalized_unsigned(
    matrix: dict[str, Any],
    plan: dict[str, Any],
    standardizer: dict[str, Any],
) -> dict[str, Any]:
    fold = plan["folds"][standardizer["foldIndex"]]
    test_start = fold["testStartIndex"]
    test_end = fold["testEndIndex"]
    if matrix["startIndex"] > test_start or matrix["endIndex"] < test_end:
        raise ContractViolation("return matrix does not cover the complete test interval")
    test_rows = [row for row in matrix["rows"] if test_start <= row["periodIndex"] <= test_end]
    if [row["periodIndex"] for row in test_rows] != list(range(test_start, test_end + 1)):
        raise ContractViolation("test feature rows are not contiguous")
    statistics = {item["instrumentId"]: item for item in standardizer["instrumentStatistics"]}
    if set(statistics) != set(matrix["instrumentIds"]):
        raise ContractViolation("standardizer and return matrix instrument sets differ")

    rows = []
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for row in test_rows:
            values = []
            for item in row["returns"]:
                statistic = statistics[item["instrumentId"]]
                mean = Decimal(statistic["mean"])
                standard_deviation = Decimal(statistic["standardDeviation"])
                normalized = (
                    Decimal("0")
                    if standard_deviation == 0
                    else (Decimal(item["value"]) - mean) / standard_deviation
                )
                values.append({
                    "instrumentId": item["instrumentId"],
                    "value": _decimal_string(normalized),
                })
            rows.append({"periodIndex": row["periodIndex"], "values": values})

    return {
        "schemaVersion": NORMALIZED_FOLD_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "returnMatrixReference": deepcopy(standardizer["returnMatrixReference"]),
        "walkForwardPlanReference": deepcopy(standardizer["walkForwardPlanReference"]),
        "standardizerReference": {
            "standardizerId": standardizer["standardizerId"],
            "schemaVersion": standardizer["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "foldIndex": standardizer["foldIndex"],
        "testStartIndex": test_start,
        "testEndIndex": test_end,
        "rows": rows,
        "reasonCodes": [
            "METHODOLOGY_NOT_APPROVED",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_FITTED_TRANSFORM_ONLY",
        ],
    }


def apply_train_fitted_standardizer(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    """Apply frozen training statistics to one fold's test rows without refitting."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    unsigned = _build_normalized_unsigned(matrix, plan, standardizer)
    normalized = {**unsigned, "normalizedFoldId": f"ASHA_NORMALIZED_FOLD_{fingerprint(unsigned)}"}
    return validate_normalized_fold(normalized, dataset, matrix, plan, standardizer)


def validate_normalized_fold(
    normalized_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    """Recompute a test transform and reject refitting, provenance drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    if not isinstance(normalized_payload, dict) or set(normalized_payload) != _NORMALIZED_KEYS:
        raise ContractViolation("normalized fold has unexpected fields")
    normalized = deepcopy(normalized_payload)
    if normalized["schemaVersion"] != NORMALIZED_FOLD_SCHEMA_VERSION:
        raise ContractViolation("unsupported normalized-fold schema version")
    if normalized["status"] != "evaluation_only" or normalized["financialUseAllowed"] is not False:
        raise ContractViolation("normalized fold must remain evaluation-only")
    if normalized["methodologyReference"] != {
        "entityId": "STATUS_TBD",
        "version": 0,
        "approvalState": "unapproved",
    }:
        raise ContractViolation("normalized fold cannot approve a methodology")
    if normalized["reasonCodes"] != [
        "METHODOLOGY_NOT_APPROVED",
        "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY",
        "TRAIN_FITTED_TRANSFORM_ONLY",
    ]:
        raise ContractViolation("normalized fold is missing permanent safety reasons")
    if not isinstance(normalized["rows"], list) or not normalized["rows"]:
        raise ContractViolation("normalized fold needs test rows")
    if any(not isinstance(row, dict) or set(row) != _NORMALIZED_ROW_KEYS for row in normalized["rows"]):
        raise ContractViolation("normalized row has unexpected fields")
    if any(
        not isinstance(value, dict) or set(value) != _NORMALIZED_VALUE_KEYS
        for row in normalized["rows"]
        for value in row["values"]
    ):
        raise ContractViolation("normalized value has unexpected fields")
    normalized_id = normalized["normalizedFoldId"]
    unsigned = {key: value for key, value in normalized.items() if key != "normalizedFoldId"}
    if not isinstance(normalized_id, str) or not _NORMALIZED_FOLD_ID.fullmatch(normalized_id):
        raise ContractViolation("normalized-fold ID is invalid")
    if normalized_id != f"ASHA_NORMALIZED_FOLD_{fingerprint(unsigned)}":
        raise ContractViolation("normalized-fold fingerprint mismatch")
    if unsigned != _build_normalized_unsigned(matrix, plan, standardizer):
        raise ContractViolation("normalized fold does not match exact train-fitted replay")
    return normalized
