from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import decode_train_only_covariance, encode_train_only_covariance  # noqa: E402
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.covariance import (  # noqa: E402
    COVARIANCE_SCHEMA_VERSION,
    build_train_only_covariance,
    validate_train_only_covariance,
)
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from normalization_fixtures import hand_dataset, normalization_inputs  # noqa: E402


def _inputs(dataset: dict) -> tuple[dict, dict, dict]:
    matrix, plan = normalization_inputs(dataset)
    standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
    return matrix, plan, standardizer


class TrainOnlyCovarianceTests(unittest.TestCase):
    def test_hand_computed_population_covariance_is_symmetric(self) -> None:
        dataset = hand_dataset()
        matrix, plan, standardizer = _inputs(dataset)
        covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
        self.assertEqual(covariance["rows"], [
            {
                "instrumentId": "SYNTH_ALPHA",
                "values": [
                    {"instrumentId": "SYNTH_ALPHA", "value": "0.250000000000"},
                    {"instrumentId": "SYNTH_BETA", "value": "0.000000000000"},
                ],
            },
            {
                "instrumentId": "SYNTH_BETA",
                "values": [
                    {"instrumentId": "SYNTH_ALPHA", "value": "0.000000000000"},
                    {"instrumentId": "SYNTH_BETA", "value": "0.000000000000"},
                ],
            },
        ])
        self.assertEqual(covariance["zeroVarianceInstrumentIds"], ["SYNTH_BETA"])
        self.assertEqual(covariance["decisionState"], "no_decision")
        self.assertFalse(covariance["financialUseAllowed"])
        self.assertFalse(covariance["executionAllowed"])
        self.assertEqual(
            covariance["covarianceId"],
            "ASHA_TRAIN_ONLY_COVARIANCE_f4882ba2207425b46cd6386d4c442f06d5ec56afac7a8db8ac73d932979424a0",
        )

    def test_future_test_change_cannot_change_fitted_values(self) -> None:
        first_dataset = hand_dataset("250")
        changed_dataset = hand_dataset("400")
        first_matrix, first_plan, first_standardizer = _inputs(first_dataset)
        changed_matrix, changed_plan, changed_standardizer = _inputs(changed_dataset)
        first = build_train_only_covariance(
            first_dataset, first_matrix, first_plan, first_standardizer
        )
        changed = build_train_only_covariance(
            changed_dataset, changed_matrix, changed_plan, changed_standardizer
        )
        self.assertEqual(first["rows"], changed["rows"])
        self.assertNotEqual(first["covarianceId"], changed["covarianceId"])

    def test_replays_exactly_and_resealed_tampering_fails_closed(self) -> None:
        dataset = hand_dataset()
        matrix, plan, standardizer = _inputs(dataset)
        covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
        self.assertEqual(
            validate_train_only_covariance(covariance, dataset, matrix, plan, standardizer),
            covariance,
        )
        covariance["rows"][0]["values"][0]["value"] = "9.000000000000"
        unsigned = {key: value for key, value in covariance.items() if key != "covarianceId"}
        covariance["covarianceId"] = f"ASHA_TRAIN_ONLY_COVARIANCE_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_train_only_covariance(covariance, dataset, matrix, plan, standardizer)

    def test_artifact_round_trip_requires_exact_standardizer(self) -> None:
        dataset = hand_dataset()
        matrix, plan, standardizer = _inputs(dataset)
        covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
        document = encode_train_only_covariance(covariance, dataset, matrix, plan, standardizer)
        self.assertEqual(
            decode_train_only_covariance(document, dataset, matrix, plan, standardizer),
            covariance,
        )
        foreign = deepcopy(standardizer)
        foreign["foldIndex"] = 1
        with self.assertRaises(ContractViolation):
            decode_train_only_covariance(document, dataset, matrix, plan, foreign)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/train-only-covariance.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], COVARIANCE_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
