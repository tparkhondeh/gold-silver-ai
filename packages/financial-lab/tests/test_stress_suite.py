from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_hrp_stress_suite,
    decode_inverse_volatility_stress_suite,
    decode_minimum_cvar_stress_suite,
    encode_hrp_stress_suite,
    encode_inverse_volatility_stress_suite,
    encode_minimum_cvar_stress_suite,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.hrp_control import (  # noqa: E402
    HRP_CONTROL_ID,
    build_hrp_comparison_control_weights,
)
from asha_financial_lab.minimum_cvar_control import MINIMUM_CVAR_CONTROL_ID  # noqa: E402
from asha_financial_lab.stress_suite import (  # noqa: E402
    STRESS_SUITE_SCHEMA_VERSION,
    build_hrp_stress_suite,
    build_inverse_volatility_stress_suite,
    build_minimum_cvar_stress_suite,
    validate_minimum_cvar_stress_suite,
)
from asha_financial_lab.synthetic_stress import (  # noqa: E402
    STRESS_SCENARIO_SCHEMA_VERSION,
    seal_synthetic_stress_scenario,
)
from test_hrp_control import _all_inputs as hrp_base_inputs  # noqa: E402
from test_hierarchical_clustering import _dataset as hrp_dataset  # noqa: E402
from test_minimum_cvar_control import (  # noqa: E402
    _build as cvar_weights,
    _dataset as cvar_dataset,
    _inputs as cvar_base_inputs,
)
from test_stress_evaluation import _inputs as inverse_base_inputs  # noqa: E402


def _scenario(label: str, shocks: list[dict]) -> dict:
    return seal_synthetic_stress_scenario({
        "schemaVersion": STRESS_SCENARIO_SCHEMA_VERSION,
        "scenarioId": f"ASHA_SYNTHETIC_STRESS_SCENARIO_SUITE_{label}_V1",
        "scenarioVersion": 1,
        "scenarioKind": "explicit_additive_return_shocks",
        "purpose": "crisis_mechanics_test",
        "financialUseAllowed": False,
        "coveragePolicy": "unspecified_entries_are_explicit_zero",
        "shocks": shocks,
    })


def _scenarios(instrument_ids: list[str]) -> list[dict]:
    first = sorted(instrument_ids)[0]
    return [
        _scenario("A", [
            {
                "periodIndex": 3,
                "instrumentId": instrument_id,
                "additiveReturnShock": f"-0.{index + 1}00000000000",
            }
            for index, instrument_id in enumerate(sorted(instrument_ids))
        ]),
        _scenario("B", [{
            "periodIndex": 3,
            "instrumentId": first,
            "additiveReturnShock": "-0.050000000000",
        }]),
    ]


def _inverse_inputs() -> tuple[dict, ...]:
    dataset, matrix, _, _, plan, standardizer, weights = inverse_base_inputs()
    return dataset, matrix, plan, standardizer, weights, _scenarios(matrix["instrumentIds"])


def _cvar_inputs() -> tuple[dict, ...]:
    dataset = cvar_dataset()
    matrix, plan = cvar_base_inputs(dataset)
    weights = cvar_weights(dataset)
    return dataset, matrix, plan, weights, _scenarios(matrix["instrumentIds"])


def _hrp_inputs() -> tuple[dict, ...]:
    dataset = hrp_dataset()
    base_inputs = hrp_base_inputs(dataset)
    matrix, plan = base_inputs[:2]
    weights = build_hrp_comparison_control_weights(dataset, *base_inputs)
    return dataset, matrix, plan, *base_inputs[2:], weights, _scenarios(matrix["instrumentIds"])


