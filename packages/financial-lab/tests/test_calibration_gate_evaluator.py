from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import unittest

from asha_financial_lab.artifacts import (
    decode_calibration_gate_result,
    decode_synthetic_calibration_evidence,
    encode_calibration_gate_result,
    encode_synthetic_calibration_evidence,
)
from asha_financial_lab.calibration_gate_evaluator import (
    CALIBRATION_EVIDENCE_SCHEMA_VERSION,
    CALIBRATION_GATE_RESULT_SCHEMA_VERSION,
    build_synthetic_calibration_evidence,
    evaluate_synthetic_calibration_evidence,
    validate_calibration_gate_result,
    validate_synthetic_calibration_evidence,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.iran_calibration_manifest import build_iran_calibration_manifest


class CalibrationGateEvaluatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = build_iran_calibration_manifest()
        self.evidence = build_synthetic_calibration_evidence(self.manifest)
        self.result = evaluate_synthetic_calibration_evidence(self.evidence, self.manifest)

    @staticmethod
    def _reseal_evidence(payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "bundleId"}
        payload["bundleId"] = f"ASHA_SYNTHETIC_CALIBRATION_EVIDENCE_{fingerprint(unsigned)}"
        return payload

    @staticmethod
    def _reseal_result(payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "resultId"}
        payload["resultId"] = f"ASHA_SYNTHETIC_CALIBRATION_GATE_RESULT_{fingerprint(unsigned)}"
        return payload

    def test_all_satisfied_fixture_passes_only_synthetic_mechanics(self) -> None:
        self.assertEqual(len(self.result["gateResults"]), 10)
        self.assertTrue(all(item["mechanicalState"] == "passed" for item in self.result["gateResults"]))
        self.assertTrue(all(item["realWorldState"] == "not_evaluated" for item in self.result["gateResults"]))
        self.assertEqual(self.result["summary"]["mechanicalState"], "passed")
        self.assertEqual(self.result["summary"]["passedGateCount"], 10)
        self.assertIsNone(self.result["summary"]["firstBlockingGateId"])
        self.assertEqual(self.result["summary"]["promotionState"], "blocked_in_synthetic_evaluator")
        self.assertFalse(self.result["financialUseAllowed"])
        self.assertFalse(self.result["executionAllowed"])
        self.assertFalse(self.result["parameterMutationAllowed"])

    def test_missing_history_blocks_itself_and_every_later_gate(self) -> None:
        evidence = build_synthetic_calibration_evidence(self.manifest, "MISSING_HISTORY_CHECK")
        result = evaluate_synthetic_calibration_evidence(evidence, self.manifest)
        self.assertEqual(result["summary"]["mechanicalState"], "blocked")
        self.assertEqual(result["summary"]["passedGateCount"], 3)
        self.assertEqual(result["summary"]["firstBlockingGateId"], "G04_HISTORY_AND_COVERAGE")
        history = result["gateResults"][3]
        self.assertEqual(history["mechanicalState"], "blocked")
        self.assertEqual(history["evidenceState"], "missing")
        self.assertEqual(history["missingCheckIds"], ["MINIMUM_VALID_OBSERVATIONS_MET"])
        self.assertTrue(all(item["mechanicalState"] == "blocked" for item in result["gateResults"][3:]))

    def test_failed_point_in_time_gate_fails_then_blocks_dependents(self) -> None:
        evidence = build_synthetic_calibration_evidence(self.manifest, "FAILED_POINT_IN_TIME_CHECK")
        result = evaluate_synthetic_calibration_evidence(evidence, self.manifest)
        self.assertEqual(result["summary"]["mechanicalState"], "failed")
        self.assertEqual(result["summary"]["passedGateCount"], 2)
        self.assertEqual(result["summary"]["firstBlockingGateId"], "G03_POINT_IN_TIME_INTEGRITY")
        point_in_time = result["gateResults"][2]
        self.assertEqual(point_in_time["mechanicalState"], "failed")
        self.assertEqual(point_in_time["failedCheckIds"], ["AVAILABLE_AT_CUTOFF_ENFORCED"])
        self.assertTrue(all(item["mechanicalState"] == "blocked" for item in result["gateResults"][3:]))

    def test_bundle_has_exact_twenty_synthetic_checks_and_no_market_data(self) -> None:
        self.assertEqual(len(self.evidence["gateEvidence"]), 10)
        self.assertEqual(sum(len(item["checks"]) for item in self.evidence["gateEvidence"]), 20)
        for gate in self.evidence["gateEvidence"]:
            for check in gate["checks"]:
                self.assertTrue(check["syntheticEvidenceId"].startswith("ASHA_SYNTHETIC_GATE_EVIDENCE_"))
        boundary = self.evidence["boundary"]
        self.assertFalse(boundary["containsMarketObservations"])
        self.assertFalse(boundary["containsProviderCredentials"])
        self.assertFalse(boundary["realDataIngestionAllowed"])

    def test_resealed_real_boundary_and_check_omission_fail_closed(self) -> None:
        real = deepcopy(self.evidence)
        real["boundary"]["containsMarketObservations"] = True
        with self.assertRaises(ContractViolation):
            validate_synthetic_calibration_evidence(self._reseal_evidence(real), self.manifest)

        omitted = deepcopy(self.evidence)
        omitted["gateEvidence"][0]["checks"].pop()
        with self.assertRaises(ContractViolation):
            validate_synthetic_calibration_evidence(self._reseal_evidence(omitted), self.manifest)

    def test_missing_reference_and_resealed_result_drift_fail_closed(self) -> None:
        inconsistent = deepcopy(self.evidence)
        inconsistent["gateEvidence"][0]["checks"][0]["state"] = "missing"
        with self.assertRaises(ContractViolation):
            validate_synthetic_calibration_evidence(self._reseal_evidence(inconsistent), self.manifest)

        promoted = deepcopy(self.result)
        promoted["summary"]["promotionState"] = "approved"
        with self.assertRaises(ContractViolation):
            validate_calibration_gate_result(
                self._reseal_result(promoted), self.evidence, self.manifest
            )

    def test_both_artifacts_round_trip_only_in_canonical_form(self) -> None:
        evidence_bytes = encode_synthetic_calibration_evidence(self.evidence, self.manifest)
        self.assertEqual(
            decode_synthetic_calibration_evidence(evidence_bytes, self.manifest),
            self.evidence,
        )
        result_bytes = encode_calibration_gate_result(self.result, self.evidence, self.manifest)
        self.assertEqual(
            decode_calibration_gate_result(result_bytes, self.evidence, self.manifest),
            self.result,
        )
        with self.assertRaises(ContractViolation):
            decode_synthetic_calibration_evidence(evidence_bytes.rstrip(), self.manifest)

    def test_schemas_lock_synthetic_boundary_and_real_promotion(self) -> None:
        schema_dir = Path(__file__).resolve().parents[1] / "schemas" / "v1"
        evidence_schema = json.loads((schema_dir / "calibration-gate-evidence.schema.json").read_text("utf-8"))
        result_schema = json.loads((schema_dir / "calibration-gate-result.schema.json").read_text("utf-8"))
        self.assertEqual(evidence_schema["properties"]["schemaVersion"]["const"], CALIBRATION_EVIDENCE_SCHEMA_VERSION)
        self.assertEqual(result_schema["properties"]["schemaVersion"]["const"], CALIBRATION_GATE_RESULT_SCHEMA_VERSION)
        boundary = evidence_schema["properties"]["boundary"]["const"]
        self.assertFalse(boundary["containsMarketObservations"])
        self.assertFalse(boundary["containsProviderCredentials"])
        self.assertFalse(result_schema["properties"]["financialUseAllowed"]["const"])
        self.assertFalse(result_schema["properties"]["executionAllowed"]["const"])
        self.assertFalse(result_schema["properties"]["parameterMutationAllowed"]["const"])


if __name__ == "__main__":
    unittest.main()
