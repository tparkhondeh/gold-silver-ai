"""Train-only discrete minimum-CVaR weights as a synthetic comparison control."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN, localcontext
from math import comb
import re
from typing import Any, Iterator

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .features import validate_point_in_time_return_matrix
from .walk_forward import validate_walk_forward_plan


MINIMUM_CVAR_SCHEMA_VERSION = "asha.synthetic.minimum_cvar_control_weights.v1"
MINIMUM_CVAR_CONTROL_ID = "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1"
_WEIGHT_SET_ID = re.compile(r"ASHA_MIN_CVAR_CONTROL_WEIGHTS_[a-f0-9]{64}\Z")
_DECIMAL_INPUT = re.compile(r"(?:0(?:\.\d{1,12})?|1(?:\.0{1,12})?)\Z")
_QUANTUM = Decimal("0.000000000001")
_MAX_GRID_UNITS = 100
_MAX_CANDIDATES = 25_000
_MAX_CANDIDATE_SCENARIO_EVALUATIONS = 1_000_000
_WEIGHT_SET_KEYS = {
    "schemaVersion", "weightSetId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "methodologyReference",
    "foldIndex", "trainStartIndex", "trainEndIndex", "parameters",
    "scenarioCount", "candidateCount", "selectedTailLosses", "cvarLoss",
    "meanReturn", "weights", "reasonCodes",
}
_PARAMETER_KEYS = {
    "kind", "tailCount", "weightStep", "confidenceRepresentation",
    "candidatePolicy", "lossDefinition", "objective", "tieBreak", "rounding",
}
_TAIL_LOSS_KEYS = {"periodIndex", "loss"}
_WEIGHT_KEYS = {"instrumentId", "weight"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _grid(weight_step: object, instrument_count: int) -> tuple[Decimal, int, int]:
    if not isinstance(weight_step, str) or not _DECIMAL_INPUT.fullmatch(weight_step):
        raise ValueError("weight_step must be a canonical decimal string between zero and one")
    try:
        step = Decimal(weight_step)
    except InvalidOperation as error:
        raise ValueError("weight_step is not a valid decimal") from error
    if step <= 0 or step > 1:
        raise ValueError("weight_step must be greater than zero and no greater than one")
    units_decimal = Decimal("1") / step
    if units_decimal != units_decimal.to_integral_value():
        raise ValueError("weight_step must divide one exactly")
    units = int(units_decimal)
    if units > _MAX_GRID_UNITS:
        raise ValueError("weight_step creates too many grid units")
    candidate_count = comb(units + instrument_count - 1, instrument_count - 1)
    if candidate_count > _MAX_CANDIDATES:
        raise ValueError("weight grid creates too many candidates")
    return step, units, candidate_count


def _compositions(total: int, parts: int) -> Iterator[tuple[int, ...]]:
    if parts == 1:
        yield (total,)
        return
    for first in range(total + 1):
        for remainder in _compositions(total - first, parts - 1):
            yield (first, *remainder)


def _training_rows(
    matrix: dict[str, Any],
    fold: dict[str, Any],
) -> list[dict[str, Any]]:
    start = max(matrix["startIndex"], fold["trainStartIndex"])
    end = fold["trainEndIndex"]
    if start > end or matrix["endIndex"] < end:
        raise ContractViolation("return matrix does not cover the minimum-CVaR training interval")
    rows = [row for row in matrix["rows"] if start <= row["periodIndex"] <= end]
    if [row["periodIndex"] for row in rows] != list(range(start, end + 1)):
        raise ContractViolation("minimum-CVaR training rows are not contiguous")
    return rows


def _candidate_metrics(
    instrument_ids: list[str],
    rows: list[dict[str, Any]],
    units: tuple[int, ...],
    total_units: int,
    tail_count: int,
) -> tuple[Decimal, Decimal, list[dict[str, Any]]]:
    weights = {
        instrument_id: Decimal(weight_units) / Decimal(total_units)
        for instrument_id, weight_units in zip(instrument_ids, units, strict=True)
    }
    scenario_results: list[tuple[Decimal, int, Decimal]] = []
    for row in rows:
        returns = {item["instrumentId"]: Decimal(item["value"]) for item in row["returns"]}
        if set(returns) != set(instrument_ids):
            raise ContractViolation("minimum-CVaR row has a different instrument set")
        portfolio_return = sum(weights[item] * returns[item] for item in instrument_ids)
        scenario_results.append((-portfolio_return, row["periodIndex"], portfolio_return))
    ordered_losses = sorted(scenario_results, key=lambda item: (-item[0], item[1]))
    selected = ordered_losses[:tail_count]
    cvar_loss = sum(item[0] for item in selected) / Decimal(tail_count)
    mean_return = sum(item[2] for item in scenario_results) / Decimal(len(scenario_results))
    tail_losses = [
        {"periodIndex": period_index, "loss": _decimal_string(loss)}
        for loss, period_index, _ in selected
    ]
    return cvar_loss, mean_return, tail_losses


def _build_unsigned(
    matrix: dict[str, Any],
    plan: dict[str, Any],
    fold_index: int,
    tail_count: int,
    weight_step: str,
) -> dict[str, Any]:
    if type(fold_index) is not int or not 0 <= fold_index < len(plan["folds"]):
        raise ValueError("fold_index must select an existing walk-forward fold")
    fold = plan["folds"][fold_index]
    rows = _training_rows(matrix, fold)
    if type(tail_count) is not int or not 1 <= tail_count <= len(rows):
        raise ValueError("tail_count must select at least one available training scenario")
    step, total_units, candidate_count = _grid(weight_step, len(matrix["instrumentIds"]))
    if candidate_count * len(rows) > _MAX_CANDIDATE_SCENARIO_EVALUATIONS:
        raise ValueError("weight grid and training scenarios exceed the work limit")

    best_units: tuple[int, ...] | None = None
    best_cvar: Decimal | None = None
    best_mean: Decimal | None = None
    best_tail_losses: list[dict[str, Any]] | None = None
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for candidate_units in _compositions(total_units, len(matrix["instrumentIds"])):
            cvar_loss, mean_return, tail_losses = _candidate_metrics(
                matrix["instrumentIds"], rows, candidate_units, total_units, tail_count
            )
            if best_cvar is None or cvar_loss < best_cvar:
                best_units = candidate_units
                best_cvar = cvar_loss
                best_mean = mean_return
                best_tail_losses = tail_losses

    if best_units is None or best_cvar is None or best_mean is None or best_tail_losses is None:
        raise ContractViolation("minimum-CVaR comparison grid produced no candidate")
    weights = [
        {
            "instrumentId": instrument_id,
            "weight": _decimal_string(Decimal(weight_units) * step),
        }
        for instrument_id, weight_units in zip(
            matrix["instrumentIds"], best_units, strict=True
        )
    ]
    if sum(Decimal(item["weight"]) for item in weights) != Decimal("1"):
        raise ContractViolation("minimum-CVaR comparison weights must sum exactly to one")

    return {
        "schemaVersion": MINIMUM_CVAR_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": MINIMUM_CVAR_CONTROL_ID,
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
        "trainStartIndex": max(matrix["startIndex"], fold["trainStartIndex"]),
        "trainEndIndex": fold["trainEndIndex"],
        "parameters": {
            "kind": "discrete_long_only_minimum_empirical_cvar_control_v1",
            "tailCount": tail_count,
            "weightStep": _decimal_string(step),
            "confidenceRepresentation": "explicit_worst_training_scenario_count",
            "candidatePolicy": "all_long_only_full_investment_grid_compositions",
            "lossDefinition": "negative_weighted_arithmetic_return",
            "objective": "minimum_mean_selected_worst_losses",
            "tieBreak": "lexicographic_weight_vector_by_instrument_id",
            "rounding": "half_even_12_decimals",
        },
        "scenarioCount": len(rows),
        "candidateCount": candidate_count,
        "selectedTailLosses": best_tail_losses,
        "cvarLoss": _decimal_string(best_cvar),
        "meanReturn": _decimal_string(best_mean),
        "weights": weights,
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "DISCRETE_GRID_EXPERIMENT_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
        ],
    }


def build_minimum_cvar_comparison_control_weights(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    *,
    fold_index: int,
    tail_count: int,
    weight_step: str,
) -> dict[str, Any]:
    """Exhaust a bounded synthetic grid without selecting a real methodology."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    unsigned = _build_unsigned(matrix, plan, fold_index, tail_count, weight_step)
    weight_set = {
        **unsigned,
        "weightSetId": f"ASHA_MIN_CVAR_CONTROL_WEIGHTS_{fingerprint(unsigned)}",
    }
    return validate_minimum_cvar_comparison_control_weights(
        weight_set, dataset, matrix, plan
    )


