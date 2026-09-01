from __future__ import annotations

from asha_financial_lab.contracts import DATASET_SCHEMA_VERSION, seal_synthetic_dataset
from asha_financial_lab.features import build_point_in_time_return_matrix
from asha_financial_lab.walk_forward import build_walk_forward_plan


def hand_dataset(test_tail: str = "250") -> dict:
    paths = {
        "SYNTH_ALPHA": ("100", "200", "200", test_tail, "260", "270"),
        "SYNTH_BETA": ("100", "100", "100", "100", "100", "100"),
    }
    observations = []
    for period_index in range(6):
        for instrument_id in sorted(paths):
            observations.append({
                "observationId": f"SYNTH_OBS_{instrument_id.removeprefix('SYNTH_')}_{period_index:03d}",
                "instrumentId": instrument_id,
                "periodIndex": period_index,
                "availableAtIndex": period_index,
                "value": f"{paths[instrument_id][period_index]}.00000000",
            })
    return seal_synthetic_dataset({
        "schemaVersion": DATASET_SCHEMA_VERSION,
        "datasetId": "ASHA_SYNTHETIC_STANDARDIZER_HAND_V1",
        "datasetVersion": 1,
        "datasetKind": "synthetic_fixture",
        "purpose": "walk_forward_mechanics_test",
        "financialUseAllowed": False,
        "instruments": [
            {"instrumentId": instrument_id, "displayName": f"[SYNTHETIC] {instrument_id}", "unit": "synthetic_index_point"}
            for instrument_id in sorted(paths)
        ],
        "observations": observations,
        "assumptionReferences": [],
    })


def normalization_inputs(dataset: dict) -> tuple[dict, dict]:
    matrix = build_point_in_time_return_matrix(dataset, 1, 5)
    plan = build_walk_forward_plan(
        dataset,
        minimum_train_periods=3,
        test_periods=1,
        step_periods=1,
        purge_periods=0,
        embargo_periods=0,
        mode="rolling",
    )
    return matrix, plan
