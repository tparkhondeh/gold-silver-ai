from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_hrp_stress_evaluation,
    decode_minimum_cvar_stress_evaluation,
    encode_hrp_stress_evaluation,
    encode_minimum_cvar_stress_evaluation,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.hrp_control import (  # noqa: E402
    HRP_CONTROL_ID,
    build_hrp_comparison_control_weights,
)
from asha_financial_lab.minimum_cvar_control import MINIMUM_CVAR_CONTROL_ID  # noqa: E402
from asha_financial_lab.stress_evaluation import (  # noqa: E402
    evaluate_hrp_stress_fold,
    evaluate_minimum_cvar_stress_fold,
    validate_hrp_stress_evaluation,
    validate_minimum_cvar_stress_evaluation,
)
from asha_financial_lab.synthetic_stress import (  # noqa: E402
    STRESS_SCENARIO_SCHEMA_VERSION,
    build_stressed_return_matrix,
    seal_synthetic_stress_scenario,
)
from test_hrp_control import _all_inputs as hrp_base_inputs  # noqa: E402
from test_hierarchical_clustering import _dataset as hrp_dataset  # noqa: E402
from test_minimum_cvar_control import (  # noqa: E402
    _build as cvar_weights,
    _dataset as cvar_dataset,
    _inputs as cvar_base_inputs,
)


def _scenario(instrument_ids: list[str], label: str) -> dict:
    return seal_synthetic_stress_scenario({
        "schemaVersion": STRESS_SCENARIO_SCHEMA_VERSION,
        "scenarioId": f"ASHA_SYNTHETIC_STRESS_SCENARIO_{label}_V1",
        "scenarioVersion": 1,
        "scenarioKind": "explicit_additive_return_shocks",
        "purpose": "crisis_mechanics_test",
        "financialUseAllowed": False,
        "coveragePolicy": "unspecified_entries_are_explicit_zero",
        "shocks": [
            {
                "periodIndex": 3,
                "instrumentId": instrument_id,
                "additiveReturnShock": f"-0.{index + 1}00000000000",
            }
            for index, instrument_id in enumerate(sorted(instrument_ids))
        ],
    })


def _hrp_inputs() -> tuple[dict, ...]:
    dataset = hrp_dataset()
    base_inputs = hrp_base_inputs(dataset)
    matrix, plan = base_inputs[:2]
    weights = build_hrp_comparison_control_weights(dataset, *base_inputs)
    scenario = _scenario(matrix["instrumentIds"], "HRP_HAND")
    stressed = build_stressed_return_matrix(dataset, matrix, scenario)
    return dataset, matrix, stressed, scenario, plan, *base_inputs[2:], weights


def _cvar_inputs() -> tuple[dict, ...]:
    dataset = cvar_dataset()
    matrix, plan = cvar_base_inputs(dataset)
    weights = cvar_weights(dataset)
    scenario = _scenario(matrix["instrumentIds"], "MIN_CVAR_HAND")
    stressed = build_stressed_return_matrix(dataset, matrix, scenario)
    return dataset, matrix, stressed, scenario, plan, weights


class HrpStressEvaluationTests(unittest.TestCase):
    def test_frozen_weights_produce_a_locked_comparison_only_result(self) -> None:
        inputs = _hrp_inputs()
        evaluation = evaluate_hrp_stress_fold(*inputs)
        self.assertEqual(evaluation["benchmarkId"], HRP_CONTROL_ID)
        self.assertEqual(
            evaluation["stressEvaluationId"],
            "ASHA_STRESS_EVALUATION_706c8aba42474bc98dbec3de616b43851a35729978f8e57d5194eb8c701bcf3a",
        )
        self.assertEqual(evaluation["weightSetReference"]["weightSetId"], inputs[-1]["weightSetId"])
        self.assertEqual(evaluation["comparisonPolicy"], "side_by_side_no_ranking")
        self.assertEqual(evaluation["decisionState"], "no_decision")
        self.assertFalse(evaluation["financialUseAllowed"])
        self.assertFalse(evaluation["executionAllowed"])
        self.assertNotIn("winner", evaluation)

    def test_canonical_artifact_round_trip_is_exact(self) -> None:
        inputs = _hrp_inputs()
        evaluation = evaluate_hrp_stress_fold(*inputs)
        document = encode_hrp_stress_evaluation(evaluation, *inputs)
        self.assertEqual(decode_hrp_stress_evaluation(document, *inputs), evaluation)

    def test_resealed_false_metric_fails_closed(self) -> None:
        inputs = _hrp_inputs()
        evaluation = evaluate_hrp_stress_fold(*inputs)
        evaluation["metrics"]["stressedMaximumDrawdownPercent"] = "0.000000000000"
        unsigned = {key: value for key, value in evaluation.items() if key != "stressEvaluationId"}
        evaluation["stressEvaluationId"] = f"ASHA_STRESS_EVALUATION_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact side-by-side replay"):
            validate_hrp_stress_evaluation(evaluation, *inputs)


class MinimumCvarStressEvaluationTests(unittest.TestCase):
    def test_frozen_weights_produce_a_locked_comparison_only_result(self) -> None:
        inputs = _cvar_inputs()
        evaluation = evaluate_minimum_cvar_stress_fold(*inputs)
        self.assertEqual(evaluation["benchmarkId"], MINIMUM_CVAR_CONTROL_ID)
        self.assertEqual(
            evaluation["stressEvaluationId"],
            "ASHA_STRESS_EVALUATION_270fd024d2eb76add42d62ef47efe2e9668d2b2a75c82b2533bc7bfb78b64127",
        )
        self.assertEqual(evaluation["weightSetReference"]["weightSetId"], inputs[-1]["weightSetId"])
        self.assertEqual(evaluation["comparisonPolicy"], "side_by_side_no_ranking")
        self.assertEqual(evaluation["decisionState"], "no_decision")
        self.assertFalse(evaluation["financialUseAllowed"])
        self.assertFalse(evaluation["executionAllowed"])
        self.assertNotIn("rank", evaluation)

    def test_canonical_artifact_round_trip_is_exact(self) -> None:
        inputs = _cvar_inputs()
        evaluation = evaluate_minimum_cvar_stress_fold(*inputs)
        document = encode_minimum_cvar_stress_evaluation(evaluation, *inputs)
        self.assertEqual(decode_minimum_cvar_stress_evaluation(document, *inputs), evaluation)

    def test_resealed_false_metric_fails_closed(self) -> None:
        inputs = _cvar_inputs()
        evaluation = evaluate_minimum_cvar_stress_fold(*inputs)
        evaluation["metrics"]["stressedCumulativeChangePercent"] = "99.000000000000"
        unsigned = {key: value for key, value in evaluation.items() if key != "stressEvaluationId"}
        evaluation["stressEvaluationId"] = f"ASHA_STRESS_EVALUATION_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact side-by-side replay"):
            validate_minimum_cvar_stress_evaluation(evaluation, *inputs)


if __name__ == "__main__":
    unittest.main()
