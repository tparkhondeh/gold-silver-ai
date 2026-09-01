from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    MAX_CONTRACT_BYTES,
    decode_evaluation_result,
    decode_synthetic_dataset,
    encode_evaluation_result,
    encode_synthetic_dataset,
)
from asha_financial_lab.baseline import evaluate_no_decision  # noqa: E402
from asha_financial_lab.contracts import ContractViolation, seal_evaluation_result  # noqa: E402
from asha_financial_lab.replay import replay_no_decision_artifacts  # noqa: E402
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402


class CanonicalArtifactTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dataset = build_reference_dataset()
        self.result = evaluate_no_decision(self.dataset, 110)

    def test_canonical_artifacts_round_trip_and_replay_exactly(self) -> None:
        dataset_document = encode_synthetic_dataset(self.dataset)
        result_document = encode_evaluation_result(self.result)
        self.assertTrue(dataset_document.endswith(b"\n"))
        self.assertEqual(decode_synthetic_dataset(dataset_document), self.dataset)
        self.assertEqual(decode_evaluation_result(result_document), self.result)
        self.assertEqual(
            replay_no_decision_artifacts(dataset_document, result_document),
            self.result,
        )

    def test_noncanonical_and_duplicate_json_are_rejected(self) -> None:
        noncanonical = encode_synthetic_dataset(self.dataset).replace(b'"datasetId"', b' "datasetId"', 1)
        with self.assertRaises(ContractViolation):
            decode_synthetic_dataset(noncanonical)
        with self.assertRaises(ContractViolation):
            decode_synthetic_dataset(b'{"schemaVersion":"first","schemaVersion":"second"}\n')

    def test_artifact_type_size_and_utf8_fail_closed(self) -> None:
        for invalid in (bytearray(b"{}\n"), b"", b"\xff", b"x" * (MAX_CONTRACT_BYTES + 1)):
            with self.subTest(value_type=type(invalid), length=len(invalid)):
                with self.assertRaises(ContractViolation):
                    decode_synthetic_dataset(invalid)

    def test_resealed_but_false_result_fails_exact_replay(self) -> None:
        false_unsigned = deepcopy(self.result)
        false_unsigned.pop("resultId")
        false_unsigned["benchmarkResults"][0]["metrics"]["available_observation_count"] = "444"
        false_result = seal_evaluation_result(false_unsigned)
        with self.assertRaises(ContractViolation):
            replay_no_decision_artifacts(
                encode_synthetic_dataset(self.dataset),
                encode_evaluation_result(false_result),
            )

    def test_result_from_another_model_cannot_enter_baseline_replay(self) -> None:
        other_unsigned = deepcopy(self.result)
        other_unsigned.pop("resultId")
        other_unsigned["modelReference"]["entityId"] = "ASHA_OTHER_SYNTHETIC_MODEL_V1"
        other_result = seal_evaluation_result(other_unsigned)
        with self.assertRaises(ContractViolation):
            replay_no_decision_artifacts(
                encode_synthetic_dataset(self.dataset),
                encode_evaluation_result(other_result),
            )


if __name__ == "__main__":
    unittest.main()
