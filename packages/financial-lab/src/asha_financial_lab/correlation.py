"""Train-only synthetic correlation derived from reviewed covariance output."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .covariance import validate_train_only_covariance
from .features import validate_point_in_time_return_matrix
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


CORRELATION_SCHEMA_VERSION = "asha.synthetic.train_only_correlation.v2"
_CORRELATION_ID = re.compile(r"ASHA_TRAIN_ONLY_CORRELATION_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_ARITHMETIC_TOLERANCE = Decimal("0.000000000000000000000000000000000000000100")
_CORRELATION_KEYS = {
    "schemaVersion", "correlationId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "standardizerReference",
    "covarianceReference", "methodologyReference", "foldIndex",
    "trainingFeatureStartIndex", "trainingFeatureEndIndex", "parameters",
    "activeInstrumentIds", "excludedZeroVarianceInstrumentIds", "rows",
    "reasonCodes",
}
_ROW_KEYS = {"instrumentId", "values"}
_VALUE_KEYS = {"instrumentId", "value"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _bounded_correlation(value: Decimal) -> Decimal:
    if value > 1:
        if value - Decimal("1") > _ARITHMETIC_TOLERANCE:
            raise ContractViolation("exact training moments imply correlation above one")
        return Decimal("1")
    if value < -1:
        if Decimal("-1") - value > _ARITHMETIC_TOLERANCE:
            raise ContractViolation("exact training moments imply correlation below minus one")
        return Decimal("-1")
    return value


def _build_unsigned(
    matrix: dict[str, Any],
    covariance: dict[str, Any],
) -> dict[str, Any]:
    excluded = list(covariance["zeroVarianceInstrumentIds"])
    active = [
        instrument_id for instrument_id in covariance["instrumentIds"]
        if instrument_id not in set(excluded)
    ]
    if len(active) < 2:
        raise ContractViolation("correlation needs at least two non-zero-variance synthetic instruments")
    training_start = covariance["trainingFeatureStartIndex"]
    training_end = covariance["trainingFeatureEndIndex"]
    training_rows = [
        row for row in matrix["rows"]
        if training_start <= row["periodIndex"] <= training_end
    ]
    if [row["periodIndex"] for row in training_rows] != list(
        range(training_start, training_end + 1)
    ):
        raise ContractViolation("correlation needs the complete training-feature interval")
    columns = {instrument_id: [] for instrument_id in covariance["instrumentIds"]}
    for row in training_rows:
        returns = {item["instrumentId"]: Decimal(item["value"]) for item in row["returns"]}
        if set(returns) != set(columns):
            raise ContractViolation("correlation row has a different instrument set")
        for instrument_id in columns:
            columns[instrument_id].append(returns[instrument_id])

    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        count = Decimal(len(training_rows))
        means = {
            instrument_id: sum(columns[instrument_id]) / count
            for instrument_id in columns
        }
        exact_covariance = {
            (left, right): sum(
                (left_value - means[left]) * (right_value - means[right])
                for left_value, right_value in zip(
                    columns[left], columns[right], strict=True
                )
            ) / count
            for left in columns
            for right in columns
        }
        exact_zero_variance_ids = {
            instrument_id for instrument_id in columns
            if exact_covariance[(instrument_id, instrument_id)] == 0
        }
        if exact_zero_variance_ids != set(excluded):
            raise ContractViolation(
                "correlation exact zero-variance set differs from covariance provenance"
            )
        variances = {
            instrument_id: exact_covariance[(instrument_id, instrument_id)]
            for instrument_id in active
        }
        if any(value <= 0 for value in variances.values()):
            raise ContractViolation("active correlation instruments need positive exact variance")
        correlation_values = {
            (left, right): (
                Decimal("1") if left == right else _bounded_correlation(
                    exact_covariance[(left, right)]
                    / (variances[left] * variances[right]).sqrt()
                )
            )
            for left in active
            for right in active
        }

    return {
        "schemaVersion": CORRELATION_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "datasetReference": deepcopy(covariance["datasetReference"]),
        "returnMatrixReference": deepcopy(covariance["returnMatrixReference"]),
        "walkForwardPlanReference": deepcopy(covariance["walkForwardPlanReference"]),
        "standardizerReference": deepcopy(covariance["standardizerReference"]),
        "covarianceReference": {
            "covarianceId": covariance["covarianceId"],
            "schemaVersion": covariance["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "foldIndex": covariance["foldIndex"],
        "trainingFeatureStartIndex": covariance["trainingFeatureStartIndex"],
        "trainingFeatureEndIndex": covariance["trainingFeatureEndIndex"],
        "parameters": {
            "kind": "pearson_from_exact_training_moments_v2",
            "zeroVariancePolicy": "exclude_and_disclose",
            "rounding": "half_even_12_decimals",
            "roundingClampTolerance": "0.000000000000000000000000000000000000000100",
        },
        "activeInstrumentIds": active,
        "excludedZeroVarianceInstrumentIds": excluded,
        "rows": [
            {
                "instrumentId": left,
                "values": [
                    {
                        "instrumentId": right,
                        "value": _decimal_string(correlation_values[(left, right)]),
                    }
                    for right in active
                ],
            }
            for left in active
        ],
        "reasonCodes": [
            "CORRELATION_FEATURE_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
            "ZERO_VARIANCE_EXCLUDED",
        ],
    }


def build_train_only_correlation(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
) -> dict[str, Any]:
    """Build correlation for non-zero-variance synthetic instruments only."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    covariance = validate_train_only_covariance(
        covariance_payload, dataset, matrix, plan, standardizer
    )
    unsigned = _build_unsigned(matrix, covariance)
    correlation = {
        **unsigned,
        "correlationId": f"ASHA_TRAIN_ONLY_CORRELATION_{fingerprint(unsigned)}",
    }
    return validate_train_only_correlation(
        correlation, dataset, matrix, plan, standardizer, covariance
    )


