from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import decode_train_only_correlation, encode_train_only_correlation  # noqa: E402
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.correlation import (  # noqa: E402
    CORRELATION_SCHEMA_VERSION,
    build_train_only_correlation,
    validate_train_only_correlation,
)
from asha_financial_lab.covariance import build_train_only_covariance  # noqa: E402
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from normalization_fixtures import hand_dataset, normalization_inputs  # noqa: E402


def _inputs(dataset: dict) -> tuple[dict, dict, dict, dict]:
    matrix, plan = normalization_inputs(dataset)
    standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
    covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
    return matrix, plan, standardizer, covariance


class TrainOnlyCorrelationTests(unittest.TestCase):
    def test_hand_computed_perfect_negative_correlation(self) -> None:
        dataset = hand_dataset(beta_level="50")
        matrix, plan, standardizer, covariance = _inputs(dataset)
        correlation = build_train_only_correlation(
            dataset, matrix, plan, standardizer, covariance
        )
        self.assertEqual(correlation["activeInstrumentIds"], ["SYNTH_ALPHA", "SYNTH_BETA"])
        self.assertEqual(correlation["rows"], [
            {
                "instrumentId": "SYNTH_ALPHA",
                "values": [
                    {"instrumentId": "SYNTH_ALPHA", "value": "1.000000000000"},
                    {"instrumentId": "SYNTH_BETA", "value": "-1.000000000000"},
                ],
            },
            {
                "instrumentId": "SYNTH_BETA",
                "values": [
                    {"instrumentId": "SYNTH_ALPHA", "value": "-1.000000000000"},
                    {"instrumentId": "SYNTH_BETA", "value": "1.000000000000"},
                ],
            },
        ])
        self.assertEqual(correlation["decisionState"], "no_decision")
        self.assertFalse(correlation["financialUseAllowed"])
        self.assertFalse(correlation["executionAllowed"])
        self.assertEqual(
            correlation["correlationId"],
            "ASHA_TRAIN_ONLY_CORRELATION_14a0e11db68635e59adcc9939d32cf0f7f7cdfc8e3d43b0d2253b3eb575047e8",
        )

    def test_zero_variance_is_disclosed_and_insufficient_active_set_fails_closed(self) -> None:
        dataset = hand_dataset()
        matrix, plan, standardizer, covariance = _inputs(dataset)
        self.assertEqual(covariance["zeroVarianceInstrumentIds"], ["SYNTH_BETA"])
        with self.assertRaisesRegex(ContractViolation, "at least two"):
            build_train_only_correlation(dataset, matrix, plan, standardizer, covariance)

    def test_future_test_change_cannot_change_fitted_correlations(self) -> None:
        first_dataset = hand_dataset("250", beta_level="50")
        changed_dataset = hand_dataset("400", beta_level="50")
        first_inputs = _inputs(first_dataset)
        changed_inputs = _inputs(changed_dataset)
        first = build_train_only_correlation(first_dataset, *first_inputs)
        changed = build_train_only_correlation(changed_dataset, *changed_inputs)
        self.assertEqual(first["rows"], changed["rows"])
        self.assertNotEqual(first["correlationId"], changed["correlationId"])

    def test_artifact_replay_and_resealed_tampering_fail_closed(self) -> None:
        dataset = hand_dataset(beta_level="50")
        matrix, plan, standardizer, covariance = _inputs(dataset)
        correlation = build_train_only_correlation(
            dataset, matrix, plan, standardizer, covariance
        )
        document = encode_train_only_correlation(
            correlation, dataset, matrix, plan, standardizer, covariance
        )
        self.assertEqual(
            decode_train_only_correlation(
                document, dataset, matrix, plan, standardizer, covariance
            ),
            correlation,
        )
        tampered = deepcopy(correlation)
        tampered["rows"][0]["values"][1]["value"] = "0.000000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "correlationId"}
        tampered["correlationId"] = f"ASHA_TRAIN_ONLY_CORRELATION_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_train_only_correlation(
                tampered, dataset, matrix, plan, standardizer, covariance
            )

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/train-only-correlation-v2.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], CORRELATION_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
