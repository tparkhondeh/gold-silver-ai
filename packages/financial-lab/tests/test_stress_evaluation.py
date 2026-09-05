from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_inverse_volatility_stress_evaluation,
    encode_inverse_volatility_stress_evaluation,
)
from asha_financial_lab.comparison_weights import (  # noqa: E402
    build_inverse_volatility_control_weights,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from asha_financial_lab.stress_evaluation import (  # noqa: E402
    STRESS_EVALUATION_SCHEMA_VERSION,
    evaluate_inverse_volatility_stress_fold,
    validate_inverse_volatility_stress_evaluation,
)
from asha_financial_lab.synthetic_stress import (  # noqa: E402
    STRESS_SCENARIO_SCHEMA_VERSION,
    build_stressed_return_matrix,
    seal_synthetic_stress_scenario,
)
from normalization_fixtures import hand_dataset, normalization_inputs  # noqa: E402


def _scenario(period: int = 3) -> dict:
    return seal_synthetic_stress_scenario({
        "schemaVersion": STRESS_SCENARIO_SCHEMA_VERSION,
        "scenarioId": "ASHA_SYNTHETIC_STRESS_SCENARIO_WEIGHTED_HAND_V1",
        "scenarioVersion": 1,
        "scenarioKind": "explicit_additive_return_shocks",
        "purpose": "crisis_mechanics_test",
        "financialUseAllowed": False,
        "coveragePolicy": "unspecified_entries_are_explicit_zero",
        "shocks": [
            {
                "periodIndex": period,
                "instrumentId": "SYNTH_ALPHA",
                "additiveReturnShock": "-0.300000000000",
            },
            {
                "periodIndex": period,
                "instrumentId": "SYNTH_BETA",
                "additiveReturnShock": "-0.150000000000",
            },
        ],
    })


def _inputs(period: int = 3) -> tuple[dict, ...]:
    dataset = hand_dataset("250", beta_level="150")
    matrix, plan = normalization_inputs(dataset)
    standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
    weights = build_inverse_volatility_control_weights(
        dataset, matrix, plan, standardizer
    )
    scenario = _scenario(period)
    stressed_matrix = build_stressed_return_matrix(dataset, matrix, scenario)
    return dataset, matrix, stressed_matrix, scenario, plan, standardizer, weights


def _evaluate(inputs: tuple[dict, ...]) -> dict:
    return evaluate_inverse_volatility_stress_fold(*inputs)


class StressEvaluationTests(unittest.TestCase):
    def test_hand_computed_frozen_weight_side_by_side_path(self) -> None:
        inputs = _inputs()
        evaluation = _evaluate(inputs)
        self.assertEqual(evaluation["periodResults"], [{
            "periodIndex": 3,
            "baseWeightedReturn": "0.083333333333",
            "stressedWeightedReturn": "-0.116666666667",
            "baseWealthIndex": "1.083333333333",
            "stressedWealthIndex": "0.883333333333",
        }])
        self.assertEqual(evaluation["metrics"], {
            "periodCount": 1,
            "stressCellCount": 2,
            "baseCumulativeChangePercent": "8.333333333325",
            "stressedCumulativeChangePercent": "-11.666666666670",
            "baseMaximumDrawdownPercent": "0.000000000000",
            "stressedMaximumDrawdownPercent": "11.666666666670",
        })

    def test_weights_are_frozen_and_output_cannot_rank_or_decide(self) -> None:
        inputs = _inputs()
        evaluation = _evaluate(inputs)
        weights = inputs[-1]
        self.assertEqual(
            evaluation["stressEvaluationId"],
            "ASHA_STRESS_EVALUATION_29d3a9abae6a7356fef0731f292af8610cccbf2891c237661750793799d3a8ea",
        )
        self.assertEqual(evaluation["weightSetReference"]["weightSetId"], weights["weightSetId"])
        self.assertEqual(evaluation["comparisonPolicy"], "side_by_side_no_ranking")
        self.assertNotIn("rank", evaluation)
        self.assertNotIn("winner", evaluation)
        self.assertEqual(evaluation["decisionState"], "no_decision")
        self.assertFalse(evaluation["financialUseAllowed"])
        self.assertFalse(evaluation["executionAllowed"])

    def test_every_shock_must_be_inside_the_associated_test_fold(self) -> None:
        inputs = _inputs(4)
        with self.assertRaisesRegex(ContractViolation, "associated test fold"):
            _evaluate(inputs)

    def test_foreign_or_resealed_weight_set_fails_before_stress_calculation(self) -> None:
        inputs = list(_inputs())
        weights = deepcopy(inputs[-1])
        weights["weights"][0]["weight"] = "0.900000000000"
        unsigned = {key: value for key, value in weights.items() if key != "weightSetId"}
        weights["weightSetId"] = f"ASHA_COMPARISON_WEIGHTS_{fingerprint(unsigned)}"
        inputs[-1] = weights
        with self.assertRaisesRegex(ContractViolation, "exact train-only replay"):
            _evaluate(tuple(inputs))

    def test_canonical_round_trip_and_resealed_false_metric_fail_closed(self) -> None:
        inputs = _inputs()
        evaluation = _evaluate(inputs)
        document = encode_inverse_volatility_stress_evaluation(evaluation, *inputs)
        self.assertEqual(
            decode_inverse_volatility_stress_evaluation(document, *inputs),
            evaluation,
        )
        evaluation["metrics"]["stressedCumulativeChangePercent"] = "99.000000000000"
        unsigned = {
            key: value for key, value in evaluation.items() if key != "stressEvaluationId"
        }
        evaluation["stressEvaluationId"] = f"ASHA_STRESS_EVALUATION_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact side-by-side replay"):
            validate_inverse_volatility_stress_evaluation(evaluation, *inputs)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/stress-evaluation.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            STRESS_EVALUATION_SCHEMA_VERSION,
        )
        self.assertEqual(
            schema["properties"]["comparisonPolicy"]["const"],
            "side_by_side_no_ranking",
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
