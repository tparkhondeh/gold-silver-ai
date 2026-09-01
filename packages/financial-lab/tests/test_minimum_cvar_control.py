from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_minimum_cvar_control_weights,
    encode_minimum_cvar_control_weights,
)
from asha_financial_lab.contracts import (  # noqa: E402
    ContractViolation,
    DATASET_SCHEMA_VERSION,
    fingerprint,
    seal_synthetic_dataset,
)
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.minimum_cvar_control import (  # noqa: E402
    MINIMUM_CVAR_CONTROL_ID,
    MINIMUM_CVAR_SCHEMA_VERSION,
    build_minimum_cvar_comparison_control_weights,
    validate_minimum_cvar_comparison_control_weights,
)
from asha_financial_lab.walk_forward import build_walk_forward_plan  # noqa: E402


def _dataset(test_alpha: str = "118.80000000") -> dict:
    paths = {
        "SYNTH_ALPHA": (
            "100.00000000", "120.00000000", "108.00000000",
            test_alpha, "120.00000000", "122.00000000",
        ),
        "SYNTH_BETA": (
            "100.00000000", "95.00000000", "104.50000000",
            "110.00000000", "112.00000000", "114.00000000",
        ),
    }
    observations = [
        {
            "observationId": f"SYNTH_OBS_{instrument_id.removeprefix('SYNTH_')}_{period_index:03d}",
            "instrumentId": instrument_id,
            "periodIndex": period_index,
            "availableAtIndex": period_index,
            "value": paths[instrument_id][period_index],
        }
        for period_index in range(6)
        for instrument_id in sorted(paths)
    ]
    return seal_synthetic_dataset({
        "schemaVersion": DATASET_SCHEMA_VERSION,
        "datasetId": "ASHA_SYNTHETIC_MIN_CVAR_HAND_V1",
        "datasetVersion": 1,
        "datasetKind": "synthetic_fixture",
        "purpose": "walk_forward_mechanics_test",
        "financialUseAllowed": False,
        "instruments": [
            {
                "instrumentId": instrument_id,
                "displayName": f"[SYNTHETIC] {instrument_id}",
                "unit": "synthetic_index_point",
            }
            for instrument_id in sorted(paths)
        ],
        "observations": observations,
        "assumptionReferences": [],
    })


def _inputs(dataset: dict) -> tuple[dict, dict]:
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


def _build(dataset: dict, **overrides: object) -> dict:
    matrix, plan = _inputs(dataset)
    parameters = {
        "fold_index": 0,
        "tail_count": 1,
        "weight_step": "0.500000000000",
        **overrides,
    }
    return build_minimum_cvar_comparison_control_weights(
        dataset, matrix, plan, **parameters
    )


class MinimumCvarComparisonControlTests(unittest.TestCase):
    def test_hand_computed_grid_selects_balanced_zero_worst_loss(self) -> None:
        weights = _build(_dataset())
        self.assertEqual(weights["benchmarkId"], MINIMUM_CVAR_CONTROL_ID)
        self.assertEqual(weights["scenarioCount"], 2)
        self.assertEqual(weights["candidateCount"], 3)
        self.assertEqual(weights["weights"], [
            {"instrumentId": "SYNTH_ALPHA", "weight": "0.500000000000"},
            {"instrumentId": "SYNTH_BETA", "weight": "0.500000000000"},
        ])
        self.assertEqual(
            sum(Decimal(item["weight"]) for item in weights["weights"]),
            Decimal("1"),
        )
        self.assertEqual(weights["selectedTailLosses"], [
            {"periodIndex": 2, "loss": "0.000000000000"},
        ])
        self.assertEqual(weights["cvarLoss"], "0.000000000000")
        self.assertEqual(weights["meanReturn"], "0.037500000000")
        self.assertEqual(
            weights["weightSetId"],
            "ASHA_MIN_CVAR_CONTROL_WEIGHTS_41c91636f3cf07dbd9fc0f7cc1b9e22a835dbf18fb1a35b89ea7e94f7d2e310e",
        )
        self.assertEqual(weights["decisionState"], "no_decision")
        self.assertFalse(weights["financialUseAllowed"])
        self.assertFalse(weights["executionAllowed"])

    def test_future_test_change_cannot_change_train_only_grid_result(self) -> None:
        first = _build(_dataset("118.80000000"))
        changed = _build(_dataset("140.00000000"))
        for field in ("weights", "selectedTailLosses", "cvarLoss", "meanReturn"):
            self.assertEqual(first[field], changed[field])
        self.assertNotEqual(first["weightSetId"], changed["weightSetId"])

    def test_grid_bounds_and_tail_count_fail_closed(self) -> None:
        dataset = _dataset()
        with self.assertRaises(ValueError):
            _build(dataset, tail_count=0)
        with self.assertRaises(ValueError):
            _build(dataset, tail_count=3)
        with self.assertRaises(ValueError):
            _build(dataset, weight_step="0.300000000000")
        with self.assertRaises(ValueError):
            _build(dataset, weight_step="0.000000000001")

    def test_artifact_replay_and_resealed_tampering_fail_closed(self) -> None:
        dataset = _dataset()
        matrix, plan = _inputs(dataset)
        weights = _build(dataset)
        document = encode_minimum_cvar_control_weights(weights, dataset, matrix, plan)
        self.assertEqual(
            decode_minimum_cvar_control_weights(document, dataset, matrix, plan),
            weights,
        )
        tampered = deepcopy(weights)
        tampered["weights"][0]["weight"] = "1.000000000000"
        tampered["weights"][1]["weight"] = "0.000000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "weightSetId"}
        tampered["weightSetId"] = f"ASHA_MIN_CVAR_CONTROL_WEIGHTS_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact train-only replay"):
            validate_minimum_cvar_comparison_control_weights(
                tampered, dataset, matrix, plan
            )

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/minimum-cvar-control-weights.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            MINIMUM_CVAR_SCHEMA_VERSION,
        )
        self.assertEqual(
            schema["properties"]["benchmarkId"]["const"],
            MINIMUM_CVAR_CONTROL_ID,
        )
        self.assertEqual(schema["properties"]["candidateCount"]["maximum"], 25000)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