def validate_minimum_cvar_comparison_control_weights(
    weight_set_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    """Recompute the bounded grid and reject provenance drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    if not isinstance(weight_set_payload, dict) or set(weight_set_payload) != _WEIGHT_SET_KEYS:
        raise ContractViolation("minimum-CVaR weight set has unexpected fields")
    weight_set = deepcopy(weight_set_payload)
    if weight_set["schemaVersion"] != MINIMUM_CVAR_SCHEMA_VERSION:
        raise ContractViolation("unsupported minimum-CVaR schema version")
    if (
        weight_set["status"] != "evaluation_only"
        or weight_set["financialUseAllowed"] is not False
        or weight_set["executionAllowed"] is not False
        or weight_set["decisionState"] != "no_decision"
        or weight_set["benchmarkId"] != MINIMUM_CVAR_CONTROL_ID
    ):
        raise ContractViolation("minimum-CVaR output crossed the comparison-only boundary")
    if weight_set["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("minimum-CVaR control cannot approve a methodology")
    if not isinstance(weight_set["parameters"], dict) or set(weight_set["parameters"]) != _PARAMETER_KEYS:
        raise ContractViolation("minimum-CVaR parameters have unexpected fields")
    if not isinstance(weight_set["selectedTailLosses"], list) or any(
        not isinstance(item, dict) or set(item) != _TAIL_LOSS_KEYS
        for item in weight_set["selectedTailLosses"]
    ):
        raise ContractViolation("minimum-CVaR tail loss has unexpected fields")
    if not isinstance(weight_set["weights"], list) or any(
        not isinstance(item, dict) or set(item) != _WEIGHT_KEYS
        for item in weight_set["weights"]
    ):
        raise ContractViolation("minimum-CVaR weight has unexpected fields")
    if weight_set["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "DISCRETE_GRID_EXPERIMENT_ONLY",
        "METHODOLOGY_NOT_APPROVED", "NO_FINANCIAL_DECISION",
        "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY", "TRAIN_ONLY_FIT",
    ]:
        raise ContractViolation("minimum-CVaR control is missing permanent safety reasons")
    weight_set_id = weight_set["weightSetId"]
    unsigned = {key: value for key, value in weight_set.items() if key != "weightSetId"}
    if not isinstance(weight_set_id, str) or not _WEIGHT_SET_ID.fullmatch(weight_set_id):
        raise ContractViolation("minimum-CVaR weight-set ID is invalid")
    if weight_set_id != f"ASHA_MIN_CVAR_CONTROL_WEIGHTS_{fingerprint(unsigned)}":
        raise ContractViolation("minimum-CVaR weight-set fingerprint mismatch")
    try:
        expected = _build_unsigned(
            matrix,
            plan,
            weight_set["foldIndex"],
            weight_set["parameters"]["tailCount"],
            weight_set["parameters"]["weightStep"],
        )
    except (TypeError, ValueError) as error:
        raise ContractViolation("minimum-CVaR parameters are invalid") from error
    if unsigned != expected:
        raise ContractViolation("minimum-CVaR weights do not match exact train-only replay")
    return weight_set
