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
from asha_financial_lab.method_comparison import (
    METHOD_COMPARISON_SCHEMA_VERSION,
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
