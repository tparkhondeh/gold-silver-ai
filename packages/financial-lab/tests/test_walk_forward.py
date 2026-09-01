from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.contracts import ContractViolation, fingerprint, seal_synthetic_dataset  # noqa: E402
from asha_financial_lab.artifacts import decode_walk_forward_plan, encode_walk_forward_plan  # noqa: E402
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402
from asha_financial_lab.walk_forward import (  # noqa: E402
    WALK_FORWARD_SCHEMA_VERSION,
    build_walk_forward_plan,
    validate_walk_forward_plan,
)


class WalkForwardMechanicsTests(unittest.TestCase):
    def test_rolling_plan_is_exact_and_excludes_not_yet_available_training_row(self) -> None:
        dataset = build_reference_dataset()
        first = build_walk_forward_plan(
            dataset,
            minimum_train_periods=11,
            test_periods=2,
            step_periods=2,
            purge_periods=0,
            embargo_periods=0,
            mode="rolling",
        )
        second = build_walk_forward_plan(
            deepcopy(dataset),
            minimum_train_periods=11,
            test_periods=2,
            step_periods=2,
            purge_periods=0,
            embargo_periods=0,
            mode="rolling",
        )
        self.assertEqual(first, second)
        self.assertEqual(validate_walk_forward_plan(first, dataset), first)
        self.assertEqual(first["folds"][0]["trainStartIndex"], 0)
        self.assertEqual(first["folds"][0]["trainEndIndex"], 10)
        self.assertEqual(first["folds"][0]["trainObservationCount"], 43)
        self.assertEqual(first["folds"][0]["testStartIndex"], 11)
        self.assertEqual(first["folds"][1]["trainStartIndex"], 2)
        self.assertFalse(first["financialUseAllowed"])
        self.assertEqual(len(first["folds"]), 54)
        self.assertEqual(
            first["planId"],
            "ASHA_WALK_FORWARD_39c28f027de22ece3c444861ef5f81fba00d3c3acdd3e6e91356c2000ce9547f",
        )
        self.assertEqual(
            first["folds"][0]["trainObservationFingerprint"],
            "a0ff89be7884fe6e3cc6df17bddea0d7a3cd901479a7fb864fa4abf63b15b3d3",
        )

    def test_plan_artifact_round_trips_only_with_its_exact_dataset(self) -> None:
        dataset = build_reference_dataset()
        plan = build_walk_forward_plan(
            dataset,
            minimum_train_periods=20,
            test_periods=5,
            step_periods=7,
            purge_periods=2,
            embargo_periods=2,
            mode="anchored",
        )
        document = encode_walk_forward_plan(plan, dataset)
        self.assertEqual(decode_walk_forward_plan(document, dataset), plan)

        other_dataset = deepcopy(dataset)
        other_dataset["observations"][0]["value"] = "101.00000000"
        other_dataset.pop("contentFingerprint")
        other_dataset = seal_synthetic_dataset(other_dataset)
        with self.assertRaises(ContractViolation):
            decode_walk_forward_plan(document, other_dataset)

    def test_anchored_purge_and_embargo_ranges_are_hand_checkable(self) -> None:
        plan = build_walk_forward_plan(
            build_reference_dataset(),
            minimum_train_periods=20,
            test_periods=5,
            step_periods=7,
            purge_periods=2,
            embargo_periods=2,
            mode="anchored",
        )
        first, second = plan["folds"][:2]
        self.assertEqual(
            {key: first[key] for key in (
                "trainStartIndex", "trainEndIndex", "purgeStartIndex", "purgeEndIndex",
                "testStartIndex", "testEndIndex", "embargoStartIndex", "embargoEndIndex",
            )},
            {
                "trainStartIndex": 0,
                "trainEndIndex": 19,
                "purgeStartIndex": 20,
                "purgeEndIndex": 21,
                "testStartIndex": 22,
                "testEndIndex": 26,
                "embargoStartIndex": 27,
                "embargoEndIndex": 28,
            },
        )
        self.assertEqual(second["trainStartIndex"], 0)
        self.assertEqual(second["trainEndIndex"], 26)
        self.assertGreater(second["testStartIndex"], first["embargoEndIndex"])

    def test_invalid_parameters_gapped_periods_and_resealed_tampering_fail_closed(self) -> None:
        dataset = build_reference_dataset()
        invalid = (
            {"minimum_train_periods": True},
            {"test_periods": 0},
            {"step_periods": 2, "test_periods": 2, "embargo_periods": 1},
            {"purge_periods": -1},
            {"mode": "selected_method"},
            {"minimum_train_periods": 119, "test_periods": 2},
        )
        defaults = {
            "minimum_train_periods": 11,
            "test_periods": 2,
            "step_periods": 2,
            "purge_periods": 0,
            "embargo_periods": 0,
            "mode": "rolling",
        }
        for override in invalid:
            with self.subTest(override=override):
                with self.assertRaises(ValueError):
                    build_walk_forward_plan(dataset, **(defaults | override))

        gapped = deepcopy(dataset)
        gapped["observations"] = [row for row in gapped["observations"] if row["periodIndex"] != 50]
        gapped.pop("contentFingerprint")
        gapped = seal_synthetic_dataset(gapped)
        with self.assertRaises(ContractViolation):
            build_walk_forward_plan(gapped, **defaults)

        plan = build_walk_forward_plan(dataset, **defaults)
        plan["folds"][0]["trainObservationCount"] += 1
        unsigned = {key: value for key, value in plan.items() if key != "planId"}
        plan["planId"] = f"ASHA_WALK_FORWARD_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact deterministic replay"):
            validate_walk_forward_plan(plan, dataset)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads((PACKAGE_ROOT / "schemas/v1/walk-forward-plan.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], WALK_FORWARD_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
