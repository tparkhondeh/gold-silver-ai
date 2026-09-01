from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_hrp_control_evaluation,
    encode_hrp_control_evaluation,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.control_evaluation import (  # noqa: E402
    WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
    evaluate_hrp_comparison_control_fold,
    validate_hrp_comparison_control_evaluation,
)
from asha_financial_lab.hrp_control import (  # noqa: E402
    HRP_CONTROL_ID,
    build_hrp_comparison_control_weights,
)
from test_hierarchical_clustering import _dataset  # noqa: E402
from test_hrp_control import _all_inputs  # noqa: E402


def _evaluation_inputs(dataset: dict) -> tuple:
    inputs = _all_inputs(dataset)
    weights = build_hrp_comparison_control_weights(dataset, *inputs)
    return (*inputs, weights)


class HrpControlEvaluationTests(unittest.TestCase):
    def test_frozen_hrp_weights_are_evaluated_only_on_associated_test_fold(self) -> None:
        dataset = _dataset()
        inputs = _evaluation_inputs(dataset)
        evaluation = evaluate_hrp_comparison_control_fold(dataset, *inputs)
        self.assertEqual(evaluation["benchmarkId"], HRP_CONTROL_ID)
        self.assertEqual(evaluation["foldIndex"], 0)
        self.assertEqual(evaluation["testStartIndex"], evaluation["testEndIndex"])
        self.assertEqual(evaluation["periodResults"], [{
            "periodIndex": 3,
            "weightedReturn": "0.125000000000",
            "wealthIndex": "1.125000000000",
        }])
        self.assertEqual(evaluation["metrics"], {
            "periodCount": 1,
            "cumulativeChangePercent": "12.500000000010",
            "maximumDrawdownPercent": "0.000000000000",
        })
        self.assertEqual(
            evaluation["evaluationId"],
            "ASHA_WEIGHTED_CONTROL_EVAL_4f6fe7e99b37ac342eec0f07451cea32ee30c15b6fb067badcd2b4e8adc31f0f",
        )
        self.assertEqual(evaluation["decisionState"], "no_decision")
        self.assertFalse(evaluation["financialUseAllowed"])
        self.assertFalse(evaluation["executionAllowed"])

    def test_future_test_change_keeps_weights_but_changes_test_evaluation(self) -> None:
        first_dataset = _dataset("250")
        changed_dataset = _dataset("400")
        first_inputs = _evaluation_inputs(first_dataset)
        changed_inputs = _evaluation_inputs(changed_dataset)
        self.assertEqual(first_inputs[-1]["weights"], changed_inputs[-1]["weights"])
        first = evaluate_hrp_comparison_control_fold(first_dataset, *first_inputs)
        changed = evaluate_hrp_comparison_control_fold(changed_dataset, *changed_inputs)
        self.assertNotEqual(first["periodResults"], changed["periodResults"])
        self.assertNotEqual(first["evaluationId"], changed["evaluationId"])

    def test_evaluation_replays_exactly_and_resealed_tampering_fails_closed(self) -> None:
        dataset = _dataset()
        inputs = _evaluation_inputs(dataset)
        evaluation = evaluate_hrp_comparison_control_fold(dataset, *inputs)
        self.assertEqual(
            validate_hrp_comparison_control_evaluation(evaluation, dataset, *inputs),
            evaluation,
        )
        tampered = deepcopy(evaluation)
        tampered["metrics"]["cumulativeChangePercent"] = "99.000000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "evaluationId"}
        tampered["evaluationId"] = f"ASHA_WEIGHTED_CONTROL_EVAL_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact test-fold replay"):
            validate_hrp_comparison_control_evaluation(tampered, dataset, *inputs)

    def test_artifact_round_trip_requires_exact_hrp_provenance_chain(self) -> None:
        dataset = _dataset()
        inputs = _evaluation_inputs(dataset)
        evaluation = evaluate_hrp_comparison_control_fold(dataset, *inputs)
        document = encode_hrp_control_evaluation(evaluation, dataset, *inputs)
        self.assertEqual(
            decode_hrp_control_evaluation(document, dataset, *inputs),
            evaluation,
        )

    def test_shared_schema_explicitly_allows_both_reviewed_control_ids(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/weighted-control-evaluation.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
        )
        self.assertEqual(
            schema["properties"]["benchmarkId"]["enum"],
            [
                "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1",
                HRP_CONTROL_ID,
                "ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1",
            ],
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
