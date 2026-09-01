from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_normalized_fold,
    encode_normalized_fold,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.normalization import (  # noqa: E402
    NORMALIZED_FOLD_SCHEMA_VERSION,
    apply_train_fitted_standardizer,
    fit_train_only_standardizer,
    validate_normalized_fold,
)
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402
from asha_financial_lab.walk_forward import build_walk_forward_plan  # noqa: E402
from normalization_fixtures import hand_dataset, normalization_inputs  # noqa: E402


class TrainFittedTransformTests(unittest.TestCase):
    def test_hand_computed_test_transform_and_zero_variance_output(self) -> None:
        dataset = hand_dataset("250")
        matrix, plan = normalization_inputs(dataset)
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        normalized = apply_train_fitted_standardizer(dataset, matrix, plan, standardizer)
        alpha, beta = normalized["rows"][0]["values"]
        self.assertEqual(alpha, {"instrumentId": "SYNTH_ALPHA", "value": "-0.500000000000"})
        self.assertEqual(beta, {"instrumentId": "SYNTH_BETA", "value": "0.000000000000"})
        self.assertEqual(normalized["testStartIndex"], 3)
        self.assertEqual(normalized["testEndIndex"], 3)

    def test_reference_transform_is_exact_and_permanently_locked(self) -> None:
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
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        first = apply_train_fitted_standardizer(dataset, matrix, plan, standardizer)
        second = apply_train_fitted_standardizer(
            deepcopy(dataset), deepcopy(matrix), deepcopy(plan), deepcopy(standardizer)
        )
        self.assertEqual(first, second)
        self.assertEqual(validate_normalized_fold(first, dataset, matrix, plan, standardizer), first)
        self.assertFalse(first["financialUseAllowed"])
        self.assertEqual(first["methodologyReference"]["approvalState"], "unapproved")
        self.assertEqual(
            first["normalizedFoldId"],
            "ASHA_NORMALIZED_FOLD_5a1dcdcc1dd6e56ca62229b760f60c0bcc925979d25b341a62e37e4eafa41a46",
        )

    def test_foreign_standardizer_and_resealed_tampering_fail_closed(self) -> None:
        dataset = hand_dataset()
        matrix, plan = normalization_inputs(dataset)
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        other_standardizer = fit_train_only_standardizer(dataset, matrix, plan, 1)
        normalized = apply_train_fitted_standardizer(dataset, matrix, plan, standardizer)
        with self.assertRaises(ContractViolation):
            validate_normalized_fold(normalized, dataset, matrix, plan, other_standardizer)

        normalized["rows"][0]["values"][0]["value"] = "9.000000000000"
        unsigned = {key: value for key, value in normalized.items() if key != "normalizedFoldId"}
        normalized["normalizedFoldId"] = f"ASHA_NORMALIZED_FOLD_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact train-fitted replay"):
            validate_normalized_fold(normalized, dataset, matrix, plan, standardizer)

    def test_artifact_round_trip_requires_exact_standardizer(self) -> None:
        dataset = hand_dataset()
        matrix, plan = normalization_inputs(dataset)
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        normalized = apply_train_fitted_standardizer(dataset, matrix, plan, standardizer)
        document = encode_normalized_fold(normalized, dataset, matrix, plan, standardizer)
        self.assertEqual(
            decode_normalized_fold(document, dataset, matrix, plan, standardizer),
            normalized,
        )

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads((PACKAGE_ROOT / "schemas/v1/normalized-fold.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], NORMALIZED_FOLD_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
