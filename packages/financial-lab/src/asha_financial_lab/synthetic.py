"""Deterministic, non-market fixture generation for laboratory mechanics."""

from __future__ import annotations

from decimal import Decimal

from .assumptions import assumption_reference
from .contracts import DATASET_SCHEMA_VERSION, seal_synthetic_dataset


REFERENCE_PERIODS = 120
REFERENCE_DATASET_ID = "ASHA_SYNTHETIC_REFERENCE_PATHS_V1"

_INSTRUMENTS = (
    ("SYNTH_CASH", "[SYNTHETIC] Constant path"),
    ("SYNTH_DEFENSIVE", "[SYNTHETIC] Defensive path"),
    ("SYNTH_TREND", "[SYNTHETIC] Trend path"),
    ("SYNTH_VOLATILE", "[SYNTHETIC] Volatile path"),
)
_VOLATILE_PATTERN = tuple(Decimal(value) for value in ("0", "2.4", "-1.2", "3.1", "-2.8", "1.7", "-0.9", "2.2"))


def _path_value(instrument_id: str, period_index: int) -> Decimal:
    period = Decimal(period_index)
    if instrument_id == "SYNTH_CASH":
        return Decimal("100")
    if instrument_id == "SYNTH_DEFENSIVE":
        shock = Decimal("-6") if 45 <= period_index <= 49 else Decimal("-3") if 50 <= period_index <= 54 else Decimal("0")
        return Decimal("100") + Decimal("0.08") * period + shock
    if instrument_id == "SYNTH_TREND":
        return Decimal("100") + Decimal("0.25") * period
    if instrument_id == "SYNTH_VOLATILE":
        return Decimal("100") + Decimal("0.15") * period + _VOLATILE_PATTERN[period_index % len(_VOLATILE_PATTERN)]
    raise ValueError("unknown synthetic instrument")


def build_reference_dataset() -> dict:
    """Build the fixed four-path fixture without randomness, dates, or real units."""

    observations = []
    for period_index in range(REFERENCE_PERIODS):
        for instrument_id, _ in _INSTRUMENTS:
            available_at_index = period_index + (
                1 if instrument_id == "SYNTH_VOLATILE" and period_index % 10 == 0 else 0
            )
            observations.append({
                "observationId": f"SYNTH_OBS_{instrument_id.removeprefix('SYNTH_')}_{period_index:03d}",
                "instrumentId": instrument_id,
                "periodIndex": period_index,
                "availableAtIndex": available_at_index,
                "value": f"{_path_value(instrument_id, period_index):.8f}",
            })

    return seal_synthetic_dataset({
        "schemaVersion": DATASET_SCHEMA_VERSION,
        "datasetId": REFERENCE_DATASET_ID,
        "datasetVersion": 1,
        "datasetKind": "synthetic_fixture",
        "purpose": "benchmark_evaluation",
        "financialUseAllowed": False,
        "instruments": [
            {"instrumentId": instrument_id, "displayName": display_name, "unit": "synthetic_index_point"}
            for instrument_id, display_name in _INSTRUMENTS
        ],
        "observations": observations,
        "assumptionReferences": [
            assumption_reference("ASHA_SYNTHETIC_ASSUMPTION_FULL_LIQUIDITY", 1),
            assumption_reference("ASHA_SYNTHETIC_ASSUMPTION_ZERO_COST", 1),
        ],
    })
