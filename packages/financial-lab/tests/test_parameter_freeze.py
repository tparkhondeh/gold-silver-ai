from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import unittest

from asha_financial_lab.artifacts import (
    decode_parameter_freeze_bundle,
    encode_parameter_freeze_bundle,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.iran_calibration_manifest import build_iran_calibration_manifest
from asha_financial_lab.parameter_freeze import (
    PARAMETER_FREEZE_SCHEMA_VERSION,
    build_parameter_freeze_bundle,
    validate_parameter_freeze_bundle,
)
from asha_financial_lab.transparent_decision import (
    TRANSPARENT_DECISION_METHOD_ID,
    build_transparent_decision_reference_input,
)


class ParameterFreezeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = build_iran_calibration_manifest()
        self.bundle = build_parameter_freeze_bundle(self.manifest)

    @staticmethod
    def _reseal(payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "bundleId"}
        payload["bundleId"] = f"ASHA_SYNTHETIC_PARAMETER_FREEZE_{fingerprint(unsigned)}"
        return payload

    def test_bundle_binds_exact_method_and_manifest_before_evaluation(self) -> None:
        self.assertEqual(self.bundle["methodReference"]["methodId"], TRANSPARENT_DECISION_METHOD_ID)
        self.assertEqual(self.bundle["manifestReference"]["manifestId"], self.manifest["manifestId"])
        lineage = self.bundle["freezeLineage"]
        self.assertEqual(lineage["linkedSyntheticEvidenceBundleIds"], [])
        self.assertEqual(lineage["linkedTestResultIds"], [])
        self.assertIsNone(lineage["realDatasetFingerprint"])
        self.assertFalse(lineage["parameterMutationAllowed"])
        self.assertTrue(lineage["newVersionRequiredForAnyChange"])

    def test_eight_equal_factor_weights_and_exact_cutoffs_are_frozen(self) -> None:
        factors = {item["factorId"]: item for item in self.bundle["factorParameters"]}
        self.assertEqual(len(factors), 8)
        self.assertEqual(sum(Decimal(item["weight"]) for item in factors.values()), Decimal("1"))
        self.assertEqual(factors["CONVERSION_COST"]["cutoffs"], ["0.0025", "0.0075", "0.015", "0.03"])
        self.assertEqual(factors["TREND"]["cutoffs"], ["-1", "-0.25", "0.25", "1"])
        self.assertEqual(
            factors["TREND"]["boundaryOperators"],
            ["less_than_or_equal", "less_than_or_equal", "less_than", "less_than"],
        )
        self.assertEqual(
            factors["CONVERSION_COST"]["boundaryOperators"],
            ["less_than_or_equal"] * 4,
        )
        self.assertEqual(factors["VALUATION"]["pointsByRegion"], [2, 1, 0, -1, -2])
        self.assertEqual(factors["LIQUIDITY"]["pointsByRegion"], [-2, -1, 0, 1, 2])

    def test_horizons_and_constraints_match_laboratory_v1(self) -> None:
        horizons = {item["horizonId"]: item for item in self.bundle["horizons"]}
        self.assertEqual(horizons["short"]["laboratoryUiWindowObservations"], 20)
        self.assertEqual(horizons["long"]["laboratoryUiWindowObservations"], 60)
        self.assertTrue(all(item["iranCalibrationState"] == "not_started" for item in horizons.values()))

        source = build_transparent_decision_reference_input()["constraints"]
        expected = {
            "MAXIMUM_ACCEPTABLE_DRAWDOWN_RATE": source["maximumAcceptableDrawdownRate"],
            "MAXIMUM_SINGLE_ASSET_WEIGHT": source["maximumSingleAssetWeight"],
            "MAXIMUM_TURNOVER_WEIGHT": source["maximumTurnoverWeight"],
            "MINIMUM_CASH_WEIGHT": source["minimumCashWeight"],
            "NO_TRADE_BAND_WEIGHT": source["noTradeBandWeight"],
        }
        self.assertEqual(
            {item["constraintId"]: item["value"] for item in self.bundle["constraints"]},
            expected,
        )

    def test_allocation_cost_and_missing_data_rules_are_explicit(self) -> None:
        rules = self.bundle["allocationRules"]
        self.assertEqual(rules["preferenceFloor"], "0.25")
        self.assertEqual(rules["riskBreachMultiplier"], "0.50")
        self.assertEqual(rules["maximumTargetCashWeight"], "0.50")
        self.assertEqual(rules["noTradeComparison"], "absolute_change_strictly_less_than_band")
        self.assertEqual(self.bundle["costRules"]["syntheticComparisonReturnDeduction"], "not_applied")
        self.assertTrue(self.bundle["costRules"]["realAllInCostModelState"].startswith("STATUS_TBD"))
        missing = self.bundle["missingDataRules"]
        self.assertEqual(missing["missingRequiredInput"], "fail_closed")
        self.assertFalse(missing["silentFillAllowed"])
        self.assertFalse(missing["interpolationAllowed"])

    def test_stress_magnitudes_probabilities_and_real_thresholds_remain_unset(self) -> None:
        self.assertEqual(len(self.bundle["stressLabelRegistry"]), 5)
        for label in self.bundle["stressLabelRegistry"]:
            self.assertIsNone(label["magnitude"])
            self.assertIsNone(label["probability"])
            self.assertTrue(label["realCalibrationState"].startswith("STATUS_TBD"))
        self.assertEqual(len(self.bundle["acceptanceThresholds"]), 6)
        for threshold in self.bundle["acceptanceThresholds"]:
            self.assertIsNone(threshold["value"])
            self.assertIsNone(threshold["unit"])
            self.assertFalse(threshold["syntheticOutcomesMaySetValue"])
            self.assertTrue(threshold["state"].startswith("STATUS_TBD"))

    def test_resealed_parameter_outcome_and_permission_drift_fail_closed(self) -> None:
        cases = []
        weight = deepcopy(self.bundle)
        weight["factorParameters"][0]["weight"] = "0.250000000000"
        cases.append(weight)
        threshold = deepcopy(self.bundle)
        threshold["acceptanceThresholds"][0]["value"] = "0.10"
        cases.append(threshold)
        outcome = deepcopy(self.bundle)
        outcome["boundary"]["derivedFromSyntheticOutcomes"] = True
        cases.append(outcome)
        financial = deepcopy(self.bundle)
        financial["boundary"]["financialUseAllowed"] = True
        cases.append(financial)
        for payload in cases:
            with self.subTest(payload=payload):
                with self.assertRaises(ContractViolation):
                    validate_parameter_freeze_bundle(self._reseal(payload), self.manifest)

    def test_canonical_round_trip_rejects_noncanonical_bytes(self) -> None:
        encoded = encode_parameter_freeze_bundle(self.bundle, self.manifest)
        self.assertEqual(decode_parameter_freeze_bundle(encoded, self.manifest), self.bundle)
        with self.assertRaises(ContractViolation):
            decode_parameter_freeze_bundle(encoded.rstrip(), self.manifest)

    def test_schema_locks_boundary_thresholds_and_parameter_mutation(self) -> None:
        path = Path(__file__).resolve().parents[1] / "schemas" / "v1" / "parameter-freeze.schema.json"
        schema = json.loads(path.read_text("utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], PARAMETER_FREEZE_SCHEMA_VERSION)
        boundary = schema["properties"]["boundary"]["const"]
        self.assertFalse(boundary["derivedFromSyntheticOutcomes"])
        self.assertFalse(boundary["financialUseAllowed"])
        self.assertFalse(boundary["executionAllowed"])
        threshold = schema["properties"]["acceptanceThresholds"]["items"]["properties"]
        self.assertIsNone(threshold["value"]["const"])
        self.assertFalse(threshold["syntheticOutcomesMaySetValue"]["const"])
        self.assertFalse(schema["properties"]["freezeLineage"]["const"]["parameterMutationAllowed"])


if __name__ == "__main__":
    unittest.main()
