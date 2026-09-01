"""Synthetic comparison controls that can never emit a financial decision."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_EVEN, localcontext
from itertools import pairwise

from .baseline import BASELINE_MODEL_ID
from .contracts import ContractViolation, RESULT_SCHEMA_VERSION, seal_evaluation_result, validate_synthetic_dataset


CASH_CONTROL_ID = "ASHA_BENCHMARK_CASH_CONTROL_V1"
EQUAL_WEIGHT_CONTROL_ID = "ASHA_BENCHMARK_EQUAL_WEIGHT_CONTROL_V1"
NO_TRADE_CONTROL_ID = "ASHA_BENCHMARK_NO_TRADE_CONTROL_V1"
_METRIC_QUANTUM = Decimal("0.00000001")


def _metric(value: Decimal) -> str:
    normalized = value.quantize(_METRIC_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.8f}"


def known_levels(dataset: dict, period_index: int) -> tuple[dict[str, Decimal], tuple[str, ...]]:
    """Return latest point-in-time-known levels and visibly carried-forward IDs."""

    latest: dict[str, tuple[int, Decimal]] = {}
    for row in dataset["observations"]:
        if row["periodIndex"] > period_index:
            break
        if row["availableAtIndex"] > period_index:
            continue
        current = latest.get(row["instrumentId"])
        if current is None or row["periodIndex"] > current[0]:
            latest[row["instrumentId"]] = (row["periodIndex"], Decimal(row["value"]))

    instrument_ids = [item["instrumentId"] for item in dataset["instruments"]]
    if set(latest) != set(instrument_ids):
        raise ContractViolation("every synthetic instrument must be known at each evaluated period")
    carried_forward = tuple(
        instrument_id
        for instrument_id in instrument_ids
        if latest[instrument_id][0] < period_index
    )
    return {instrument_id: latest[instrument_id][1] for instrument_id in instrument_ids}, carried_forward


def _path_metrics(levels_by_period: list[dict[str, Decimal]], instrument_ids: list[str]) -> tuple[Decimal, Decimal]:
    wealth = Decimal("1")
    peak = wealth
    maximum_drawdown = Decimal("0")
    count = Decimal(len(instrument_ids))
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for previous, current in pairwise(levels_by_period):
            period_return = sum(
                (current[instrument_id] / previous[instrument_id]) - Decimal("1")
                for instrument_id in instrument_ids
            ) / count
            wealth *= Decimal("1") + period_return
            peak = max(peak, wealth)
            maximum_drawdown = max(maximum_drawdown, (peak - wealth) / peak)
        return (wealth - Decimal("1")) * Decimal("100"), maximum_drawdown * Decimal("100")


def _buy_and_hold_metrics(levels_by_period: list[dict[str, Decimal]], instrument_ids: list[str]) -> tuple[Decimal, Decimal]:
    initial = levels_by_period[0]
    peak = Decimal("1")
    wealth = peak
    maximum_drawdown = Decimal("0")
    count = Decimal(len(instrument_ids))
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        for current in levels_by_period[1:]:
            wealth = sum(current[instrument_id] / initial[instrument_id] for instrument_id in instrument_ids) / count
            peak = max(peak, wealth)
            maximum_drawdown = max(maximum_drawdown, (peak - wealth) / peak)
        return (wealth - Decimal("1")) * Decimal("100"), maximum_drawdown * Decimal("100")


def evaluate_comparison_controls(dataset_payload: object, start_index: int, end_index: int) -> dict:
    """Evaluate cash, period-rebalanced 1/N, and no-trade controls on synthetic levels."""

    dataset = validate_synthetic_dataset(dataset_payload)
    maximum_period = max(row["periodIndex"] for row in dataset["observations"])
    if (
        type(start_index) is not int
        or type(end_index) is not int
        or start_index < 0
        or end_index <= start_index
        or end_index > maximum_period
    ):
        raise ValueError("comparison-control range must satisfy 0 <= start < end <= dataset maximum")

    levels_by_period: list[dict[str, Decimal]] = []
    carried_forward_count = 0
    for period_index in range(start_index, end_index + 1):
        levels, carried_forward = known_levels(dataset, period_index)
        levels_by_period.append(levels)
        carried_forward_count += len(carried_forward)

    instrument_ids = [item["instrumentId"] for item in dataset["instruments"]]
    if "SYNTH_CASH" not in instrument_ids:
        raise ContractViolation("cash comparison control requires SYNTH_CASH")
    cash_change, cash_drawdown = _path_metrics(levels_by_period, ["SYNTH_CASH"])
    equal_change, equal_drawdown = _path_metrics(levels_by_period, instrument_ids)
    no_trade_change, no_trade_drawdown = _buy_and_hold_metrics(levels_by_period, instrument_ids)

    common_metrics = {
        "end_index": str(end_index),
        "start_index": str(start_index),
    }
    return seal_evaluation_result({
        "schemaVersion": RESULT_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "riskState": "execution_disabled",
        "datasetReference": {
            "datasetId": dataset["datasetId"],
            "version": dataset["datasetVersion"],
            "contentFingerprint": dataset["contentFingerprint"],
        },
        "modelReference": {
            "entityId": BASELINE_MODEL_ID,
            "version": 1,
            "lifecycle": "evaluation_only",
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "assumptionReferences": dataset["assumptionReferences"],
        "benchmarkResults": [
            {
                "benchmarkId": CASH_CONTROL_ID,
                "status": "computed",
                "metrics": {
                    **common_metrics,
                    "cumulative_change_percent": _metric(cash_change),
                    "instrument_count": "1",
                    "maximum_drawdown_percent": _metric(cash_drawdown),
                },
                "reasonCodes": ["SYNTHETIC_COMPARISON_CONTROL"],
            },
            {
                "benchmarkId": EQUAL_WEIGHT_CONTROL_ID,
                "status": "computed",
                "metrics": {
                    **common_metrics,
                    "carried_forward_observation_count": str(carried_forward_count),
                    "cumulative_change_percent": _metric(equal_change),
                    "instrument_count": str(len(instrument_ids)),
                    "maximum_drawdown_percent": _metric(equal_drawdown),
                },
                "reasonCodes": ["SYNTHETIC_COMPARISON_CONTROL"],
            },
            {
                "benchmarkId": NO_TRADE_CONTROL_ID,
                "status": "computed",
                "metrics": {
                    **common_metrics,
                    "carried_forward_observation_count": str(carried_forward_count),
                    "cumulative_change_percent": _metric(no_trade_change),
                    "instrument_count": str(len(instrument_ids)),
                    "maximum_drawdown_percent": _metric(no_trade_drawdown),
                },
                "reasonCodes": ["SYNTHETIC_COMPARISON_CONTROL"],
            },
        ],
        "reasonCodes": [
            "COMPARISON_CONTROLS_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    })
