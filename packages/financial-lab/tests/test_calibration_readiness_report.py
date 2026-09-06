from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (
    decode_calibration_readiness_report,
    encode_calibration_readiness_report,
)
from asha_financial_lab.calibration_gate_evaluator import (
    build_synthetic_calibration_evidence,
    evaluate_synthetic_calibration_evidence,
)
from asha_financial_lab.calibration_preflight import build_synthetic_calibration_preflight
from asha_financial_lab.calibration_readiness_report import (
    CALIBRATION_READINESS_REPORT_SCHEMA_VERSION,
    build_calibration_readiness_report,
    validate_calibration_readiness_report,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint
from asha_financial_lab.iran_calibration_manifest import build_iran_calibration_manifest
from asha_financial_lab.parameter_freeze import build_parameter_freeze_bundle


class CalibrationReadinessReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = build_iran_calibration_manifest()
        self.freeze = build_parameter_freeze_bundle(self.manifest)
        self.evidence = build_synthetic_calibration_evidence(self.manifest)
        self.preflight = build_synthetic_calibration_preflight(
            self.freeze, self.evidence, self.manifest
        )
        self.report = build_calibration_readiness_report(
            self.manifest, self.freeze, self.evidence, self.preflight
        )

    @staticmethod
    def _reseal_report(payload: dict) -> dict:
        unsigned = {key: value for key, value in payload.items() if key != "reportId"}
        payload["reportId"] = f"ASHA_SYNTHETIC_CALIBRATION_READINESS_{fingerprint(unsigned)}"
        return payload

    def test_ten_gates_are_plain_language_but_real_states_stay_unevaluated(self) -> None:
        self.assertEqual(len(self.report["gateReadiness"]), 10)
        for item in self.report["gateReadiness"]:
            self.assertTrue(item["ownerTitleFa"])
            self.assertTrue(item["ownerExplanationFa"])
            self.assertIn("واقعی انجام نشده", item["ownerStateFa"])
            self.assertEqual(item["realWorldState"], "not_evaluated")
            self.assertGreater(item["remainingEvidenceCount"], 0)
            self.assertEqual(item["remainingEvidenceCount"], len(item["remainingEvidence"]))
        self.assertEqual(self.report["summary"]["realCalibrationState"], "not_evaluated")
        self.assertEqual(
            self.report["summary"]["realReadinessState"],
            "blocked_until_licensed_iran_evidence",
        )

    def test_exact_five_upstream_identities_are_retained(self) -> None:
        gate_result = evaluate_synthetic_calibration_evidence(self.evidence, self.manifest)
        self.assertEqual(
            self.report["generatedFrom"],
            {
                "manifestId": self.manifest["manifestId"],
                "freezeBundleId": self.freeze["bundleId"],
                "evidenceBundleId": self.evidence["bundleId"],
                "gateResultId": gate_result["resultId"],
                "preflightId": self.preflight["preflightId"],
            },
        )

    def test_real_evidence_inventory_is_derived_from_manifest_and_freeze(self) -> None:
        gates = {item["gateId"]: item for item in self.report["gateReadiness"]}
        history_items = gates["G04_HISTORY_AND_COVERAGE"]["remainingEvidence"]
        self.assertEqual(len(history_items), 8)
        concentration = next(item for item in history_items if item["evidenceId"].startswith("CONCENTRATION_"))
        self.assertIn("252", concentration["ownerLabelFa"])
        self.assertIn("100.000000٪", concentration["ownerLabelFa"])
        self.assertEqual(len(gates["G05_IRAN_MARKET_EVIDENCE"]["remainingEvidence"]), 18)
        self.assertEqual(len(gates["G07_PARAMETER_FREEZE"]["remainingEvidence"]), 11)
        self.assertEqual(len(gates["G09_PREDECLARED_ACCEPTANCE"]["remainingEvidence"]), 7)
        self.assertTrue(all(
            evidence["state"] == "required_not_supplied"
            for gate in gates.values()
            for evidence in gate["remainingEvidence"]
        ))

    def test_failed_and_missing_synthetic_states_are_explained_without_real_promotion(self) -> None:
        cases = (
            ("FAILED_POINT_IN_TIME_CHECK", "failed", "شکست خورد"),
            ("MISSING_HISTORY_CHECK", "blocked", "متوقف است"),
        )
        for scenario, expected_state, phrase in cases:
            with self.subTest(scenario=scenario):
                evidence = build_synthetic_calibration_evidence(self.manifest, scenario)
                preflight = build_synthetic_calibration_preflight(
                    self.freeze, evidence, self.manifest
                )
                report = build_calibration_readiness_report(
                    self.manifest, self.freeze, evidence, preflight
                )
                affected = next(
                    item for item in report["gateReadiness"]
                    if item["syntheticMechanicalState"] == expected_state
                )
                self.assertIn(phrase, affected["ownerStateFa"])
                self.assertIn(
                    "خطا دارد" if expected_state == "failed" else "متوقف است",
                    report["summary"]["ownerHeadlineFa"],
                )
                self.assertEqual(affected["realWorldState"], "not_evaluated")
                self.assertFalse(report["financialUseAllowed"])

    def test_foreign_preflight_cannot_be_paired_with_different_evidence(self) -> None:
        evidence = build_synthetic_calibration_evidence(self.manifest, "MISSING_HISTORY_CHECK")
        with self.assertRaises(ContractViolation):
            build_calibration_readiness_report(
                self.manifest, self.freeze, evidence, self.preflight
            )

    def test_resealed_text_permission_and_evidence_omission_fail_closed(self) -> None:
        cases = []
        text_drift = deepcopy(self.report)
        text_drift["summary"]["ownerHeadlineFa"] = "آمادهٔ استفاده"
        cases.append(text_drift)
        permission = deepcopy(self.report)
        permission["financialUseAllowed"] = True
        cases.append(permission)
        omission = deepcopy(self.report)
        omission["gateReadiness"][0]["remainingEvidence"].pop()
        omission["gateReadiness"][0]["remainingEvidenceCount"] -= 1
        cases.append(omission)
        for payload in cases:
            with self.subTest():
                with self.assertRaises(ContractViolation):
                    validate_calibration_readiness_report(
                        self._reseal_report(payload),
                        self.manifest,
                        self.freeze,
                        self.evidence,
                        self.preflight,
                    )

    def test_canonical_round_trip_rejects_noncanonical_document(self) -> None:
        encoded = encode_calibration_readiness_report(
            self.report, self.manifest, self.freeze, self.evidence, self.preflight
        )
        self.assertEqual(
            decode_calibration_readiness_report(
                encoded, self.manifest, self.freeze, self.evidence, self.preflight
            ),
            self.report,
        )
        with self.assertRaises(ContractViolation):
            decode_calibration_readiness_report(
                encoded.rstrip(), self.manifest, self.freeze, self.evidence, self.preflight
            )

    def test_schema_locks_no_score_request_claim_or_permission(self) -> None:
        path = Path(__file__).resolve().parents[1] / "schemas" / "v1" / "calibration-readiness-report.schema.json"
        schema = json.loads(path.read_text("utf-8"))
        properties = schema["properties"]
        self.assertEqual(
            properties["schemaVersion"]["const"],
            CALIBRATION_READINESS_REPORT_SCHEMA_VERSION,
        )
        boundary = properties["boundary"]["const"]
        self.assertFalse(boundary["realDataRequestCreated"])
        self.assertFalse(boundary["methodScoreProduced"])
        self.assertFalse(boundary["methodRankingProduced"])
        self.assertFalse(boundary["performanceClaimAllowed"])
        self.assertFalse(boundary["thresholdSelectionAllowed"])
        self.assertFalse(properties["financialUseAllowed"]["const"])
        self.assertFalse(properties["executionAllowed"]["const"])
        self.assertFalse(properties["parameterMutationAllowed"]["const"])

    def test_checked_in_web_reference_is_the_exact_canonical_report(self) -> None:
        path = (
            Path(__file__).resolve().parents[3]
            / "apps"
            / "web"
            / "public"
            / "artifacts"
            / "calibration-readiness-report.v1.json"
        )
        self.assertEqual(
            path.read_bytes(),
            encode_calibration_readiness_report(
                self.report,
                self.manifest,
                self.freeze,
                self.evidence,
                self.preflight,
            ),
        )


if __name__ == "__main__":
    unittest.main()
