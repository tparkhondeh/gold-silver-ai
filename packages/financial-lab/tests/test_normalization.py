from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.contracts import (  # noqa: E402
    ContractViolation,
    DATASET_SCHEMA_VERSION,
    fingerprint,
    seal_synthetic_dataset,
)
from asha_financial_lab.artifacts import (  # noqa: E402
    decode_train_only_standardizer,
    encode_train_only_standardizer,
)
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.normalization import (  # noqa: E402
    STANDARDIZER_SCHEMA_VERSION,
    fit_train_only_standardizer,
    validate_train_only_standardizer,
)
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402
from asha_financial_lab.walk_forward import build_walk_forward_plan  # noqa: E402


def _hand_dataset(test_tail: str = "250") -> dict:
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


class TrainOnlyNormalizationTests(unittest.TestCase):
    def test_hand_computed_mean_deviation_and_zero_variance_policy(self) -> None:
        dataset = _hand_dataset()
        matrix, plan = _inputs(dataset)
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        alpha, beta = standardizer["instrumentStatistics"]
        self.assertEqual(alpha, {
            "instrumentId": "SYNTH_ALPHA",
            "observationCount": 2,
            "mean": "0.500000000000",
            "standardDeviation": "0.500000000000",
        })
        self.assertEqual(beta["mean"], "0.000000000000")
        self.assertEqual(beta["standardDeviation"], "0.000000000000")
        self.assertEqual(standardizer["trainingFeatureStartIndex"], 1)
        self.assertEqual(standardizer["trainingFeatureEndIndex"], 2)

    def test_changing_test_tail_cannot_change_train_only_statistics(self) -> None:
        first_dataset = _hand_dataset("250")
        second_dataset = _hand_dataset("999")
        first_matrix, first_plan = _inputs(first_dataset)
        second_matrix, second_plan = _inputs(second_dataset)
        first = fit_train_only_standardizer(first_dataset, first_matrix, first_plan, 0)
        second = fit_train_only_standardizer(second_dataset, second_matrix, second_plan, 0)
        self.assertEqual(first["instrumentStatistics"], second["instrumentStatistics"])

    def test_reference_fit_replays_exactly_and_remains_locked(self) -> None:
        dataset = build_reference_dataset()
        matrix = build_point_in_time_return_matrix(dataset, 2, 110)
        plan = build_walk_forward_plan(
            dataset,
            minimum_train_periods=11,
            test_periods=2,
            step_periods=2,
            purge_periods=0,
            embargo_periods=0,
            mode="rolling",
        )
        first = fit_train_only_standardizer(dataset, matrix, plan, 0)
        second = fit_train_only_standardizer(deepcopy(dataset), deepcopy(matrix), deepcopy(plan), 0)
        self.assertEqual(first, second)
        self.assertEqual(validate_train_only_standardizer(first, dataset, matrix, plan), first)
        self.assertFalse(first["financialUseAllowed"])
        self.assertEqual(first["methodologyReference"]["approvalState"], "unapproved")
        self.assertEqual(
            first["standardizerId"],
            "ASHA_STANDARDIZER_2b9926e6f259684c0df9d292d10d2fc28279e9a197772c242eac3c93c7dc8653",
        )

    def test_standardizer_artifact_round_trips_with_exact_provenance(self) -> None:
        dataset = _hand_dataset()
        matrix, plan = _inputs(dataset)
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        document = encode_train_only_standardizer(standardizer, dataset, matrix, plan)
        self.assertEqual(
            decode_train_only_standardizer(document, dataset, matrix, plan),
            standardizer,
        )

        other_plan = build_walk_forward_plan(
            dataset,
            minimum_train_periods=4,
            test_periods=1,
            step_periods=1,
            purge_periods=0,
            embargo_periods=0,
            mode="rolling",
        )
        with self.assertRaises(ContractViolation):
            decode_train_only_standardizer(document, dataset, matrix, other_plan)

    def test_invalid_fold_incomplete_matrix_and_resealed_tampering_fail_closed(self) -> None:
        dataset = _hand_dataset()
        matrix, plan = _inputs(dataset)
        for fold_index in (-1, len(plan["folds"]), True, "0"):
            with self.subTest(fold_index=fold_index):
                with self.assertRaises(ValueError):
                    fit_train_only_standardizer(dataset, matrix, plan, fold_index)

        incomplete = build_point_in_time_return_matrix(dataset, 2, 5)
        with self.assertRaises(ContractViolation):
            fit_train_only_standardizer(dataset, incomplete, plan, 0)

        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        standardizer["instrumentStatistics"][0]["mean"] = "9.000000000000"
        unsigned = {key: value for key, value in standardizer.items() if key != "standardizerId"}
        standardizer["standardizerId"] = f"ASHA_STANDARDIZER_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact train-only replay"):
            validate_train_only_standardizer(standardizer, dataset, matrix, plan)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads((PACKAGE_ROOT / "schemas/v1/standardizer.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], STANDARDIZER_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
