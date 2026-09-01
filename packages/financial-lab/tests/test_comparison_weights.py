from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_inverse_volatility_weights,
    encode_inverse_volatility_weights,
)
from asha_financial_lab.comparison_weights import (  # noqa: E402
    INVERSE_VOLATILITY_CONTROL_ID,
    INVERSE_VOLATILITY_SCHEMA_VERSION,
    build_inverse_volatility_control_weights,
    validate_inverse_volatility_control_weights,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402
from asha_financial_lab.walk_forward import build_walk_forward_plan  # noqa: E402
from normalization_fixtures import hand_dataset, normalization_inputs  # noqa: E402


def _control_inputs(dataset: dict) -> tuple[dict, dict, dict]:
    matrix, plan = normalization_inputs(dataset)
    standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
    return matrix, plan, standardizer


class InverseVolatilityControlTests(unittest.TestCase):
    def test_hand_computed_inverse_volatility_weights_sum_exactly_to_one(self) -> None:
        dataset = hand_dataset(beta_level="150")
        matrix, plan, standardizer = _control_inputs(dataset)
        weights = build_inverse_volatility_control_weights(dataset, matrix, plan, standardizer)
        self.assertEqual(weights["benchmarkId"], INVERSE_VOLATILITY_CONTROL_ID)
        self.assertEqual(weights["weights"], [
            {"instrumentId": "SYNTH_ALPHA", "weight": "0.333333333333"},
            {"instrumentId": "SYNTH_BETA", "weight": "0.666666666667"},
        ])
        self.assertEqual(sum(Decimal(item["weight"]) for item in weights["weights"]), Decimal("1"))

    def test_zero_variance_gets_zero_weight_and_all_zero_fails_closed(self) -> None:
        dataset = hand_dataset()
        matrix, plan, standardizer = _control_inputs(dataset)
        weights = build_inverse_volatility_control_weights(dataset, matrix, plan, standardizer)
        self.assertEqual(weights["zeroVarianceInstrumentIds"], ["SYNTH_BETA"])
        self.assertEqual(weights["weights"][1]["weight"], "0.000000000000")

        all_zero = hand_dataset("100", alpha_mid="100")
        zero_matrix, zero_plan, zero_standardizer = _control_inputs(all_zero)
        with self.assertRaises(ContractViolation):
            build_inverse_volatility_control_weights(all_zero, zero_matrix, zero_plan, zero_standardizer)

    def test_reference_weights_replay_exactly_and_remain_no_decision(self) -> None:
        dataset = build_reference_dataset()
        matrix = build_point_in_time_return_matrix(dataset, 2, 110)
        plan = build_walk_forward_plan(
            dataset,
            minimum_train_periods=11,
            test_periods=2,
            step_periods=2,
            purge_periods=0,
            embargo_periods=0,
            mode="rolling",
        )
        standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
        first = build_inverse_volatility_control_weights(dataset, matrix, plan, standardizer)
        second = build_inverse_volatility_control_weights(
            deepcopy(dataset), deepcopy(matrix), deepcopy(plan), deepcopy(standardizer)
        )
        self.assertEqual(first, second)
        self.assertEqual(
            validate_inverse_volatility_control_weights(first, dataset, matrix, plan, standardizer),
            first,
        )
        self.assertEqual(first["decisionState"], "no_decision")
        self.assertFalse(first["financialUseAllowed"])
        self.assertFalse(first["executionAllowed"])
        self.assertEqual(
            first["weightSetId"],
            "ASHA_COMPARISON_WEIGHTS_d7ed96771369fbcf59b65e1dd86722bed323a01eb599013704521391e5629082",
        )
        self.assertEqual(first["zeroVarianceInstrumentIds"], ["SYNTH_CASH"])

    def test_artifact_and_resealed_tamper_checks_require_exact_provenance(self) -> None:
        dataset = hand_dataset(beta_level="150")
        matrix, plan, standardizer = _control_inputs(dataset)
        weights = build_inverse_volatility_control_weights(dataset, matrix, plan, standardizer)
        document = encode_inverse_volatility_weights(weights, dataset, matrix, plan, standardizer)
        self.assertEqual(
            decode_inverse_volatility_weights(document, dataset, matrix, plan, standardizer),
            weights,
        )
        weights["weights"][0]["weight"] = "0.500000000000"
        weights["weights"][1]["weight"] = "0.500000000000"
        unsigned = {key: value for key, value in weights.items() if key != "weightSetId"}
        weights["weightSetId"] = f"ASHA_COMPARISON_WEIGHTS_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact train-only replay"):
            validate_inverse_volatility_control_weights(weights, dataset, matrix, plan, standardizer)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads((PACKAGE_ROOT / "schemas/v1/inverse-volatility-weights.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], INVERSE_VOLATILITY_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
