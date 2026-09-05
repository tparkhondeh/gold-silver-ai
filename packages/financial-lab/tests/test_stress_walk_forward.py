from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_hrp_stress_walk_forward_report,
    decode_inverse_volatility_stress_walk_forward_report,
    decode_minimum_cvar_stress_walk_forward_report,
    encode_hrp_stress_walk_forward_report,
    encode_inverse_volatility_stress_walk_forward_report,
    encode_minimum_cvar_stress_walk_forward_report,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.hrp_control import HRP_CONTROL_ID  # noqa: E402
from asha_financial_lab.minimum_cvar_control import MINIMUM_CVAR_CONTROL_ID  # noqa: E402
from asha_financial_lab.stress_walk_forward import (  # noqa: E402
    STRESS_WALK_FORWARD_SCHEMA_VERSION,
    build_hrp_stress_walk_forward_report,
    build_inverse_volatility_stress_walk_forward_report,
    build_minimum_cvar_stress_walk_forward_report,
    validate_minimum_cvar_stress_walk_forward_report,
)
from asha_financial_lab.synthetic_stress import (  # noqa: E402
    STRESS_SCENARIO_SCHEMA_VERSION,
    seal_synthetic_stress_scenario,
)
from test_hierarchical_clustering import _dataset as hrp_dataset, _inputs as hrp_inputs  # noqa: E402
from test_minimum_cvar_control import _dataset as cvar_dataset, _inputs as cvar_inputs  # noqa: E402


def _scenario(label: str, period_index: int, shocks: list[dict]) -> dict:
    return seal_synthetic_stress_scenario({
        "schemaVersion": STRESS_SCENARIO_SCHEMA_VERSION,
        "scenarioId": f"ASHA_SYNTHETIC_STRESS_SCENARIO_WALK_{label}_V1",
        "scenarioVersion": 1,
        "scenarioKind": "explicit_additive_return_shocks",
        "purpose": "crisis_mechanics_test",
        "financialUseAllowed": False,
        "coveragePolicy": "unspecified_entries_are_explicit_zero",
        "shocks": [
            {**shock, "periodIndex": period_index}
            for shock in shocks
        ],
    })


def _fold_scenarios(matrix: dict, plan: dict) -> list[dict]:
    instruments = sorted(matrix["instrumentIds"])
    return [
        {
            "foldIndex": fold["foldIndex"],
            "scenarios": [
                _scenario(
                    f"FOLD_{fold['foldIndex']}_A",
                    fold["testStartIndex"],
                    [
                        {
                            "instrumentId": instrument_id,
                            "additiveReturnShock": f"-0.{index + 1}00000000000",
                        }
                        for index, instrument_id in enumerate(instruments)
                    ],
                ),
                _scenario(
                    f"FOLD_{fold['foldIndex']}_B",
                    fold["testStartIndex"],
                    [{
                        "instrumentId": instruments[0],
                        "additiveReturnShock": "-0.050000000000",
                    }],
                ),
            ],
        }
        for fold in plan["folds"]
    ]


def _inputs() -> tuple[dict, dict, dict, list[dict]]:
    dataset = cvar_dataset()
    matrix, plan = cvar_inputs(dataset)
    return dataset, matrix, plan, _fold_scenarios(matrix, plan)


def _hrp_inputs() -> tuple[dict, dict, dict, list[dict]]:
    dataset = hrp_dataset()
    matrix, plan, *_ = hrp_inputs(dataset)
    return dataset, matrix, plan, _fold_scenarios(matrix, plan)


