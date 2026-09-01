from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.contracts import (  # noqa: E402
    ContractViolation,
    DATASET_SCHEMA_VERSION,
    seal_evaluation_result,
    seal_synthetic_dataset,
    validate_evaluation_result,
)
from asha_financial_lab.artifacts import encode_evaluation_result, encode_synthetic_dataset  # noqa: E402
from asha_financial_lab.controls import (  # noqa: E402
    CASH_CONTROL_ID,
    EQUAL_WEIGHT_CONTROL_ID,
    evaluate_comparison_controls,
)
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402
from asha_financial_lab.replay import replay_comparison_control_artifacts  # noqa: E402


def _hand_fixture(*, delayed_second_path: bool = False) -> dict:
    paths = {
        "SYNTH_AA": ("100", "110", "110"),
        "SYNTH_BB": ("100", "120", "90"),
        "SYNTH_CASH": ("100", "100", "100"),
    }
    observations = []
    for period_index in range(3):
        for instrument_id in sorted(paths):
            observations.append({
                "observationId": f"SYNTH_OBS_{instrument_id.removeprefix('SYNTH_')}_{period_index:03d}",
                "instrumentId": instrument_id,
                "periodIndex": period_index,
                "availableAtIndex": 2 if delayed_second_path and instrument_id == "SYNTH_BB" and period_index == 1 else period_index,
                "value": f"{paths[instrument_id][period_index]}.00000000",
            })
    return seal_synthetic_dataset({
        "schemaVersion": DATASET_SCHEMA_VERSION,
        "datasetId": "ASHA_SYNTHETIC_HAND_CHECK_V1",
        "datasetVersion": 1,
        "datasetKind": "synthetic_fixture",
        "purpose": "benchmark_evaluation",
        "financialUseAllowed": False,
        "instruments": [
            {"instrumentId": instrument_id, "displayName": f"[SYNTHETIC] {instrument_id}", "unit": "synthetic_index_point"}
            for instrument_id in sorted(paths)
        ],
        "observations": observations,
        "assumptionReferences": [],
    })


class ComparisonControlTests(unittest.TestCase):
    def test_hand_computed_cash_and_equal_weight_controls(self) -> None:
        result = evaluate_comparison_controls(_hand_fixture(), 0, 2)
        self.assertEqual(validate_evaluation_result(result), result)
        cash, equal_weight = result["benchmarkResults"]
        self.assertEqual(cash["benchmarkId"], CASH_CONTROL_ID)
        self.assertEqual(cash["metrics"]["cumulative_change_percent"], "0.00000000")
        self.assertEqual(cash["metrics"]["maximum_drawdown_percent"], "0.00000000")
        self.assertEqual(equal_weight["benchmarkId"], EQUAL_WEIGHT_CONTROL_ID)
        self.assertEqual(equal_weight["metrics"]["cumulative_change_percent"], "0.83333333")
        self.assertEqual(equal_weight["metrics"]["maximum_drawdown_percent"], "8.33333333")
        self.assertEqual(equal_weight["metrics"]["carried_forward_observation_count"], "0")

    def test_delayed_value_is_carried_forward_not_seen_early(self) -> None:
        result = evaluate_comparison_controls(_hand_fixture(delayed_second_path=True), 0, 2)
        equal_weight = result["benchmarkResults"][1]
        self.assertEqual(equal_weight["metrics"]["carried_forward_observation_count"], "1")
        self.assertEqual(equal_weight["metrics"]["cumulative_change_percent"], "-0.11111111")
        self.assertEqual(equal_weight["metrics"]["maximum_drawdown_percent"], "3.33333333")

    def test_reference_control_replay_is_exact_and_locked(self) -> None:
        dataset = build_reference_dataset()
        first = evaluate_comparison_controls(dataset, 1, 110)
        second = evaluate_comparison_controls(deepcopy(dataset), 1, 110)
        self.assertEqual(first, second)
        self.assertEqual(first["decisionState"], "no_decision")
        self.assertFalse(first["financialUseAllowed"])
        self.assertFalse(first["executionAllowed"])
        self.assertEqual(first["methodologyReference"]["approvalState"], "unapproved")
        self.assertEqual(
            first["benchmarkResults"][1]["metrics"]["carried_forward_observation_count"],
            "11",
        )
        self.assertEqual(
            first["benchmarkResults"][1]["metrics"]["cumulative_change_percent"],
            "13.52651172",
        )
        self.assertEqual(
            first["benchmarkResults"][1]["metrics"]["maximum_drawdown_percent"],
            "1.96755954",
        )
        self.assertEqual(
            first["resultId"],
            "ASHA_EVAL_654ad475c58313afee68067efe85889ba25f6d169fb0b7036bc209c55c8c964e",
        )
        self.assertEqual(
            replay_comparison_control_artifacts(
                encode_synthetic_dataset(dataset),
                encode_evaluation_result(first),
            ),
            first,
        )

    def test_resealed_false_control_result_fails_exact_replay(self) -> None:
        dataset = build_reference_dataset()
        false_unsigned = evaluate_comparison_controls(dataset, 1, 110)
        false_unsigned.pop("resultId")
        false_unsigned["benchmarkResults"][1]["metrics"]["cumulative_change_percent"] = "99.00000000"
        false_result = seal_evaluation_result(false_unsigned)
        with self.assertRaises(ContractViolation):
            replay_comparison_control_artifacts(
                encode_synthetic_dataset(dataset),
                encode_evaluation_result(false_result),
            )

    def test_invalid_range_missing_cash_and_tampering_fail_closed(self) -> None:
        dataset = build_reference_dataset()
        for start, end in ((-1, 2), (2, 2), (3, 2), (0, 120), (True, 2), (0, "2")):
            with self.subTest(start=start, end=end):
                with self.assertRaises(ValueError):
                    evaluate_comparison_controls(dataset, start, end)

        missing_cash = _hand_fixture()
        missing_cash["instruments"] = missing_cash["instruments"][:-1]
        missing_cash["observations"] = [
            row for row in missing_cash["observations"] if row["instrumentId"] != "SYNTH_CASH"
        ]
        missing_cash.pop("contentFingerprint")
        missing_cash = seal_synthetic_dataset(missing_cash)
        with self.assertRaises(ContractViolation):
            evaluate_comparison_controls(missing_cash, 0, 2)


if __name__ == "__main__":
    unittest.main()
