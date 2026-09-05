from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import unittest

from asha_financial_lab.artifacts import (
    decode_transparent_decision_input,
    decode_transparent_guarded_decision,
    encode_transparent_decision_input,
    encode_transparent_guarded_decision,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.transparent_decision import (
    TRANSPARENT_DECISION_INPUT_SCHEMA_VERSION,
    TRANSPARENT_DECISION_METHOD_ID,
    TRANSPARENT_DECISION_SCHEMA_VERSION,
    build_transparent_decision_reference_input,
    build_transparent_guarded_decision,
    seal_transparent_decision_input,
    validate_transparent_guarded_decision,
)


def _reseal_input(payload: dict) -> dict:
    unsigned = {key: value for key, value in payload.items() if key != "contentFingerprint"}
    return seal_transparent_decision_input(unsigned)


class TransparentGuardedDecisionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.input = build_transparent_decision_reference_input()
        self.result = build_transparent_guarded_decision(self.input)

    def test_reference_result_is_exact_and_financially_locked(self) -> None:
        self.assertEqual(
            self.result["decisionId"],
            "ASHA_TRANSPARENT_DECISION_d22d3996bc3dc5654c644b90a046fe98e1ec6ce4c21bc04d275a1b26aef7a69c",
        )
        self.assertEqual(self.result["methodologyReference"]["entityId"], TRANSPARENT_DECISION_METHOD_ID)
        self.assertEqual(self.result["status"], "evaluation_only")
        self.assertFalse(self.result["financialUseAllowed"])
        self.assertFalse(self.result["executionAllowed"])
        self.assertEqual(self.result["decisionState"], "synthetic_proposal_only")
        self.assertEqual(self.result["evidenceState"]["iranCalibrationStatus"], "not_evaluated")

    def test_actions_weights_and_amounts_are_hand_checkable(self) -> None:
        decisions = {item["instrumentId"]: item for item in self.result["assetDecisions"]}
        self.assertEqual(
            {
                key: (item["action"], item["changePercentPoint"], item["suggestedAmountToman"])
                for key, item in decisions.items()
            },
            {
                "SYNTH_CASH": ("increase", "12.500000", "12500000"),
                "SYNTH_DEFENSIVE": ("hold", "0.000000", "0"),
                "SYNTH_TREND": ("reduce", "-8.241758", "8241758"),
                "SYNTH_VOLATILE": ("reduce", "-4.258242", "4258242"),
            },
        )
        self.assertEqual(
            sum(Decimal(item["proposedWeightPercent"]) for item in decisions.values()),
            Decimal("100.000000"),
        )
        self.assertEqual(self.result["portfolioMetrics"]["appliedTurnoverPercent"], "12.500000")
        self.assertLess(
            Decimal(self.result["portfolioMetrics"]["proposedConcentrationHhi"]),
            Decimal(self.result["portfolioMetrics"]["currentConcentrationHhi"]),
        )

    def test_all_eight_equal_factors_reconcile_to_each_non_cash_score(self) -> None:
        non_cash = [
            item for item in self.result["assetDecisions"] if item["instrumentId"] != "SYNTH_CASH"
        ]
        for decision in non_cash:
            self.assertEqual(len(decision["factorContributions"]), 8)
            self.assertEqual(
                sum(Decimal(item["weight"]) for item in decision["factorContributions"]),
                Decimal("1.000000000000"),
            )
            expected = sum(
                Decimal(item["weightedContribution"])
                for item in decision["factorContributions"]
            ) * Decimal("50")
            self.assertEqual(Decimal(decision["decisionScore"]), expected)

    def test_risk_breach_and_turnover_guards_are_visible(self) -> None:
        decisions = {item["instrumentId"]: item for item in self.result["assetDecisions"]}
        self.assertIn(
            "DRAWDOWN_OR_STRESS_TOLERANCE_BREACHED",
            decisions["SYNTH_VOLATILE"]["actionReasonCodes"],
        )
        self.assertIn(
            "CURRENT_WEIGHT_ABOVE_SINGLE_ASSET_CAP",
            decisions["SYNTH_TREND"]["actionReasonCodes"],
        )
        self.assertEqual(self.result["overallDecision"]["action"], "convert")
        self.assertEqual(self.result["overallDecision"]["destinationInstrumentId"], "SYNTH_CASH")
        self.assertLessEqual(
            Decimal(self.result["portfolioMetrics"]["appliedTurnoverPercent"]),
            Decimal("25"),
        )

    def test_horizon_and_single_factor_sensitivity_are_directional(self) -> None:
        wide_band = deepcopy(self.input)
        wide_band["constraints"]["noTradeBandWeight"] = "0.25"
        no_trade_result = build_transparent_guarded_decision(_reseal_input(wide_band))
        self.assertTrue(all(item["action"] == "hold" for item in no_trade_result["assetDecisions"]))
        self.assertEqual(no_trade_result["overallDecision"]["action"], "hold")
        self.assertEqual(no_trade_result["overallDecision"]["suggestedAmountToman"], "0")

        long_input = build_transparent_decision_reference_input("long")
        long_result = build_transparent_guarded_decision(long_input)
        short_volatile = next(
            item for item in self.result["assetDecisions"] if item["instrumentId"] == "SYNTH_VOLATILE"
        )
        long_volatile = next(
            item for item in long_result["assetDecisions"] if item["instrumentId"] == "SYNTH_VOLATILE"
        )
        self.assertGreater(Decimal(long_volatile["decisionScore"]), Decimal(short_volatile["decisionScore"]))

        cheaper = deepcopy(self.input)
        volatile = next(item for item in cheaper["assets"] if item["instrumentId"] == "SYNTH_VOLATILE")
        volatile["valuationPercentile"] = "0.10"
        cheaper = _reseal_input(cheaper)
        improved = build_transparent_guarded_decision(cheaper)
        improved_volatile = next(
            item for item in improved["assetDecisions"] if item["instrumentId"] == "SYNTH_VOLATILE"
        )
        self.assertEqual(
            Decimal(improved_volatile["decisionScore"]) - Decimal(short_volatile["decisionScore"]),
            Decimal("25.000000"),
        )

    def test_resealed_output_or_input_drift_fails_exact_replay(self) -> None:
        tampered = deepcopy(self.result)
        tampered["assetDecisions"][0]["suggestedAmountToman"] = "1"
        unsigned = {key: value for key, value in tampered.items() if key != "decisionId"}
        tampered["decisionId"] = f"ASHA_TRANSPARENT_DECISION_{fingerprint(unsigned)}"
        with self.assertRaises(ContractViolation):
            validate_transparent_guarded_decision(tampered, self.input)

        malformed = deepcopy(self.input)
        del malformed["assets"][0]["conversionCostRate"]
        unsigned_input = {key: value for key, value in malformed.items() if key != "contentFingerprint"}
        malformed["contentFingerprint"] = fingerprint(unsigned_input)
        with self.assertRaises(ContractViolation):
            build_transparent_guarded_decision(malformed)

    def test_canonical_input_and_decision_round_trip(self) -> None:
        encoded_input = encode_transparent_decision_input(self.input)
        replayed_input = decode_transparent_decision_input(encoded_input)
        self.assertEqual(replayed_input, self.input)
        encoded_result = encode_transparent_guarded_decision(self.result, replayed_input)
        self.assertEqual(
            decode_transparent_guarded_decision(encoded_result, replayed_input),
            self.result,
        )

    def test_machine_schemas_match_runtime_versions(self) -> None:
        root = Path(__file__).resolve().parents[1] / "schemas" / "v1"
        input_schema = json.loads((root / "transparent-decision-input.schema.json").read_text("utf-8"))
        output_schema = json.loads((root / "transparent-decision.schema.json").read_text("utf-8"))
        self.assertEqual(input_schema["properties"]["schemaVersion"]["const"], TRANSPARENT_DECISION_INPUT_SCHEMA_VERSION)
        self.assertEqual(output_schema["properties"]["schemaVersion"]["const"], TRANSPARENT_DECISION_SCHEMA_VERSION)
        self.assertFalse(output_schema["properties"]["financialUseAllowed"]["const"])
        self.assertFalse(output_schema["properties"]["executionAllowed"]["const"])


if __name__ == "__main__":
    unittest.main()
