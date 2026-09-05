from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import unittest

from asha_financial_lab.artifacts import (
    decode_iran_calibration_manifest,
    encode_iran_calibration_manifest,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.iran_calibration_manifest import (
    IRAN_CALIBRATION_MANIFEST_SCHEMA_VERSION,
    build_iran_calibration_manifest,
    validate_iran_calibration_manifest,
)
from asha_financial_lab.transparent_decision import TRANSPARENT_DECISION_METHOD_ID


class IranCalibrationManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = build_iran_calibration_manifest()

    def _reseal(self, payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "manifestId"}
        payload["manifestId"] = f"ASHA_IRAN_CALIBRATION_MANIFEST_{fingerprint(unsigned)}"
        return payload

    def test_manifest_covers_every_factor_and_constraint(self) -> None:
        self.assertEqual(
            [item["factorId"] for item in self.manifest["factorRequirements"]],
            [
                "CONCENTRATION", "CONVERSION_COST", "CRISIS_RESILIENCE", "DRAWDOWN",
                "LIQUIDITY", "TREND", "VALUATION", "VOLATILITY",
            ],
        )
        self.assertEqual(len(self.manifest["constraintRequirements"]), 5)
        self.assertEqual(
            self.manifest["methodReference"]["methodId"],
            TRANSPARENT_DECISION_METHOD_ID,
        )

    def test_history_split_and_test_freeze_are_exact(self) -> None:
        plan = self.manifest["historyPlan"]
        self.assertEqual(plan["minimumValidObservations"], 1260)
        self.assertEqual(
            plan["trainObservations"] + plan["validationObservations"] + plan["testObservations"],
            plan["minimumValidObservations"],
        )
        self.assertEqual(plan["minimumWalkForwardFolds"], 6)
        self.assertEqual(plan["walkForwardScope"], "development_segment_only_test_untouched")
        self.assertEqual(
            self.manifest["parameterFreeze"]["freezePoint"],
            "before_any_untouched_test_window_is_opened",
        )
        self.assertFalse(self.manifest["parameterFreeze"]["syntheticResultsMayChangeParameters"])
        self.assertFalse(self.manifest["parameterFreeze"]["testResultsMayChangeFrozenParameters"])

    def test_every_factor_requires_point_in_time_lineage_and_iran_checks(self) -> None:
        lineage = {
            "available_at_utc", "observed_at_utc",
            "source_contract_id", "source_contract_version",
        }
        for factor in self.manifest["factorRequirements"]:
            self.assertTrue(lineage.issubset(factor["requiredFields"]))
            self.assertEqual(len(factor["iranSpecificChecks"]), 2)
            self.assertEqual(factor["missingDataRule"], "fail_closed_no_silent_fill")
            self.assertEqual(factor["finalCalibrationState"], "not_started")

    def test_ten_gates_start_unevaluated_and_promotion_stays_locked(self) -> None:
        self.assertEqual(len(self.manifest["validationGates"]), 10)
        self.assertTrue(all(item["currentState"] == "not_evaluated" for item in self.manifest["validationGates"]))
        boundary = self.manifest["boundary"]
        self.assertFalse(boundary["containsMarketObservations"])
        self.assertFalse(boundary["providerSelected"])
        self.assertFalse(boundary["realDataIngestionAllowed"])
        self.assertFalse(boundary["financialUseAllowed"])
        self.assertFalse(boundary["executionAllowed"])
        policy = self.manifest["promotionPolicy"]
        self.assertTrue(policy["laterOwnerAdrRequired"])
        self.assertFalse(policy["syntheticResultsCanProveFinancialPerformance"])
        self.assertFalse(policy["currentFinancialUseAllowed"])
        self.assertFalse(policy["currentExecutionAllowed"])

    def test_resealed_history_or_gate_drift_fails_closed(self) -> None:
        changed_history = deepcopy(self.manifest)
        changed_history["historyPlan"]["testObservations"] = 251
        with self.assertRaises(ContractViolation):
            validate_iran_calibration_manifest(self._reseal(changed_history))

        premature_gate = deepcopy(self.manifest)
        premature_gate["validationGates"][0]["currentState"] = "passed"
        with self.assertRaises(ContractViolation):
            validate_iran_calibration_manifest(self._reseal(premature_gate))

    def test_resealed_real_data_or_parameter_change_fails_closed(self) -> None:
        real_data = deepcopy(self.manifest)
        real_data["boundary"]["realDataIngestionAllowed"] = True
        with self.assertRaises(ContractViolation):
            validate_iran_calibration_manifest(self._reseal(real_data))

        changed_weight = deepcopy(self.manifest)
        changed_weight["constraintRequirements"][0]["laboratoryV1Value"] = "0.20"
        with self.assertRaises(ContractViolation):
            validate_iran_calibration_manifest(self._reseal(changed_weight))

        changed_freeze = deepcopy(self.manifest)
        changed_freeze["parameterFreeze"]["items"][-1] = "WINNER_SELECTION_RULE"
        changed_freeze["parameterFreeze"]["items"].sort()
        with self.assertRaises(ContractViolation):
            validate_iran_calibration_manifest(self._reseal(changed_freeze))

    def test_canonical_round_trip_rejects_duplicate_json_key(self) -> None:
        encoded = encode_iran_calibration_manifest(self.manifest)
        self.assertEqual(decode_iran_calibration_manifest(encoded), self.manifest)
        duplicate = encoded.replace(
            b'{"boundary":',
            b'{"boundary":{},"boundary":',
            1,
        )
        with self.assertRaises(ContractViolation):
            decode_iran_calibration_manifest(duplicate)

    def test_schema_locks_real_financial_and_execution_use(self) -> None:
        path = Path(__file__).resolve().parents[1] / "schemas" / "v1" / "iran-calibration-manifest.schema.json"
        schema = json.loads(path.read_text("utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], IRAN_CALIBRATION_MANIFEST_SCHEMA_VERSION)
        boundary = schema["properties"]["boundary"]["const"]
        self.assertFalse(boundary["realDataIngestionAllowed"])
        self.assertFalse(boundary["financialUseAllowed"])
        self.assertFalse(boundary["executionAllowed"])


if __name__ == "__main__":
    unittest.main()
