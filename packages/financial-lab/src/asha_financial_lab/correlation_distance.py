"""Train-only synthetic correlation distance for later comparison controls."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .correlation import validate_train_only_correlation
from .covariance import validate_train_only_covariance
from .features import validate_point_in_time_return_matrix
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


CORRELATION_DISTANCE_SCHEMA_VERSION = "asha.synthetic.correlation_distance.v1"
_DISTANCE_ID = re.compile(r"ASHA_CORRELATION_DISTANCE_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_DISTANCE_KEYS = {
    "schemaVersion", "distanceId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "standardizerReference",
    "covarianceReference", "correlationReference", "methodologyReference",
    "foldIndex", "trainingFeatureStartIndex", "trainingFeatureEndIndex",
    "parameters", "activeInstrumentIds", "excludedZeroVarianceInstrumentIds",
    "rows", "reasonCodes",
}
_ROW_KEYS = {"instrumentId", "values"}
_VALUE_KEYS = {"instrumentId", "value"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _build_unsigned(correlation: dict[str, Any]) -> dict[str, Any]:
    active = list(correlation["activeInstrumentIds"])
    correlation_values = {
        (row["instrumentId"], value["instrumentId"]): Decimal(value["value"])
        for row in correlation["rows"]
        for value in row["values"]
    }
    expected_pairs = {(left, right) for left in active for right in active}
    if set(correlation_values) != expected_pairs:
        raise ContractViolation("correlation does not contain an exact square active-instrument matrix")

    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        distances = {}
        for left in active:
            for right in active:
                correlation_value = correlation_values[(left, right)]
                if correlation_value < -1 or correlation_value > 1:
                    raise ContractViolation("correlation distance requires values between minus one and one")
                distance = ((Decimal("1") - correlation_value) / Decimal("2")).sqrt()
                if left == right and distance != 0:
                    raise ContractViolation("correlation-distance diagonal must be zero")
                distances[(left, right)] = distance

    return {
        "schemaVersion": CORRELATION_DISTANCE_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "datasetReference": deepcopy(correlation["datasetReference"]),
        "returnMatrixReference": deepcopy(correlation["returnMatrixReference"]),
        "walkForwardPlanReference": deepcopy(correlation["walkForwardPlanReference"]),
        "standardizerReference": deepcopy(correlation["standardizerReference"]),
        "covarianceReference": deepcopy(correlation["covarianceReference"]),
        "correlationReference": {
            "correlationId": correlation["correlationId"],
            "schemaVersion": correlation["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "foldIndex": correlation["foldIndex"],
        "trainingFeatureStartIndex": correlation["trainingFeatureStartIndex"],
        "trainingFeatureEndIndex": correlation["trainingFeatureEndIndex"],
        "parameters": {
            "kind": "sqrt_one_minus_correlation_over_two_v1",
            "rounding": "half_even_12_decimals",
            "range": "zero_to_one_inclusive",
        },
        "activeInstrumentIds": active,
        "excludedZeroVarianceInstrumentIds": deepcopy(
            correlation["excludedZeroVarianceInstrumentIds"]
        ),
        "rows": [
            {
                "instrumentId": left,
                "values": [
                    {
                        "instrumentId": right,
                        "value": _decimal_string(distances[(left, right)]),
                    }
                    for right in active
                ],
            }
            for left in active
        ],
        "reasonCodes": [
            "CORRELATION_DISTANCE_FEATURE_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
            "ZERO_VARIANCE_EXCLUDED",
        ],
    }


def build_train_only_correlation_distance(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
) -> dict[str, Any]:
    """Convert one reviewed train-only correlation matrix into bounded distance."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    covariance = validate_train_only_covariance(
        covariance_payload, dataset, matrix, plan, standardizer
    )
    correlation = validate_train_only_correlation(
        correlation_payload, dataset, matrix, plan, standardizer, covariance
    )
    unsigned = _build_unsigned(correlation)
    distance = {
        **unsigned,
        "distanceId": f"ASHA_CORRELATION_DISTANCE_{fingerprint(unsigned)}",
    }
    return validate_train_only_correlation_distance(
        distance, dataset, matrix, plan, standardizer, covariance, correlation
    )


def validate_train_only_correlation_distance(
    distance_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
) -> dict[str, Any]:
    """Recompute the complete distance matrix and reject drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    covariance = validate_train_only_covariance(
        covariance_payload, dataset, matrix, plan, standardizer
    )
    correlation = validate_train_only_correlation(
        correlation_payload, dataset, matrix, plan, standardizer, covariance
    )
    if not isinstance(distance_payload, dict) or set(distance_payload) != _DISTANCE_KEYS:
        raise ContractViolation("correlation distance has unexpected fields")
    distance = deepcopy(distance_payload)
    if distance["schemaVersion"] != CORRELATION_DISTANCE_SCHEMA_VERSION:
        raise ContractViolation("unsupported correlation-distance schema version")
    if (
        distance["status"] != "evaluation_only"
        or distance["financialUseAllowed"] is not False
        or distance["executionAllowed"] is not False
        or distance["decisionState"] != "no_decision"
    ):
        raise ContractViolation("correlation distance crossed its safety boundary")
    if distance["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("correlation distance cannot approve a methodology")
    if distance["parameters"] != {
        "kind": "sqrt_one_minus_correlation_over_two_v1",
        "rounding": "half_even_12_decimals",
        "range": "zero_to_one_inclusive",
    }:
        raise ContractViolation("correlation-distance parameters are not the reviewed mechanics")
    if distance["reasonCodes"] != [
        "CORRELATION_DISTANCE_FEATURE_ONLY", "METHODOLOGY_NOT_APPROVED",
        "NO_FINANCIAL_DECISION", "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY",
        "TRAIN_ONLY_FIT", "ZERO_VARIANCE_EXCLUDED",
    ]:
        raise ContractViolation("correlation distance is missing permanent safety reasons")
    if not isinstance(distance["activeInstrumentIds"], list) or len(distance["activeInstrumentIds"]) < 2:
        raise ContractViolation("correlation distance needs at least two active instruments")
    if not isinstance(distance["excludedZeroVarianceInstrumentIds"], list):
        raise ContractViolation("excluded zero-variance instruments must be an array")
    if not isinstance(distance["rows"], list) or any(
        not isinstance(row, dict) or set(row) != _ROW_KEYS for row in distance["rows"]
    ):
        raise ContractViolation("correlation-distance row has unexpected fields")
    if any(
        not isinstance(row["values"], list)
        or not row["values"]
        or any(
            not isinstance(value, dict) or set(value) != _VALUE_KEYS
            for value in row["values"]
        )
        for row in distance["rows"]
    ):
        raise ContractViolation("correlation-distance value has unexpected fields")
    distance_id = distance["distanceId"]
    unsigned = {key: value for key, value in distance.items() if key != "distanceId"}
    if not isinstance(distance_id, str) or not _DISTANCE_ID.fullmatch(distance_id):
        raise ContractViolation("correlation-distance ID is invalid")
    if distance_id != f"ASHA_CORRELATION_DISTANCE_{fingerprint(unsigned)}":
        raise ContractViolation("correlation-distance fingerprint mismatch")
    if unsigned != _build_unsigned(correlation):
        raise ContractViolation("correlation distance does not match exact replay")
    return distance
