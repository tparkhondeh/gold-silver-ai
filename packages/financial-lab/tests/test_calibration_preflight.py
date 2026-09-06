from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import unittest

from asha_financial_lab.artifacts import (
    decode_calibration_preflight,
    encode_calibration_preflight,
)
from asha_financial_lab.calibration_gate_evaluator import build_synthetic_calibration_evidence
from asha_financial_lab.calibration_preflight import (
    CALIBRATION_PREFLIGHT_SCHEMA_VERSION,
    build_synthetic_calibration_preflight,
    validate_synthetic_calibration_preflight,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.iran_calibration_manifest import build_iran_calibration_manifest
from asha_financial_lab.parameter_freeze import build_parameter_freeze_bundle


class CalibrationPreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = build_iran_calibration_manifest()
        self.freeze = build_parameter_freeze_bundle(self.manifest)
        self.evidence = build_synthetic_calibration_evidence(self.manifest)
        self.preflight = build_synthetic_calibration_preflight(
            self.freeze, self.evidence, self.manifest
        )

    @staticmethod
    def _reseal_evidence(payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "bundleId"}
        payload["bundleId"] = f"ASHA_SYNTHETIC_CALIBRATION_EVIDENCE_{fingerprint(unsigned)}"
        return payload

    @staticmethod
    def _reseal_freeze(payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "bundleId"}
        payload["bundleId"] = f"ASHA_SYNTHETIC_PARAMETER_FREEZE_{fingerprint(unsigned)}"
        return payload

    @staticmethod
    def _reseal_preflight(payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "preflightId"}
        payload["preflightId"] = f"ASHA_SYNTHETIC_CALIBRATION_PREFLIGHT_{fingerprint(unsigned)}"
        return payload

    def test_exact_freeze_allows_only_synthetic_g07_mechanics(self) -> None:
        summary = self.preflight["summary"]
        self.assertEqual(summary["preflightMechanicalState"], "passed")
        self.assertEqual(summary["freezeMechanicalState"], "passed")
        self.assertEqual(summary["g07EvidenceState"], "satisfied")
        self.assertEqual(summary["g07MechanicalState"], "passed")
        self.assertEqual(summary["g07RealWorldState"], "not_evaluated")
        self.assertEqual(summary["realCalibrationState"], "not_evaluated")
        self.assertEqual(summary["promotionState"], "blocked_in_synthetic_preflight")
        self.assertFalse(self.preflight["financialUseAllowed"])
        self.assertFalse(self.preflight["executionAllowed"])
        self.assertFalse(self.preflight["parameterMutationAllowed"])

    def test_exact_upstream_identities_and_seven_checks_are_linked(self) -> None:
        self.assertEqual(self.preflight["freezeReference"]["bundleId"], self.freeze["bundleId"])
        self.assertEqual(self.preflight["evidenceReference"]["bundleId"], self.evidence["bundleId"])
        self.assertEqual(len(self.preflight["checks"]), 7)
        self.assertTrue(all(item["state"] == "passed" for item in self.preflight["checks"]))
        self.assertEqual(
            [item["checkId"] for item in self.preflight["checks"][:5]],
            [
                "EXACT_PARAMETER_FREEZE_REPLAYS",
                "FREEZE_PRECEDES_EVALUATION_LINKS",
                "FREEZE_NOT_OUTCOME_DERIVED",
                "REAL_THRESHOLDS_REMAIN_UNSET",
                "REAL_STRESS_VALUES_REMAIN_UNSET",
            ],
        )

    def test_prior_missing_gate_blocks_g07_preflight(self) -> None:
        evidence = build_synthetic_calibration_evidence(self.manifest, "MISSING_HISTORY_CHECK")
        preflight = build_synthetic_calibration_preflight(self.freeze, evidence, self.manifest)
        self.assertEqual(preflight["summary"]["preflightMechanicalState"], "blocked")
        self.assertEqual(preflight["summary"]["g07EvidenceState"], "satisfied")
        self.assertEqual(preflight["summary"]["g07MechanicalState"], "blocked")
        self.assertEqual(preflight["summary"]["firstBlockingGateId"], "G04_HISTORY_AND_COVERAGE")

    def test_missing_or_failed_g07_evidence_blocks_or_fails(self) -> None:
        for state, expected in (("missing", "blocked"), ("failed", "failed")):
            with self.subTest(state=state):
                evidence = deepcopy(self.evidence)
                check = evidence["gateEvidence"][6]["checks"][0]
                check["state"] = state
                if state == "missing":
                    check["syntheticEvidenceId"] = None
                evidence = self._reseal_evidence(evidence)
                preflight = build_synthetic_calibration_preflight(
                    self.freeze, evidence, self.manifest
                )
                self.assertEqual(preflight["summary"]["preflightMechanicalState"], expected)
                self.assertEqual(preflight["summary"]["g07MechanicalState"], expected)

    def test_resealed_freeze_drift_fails_before_preflight(self) -> None:
        for mutate in ("link", "threshold", "outcome", "stress"):
            with self.subTest(mutate=mutate):
                freeze = deepcopy(self.freeze)
                if mutate == "link":
                    freeze["freezeLineage"]["linkedTestResultIds"] = ["SYNTHETIC_RESULT"]
                elif mutate == "threshold":
                    freeze["acceptanceThresholds"][0]["value"] = "0.10"
                elif mutate == "outcome":
                    freeze["boundary"]["derivedFromSyntheticOutcomes"] = True
                else:
                    freeze["stressLabelRegistry"][0]["magnitude"] = "-0.20"
                with self.assertRaises(ContractViolation):
                    build_synthetic_calibration_preflight(
                        self._reseal_freeze(freeze), self.evidence, self.manifest
                    )

    def test_resealed_permission_or_summary_drift_cannot_replay(self) -> None:
        for mutate in ("financial", "promotion", "g07_real"):
            with self.subTest(mutate=mutate):
                preflight = deepcopy(self.preflight)
                if mutate == "financial":
                    preflight["financialUseAllowed"] = True
                elif mutate == "promotion":
                    preflight["summary"]["promotionState"] = "approved"
                else:
                    preflight["summary"]["g07RealWorldState"] = "passed"
                with self.assertRaises(ContractViolation):
                    validate_synthetic_calibration_preflight(
                        self._reseal_preflight(preflight),
                        self.freeze,
                        self.evidence,
                        self.manifest,
                    )

    def test_canonical_round_trip_rejects_noncanonical_document(self) -> None:
        encoded = encode_calibration_preflight(
            self.preflight, self.freeze, self.evidence, self.manifest
        )
        self.assertEqual(
            decode_calibration_preflight(
                encoded, self.freeze, self.evidence, self.manifest
            ),
            self.preflight,
        )
        with self.assertRaises(ContractViolation):
            decode_calibration_preflight(
                encoded.rstrip(), self.freeze, self.evidence, self.manifest
            )

    def test_schema_permanently_locks_real_use_and_promotion(self) -> None:
        path = Path(__file__).resolve().parents[1] / "schemas" / "v1" / "calibration-preflight.schema.json"
        schema = json.loads(path.read_text("utf-8"))
        properties = schema["properties"]
        self.assertEqual(properties["schemaVersion"]["const"], CALIBRATION_PREFLIGHT_SCHEMA_VERSION)
        self.assertFalse(properties["financialUseAllowed"]["const"])
        self.assertFalse(properties["executionAllowed"]["const"])
        self.assertFalse(properties["parameterMutationAllowed"]["const"])
        summary = properties["summary"]["properties"]
        self.assertEqual(summary["g07RealWorldState"]["const"], "not_evaluated")
        self.assertEqual(summary["promotionState"]["const"], "blocked_in_synthetic_preflight")


if __name__ == "__main__":
    unittest.main()
