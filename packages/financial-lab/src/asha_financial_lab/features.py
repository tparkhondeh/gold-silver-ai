"""Point-in-time synthetic return features with no model or recommendation output."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .controls import known_levels


RETURN_MATRIX_SCHEMA_VERSION = "asha.synthetic.return_matrix.v1"
_MATRIX_ID = re.compile(r"ASHA_RETURN_MATRIX_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_MATRIX_KEYS = {
    "schemaVersion",
    "matrixId",
    "status",
    "financialUseAllowed",
    "datasetReference",
    "methodologyReference",
    "startIndex",
    "endIndex",
    "instrumentIds",
    "rows",
    "reasonCodes",
}
_ROW_KEYS = {"periodIndex", "carriedForwardInstrumentIds", "returns"}
_RETURN_KEYS = {"instrumentId", "value"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _range(start_index: object, end_index: object, maximum_period: int) -> tuple[int, int]:
    if (
        type(start_index) is not int
        or type(end_index) is not int
        or start_index < 1
        or end_index < start_index
        or end_index > maximum_period
    ):
        raise ValueError("return-matrix range must satisfy 1 <= start <= end <= dataset maximum")
    return start_index, end_index


def _build_unsigned(dataset: dict[str, Any], start_index: int, end_index: int) -> dict[str, Any]:
    instrument_ids = [item["instrumentId"] for item in dataset["instruments"]]
    previous_levels, _ = known_levels(dataset, start_index - 1)
    rows = []
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for period_index in range(start_index, end_index + 1):
            current_levels, carried_forward = known_levels(dataset, period_index)
            rows.append({
                "periodIndex": period_index,
                "carriedForwardInstrumentIds": list(carried_forward),
                "returns": [
                    {
                        "instrumentId": instrument_id,
                        "value": _decimal_string(
                            current_levels[instrument_id] / previous_levels[instrument_id] - Decimal("1")
                        ),
                    }
                    for instrument_id in instrument_ids
                ],
            })
            previous_levels = current_levels
    return {
        "schemaVersion": RETURN_MATRIX_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "datasetReference": {
            "datasetId": dataset["datasetId"],
            "version": dataset["datasetVersion"],
            "contentFingerprint": dataset["contentFingerprint"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "startIndex": start_index,
        "endIndex": end_index,
        "instrumentIds": instrument_ids,
        "rows": rows,
        "reasonCodes": [
            "FEATURE_MECHANICS_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "POINT_IN_TIME_ONLY",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


def build_point_in_time_return_matrix(dataset_payload: object, start_index: object, end_index: object) -> dict[str, Any]:
    """Build decimal synthetic returns from latest levels known at each period."""

    dataset = validate_synthetic_dataset(dataset_payload)
    maximum_period = max(row["periodIndex"] for row in dataset["observations"])
    start, end = _range(start_index, end_index, maximum_period)
    unsigned = _build_unsigned(dataset, start, end)
    matrix = {**unsigned, "matrixId": f"ASHA_RETURN_MATRIX_{fingerprint(unsigned)}"}
    return validate_point_in_time_return_matrix(matrix, dataset)


def validate_point_in_time_return_matrix(matrix_payload: object, dataset_payload: object) -> dict[str, Any]:
    """Recompute and compare the entire matrix against its synthetic dataset."""

    dataset = validate_synthetic_dataset(dataset_payload)
    if not isinstance(matrix_payload, dict) or set(matrix_payload) != _MATRIX_KEYS:
        raise ContractViolation("return matrix has unexpected fields")
    matrix = deepcopy(matrix_payload)
    if matrix["schemaVersion"] != RETURN_MATRIX_SCHEMA_VERSION:
        raise ContractViolation("unsupported return-matrix schema version")
    if matrix["status"] != "evaluation_only" or matrix["financialUseAllowed"] is not False:
        raise ContractViolation("return matrix must remain evaluation-only")
    if matrix["methodologyReference"] != {
        "entityId": "STATUS_TBD",
        "version": 0,
        "approvalState": "unapproved",
    }:
        raise ContractViolation("return matrix cannot approve a methodology")
    expected_reference = {
        "datasetId": dataset["datasetId"],
        "version": dataset["datasetVersion"],
        "contentFingerprint": dataset["contentFingerprint"],
    }
    if matrix["datasetReference"] != expected_reference:
        raise ContractViolation("return matrix references a different dataset")
    if matrix["reasonCodes"] != [
        "FEATURE_MECHANICS_ONLY",
        "METHODOLOGY_NOT_APPROVED",
        "POINT_IN_TIME_ONLY",
        "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY",
    ]:
        raise ContractViolation("return matrix is missing permanent safety reasons")
    if not isinstance(matrix["rows"], list) or not matrix["rows"]:
        raise ContractViolation("return matrix needs rows")
    if any(not isinstance(row, dict) or set(row) != _ROW_KEYS for row in matrix["rows"]):
        raise ContractViolation("return-matrix row has unexpected fields")
    if any(
        not isinstance(item, dict) or set(item) != _RETURN_KEYS
        for row in matrix["rows"]
        for item in row["returns"]
    ):
        raise ContractViolation("return-matrix value has unexpected fields")
    try:
        maximum_period = max(row["periodIndex"] for row in dataset["observations"])
        start, end = _range(matrix["startIndex"], matrix["endIndex"], maximum_period)
    except ValueError as error:
        raise ContractViolation("return-matrix range is invalid") from error
    matrix_id = matrix["matrixId"]
    unsigned = {key: value for key, value in matrix.items() if key != "matrixId"}
    if not isinstance(matrix_id, str) or not _MATRIX_ID.fullmatch(matrix_id):
        raise ContractViolation("return-matrix ID is invalid")
    if matrix_id != f"ASHA_RETURN_MATRIX_{fingerprint(unsigned)}":
        raise ContractViolation("return-matrix fingerprint mismatch")
    if unsigned != _build_unsigned(dataset, start, end):
        raise ContractViolation("return matrix does not match exact point-in-time replay")
    return matrix