class StressSuiteTests(unittest.TestCase):
    def test_inverse_volatility_keeps_scenario_metrics_separate(self) -> None:
        suite = build_inverse_volatility_stress_suite(*_inverse_inputs())
        self.assertEqual(
            suite["stressSuiteId"],
            "ASHA_STRESS_SUITE_0c5448e1e5ae0c30585db60cb86dede02863db69c47fb374db3b0a6203983289",
        )
        self.assertEqual(suite["summary"], {
            "scenarioCount": 2,
            "testStartIndex": 3,
            "testEndIndex": 3,
            "aggregationPolicy": "none_scenario_metrics_only",
        })
        self.assertEqual(len(suite["scenarioResults"]), 2)
        self.assertEqual(
            suite["scenarioResults"][0]["metrics"]["baseCumulativeChangePercent"],
            suite["scenarioResults"][1]["metrics"]["baseCumulativeChangePercent"],
        )
        self.assertNotIn("winner", suite)
        self.assertNotIn("rank", suite)
        self.assertEqual(suite["decisionState"], "no_decision")
        self.assertFalse(suite["financialUseAllowed"])
        self.assertFalse(suite["executionAllowed"])

    def test_minimum_cvar_uses_its_exact_frozen_weight_identity(self) -> None:
        inputs = _cvar_inputs()
        suite = build_minimum_cvar_stress_suite(*inputs)
        self.assertEqual(
            suite["stressSuiteId"],
            "ASHA_STRESS_SUITE_2c1781212abbd38ab7c77c146fd75d81fc843ae3c1858e143fed2b0b0a440246",
        )
        self.assertEqual(suite["benchmarkId"], MINIMUM_CVAR_CONTROL_ID)
        self.assertEqual(suite["weightSetReference"]["weightSetId"], inputs[-2]["weightSetId"])
        self.assertEqual(suite["summary"]["aggregationPolicy"], "none_scenario_metrics_only")

    def test_hrp_uses_its_complete_train_only_provenance(self) -> None:
        inputs = _hrp_inputs()
        suite = build_hrp_stress_suite(*inputs)
        self.assertEqual(
            suite["stressSuiteId"],
            "ASHA_STRESS_SUITE_066652a13a57c2e12a032d2cfeb5b4a0c2476bd7a7ab987beca1ef505a56483c",
        )
        self.assertEqual(suite["benchmarkId"], HRP_CONTROL_ID)
        self.assertEqual(suite["weightSetReference"]["weightSetId"], inputs[-2]["weightSetId"])
        self.assertEqual(suite["summary"]["scenarioCount"], 2)

    def test_all_three_canonical_artifacts_round_trip_exactly(self) -> None:
        inverse_inputs = _inverse_inputs()
        inverse = build_inverse_volatility_stress_suite(*inverse_inputs)
        self.assertEqual(
            decode_inverse_volatility_stress_suite(
                encode_inverse_volatility_stress_suite(inverse, *inverse_inputs), *inverse_inputs
            ),
            inverse,
        )
        cvar_inputs = _cvar_inputs()
        cvar = build_minimum_cvar_stress_suite(*cvar_inputs)
        self.assertEqual(
            decode_minimum_cvar_stress_suite(
                encode_minimum_cvar_stress_suite(cvar, *cvar_inputs), *cvar_inputs
            ),
            cvar,
        )
        hrp_inputs = _hrp_inputs()
        hrp = build_hrp_stress_suite(*hrp_inputs)
        self.assertEqual(
            decode_hrp_stress_suite(encode_hrp_stress_suite(hrp, *hrp_inputs), *hrp_inputs),
            hrp,
        )

    def test_resealed_aggregate_or_false_metric_fails_closed(self) -> None:
        inputs = _cvar_inputs()
        suite = build_minimum_cvar_stress_suite(*inputs)
        suite["scenarioResults"][0]["metrics"]["stressedCumulativeChangePercent"] = (
            "99.000000000000"
        )
        unsigned = {key: value for key, value in suite.items() if key != "stressSuiteId"}
        suite["stressSuiteId"] = f"ASHA_STRESS_SUITE_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact multi-scenario replay"):
            validate_minimum_cvar_stress_suite(suite, *inputs)

    def test_scenarios_must_be_multiple_unique_and_sorted(self) -> None:
        inputs = list(_inverse_inputs())
        inputs[-1] = [inputs[-1][0]]
        with self.assertRaisesRegex(ContractViolation, "between 2 and 16"):
            build_inverse_volatility_stress_suite(*inputs)
        inputs = list(_inverse_inputs())
        inputs[-1] = list(reversed(inputs[-1]))
        with self.assertRaisesRegex(ContractViolation, "unique and sorted"):
            build_inverse_volatility_stress_suite(*inputs)

    def test_machine_readable_schema_preserves_all_safety_locks(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/stress-suite.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], STRESS_SUITE_SCHEMA_VERSION)
        self.assertEqual(
            schema["properties"]["summary"]["properties"]["aggregationPolicy"]["const"],
            "none_scenario_metrics_only",
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