def validate_train_only_correlation(
    correlation_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
) -> dict[str, Any]:
    """Recompute correlation and reject inclusion drift, leakage, or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    covariance = validate_train_only_covariance(
        covariance_payload, dataset, matrix, plan, standardizer
    )
    if not isinstance(correlation_payload, dict) or set(correlation_payload) != _CORRELATION_KEYS:
        raise ContractViolation("train-only correlation has unexpected fields")
    correlation = deepcopy(correlation_payload)
    if correlation["schemaVersion"] != CORRELATION_SCHEMA_VERSION:
        raise ContractViolation("unsupported train-only correlation schema version")
    if (
        correlation["status"] != "evaluation_only"
        or correlation["financialUseAllowed"] is not False
        or correlation["executionAllowed"] is not False
        or correlation["decisionState"] != "no_decision"
    ):
        raise ContractViolation("train-only correlation crossed its safety boundary")
    if correlation["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("train-only correlation cannot approve a methodology")
    if correlation["parameters"] != {
        "kind": "pearson_from_exact_training_moments_v2",
        "zeroVariancePolicy": "exclude_and_disclose",
        "rounding": "half_even_12_decimals",
        "roundingClampTolerance": "0.000000000000000000000000000000000000000100",
    }:
        raise ContractViolation("correlation parameters are not the reviewed exact mechanics")
    if correlation["reasonCodes"] != [
        "CORRELATION_FEATURE_ONLY", "METHODOLOGY_NOT_APPROVED", "NO_FINANCIAL_DECISION",
        "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY", "TRAIN_ONLY_FIT",
        "ZERO_VARIANCE_EXCLUDED",
    ]:
        raise ContractViolation("train-only correlation is missing permanent safety reasons")
    if not isinstance(correlation["activeInstrumentIds"], list) or not correlation["activeInstrumentIds"]:
        raise ContractViolation("train-only correlation needs active instruments")
    if not isinstance(correlation["excludedZeroVarianceInstrumentIds"], list):
        raise ContractViolation("excluded zero-variance instruments must be an array")
    if not isinstance(correlation["rows"], list) or any(
        not isinstance(row, dict) or set(row) != _ROW_KEYS for row in correlation["rows"]
    ):
        raise ContractViolation("correlation row has unexpected fields")
    if any(
        not isinstance(row["values"], list)
        or not row["values"]
        or any(
            not isinstance(value, dict) or set(value) != _VALUE_KEYS
            for value in row["values"]
        )
        for row in correlation["rows"]
    ):
        raise ContractViolation("correlation value has unexpected fields")
    correlation_id = correlation["correlationId"]
    unsigned = {key: value for key, value in correlation.items() if key != "correlationId"}
    if not isinstance(correlation_id, str) or not _CORRELATION_ID.fullmatch(correlation_id):
        raise ContractViolation("train-only correlation ID is invalid")
    if correlation_id != f"ASHA_TRAIN_ONLY_CORRELATION_{fingerprint(unsigned)}":
        raise ContractViolation("train-only correlation fingerprint mismatch")
    if unsigned != _build_unsigned(matrix, covariance):
        raise ContractViolation("train-only correlation does not match exact replay")
    return correlation
