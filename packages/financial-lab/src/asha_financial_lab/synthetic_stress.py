"""Apply explicit synthetic shocks without selecting a financial methodology."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .features import validate_point_in_time_return_matrix


STRESS_SCENARIO_SCHEMA_VERSION = "asha.synthetic.stress_scenario.v1"
STRESSED_RETURN_MATRIX_SCHEMA_VERSION = "asha.synthetic.stressed_return_matrix.v1"
_SCENARIO_ID = re.compile(r"ASHA_SYNTHETIC_STRESS_SCENARIO_[A-Z0-9_]{2,64}_V[1-9][0-9]*\Z")
_STRESSED_MATRIX_ID = re.compile(r"ASHA_STRESSED_RETURN_MATRIX_[a-f0-9]{64}\Z")
_INSTRUMENT_ID = re.compile(r"SYNTH_[A-Z0-9_]{2,64}\Z")
_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]{0,11})\.[0-9]{12}\Z")
_QUANTUM = Decimal("0.000000000001")
_SCENARIO_KEYS = {
    "schemaVersion", "scenarioId", "scenarioVersion", "scenarioKind", "purpose",
    "financialUseAllowed", "coveragePolicy", "shocks", "contentFingerprint",
}
_SHOCK_KEYS = {"periodIndex", "instrumentId", "additiveReturnShock"}
_MATRIX_KEYS = {
    "schemaVersion", "stressedMatrixId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "datasetReference",
    "baseReturnMatrixReference", "stressScenarioReference", "methodologyReference",
    "startIndex", "endIndex", "instrumentIds", "rows", "reasonCodes",
}
_ROW_KEYS = {"periodIndex", "returns"}
_RETURN_KEYS = {"instrumentId", "baseReturn", "additiveReturnShock", "stressedReturn"}


def _decimal(value: object, label: str) -> Decimal:
    if not isinstance(value, str) or not _DECIMAL.fullmatch(value) or value.startswith("-0.000000000000"):
        raise ContractViolation(f"{label} must be a canonical 12-decimal string")
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ContractViolation(f"{label} is not decimal") from error
    if not parsed.is_finite():
        raise ContractViolation(f"{label} must be finite")
    return parsed


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _validate_unsigned_scenario(payload: object) -> dict[str, Any]:
    expected = _SCENARIO_KEYS - {"contentFingerprint"}
    if not isinstance(payload, dict) or set(payload) != expected:
        raise ContractViolation("unsigned stress scenario has unexpected fields")
    scenario = deepcopy(payload)
    if scenario["schemaVersion"] != STRESS_SCENARIO_SCHEMA_VERSION:
        raise ContractViolation("unsupported stress-scenario schema version")
    if not isinstance(scenario["scenarioId"], str) or not _SCENARIO_ID.fullmatch(scenario["scenarioId"]):
        raise ContractViolation("stress scenario ID must use the explicit synthetic namespace")
    if type(scenario["scenarioVersion"]) is not int or scenario["scenarioVersion"] < 1:
        raise ContractViolation("stress scenario version must be a positive integer")
    if scenario["scenarioKind"] != "explicit_additive_return_shocks":
        raise ContractViolation("stress scenario kind must remain explicit additive shocks")
    if scenario["purpose"] != "crisis_mechanics_test":
        raise ContractViolation("stress scenario is limited to crisis mechanics tests")
    if scenario["financialUseAllowed"] is not False:
        raise ContractViolation("synthetic stress scenarios cannot allow financial use")
    if scenario["coveragePolicy"] != "unspecified_entries_are_explicit_zero":
        raise ContractViolation("stress scenario needs an explicit zero-default policy")
    shocks = scenario["shocks"]
    if not isinstance(shocks, list) or not 1 <= len(shocks) <= 10_000:
        raise ContractViolation("stress scenario needs between 1 and 10000 explicit shocks")
    order: list[tuple[int, str]] = []
    for shock in shocks:
        if not isinstance(shock, dict) or set(shock) != _SHOCK_KEYS:
            raise ContractViolation("stress shock has unexpected fields")
        if type(shock["periodIndex"]) is not int or shock["periodIndex"] < 1:
            raise ContractViolation("stress shock period must be a positive integer")
        if not isinstance(shock["instrumentId"], str) or not _INSTRUMENT_ID.fullmatch(shock["instrumentId"]):
            raise ContractViolation("stress shock instrument must use the synthetic namespace")
        value = _decimal(shock["additiveReturnShock"], "additive return shock")
        if value == 0 or abs(value) > Decimal("1"):
            raise ContractViolation("explicit stress shocks must be non-zero and within [-1, 1]")
        order.append((shock["periodIndex"], shock["instrumentId"]))
    if order != sorted(set(order)):
        raise ContractViolation("stress shocks must be unique and sorted by period and instrument")
    return scenario


def seal_synthetic_stress_scenario(unsigned_payload: object) -> dict[str, Any]:
    """Seal an explicit, reusable synthetic shock definition."""

    unsigned = _validate_unsigned_scenario(unsigned_payload)
    sealed = {**unsigned, "contentFingerprint": fingerprint(unsigned)}
    return validate_synthetic_stress_scenario(sealed)


def validate_synthetic_stress_scenario(payload: object) -> dict[str, Any]:
    """Reject real namespaces, hidden defaults, ambiguous shocks, and tampering."""

    if not isinstance(payload, dict) or set(payload) != _SCENARIO_KEYS:
        raise ContractViolation("stress scenario has unexpected fields")
    scenario = deepcopy(payload)
    unsigned = {key: value for key, value in scenario.items() if key != "contentFingerprint"}
    _validate_unsigned_scenario(unsigned)
    content_fingerprint = scenario["contentFingerprint"]
    if not isinstance(content_fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", content_fingerprint):
        raise ContractViolation("stress scenario fingerprint is invalid")
    if content_fingerprint != fingerprint(unsigned):
        raise ContractViolation("stress scenario fingerprint mismatch")
    return scenario


def _build_unsigned(
    matrix: dict[str, Any], scenario: dict[str, Any]
) -> dict[str, Any]:
    shock_values: dict[tuple[int, str], Decimal] = {}
    valid_periods = set(range(matrix["startIndex"], matrix["endIndex"] + 1))
    valid_instruments = set(matrix["instrumentIds"])
    for shock in scenario["shocks"]:
        key = (shock["periodIndex"], shock["instrumentId"])
        if key[0] not in valid_periods or key[1] not in valid_instruments:
            raise ContractViolation("stress shock falls outside the exact base matrix")
        shock_values[key] = Decimal(shock["additiveReturnShock"])

    rows = []
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for row in matrix["rows"]:
            returns = []
            for item in row["returns"]:
                key = (row["periodIndex"], item["instrumentId"])
                base_return = Decimal(item["value"])
                shock = shock_values.get(key, Decimal("0"))
                stressed_return = base_return + shock
                if stressed_return <= Decimal("-1"):
                    raise ContractViolation("stress scenario cannot create a return at or below -100 percent")
                returns.append({
                    "instrumentId": item["instrumentId"],
                    "baseReturn": _decimal_string(base_return),
                    "additiveReturnShock": _decimal_string(shock),
                    "stressedReturn": _decimal_string(stressed_return),
                })
            rows.append({"periodIndex": row["periodIndex"], "returns": returns})

    return {
        "schemaVersion": STRESSED_RETURN_MATRIX_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "datasetReference": deepcopy(matrix["datasetReference"]),
        "baseReturnMatrixReference": {
            "matrixId": matrix["matrixId"],
            "schemaVersion": matrix["schemaVersion"],
        },
        "stressScenarioReference": {
            "scenarioId": scenario["scenarioId"],
            "version": scenario["scenarioVersion"],
            "contentFingerprint": scenario["contentFingerprint"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
        },
        "startIndex": matrix["startIndex"],
        "endIndex": matrix["endIndex"],
        "instrumentIds": deepcopy(matrix["instrumentIds"]),
        "rows": rows,
        "reasonCodes": [
            "EXPLICIT_SYNTHETIC_SHOCKS_ONLY",
            "FEATURE_MECHANICS_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


def build_stressed_return_matrix(
    dataset_payload: object,
    matrix_payload: object,
    scenario_payload: object,
) -> dict[str, Any]:
    """Apply every explicit shock to its exact synthetic matrix cell."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    unsigned = _build_unsigned(matrix, scenario)
    stressed = {
        **unsigned,
        "stressedMatrixId": f"ASHA_STRESSED_RETURN_MATRIX_{fingerprint(unsigned)}",
    }
    return validate_stressed_return_matrix(stressed, dataset, matrix, scenario)


