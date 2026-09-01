from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_train_only_correlation_distance,
    encode_train_only_correlation_distance,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.correlation import build_train_only_correlation  # noqa: E402
from asha_financial_lab.correlation_distance import (  # noqa: E402
    CORRELATION_DISTANCE_SCHEMA_VERSION,
    build_train_only_correlation_distance,
    validate_train_only_correlation_distance,
)
from asha_financial_lab.covariance import build_train_only_covariance  # noqa: E402
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from normalization_fixtures import hand_dataset, normalization_inputs  # noqa: E402


def _inputs(dataset: dict) -> tuple[dict, dict, dict, dict, dict]:
    matrix, plan = normalization_inputs(dataset)
    standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
    covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
    correlation = build_train_only_correlation(dataset, matrix, plan, standardizer, covariance)
    return matrix, plan, standardizer, covariance, correlation


class CorrelationDistanceTests(unittest.TestCase):
    def test_hand_computed_opposites_have_unit_distance(self) -> None:
        dataset = hand_dataset(beta_level="50")
        inputs = _inputs(dataset)
        distance = build_train_only_correlation_distance(dataset, *inputs)
        self.assertEqual(distance["rows"], [
            {
                "instrumentId": "SYNTH_ALPHA",
                "values": [
                    {"instrumentId": "SYNTH_ALPHA", "value": "0.000000000000"},
                    {"instrumentId": "SYNTH_BETA", "value": "1.000000000000"},
                ],
            },
            {
                "instrumentId": "SYNTH_BETA",
                "values": [
                    {"instrumentId": "SYNTH_ALPHA", "value": "1.000000000000"},
                    {"instrumentId": "SYNTH_BETA", "value": "0.000000000000"},
                ],
            },
        ])
        self.assertEqual(distance["decisionState"], "no_decision")
        self.assertFalse(distance["financialUseAllowed"])
        self.assertFalse(distance["executionAllowed"])
        self.assertEqual(
            distance["distanceId"],
            "ASHA_CORRELATION_DISTANCE_9cc1d8dbacabebc1031540ca94e941aff925046c2fdbb92b45b10cda3a915223",
        )

    def test_identical_paths_have_zero_distance(self) -> None:
        dataset = hand_dataset(beta_level="200")
        inputs = _inputs(dataset)
        distance = build_train_only_correlation_distance(dataset, *inputs)
        self.assertEqual(distance["rows"][0]["values"][1]["value"], "0.000000000000")
        self.assertEqual(distance["rows"][1]["values"][0]["value"], "0.000000000000")

    def test_future_test_change_cannot_change_fitted_distance(self) -> None:
        first_dataset = hand_dataset("250", beta_level="50")
        changed_dataset = hand_dataset("400", beta_level="50")
        first = build_train_only_correlation_distance(first_dataset, *_inputs(first_dataset))
        changed = build_train_only_correlation_distance(changed_dataset, *_inputs(changed_dataset))
        self.assertEqual(first["rows"], changed["rows"])
        self.assertNotEqual(first["distanceId"], changed["distanceId"])

    def test_artifact_replay_and_resealed_tampering_fail_closed(self) -> None:
        dataset = hand_dataset(beta_level="50")
        inputs = _inputs(dataset)
        distance = build_train_only_correlation_distance(dataset, *inputs)
        document = encode_train_only_correlation_distance(distance, dataset, *inputs)
        self.assertEqual(
            decode_train_only_correlation_distance(document, dataset, *inputs),
            distance,
        )
        tampered = deepcopy(distance)
        tampered["rows"][0]["values"][1]["value"] = "0.500000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "distanceId"}
        tampered["distanceId"] = f"ASHA_CORRELATION_DISTANCE_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_train_only_correlation_distance(tampered, dataset, *inputs)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/correlation-distance.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            CORRELATION_DISTANCE_SCHEMA_VERSION,
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
