from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import unittest

from asha_financial_lab.artifacts import (
    decode_method_comparison_report,
    encode_method_comparison_report,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.controls import NO_TRADE_CONTROL_ID
from asha_financial_lab.method_comparison import (
    METHOD_COMPARISON_SCHEMA_VERSION,
    _evaluate_no_trade,
    _evaluate_weights,
    build_method_comparison_report,
    validate_method_comparison_report,
)
from asha_financial_lab.transparent_decision import TRANSPARENT_DECISION_METHOD_ID


class MethodComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = build_method_comparison_report()

    def test_same_two_folds_cover_proposal_and_six_controls(self) -> None:
        self.assertEqual(self.report["summary"]["foldCount"], 2)
        self.assertEqual(self.report["summary"]["methodCount"], 7)
        self.assertEqual(self.report["selectedMethodId"], TRANSPARENT_DECISION_METHOD_ID)
        expected = self.report["comparisonMethodIds"]
        for fold in self.report["foldResults"]:
            self.assertEqual([item["methodId"] for item in fold["methodResults"]], expected)

    def test_each_weight_set_reconciles_and_test_window_is_fixed(self) -> None:
        for fold in self.report["foldResults"]:
            self.assertLess(fold["trainEndIndex"], fold["testStartIndex"])
            for method in fold["methodResults"]:
                self.assertEqual(
                    sum(Decimal(item["weight"]) for item in method["weights"]),
                    Decimal("1.000000000000"),
                )
                self.assertEqual(method["metrics"]["periodCount"], 20)

    def test_no_trade_does_not_rebalance_after_a_price_move(self) -> None:
        # Half cash / half A: A doubles then returns to its initial price.
        # Fixed holdings return to initial NAV; rebalancing earns 12.5% instead.
        ids = ["SYNTH_A", "SYNTH_CASH"]
        dataset = {
            "instruments": [{"instrumentId": item} for item in ids],
            "observations": [
                {"instrumentId": item, "periodIndex": period, "availableAtIndex": period,
                 "value": str(level if item == "SYNTH_A" else 100)}
                for period, level in enumerate([100, 200, 100]) for item in ids
            ],
        }
        matrix = {
            "instrumentIds": ids,
            "rows": [
                {"periodIndex": period, "returns": [
                    {"instrumentId": "SYNTH_A", "value": value},
                    {"instrumentId": "SYNTH_CASH", "value": "0"},
                ]} for period, value in [(1, "1"), (2, "-0.5")]
            ],
        }
        fold = {"testStartIndex": 1, "testEndIndex": 2}
        weights = {item: Decimal("0.5") for item in ids}
        no_trade = _evaluate_no_trade(dataset, fold, weights)
        rebalanced = _evaluate_weights(matrix, fold, weights)
        self.assertEqual(no_trade, {"periodCount": 2, "cumulativeChangePercent": "0.000000000000",
                                    "maximumDrawdownPercent": "33.333333333333"})
        self.assertEqual(rebalanced, {"periodCount": 2, "cumulativeChangePercent": "12.500000000000",
                                     "maximumDrawdownPercent": "25.000000000000"})

    def test_no_trade_preserves_unequal_weights_and_delayed_availability(self) -> None:
        ids = ["SYNTH_A", "SYNTH_CASH"]
        dataset = {
            "instruments": [{"instrumentId": item} for item in ids],
            "observations": [
                {"instrumentId": item, "periodIndex": period,
                 "availableAtIndex": period + (1 if item == "SYNTH_A" and period else 0),
                 "value": str(level if item == "SYNTH_A" else 100)}
                for period, level in enumerate([100, 200, 50]) for item in ids
            ],
        }
        weights = {"SYNTH_A": Decimal("0.25"), "SYNTH_CASH": Decimal("0.75")}
        self.assertEqual(_evaluate_no_trade(dataset, {"testStartIndex": 1, "testEndIndex": 1}, weights),
                         {"periodCount": 1, "cumulativeChangePercent": "0.000000000000",
                          "maximumDrawdownPercent": "0.000000000000"})
        self.assertEqual(_evaluate_no_trade(dataset, {"testStartIndex": 1, "testEndIndex": 2}, weights),
                         {"periodCount": 2, "cumulativeChangePercent": "25.000000000000",
                          "maximumDrawdownPercent": "0.000000000000"})

    def test_reference_no_trade_is_corrected_and_other_six_methods_are_unchanged(self) -> None:
        # The six unaffected methods were replayed from the pre-correction source.
        # Pin their exact metrics rather than widening a financial tolerance.
        expected = {
            "ASHA_BENCHMARK_CASH_CONTROL_V1": [("0.000000000000", "0.000000000000"), ("0.000000000000", "0.000000000000")],
            "ASHA_BENCHMARK_EQUAL_WEIGHT_CONTROL_V1": [("2.104041634872", "1.197921745725"), ("2.429005290106", "1.173535671675")],
            "ASHA_BENCHMARK_HRP_CONTROL_V1": [("4.347548926549", "0.000000000000"), ("4.166447348523", "0.000000000000")],
            "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1": [("4.316415412733", "0.000000000000"), ("4.143001172654", "0.000000000000")],
            "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1": [("4.347826086972", "0.000000000000"), ("4.166666666731", "0.000000000000")],
            TRANSPARENT_DECISION_METHOD_ID: [("2.231801805500", "0.586006745886"), ("2.301945988496", "0.550824310681")],
            NO_TRADE_CONTROL_ID: [("2.554857193934", "0.650536736205"), ("2.705915380296", "0.643213360246")],
        }
        for index, fold in enumerate(self.report["foldResults"]):
            self.assertEqual({method["methodId"] for method in fold["methodResults"]}, set(expected))
            for method in fold["methodResults"]:
                change, drawdown = expected[method["methodId"]][index]
                self.assertEqual(method["metrics"], {"periodCount": 20,
                    "cumulativeChangePercent": change, "maximumDrawdownPercent": drawdown})

    def test_synthetic_metrics_cannot_rank_or_select(self) -> None:
        self.assertEqual(
            self.report["selectionBasis"],
            "engineering_fit_only_not_synthetic_performance",
        )
        self.assertEqual(self.report["summary"]["aggregationPolicy"], "none_fold_or_method_metrics_only")
        self.assertEqual(self.report["summary"]["rankingPolicy"], "none_synthetic_performance_cannot_select")
        self.assertIn("IRAN_VALIDATION_REQUIRED", self.report["reasonCodes"])

    def test_sensitivity_changes_only_the_resealed_synthetic_decision(self) -> None:
        checks = {item["checkId"]: item for item in self.report["scenarioAndSensitivityChecks"]}
        self.assertEqual(set(checks), {"BASE_SHORT", "HORIZON_LONG", "CRISIS_WORSENED", "VALUATION_ONE_FACTOR"})
        self.assertNotEqual(checks["BASE_SHORT"]["decisionId"], checks["HORIZON_LONG"]["decisionId"])
        self.assertNotEqual(checks["BASE_SHORT"]["decisionId"], checks["VALUATION_ONE_FACTOR"]["decisionId"])
        self.assertEqual(checks["CRISIS_WORSENED"]["action"], "reduce")

    def test_resealed_metric_tampering_fails_exact_replay(self) -> None:
        tampered = deepcopy(self.report)
        tampered["foldResults"][0]["methodResults"][0]["metrics"]["cumulativeChangePercent"] = "9.000000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "reportId"}
        tampered["reportId"] = f"ASHA_METHOD_COMPARISON_{fingerprint(unsigned)}"
        with self.assertRaises(ContractViolation):
            validate_method_comparison_report(tampered)

    def test_canonical_transport_and_schema_keep_financial_lock(self) -> None:
        encoded = encode_method_comparison_report(self.report)
        self.assertEqual(decode_method_comparison_report(encoded), self.report)
        path = Path(__file__).resolve().parents[1] / "schemas" / "v1" / "method-comparison.schema.json"
        schema = json.loads(path.read_text("utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], METHOD_COMPARISON_SCHEMA_VERSION)
        self.assertFalse(schema["properties"]["financialUseAllowed"]["const"])
        self.assertFalse(schema["properties"]["executionAllowed"]["const"])


if __name__ == "__main__":
    unittest.main()
