from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_minimum_cvar_control_evaluation,
    encode_minimum_cvar_control_evaluation,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.control_evaluation import (  # noqa: E402
    WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
    evaluate_minimum_cvar_comparison_control_fold,
    validate_minimum_cvar_comparison_control_evaluation,
)
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.minimum_cvar_control import (  # noqa: E402
    MINIMUM_CVAR_CONTROL_ID,
    build_minimum_cvar_comparison_control_weights,
)
from test_minimum_cvar_control import _build, _dataset, _inputs  # noqa: E402


def _evaluation_inputs(dataset: dict) -> tuple[dict, dict, dict]:
    matrix, plan = _inputs(dataset)
    weights = _build(dataset)
    return matrix, plan, weights


class MinimumCvarControlEvaluationTests(unittest.TestCase):
    def test_frozen_minimum_cvar_weights_use_only_associated_test_fold(self) -> None:
        dataset = _dataset()
        inputs = _evaluation_inputs(dataset)
        evaluation = evaluate_minimum_cvar_comparison_control_fold(dataset, *inputs)
        self.assertEqual(evaluation["benchmarkId"], MINIMUM_CVAR_CONTROL_ID)
        self.assertEqual(evaluation["foldIndex"], 0)
        self.assertEqual(evaluation["periodResults"], [{
            "periodIndex": 3,
            "weightedReturn": "0.076315789474",
            "wealthIndex": "1.076315789474",
        }])
        self.assertEqual(evaluation["metrics"], {
            "periodCount": 1,
            "cumulativeChangePercent": "7.631578947350",
            "maximumDrawdownPercent": "0.000000000000",
        })
        self.assertEqual(
            evaluation["evaluationId"],
            "ASHA_WEIGHTED_CONTROL_EVAL_4593908089b0112aa6abe3df3247aaeb274ea54599662e9b0bfe4ed41aabf002",
        )
        self.assertEqual(evaluation["decisionState"], "no_decision")
        self.assertFalse(evaluation["financialUseAllowed"])
        self.assertFalse(evaluation["executionAllowed"])

    def test_future_test_change_keeps_weights_but_changes_evaluation(self) -> None:
        first_dataset = _dataset("118.80000000")
        changed_dataset = _dataset("140.00000000")
        first_inputs = _evaluation_inputs(first_dataset)
        changed_inputs = _evaluation_inputs(changed_dataset)
        self.assertEqual(first_inputs[-1]["weights"], changed_inputs[-1]["weights"])
        first = evaluate_minimum_cvar_comparison_control_fold(
            first_dataset, *first_inputs
        )
        changed = evaluate_minimum_cvar_comparison_control_fold(
            changed_dataset, *changed_inputs
        )
        self.assertNotEqual(first["periodResults"], changed["periodResults"])
        self.assertNotEqual(first["evaluationId"], changed["evaluationId"])

    def test_incomplete_test_interval_and_resealed_false_metric_fail_closed(self) -> None:
        dataset = _dataset()
        matrix, plan, weights = _evaluation_inputs(dataset)
        incomplete = build_point_in_time_return_matrix(dataset, 1, 2)
        incomplete_weights = build_minimum_cvar_comparison_control_weights(
            dataset,
            incomplete,
            plan,
            fold_index=0,
            tail_count=1,
            weight_step="0.500000000000",
        )
        with self.assertRaisesRegex(ContractViolation, "does not cover"):
            evaluate_minimum_cvar_comparison_control_fold(
                dataset, incomplete, plan, incomplete_weights
            )

        evaluation = evaluate_minimum_cvar_comparison_control_fold(
            dataset, matrix, plan, weights
        )
        tampered = deepcopy(evaluation)
        tampered["metrics"]["cumulativeChangePercent"] = "99.000000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "evaluationId"}
        tampered["evaluationId"] = f"ASHA_WEIGHTED_CONTROL_EVAL_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact test-fold replay"):
            validate_minimum_cvar_comparison_control_evaluation(
                tampered, dataset, matrix, plan, weights
            )

    def test_artifact_round_trip_requires_exact_weight_provenance(self) -> None:
        dataset = _dataset()
        inputs = _evaluation_inputs(dataset)
        evaluation = evaluate_minimum_cvar_comparison_control_fold(dataset, *inputs)
        document = encode_minimum_cvar_control_evaluation(
            evaluation, dataset, *inputs
        )
        self.assertEqual(
            decode_minimum_cvar_control_evaluation(document, dataset, *inputs),
            evaluation,
        )

    def test_shared_evaluation_schema_allows_only_reviewed_controls(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/weighted-control-evaluation.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
        )
        self.assertEqual(schema["properties"]["benchmarkId"]["enum"], [
            "ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1",
            "ASHA_BENCHMARK_HRP_CONTROL_V1",
            MINIMUM_CVAR_CONTROL_ID,
        ])
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
