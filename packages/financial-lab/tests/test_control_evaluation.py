from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_weighted_control_evaluation,
    encode_weighted_control_evaluation,
)
from asha_financial_lab.comparison_weights import build_inverse_volatility_control_weights  # noqa: E402
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.control_evaluation import (  # noqa: E402
    WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
    evaluate_inverse_volatility_control_fold,
    validate_inverse_volatility_control_evaluation,
)
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402
from asha_financial_lab.walk_forward import build_walk_forward_plan  # noqa: E402
from normalization_fixtures import hand_dataset, normalization_inputs  # noqa: E402


def _inputs(dataset: dict) -> tuple[dict, dict, dict, dict]:
    matrix, plan = normalization_inputs(dataset)
    standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
    weights = build_inverse_volatility_control_weights(dataset, matrix, plan, standardizer)
    return matrix, plan, standardizer, weights


class WeightedControlEvaluationTests(unittest.TestCase):
    def test_hand_computed_frozen_weight_test_return(self) -> None:
        dataset = hand_dataset("250", beta_level="150")
        matrix, plan, standardizer, weights = _inputs(dataset)
        evaluation = evaluate_inverse_volatility_control_fold(dataset, matrix, plan, standardizer, weights)
        self.assertEqual(evaluation["periodResults"], [{
            "periodIndex": 3,
            "weightedReturn": "0.083333333333",
            "wealthIndex": "1.083333333333",
        }])
        self.assertEqual(evaluation["metrics"], {
            "periodCount": 1,
            "cumulativeChangePercent": "8.333333333325",
            "maximumDrawdownPercent": "0.000000000000",
        })

    def test_reference_evaluation_replays_exactly_and_remains_no_decision(self) -> None:
        dataset = build_reference_dataset()
        matrix = build_point_in_time_return_matrix(dataset, 2, 110)
        plan = build_walk_forward_plan(
            dataset, minimum_train_periods=11, test_periods=2, step_periods=2,
            purge_periods=0, embargo_periods=0, mode="rolling",
        )
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        weights = build_inverse_volatility_control_weights(dataset, matrix, plan, standardizer)
        first = evaluate_inverse_volatility_control_fold(dataset, matrix, plan, standardizer, weights)
        second = evaluate_inverse_volatility_control_fold(
            deepcopy(dataset), deepcopy(matrix), deepcopy(plan), deepcopy(standardizer), deepcopy(weights)
        )
        self.assertEqual(first, second)
        self.assertEqual(
            first["evaluationId"],
            "ASHA_WEIGHTED_CONTROL_EVAL_018f4d0fca12ce97d98fa90c826de27994b290256f475758002b366312019d2f",
        )
        self.assertEqual(
            validate_inverse_volatility_control_evaluation(
                first, dataset, matrix, plan, standardizer, weights
            ),
            first,
        )
        self.assertEqual(first["decisionState"], "no_decision")
        self.assertFalse(first["financialUseAllowed"])
        self.assertFalse(first["executionAllowed"])

    def test_incomplete_matrix_and_resealed_tampering_fail_closed(self) -> None:
        dataset = hand_dataset("250", beta_level="150")
        matrix, plan, standardizer, weights = _inputs(dataset)
        incomplete = build_point_in_time_return_matrix(dataset, 1, 2)
        with self.assertRaises(ContractViolation):
            evaluate_inverse_volatility_control_fold(dataset, incomplete, plan, standardizer, weights)

        evaluation = evaluate_inverse_volatility_control_fold(dataset, matrix, plan, standardizer, weights)
        evaluation["metrics"]["cumulativeChangePercent"] = "99.000000000000"
        unsigned = {key: value for key, value in evaluation.items() if key != "evaluationId"}
        evaluation["evaluationId"] = f"ASHA_WEIGHTED_CONTROL_EVAL_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact test-fold replay"):
            validate_inverse_volatility_control_evaluation(
                evaluation, dataset, matrix, plan, standardizer, weights
            )

    def test_artifact_round_trip_requires_exact_weight_set(self) -> None:
        dataset = hand_dataset("250", beta_level="150")
        matrix, plan, standardizer, weights = _inputs(dataset)
        evaluation = evaluate_inverse_volatility_control_fold(dataset, matrix, plan, standardizer, weights)
        document = encode_weighted_control_evaluation(
            evaluation, dataset, matrix, plan, standardizer, weights
        )
        self.assertEqual(
            decode_weighted_control_evaluation(
                document, dataset, matrix, plan, standardizer, weights
            ),
            evaluation,
        )

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads((PACKAGE_ROOT / "schemas/v1/weighted-control-evaluation.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
