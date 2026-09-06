from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from asha_financial_lab.artifacts import encode_calibration_intake_plan, decode_calibration_intake_plan
from asha_financial_lab.calibration_intake_plan import build_calibration_intake_plan, validate_calibration_intake_plan
from asha_financial_lab.calibration_readiness_report import build_calibration_readiness_report
from asha_financial_lab.calibration_gate_evaluator import build_synthetic_calibration_evidence
from asha_financial_lab.calibration_preflight import build_synthetic_calibration_preflight
from asha_financial_lab.iran_calibration_manifest import build_iran_calibration_manifest
from asha_financial_lab.parameter_freeze import build_parameter_freeze_bundle
from asha_financial_lab.contracts import ContractViolation, fingerprint


class CalibrationIntakePlanTests(unittest.TestCase):
    def setUp(self):
        manifest = build_iran_calibration_manifest()
        freeze = build_parameter_freeze_bundle(manifest)
        evidence = build_synthetic_calibration_evidence(manifest)
        preflight = build_synthetic_calibration_preflight(freeze, evidence, manifest)
        report = build_calibration_readiness_report(manifest, freeze, evidence, preflight)
        self.upstream = (report, manifest, freeze, evidence, preflight)
        self.plan = build_calibration_intake_plan(*self.upstream)

    def reject_resealed(self, payload):
        unsigned = {key: value for key, value in payload.items() if key != "planId"}
        payload["planId"] = f"ASHA_SYNTHETIC_CALIBRATION_INTAKE_{fingerprint(unsigned)}"
        with self.assertRaises(ContractViolation):
            validate_calibration_intake_plan(payload, *self.upstream)

    def test_exact_order_complete_inventory_and_no_input_mutation(self):
        original = deepcopy(self.upstream)
        expected = [(gate["gateId"], item["evidenceId"]) for gate in self.upstream[0]["gateReadiness"] for item in gate["remainingEvidence"]]
        self.assertEqual([(slot["gateId"], slot["evidenceId"]) for slot in self.plan["slots"]], expected)
        self.assertEqual(len(expected), 64)
        self.assertEqual(len(set(expected)), 64)
        self.assertTrue(all(slot["state"] == "not_collected" and slot["content"] is None for slot in self.plan["slots"]))
        self.assertEqual(build_calibration_intake_plan(*self.upstream), self.plan)
        self.assertEqual(self.upstream, original)

    def test_missing_duplicate_foreign_and_reordered_slots_are_rejected(self):
        for mutate in (
            lambda slots: slots.pop(),
            lambda slots: slots.__setitem__(1, deepcopy(slots[0])),
            lambda slots: slots[0].__setitem__("evidenceId", "FOREIGN_EVIDENCE"),
            lambda slots: slots.reverse(),
        ):
            plan = deepcopy(self.plan)
            mutate(plan["slots"])
            self.reject_resealed(plan)

    def test_no_market_content_identity_credentials_score_or_gate_can_attach(self):
        for key, value in (("content", {"price": "100"}), ("provider", "EXAMPLE"), ("credential", "SYNTHETIC_TEST_ONLY"), ("score", 1), ("state", "collected"), ("realWorldState", "passed")):
            with self.subTest(key=key):
                plan = deepcopy(self.plan)
                plan["slots"][0][key] = value
                self.reject_resealed(plan)

    def test_permissions_counts_and_type_confusion_fail_closed(self):
        for key in ("realDataRequestCreated", "financialUseAllowed", "executionAllowed", "parameterMutationAllowed"):
            for value in (True, 0):
                plan = deepcopy(self.plan)
                plan[key] = value
                self.reject_resealed(plan)
        plan = deepcopy(self.plan)
        plan["summary"]["collectedCount"] = False
        self.reject_resealed(plan)

    def test_upstream_report_is_revalidated_even_if_resealed(self):
        upstream = deepcopy(self.upstream)
        upstream[0]["gateReadiness"][0]["remainingEvidence"].pop()
        unsigned = {key: value for key, value in upstream[0].items() if key != "reportId"}
        upstream[0]["reportId"] = f"ASHA_SYNTHETIC_CALIBRATION_READINESS_{fingerprint(unsigned)}"
        with self.assertRaises(ContractViolation):
            build_calibration_intake_plan(*upstream)

    def test_canonical_round_trip_and_ambiguous_transport_rejection(self):
        document = encode_calibration_intake_plan(self.plan, *self.upstream)
        self.assertEqual(decode_calibration_intake_plan(document, *self.upstream), self.plan)
        for invalid in (document.rstrip(), b'{"x":1,"x":2}\n', b'\xff'):
            with self.assertRaises(ContractViolation):
                decode_calibration_intake_plan(invalid, *self.upstream)

    def test_blocked_upstream_does_not_advance_any_collection(self):
        _, manifest, freeze, _, _ = self.upstream
        evidence = build_synthetic_calibration_evidence(manifest, "MISSING_HISTORY_CHECK")
        preflight = build_synthetic_calibration_preflight(freeze, evidence, manifest)
        report = build_calibration_readiness_report(manifest, freeze, evidence, preflight)
        plan = build_calibration_intake_plan(report, manifest, freeze, evidence, preflight)
        self.assertNotEqual(plan["readinessReportId"], self.plan["readinessReportId"])
        self.assertEqual(plan["summary"], {"requiredCount": 64, "collectedCount": 0})
        self.assertEqual(plan["realWorldState"], "not_evaluated")


if __name__ == "__main__":
    unittest.main()