class StressWalkForwardTests(unittest.TestCase):
    def test_inverse_volatility_preserves_every_fold_scenario_cell(self) -> None:
        inputs = _inputs()
        report = build_inverse_volatility_stress_walk_forward_report(*inputs)
        self.assertEqual(
            report["reportId"],
            "ASHA_STRESS_WALK_FORWARD_REPORT_9ce0d5f2718b210c6306c0a86cc9596128b9c278703ae6486d25966996669c40",
        )
        self.assertEqual(report["summary"], {
            "foldCount": 3,
            "scenarioCellCount": 6,
            "firstTestIndex": 3,
            "lastTestIndex": 5,
            "aggregationPolicy": "none_fold_or_scenario_metrics_only",
        })
        self.assertEqual([item["scenarioCount"] for item in report["foldResults"]], [2, 2, 2])
        self.assertEqual(
            [item["testStartIndex"] for item in report["foldResults"]],
            [3, 4, 5],
        )
        self.assertNotIn("winner", report)
        self.assertNotIn("rank", report)
        self.assertEqual(report["decisionState"], "no_decision")
        self.assertFalse(report["financialUseAllowed"])
        self.assertFalse(report["executionAllowed"])

    def test_minimum_cvar_refits_each_fold_before_freezing(self) -> None:
        inputs = _inputs()
        report = build_minimum_cvar_stress_walk_forward_report(
            *inputs, tail_count=1, weight_step="0.500000000000"
        )
        self.assertEqual(
            report["reportId"],
            "ASHA_STRESS_WALK_FORWARD_REPORT_b2f15ee0be0a2394a7434f769bd0d777a2d77563a736d8c18aac71a003830d4a",
        )
        self.assertEqual(report["benchmarkId"], MINIMUM_CVAR_CONTROL_ID)
        self.assertEqual(report["parameters"]["tailCount"], 1)
        self.assertEqual(report["parameters"]["weightStep"], "0.500000000000")
        self.assertEqual(len({item["weightSetReference"]["weightSetId"] for item in report["foldResults"]}), 3)

    def test_hrp_rebuilds_the_complete_train_only_chain_per_fold(self) -> None:
        report = build_hrp_stress_walk_forward_report(*_hrp_inputs())
        self.assertEqual(
            report["reportId"],
            "ASHA_STRESS_WALK_FORWARD_REPORT_8d747ea614c5c775d51d0ef40dc2224eacfe387afe683110e850eab3a4c7e87b",
        )
        self.assertEqual(report["benchmarkId"], HRP_CONTROL_ID)
        self.assertEqual(report["summary"]["foldCount"], 3)
        self.assertEqual(len({item["weightSetReference"]["weightSetId"] for item in report["foldResults"]}), 3)

    def test_all_three_canonical_reports_round_trip_exactly(self) -> None:
        inputs = _inputs()
        inverse = build_inverse_volatility_stress_walk_forward_report(*inputs)
        self.assertEqual(
            decode_inverse_volatility_stress_walk_forward_report(
                encode_inverse_volatility_stress_walk_forward_report(inverse, *inputs), *inputs
            ),
            inverse,
        )
        cvar = build_minimum_cvar_stress_walk_forward_report(
            *inputs, tail_count=1, weight_step="0.500000000000"
        )
        self.assertEqual(
            decode_minimum_cvar_stress_walk_forward_report(
                encode_minimum_cvar_stress_walk_forward_report(cvar, *inputs), *inputs
            ),
            cvar,
        )
        hrp_inputs_value = _hrp_inputs()
        hrp = build_hrp_stress_walk_forward_report(*hrp_inputs_value)
        self.assertEqual(
            decode_hrp_stress_walk_forward_report(
                encode_hrp_stress_walk_forward_report(hrp, *hrp_inputs_value),
                *hrp_inputs_value,
            ),
            hrp,
        )

    def test_resealed_fold_or_metric_omission_fails_closed(self) -> None:
        inputs = _inputs()
        report = build_minimum_cvar_stress_walk_forward_report(
            *inputs, tail_count=1, weight_step="0.500000000000"
        )
        report["foldResults"][0]["scenarioResults"].pop()
        report["foldResults"][0]["scenarioCount"] = 1
        report["summary"]["scenarioCellCount"] = 5
        unsigned = {key: value for key, value in report.items() if key != "reportId"}
        report["reportId"] = f"ASHA_STRESS_WALK_FORWARD_REPORT_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_minimum_cvar_stress_walk_forward_report(report, *inputs)

        malformed = build_minimum_cvar_stress_walk_forward_report(
            *inputs, tail_count=1, weight_step="0.500000000000"
        )
        malformed["foldResults"][0]["scenarioResults"] = {}
        with self.assertRaisesRegex(ContractViolation, "scenario counts"):
            validate_minimum_cvar_stress_walk_forward_report(malformed, *inputs)

    def test_fold_scenario_sets_must_be_complete_and_ordered(self) -> None:
        inputs = list(_inputs())
        inputs[-1] = inputs[-1][:-1]
        with self.assertRaisesRegex(ContractViolation, "one scenario set per fold"):
            build_inverse_volatility_stress_walk_forward_report(*inputs)
        inputs = list(_inputs())
        inputs[-1][0]["foldIndex"] = 1
        with self.assertRaisesRegex(ContractViolation, "exact fold order"):
            build_inverse_volatility_stress_walk_forward_report(*inputs)

    def test_machine_readable_schema_preserves_non_aggregation(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/stress-walk-forward-report.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            STRESS_WALK_FORWARD_SCHEMA_VERSION,
        )
        self.assertEqual(
            schema["properties"]["summary"]["properties"]["aggregationPolicy"]["const"],
            "none_fold_or_scenario_metrics_only",
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
