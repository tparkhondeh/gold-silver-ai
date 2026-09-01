"""Train-only synthetic population covariance with no portfolio decision output."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .features import validate_point_in_time_return_matrix
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


COVARIANCE_SCHEMA_VERSION = "asha.synthetic.train_only_covariance.v1"
_COVARIANCE_ID = re.compile(r"ASHA_TRAIN_ONLY_COVARIANCE_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_COVARIANCE_KEYS = {
    "schemaVersion", "covarianceId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "standardizerReference",
    "methodologyReference", "foldIndex", "trainingFeatureStartIndex",
    "trainingFeatureEndIndex", "parameters", "instrumentIds", "rows",
    "zeroVarianceInstrumentIds", "reasonCodes",
}
_ROW_KEYS = {"instrumentId", "values"}
_VALUE_KEYS = {"instrumentId", "value"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _build_unsigned(
    matrix: dict[str, Any],
    standardizer: dict[str, Any],
) -> dict[str, Any]:
    training_start = standardizer["trainingFeatureStartIndex"]
    training_end = standardizer["trainingFeatureEndIndex"]
    training_rows = [
        row for row in matrix["rows"]
        if training_start <= row["periodIndex"] <= training_end
    ]
    if [row["periodIndex"] for row in training_rows] != list(range(training_start, training_end + 1)):
        raise ContractViolation("covariance needs the complete contiguous training-feature interval")

    instrument_ids = list(matrix["instrumentIds"])
    columns = {instrument_id: [] for instrument_id in instrument_ids}
    for row in training_rows:
        returns = {item["instrumentId"]: Decimal(item["value"]) for item in row["returns"]}
        if set(returns) != set(instrument_ids):
            raise ContractViolation("covariance row has a different instrument set")
        for instrument_id in instrument_ids:
            columns[instrument_id].append(returns[instrument_id])

    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        count = Decimal(len(training_rows))
        means = {
            instrument_id: sum(columns[instrument_id]) / count
            for instrument_id in instrument_ids
        }
        exact_covariance = {
            (left, right): sum(
                (left_value - means[left]) * (right_value - means[right])
                for left_value, right_value in zip(columns[left], columns[right], strict=True)
            ) / count
            for left in instrument_ids
            for right in instrument_ids
        }

    return {
        "schemaVersion": COVARIANCE_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "returnMatrixReference": {
            "matrixId": matrix["matrixId"],
            "schemaVersion": matrix["schemaVersion"],
        },
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
        "trainingFeatureStartIndex": training_start,
        "trainingFeatureEndIndex": training_end,
        "parameters": {
            "estimator": "population_covariance_v1",
            "denominator": "training_observation_count",
            "rounding": "half_even_12_decimals",
        },
        "instrumentIds": instrument_ids,
        "rows": [
            {
                "instrumentId": left,
                "values": [
                    {
                        "instrumentId": right,
                        "value": _decimal_string(exact_covariance[(left, right)]),
                    }
                    for right in instrument_ids
                ],
            }
            for left in instrument_ids
        ],
        "zeroVarianceInstrumentIds": [
            instrument_id for instrument_id in instrument_ids
            if exact_covariance[(instrument_id, instrument_id)] == 0
        ],
        "reasonCodes": [
            "COVARIANCE_FEATURE_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
        ],
    }


def build_train_only_covariance(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    """Build one population covariance matrix from an exact synthetic train fold."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    unsigned = _build_unsigned(matrix, standardizer)
    covariance = {
        **unsigned,
        "covarianceId": f"ASHA_TRAIN_ONLY_COVARIANCE_{fingerprint(unsigned)}",
    }
    return validate_train_only_covariance(covariance, dataset, matrix, plan, standardizer)


def validate_train_only_covariance(
    covariance_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    """Recompute train-only covariance and reject future leakage or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    if not isinstance(covariance_payload, dict) or set(covariance_payload) != _COVARIANCE_KEYS:
        raise ContractViolation("train-only covariance has unexpected fields")
    covariance = deepcopy(covariance_payload)
    if covariance["schemaVersion"] != COVARIANCE_SCHEMA_VERSION:
        raise ContractViolation("unsupported train-only covariance schema version")
    if (
        covariance["status"] != "evaluation_only"
        or covariance["financialUseAllowed"] is not False
        or covariance["executionAllowed"] is not False
        or covariance["decisionState"] != "no_decision"
    ):
        raise ContractViolation("train-only covariance crossed its safety boundary")
    if covariance["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("train-only covariance cannot approve a methodology")
    if covariance["parameters"] != {
        "estimator": "population_covariance_v1",
        "denominator": "training_observation_count",
        "rounding": "half_even_12_decimals",
    }:
        raise ContractViolation("covariance parameters are not the reviewed exact mechanics")
    if covariance["reasonCodes"] != [
        "COVARIANCE_FEATURE_ONLY", "METHODOLOGY_NOT_APPROVED", "NO_FINANCIAL_DECISION",
        "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY", "TRAIN_ONLY_FIT",
    ]:
        raise ContractViolation("train-only covariance is missing permanent safety reasons")
    if not isinstance(covariance["instrumentIds"], list) or not covariance["instrumentIds"]:
        raise ContractViolation("train-only covariance needs instruments")
    if not isinstance(covariance["rows"], list) or any(
        not isinstance(row, dict) or set(row) != _ROW_KEYS for row in covariance["rows"]
    ):
        raise ContractViolation("covariance row has unexpected fields")
    if any(
        not isinstance(row["values"], list)
        or not row["values"]
        or any(
            not isinstance(value, dict) or set(value) != _VALUE_KEYS
            for value in row["values"]
        )
        for row in covariance["rows"]
    ):
        raise ContractViolation("covariance value has unexpected fields")
    if not isinstance(covariance["zeroVarianceInstrumentIds"], list) or any(
        not isinstance(instrument_id, str)
        for instrument_id in covariance["zeroVarianceInstrumentIds"]
    ):
        raise ContractViolation("zero-variance instrument IDs are invalid")
    covariance_id = covariance["covarianceId"]
    unsigned = {key: value for key, value in covariance.items() if key != "covarianceId"}
    if not isinstance(covariance_id, str) or not _COVARIANCE_ID.fullmatch(covariance_id):
        raise ContractViolation("train-only covariance ID is invalid")
    if covariance_id != f"ASHA_TRAIN_ONLY_COVARIANCE_{fingerprint(unsigned)}":
        raise ContractViolation("train-only covariance fingerprint mismatch")
    if unsigned != _build_unsigned(matrix, standardizer):
        raise ContractViolation("train-only covariance does not match exact replay")
    return covariance
