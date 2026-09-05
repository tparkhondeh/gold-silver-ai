from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import unittest

from asha_financial_lab.artifacts import (
    decode_methodology_selection_record,
    encode_methodology_selection_record,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.methodology_selection import (
    METHODOLOGY_SELECTION_SCHEMA_VERSION,
    build_methodology_selection_record,
    validate_methodology_selection_record,
)
from asha_financial_lab.transparent_decision import TRANSPARENT_DECISION_METHOD_ID


class MethodologySelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.record = build_methodology_selection_record()

    def test_equal_predeclared_criteria_select_engineering_fit_not_performance(self) -> None:
        self.assertEqual(len(self.record["criteria"]), 10)
        self.assertEqual(
            sum(Decimal(item["weight"]) for item in self.record["criteria"]),
            Decimal("1.000000"),
        )
        self.assertEqual(self.record["comparisonPurpose"], "engineering_fit_not_financial_performance")
        self.assertEqual(self.record["selectedMethodId"], TRANSPARENT_DECISION_METHOD_ID)
        self.assertIn("BEST_FINANCIAL_PERFORMANCE", self.record["rejectedClaims"])

    def test_nine_methods_reconcile_scores_without_result_chasing(self) -> None:
        self.assertEqual(len(self.record["candidates"]), 9)
        for candidate in self.record["candidates"]:
            expected = sum(
                Decimal(item["score"]) * Decimal("0.1")
                for item in candidate["criterionScores"]
            )
            self.assertEqual(Decimal(candidate["engineeringFitScore"]), expected)
            self.assertEqual(candidate["financialPerformanceStatus"], "not_evaluated")
            self.assertEqual(candidate["iranCalibrationStatus"], "not_evaluated")
        selected = next(
            item for item in self.record["candidates"]
            if item["methodId"] == TRANSPARENT_DECISION_METHOD_ID
        )
        others = [
            Decimal(item["engineeringFitScore"])
            for item in self.record["candidates"] if item is not selected
        ]
        self.assertGreater(Decimal(selected["engineeringFitScore"]), max(others))

    def test_sources_include_recent_and_classical_primary_material(self) -> None:
        source_ids = {item["sourceId"] for item in self.record["sources"]}
        self.assertEqual(len(source_ids), 18)
        self.assertIn("SALAS_MOLINA_NIN_FAST_HRP_2026", source_ids)
        self.assertIn("TRUCIOS_HIERARCHICAL_COMPARISON_2026", source_ids)
        self.assertIn("DEMIGUEL_NAIVE_DIVERSIFICATION_2009", source_ids)
        self.assertIn("BAILEY_BACKTEST_OVERFITTING_2016", source_ids)
        self.assertIn("KIM_TSE_WALD_TSMOM_CRITIQUE_2016", source_ids)
        self.assertIn("HUANG_LI_WANG_ZHOU_TSMOM_CRITIQUE_2020", source_ids)
        self.assertTrue(all(item["reviewedOn"] == "2026-09-05" for item in self.record["sources"]))

    def test_resealed_selection_drift_fails_closed(self) -> None:
        tampered = deepcopy(self.record)
        tampered["selectedMethodId"] = "ASHA_BENCHMARK_HRP_CONTROL_V1"
        unsigned = {key: value for key, value in tampered.items() if key != "selectionId"}
        tampered["selectionId"] = f"ASHA_METHODOLOGY_SELECTION_{fingerprint(unsigned)}"
        with self.assertRaises(ContractViolation):
            validate_methodology_selection_record(tampered)

    def test_canonical_selection_round_trip(self) -> None:
        encoded = encode_methodology_selection_record(self.record)
        self.assertEqual(decode_methodology_selection_record(encoded), self.record)

    def test_schema_preserves_the_laboratory_only_selection(self) -> None:
        path = Path(__file__).resolve().parents[1] / "schemas" / "v1" / "methodology-selection.schema.json"
        schema = json.loads(path.read_text("utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], METHODOLOGY_SELECTION_SCHEMA_VERSION)
        self.assertFalse(schema["properties"]["financialUseAllowed"]["const"])
        self.assertFalse(schema["properties"]["executionAllowed"]["const"])
        self.assertEqual(schema["properties"]["selectedMethodId"]["const"], TRANSPARENT_DECISION_METHOD_ID)


if __name__ == "__main__":
    unittest.main()
