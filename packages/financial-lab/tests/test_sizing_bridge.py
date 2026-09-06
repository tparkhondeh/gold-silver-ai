from copy import deepcopy
import json
from pathlib import Path
import unittest

from asha_financial_lab.contracts import ContractViolation
from asha_financial_lab.sizing_bridge import build_sizing_bridge, validate_sizing_bridge
from asha_financial_lab.method_comparison import build_method_comparison_report


class SizingBridgeTests(unittest.TestCase):
    def test_exact_controls_and_train_test_order(self):
        packet = build_sizing_bridge()
        source = build_method_comparison_report()
        self.assertEqual(packet["methodComparisonId"], source["reportId"])
        self.assertEqual(len(packet["folds"]), 2)
        for fold, original in zip(packet["folds"], source["foldResults"], strict=True):
            self.assertLessEqual(fold["trainEndIndex"], fold["executionCutoffIndex"])
            self.assertLess(fold["executionCutoffIndex"], fold["testStartIndex"])
            self.assertEqual(len(fold["methods"]), 7)
            self.assertEqual([m["weights"] for m in fold["methods"]], [m["weights"] for m in original["methodResults"]])
            self.assertEqual([p["periodIndex"] for p in fold["evaluationPoints"]], list(range(fold["testStartIndex"], fold["testEndIndex"] + 1)))
        self.assertFalse(packet["financialUseAllowed"])
        self.assertFalse(packet["executionAllowed"])

    def test_replay_rejects_future_or_fabricated_weights_and_permissions(self):
        original = build_sizing_bridge()
        for mutate in [
            lambda p: p.update(executionAllowed=True),
            lambda p: p["folds"][0].update(executionCutoffIndex=999),
            lambda p: p["folds"][0]["methods"][0]["weights"][0].update(weight="0.999999999999"),
            lambda p: p["folds"][0]["evaluationPoints"][0]["levels"].update(SYNTH_DEFENSIVE="999"),
        ]:
            altered = deepcopy(original)
            mutate(altered)
            with self.assertRaises(ContractViolation):
                validate_sizing_bridge(altered)
        self.assertEqual(validate_sizing_bridge(original), original)

    def test_web_reference_is_exact_generated_bridge(self):
        root = Path(__file__).resolve().parents[3]
        path = root / "apps/web/data/physical-sizing-bridge-v1.json"
        self.assertEqual(validate_sizing_bridge(json.loads(path.read_text(encoding="utf-8"))), build_sizing_bridge())


if __name__ == "__main__":
    unittest.main()
