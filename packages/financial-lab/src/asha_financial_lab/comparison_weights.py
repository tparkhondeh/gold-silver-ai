"""Train-only inverse-volatility weights as a non-operational comparison control."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .features import validate_point_in_time_return_matrix
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


INVERSE_VOLATILITY_SCHEMA_VERSION = "asha.synthetic.inverse_volatility_weights.v1"
INVERSE_VOLATILITY_CONTROL_ID = "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1"
_WEIGHT_SET_ID = re.compile(r"ASHA_COMPARISON_WEIGHTS_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_WEIGHT_SET_KEYS = {
    "schemaVersion", "weightSetId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "standardizerReference",
    "methodologyReference", "foldIndex", "parameters", "weights",
    "zeroVarianceInstrumentIds", "reasonCodes",
}
_WEIGHT_KEYS = {"instrumentId", "weight"}


def _weight_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _build_unsigned(
    matrix: dict[str, Any],
    standardizer: dict[str, Any],
) -> dict[str, Any]:
    statistics = {item["instrumentId"]: item for item in standardizer["instrumentStatistics"]}
    if set(statistics) != set(matrix["instrumentIds"]):
        raise ContractViolation("inverse-volatility inputs have different instrument sets")
    standard_deviations = {
        instrument_id: Decimal(statistics[instrument_id]["standardDeviation"])
        for instrument_id in matrix["instrumentIds"]
    }
    positive_ids = [
        instrument_id for instrument_id in matrix["instrumentIds"]
        if standard_deviations[instrument_id] > 0
    ]
    if not positive_ids:
        raise ContractViolation("inverse-volatility control is not computable when every variance is zero")

    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        inverse = {
            instrument_id: Decimal("1") / standard_deviations[instrument_id]
            for instrument_id in positive_ids
        }
        inverse_total = sum(inverse.values())
        rounded = {
            instrument_id: (inverse[instrument_id] / inverse_total).quantize(
                _QUANTUM,
                rounding=ROUND_HALF_EVEN,
            )
            for instrument_id in positive_ids
        }
        residual_target = min(positive_ids, key=lambda item: (-inverse[item], item))
        rounded[residual_target] += Decimal("1") - sum(rounded.values())

    weights = [
        {
            "instrumentId": instrument_id,
            "weight": _weight_string(rounded.get(instrument_id, Decimal("0"))),
        }
        for instrument_id in matrix["instrumentIds"]
    ]
    if sum(Decimal(item["weight"]) for item in weights) != Decimal("1"):
        raise ContractViolation("inverse-volatility comparison weights must sum exactly to one")

    return {
        "schemaVersion": INVERSE_VOLATILITY_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": INVERSE_VOLATILITY_CONTROL_ID,
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
        "parameters": {
            "kind": "inverse_population_standard_deviation_v1",
            "rounding": "half_even_12_decimals",
            "zeroVariancePolicy": "zero_weight",
            "residualPolicy": "largest_raw_weight_then_instrument_id",
        },
        "weights": weights,
        "zeroVarianceInstrumentIds": [
            instrument_id for instrument_id in matrix["instrumentIds"]
            if standard_deviations[instrument_id] == 0
        ],
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


def build_inverse_volatility_control_weights(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    """Build train-only inverse-volatility control weights with no decision output."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    unsigned = _build_unsigned(matrix, standardizer)
    weight_set = {**unsigned, "weightSetId": f"ASHA_COMPARISON_WEIGHTS_{fingerprint(unsigned)}"}
    return validate_inverse_volatility_control_weights(weight_set, dataset, matrix, plan, standardizer)


def validate_inverse_volatility_control_weights(
    weight_set_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    """Recompute the comparison weights and reject provenance drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    if not isinstance(weight_set_payload, dict) or set(weight_set_payload) != _WEIGHT_SET_KEYS:
        raise ContractViolation("inverse-volatility weight set has unexpected fields")
    weight_set = deepcopy(weight_set_payload)
    if weight_set["schemaVersion"] != INVERSE_VOLATILITY_SCHEMA_VERSION:
        raise ContractViolation("unsupported inverse-volatility schema version")
    if (
        weight_set["status"] != "evaluation_only"
        or weight_set["financialUseAllowed"] is not False
        or weight_set["executionAllowed"] is not False
        or weight_set["decisionState"] != "no_decision"
        or weight_set["benchmarkId"] != INVERSE_VOLATILITY_CONTROL_ID
    ):
        raise ContractViolation("inverse-volatility output crossed the comparison-only boundary")
    if weight_set["methodologyReference"] != {
        "entityId": "STATUS_TBD",
        "version": 0,
        "approvalState": "unapproved",
    }:
        raise ContractViolation("inverse-volatility control cannot approve a methodology")
    if weight_set["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY",
        "METHODOLOGY_NOT_APPROVED",
        "NO_FINANCIAL_DECISION",
        "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY",
    ]:
        raise ContractViolation("inverse-volatility control is missing permanent safety reasons")
    if not isinstance(weight_set["weights"], list) or any(
        not isinstance(item, dict) or set(item) != _WEIGHT_KEYS for item in weight_set["weights"]
    ):
        raise ContractViolation("inverse-volatility weights have unexpected fields")
    weight_set_id = weight_set["weightSetId"]
    unsigned = {key: value for key, value in weight_set.items() if key != "weightSetId"}
    if not isinstance(weight_set_id, str) or not _WEIGHT_SET_ID.fullmatch(weight_set_id):
        raise ContractViolation("inverse-volatility weight-set ID is invalid")
    if weight_set_id != f"ASHA_COMPARISON_WEIGHTS_{fingerprint(unsigned)}":
        raise ContractViolation("inverse-volatility weight-set fingerprint mismatch")
    if unsigned != _build_unsigned(matrix, standardizer):
        raise ContractViolation("inverse-volatility weights do not match exact train-only replay")
    return weight_set
