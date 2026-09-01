from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.baseline import BASELINE_MODEL_ID, evaluate_no_decision  # noqa: E402
from asha_financial_lab.contracts import ContractViolation, validate_evaluation_result  # noqa: E402
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402


class NoDecisionBaselineTests(unittest.TestCase):
    def test_replay_is_exact_and_output_remains_locked(self) -> None:
        dataset = build_reference_dataset()
        first = evaluate_no_decision(dataset, 110)
        second = evaluate_no_decision(deepcopy(dataset), 110)
        self.assertEqual(first, second)
        self.assertEqual(validate_evaluation_result(first), first)
        self.assertEqual(first["modelReference"]["entityId"], BASELINE_MODEL_ID)
        self.assertEqual(first["decisionState"], "no_decision")
        self.assertFalse(first["financialUseAllowed"])
        self.assertFalse(first["executionAllowed"])

    def test_cutoff_excludes_an_observation_not_yet_available(self) -> None:
        result = evaluate_no_decision(build_reference_dataset(), 110)
        metrics = result["benchmarkResults"][0]["metrics"]
        self.assertEqual(metrics, {
            "available_observation_count": "443",
            "cutoff_index": "110",
            "instrument_count": "4",
        })

    def test_first_cutoff_is_hand_checkable_and_excludes_delayed_row(self) -> None:
        result = evaluate_no_decision(build_reference_dataset(), 0)
        self.assertEqual(result["benchmarkResults"][0]["metrics"]["available_observation_count"], "3")
        self.assertEqual(result["benchmarkResults"][0]["metrics"]["instrument_count"], "3")

    def test_invalid_cutoffs_and_tampered_dataset_fail_closed(self) -> None:
        dataset = build_reference_dataset()
        for cutoff in (-1, 120, True, "10"):
            with self.subTest(cutoff=cutoff):
                with self.assertRaises(ValueError):
                    evaluate_no_decision(dataset, cutoff)

        tampered = deepcopy(dataset)
        tampered["observations"][0]["value"] = "101.00000000"
        with self.assertRaises(ContractViolation):
            evaluate_no_decision(tampered, 0)


if __name__ == "__main__":
    unittest.main()