def validate_stressed_return_matrix(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    scenario_payload: object,
) -> dict[str, Any]:
    """Recompute the whole stressed matrix and reject drift or resealed false values."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    scenario = validate_synthetic_stress_scenario(scenario_payload)
    if not isinstance(payload, dict) or set(payload) != _MATRIX_KEYS:
        raise ContractViolation("stressed return matrix has unexpected fields")
    stressed = deepcopy(payload)
    if stressed["schemaVersion"] != STRESSED_RETURN_MATRIX_SCHEMA_VERSION:
        raise ContractViolation("unsupported stressed-return-matrix schema version")
    if (
        stressed["status"] != "evaluation_only"
        or stressed["financialUseAllowed"] is not False
        or stressed["executionAllowed"] is not False
        or stressed["decisionState"] != "no_decision"
    ):
        raise ContractViolation("stressed return matrix crossed its safety boundary")
    if stressed["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("stressed return matrix cannot approve a methodology")
    if stressed["reasonCodes"] != [
        "EXPLICIT_SYNTHETIC_SHOCKS_ONLY", "FEATURE_MECHANICS_ONLY",
        "METHODOLOGY_NOT_APPROVED", "NO_FINANCIAL_DECISION",
        "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY",
    ]:
        raise ContractViolation("stressed return matrix is missing permanent safety reasons")
    if not isinstance(stressed["rows"], list) or any(
        not isinstance(row, dict) or set(row) != _ROW_KEYS for row in stressed["rows"]
    ):
        raise ContractViolation("stressed return rows have unexpected fields")
    if any(
        not isinstance(item, dict) or set(item) != _RETURN_KEYS
        for row in stressed["rows"] for item in row["returns"]
    ):
        raise ContractViolation("stressed return value has unexpected fields")
    stressed_id = stressed["stressedMatrixId"]
    unsigned = {key: value for key, value in stressed.items() if key != "stressedMatrixId"}
    if not isinstance(stressed_id, str) or not _STRESSED_MATRIX_ID.fullmatch(stressed_id):
        raise ContractViolation("stressed return matrix ID is invalid")
    if stressed_id != f"ASHA_STRESSED_RETURN_MATRIX_{fingerprint(unsigned)}":
        raise ContractViolation("stressed return matrix fingerprint mismatch")
    if unsigned != _build_unsigned(matrix, scenario):
        raise ContractViolation("stressed return matrix does not match exact replay")
    return stressed
