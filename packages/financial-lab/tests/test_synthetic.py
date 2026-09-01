from __future__ import annotations

from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.assumptions import resolve_assumption  # noqa: E402
from asha_financial_lab.contracts import canonical_json, validate_synthetic_dataset  # noqa: E402
from asha_financial_lab.synthetic import (  # noqa: E402
    REFERENCE_DATASET_ID,
    REFERENCE_PERIODS,
    build_reference_dataset,
)


class SyntheticReferenceFixtureTests(unittest.TestCase):
    def test_fixture_is_exactly_replayable_and_contract_valid(self) -> None:
        first = build_reference_dataset()
        second = build_reference_dataset()
        self.assertEqual(first, second)
        self.assertEqual(validate_synthetic_dataset(first), first)
        self.assertEqual(first["datasetId"], REFERENCE_DATASET_ID)
        self.assertEqual(len(first["observations"]), REFERENCE_PERIODS * 4)
        self.assertEqual(first["contentFingerprint"], "df997bd86869e05a75e80aa76caccf639d900478f4a0c7ac8fbeebd147a55961")

    def test_fixture_contains_no_real_market_namespace_or_unit(self) -> None:
        serialized = canonical_json(build_reference_dataset()).upper()
        for forbidden in ("TOMAN", "IRR", "USD", "XAU", "XAG", "NAVASAN", "GOLDAPI"):
            self.assertNotIn(forbidden, serialized)

    def test_point_in_time_delays_are_explicit_and_never_early(self) -> None:
        observations = build_reference_dataset()["observations"]
        delayed = [row for row in observations if row["availableAtIndex"] > row["periodIndex"]]
        self.assertEqual(len(delayed), 12)
        self.assertTrue(all(row["instrumentId"] == "SYNTH_VOLATILE" for row in delayed))
        self.assertTrue(all(row["availableAtIndex"] >= row["periodIndex"] for row in observations))

    def test_every_assumption_reference_resolves_to_fingerprinted_synthetic_content(self) -> None:
        dataset = build_reference_dataset()
        resolved = [resolve_assumption(reference["entityId"], reference["version"]) for reference in dataset["assumptionReferences"]]
        self.assertTrue(all(entry["status"] == "synthetic_only" for entry in resolved))
        self.assertTrue(all(len(entry["contentFingerprint"]) == 64 for entry in resolved))

    def test_hand_checkable_paths_start_at_expected_synthetic_index(self) -> None:
        dataset = build_reference_dataset()
        first_period = [row for row in dataset["observations"] if row["periodIndex"] == 0]
        values = {row["instrumentId"]: row["value"] for row in first_period}
        self.assertEqual(values, {
            "SYNTH_CASH": "100.00000000",
            "SYNTH_DEFENSIVE": "100.00000000",
            "SYNTH_TREND": "100.00000000",
            "SYNTH_VOLATILE": "100.00000000",
        })


if __name__ == "__main__":
    unittest.main()
