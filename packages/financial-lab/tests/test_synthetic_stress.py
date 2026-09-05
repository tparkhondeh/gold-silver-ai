from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_stressed_return_matrix,
    decode_synthetic_stress_scenario,
    encode_stressed_return_matrix,
    encode_synthetic_stress_scenario,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.synthetic_stress import (  # noqa: E402
    STRESSED_RETURN_MATRIX_SCHEMA_VERSION,
    STRESS_SCENARIO_SCHEMA_VERSION,
    build_stressed_return_matrix,
    seal_synthetic_stress_scenario,
    validate_stressed_return_matrix,
)
from normalization_fixtures import hand_dataset  # noqa: E402


def _scenario(shocks: list[dict] | None = None) -> dict:
    return seal_synthetic_stress_scenario({
        "schemaVersion": STRESS_SCENARIO_SCHEMA_VERSION,
        "scenarioId": "ASHA_SYNTHETIC_STRESS_SCENARIO_HAND_V1",
        "scenarioVersion": 1,
        "scenarioKind": "explicit_additive_return_shocks",
        "purpose": "crisis_mechanics_test",
        "financialUseAllowed": False,
        "coveragePolicy": "unspecified_entries_are_explicit_zero",
        "shocks": shocks or [{
            "periodIndex": 3,
            "instrumentId": "SYNTH_ALPHA",
            "additiveReturnShock": "-0.500000000000",
        }],
    })


def _inputs() -> tuple[dict, dict]:
    dataset = hand_dataset()
    return dataset, build_point_in_time_return_matrix(dataset, 1, 5)


class SyntheticStressTests(unittest.TestCase):
    def test_hand_computed_additive_shocks_preserve_base_values(self) -> None:
        dataset, matrix = _inputs()
        scenario = _scenario([
            {
                "periodIndex": 3,
                "instrumentId": "SYNTH_ALPHA",
                "additiveReturnShock": "-0.500000000000",
            },
            {
                "periodIndex": 3,
                "instrumentId": "SYNTH_BETA",
                "additiveReturnShock": "-0.100000000000",
            },
        ])
        stressed = build_stressed_return_matrix(dataset, matrix, scenario)
        period = stressed["rows"][2]
        self.assertEqual(period, {
            "periodIndex": 3,
            "returns": [
                {
                    "instrumentId": "SYNTH_ALPHA",
                    "baseReturn": "0.250000000000",
                    "additiveReturnShock": "-0.500000000000",
                    "stressedReturn": "-0.250000000000",
                },
                {
                    "instrumentId": "SYNTH_BETA",
                    "baseReturn": "0.000000000000",
                    "additiveReturnShock": "-0.100000000000",
                    "stressedReturn": "-0.100000000000",
                },
            ],
        })

    def test_unspecified_cells_are_visible_zero_and_output_stays_locked(self) -> None:
        dataset, matrix = _inputs()
        scenario = _scenario()
        first = build_stressed_return_matrix(dataset, matrix, scenario)
        second = build_stressed_return_matrix(deepcopy(dataset), deepcopy(matrix), deepcopy(scenario))
        self.assertEqual(first, second)
        self.assertEqual(
            first["stressedMatrixId"],
            "ASHA_STRESSED_RETURN_MATRIX_2ab1eed7fac78405e2069a102bbcd4a5a1a43ca5e9c998b4c99e282666205912",
        )
        self.assertEqual(len(first["rows"]), 5)
        self.assertEqual(first["rows"][0]["returns"][0]["additiveReturnShock"], "0.000000000000")
        self.assertEqual(first["decisionState"], "no_decision")
        self.assertFalse(first["financialUseAllowed"])
        self.assertFalse(first["executionAllowed"])

    def test_scenario_rejects_real_namespace_ambiguous_order_and_zero_entries(self) -> None:
        with self.assertRaises(ContractViolation):
            _scenario([{
                "periodIndex": 3,
                "instrumentId": "XAU_USD",
                "additiveReturnShock": "-0.500000000000",
            }])
        with self.assertRaises(ContractViolation):
            _scenario([
                {
                    "periodIndex": 3,
                    "instrumentId": "SYNTH_BETA",
                    "additiveReturnShock": "-0.100000000000",
                },
                {
                    "periodIndex": 3,
                    "instrumentId": "SYNTH_ALPHA",
                    "additiveReturnShock": "-0.500000000000",
                },
            ])
        with self.assertRaises(ContractViolation):
            _scenario([{
                "periodIndex": 3,
                "instrumentId": "SYNTH_ALPHA",
                "additiveReturnShock": "0.000000000000",
            }])

    def test_outside_matrix_and_total_loss_fail_closed(self) -> None:
        dataset, matrix = _inputs()
        outside = _scenario([{
            "periodIndex": 6,
            "instrumentId": "SYNTH_ALPHA",
            "additiveReturnShock": "-0.100000000000",
        }])
        with self.assertRaisesRegex(ContractViolation, "outside the exact base matrix"):
            build_stressed_return_matrix(dataset, matrix, outside)
        total_loss = _scenario([{
            "periodIndex": 2,
            "instrumentId": "SYNTH_BETA",
            "additiveReturnShock": "-1.000000000000",
        }])
        with self.assertRaisesRegex(ContractViolation, "at or below -100 percent"):
            build_stressed_return_matrix(dataset, matrix, total_loss)

    def test_canonical_round_trip_and_resealed_false_value_fail_closed(self) -> None:
        dataset, matrix = _inputs()
        scenario = _scenario()
        self.assertEqual(
            decode_synthetic_stress_scenario(encode_synthetic_stress_scenario(scenario)),
            scenario,
        )
        stressed = build_stressed_return_matrix(dataset, matrix, scenario)
        document = encode_stressed_return_matrix(stressed, dataset, matrix, scenario)
        self.assertEqual(
            decode_stressed_return_matrix(document, dataset, matrix, scenario),
            stressed,
        )
        stressed["rows"][2]["returns"][0]["stressedReturn"] = "0.900000000000"
        unsigned = {key: value for key, value in stressed.items() if key != "stressedMatrixId"}
        stressed["stressedMatrixId"] = f"ASHA_STRESSED_RETURN_MATRIX_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_stressed_return_matrix(stressed, dataset, matrix, scenario)

    def test_machine_readable_schemas_match_runtime_versions(self) -> None:
        scenario_schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/synthetic-stress-scenario.schema.json").read_text(encoding="utf-8")
        )
        matrix_schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/stressed-return-matrix.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            scenario_schema["properties"]["schemaVersion"]["const"],
            STRESS_SCENARIO_SCHEMA_VERSION,
        )
        self.assertEqual(
            matrix_schema["properties"]["schemaVersion"]["const"],
            STRESSED_RETURN_MATRIX_SCHEMA_VERSION,
        )
        self.assertFalse(scenario_schema["additionalProperties"])
        self.assertFalse(matrix_schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
