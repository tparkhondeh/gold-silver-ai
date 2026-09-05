from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_methodology_evidence_gap_report,
    encode_methodology_evidence_gap_report,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.methodology_gaps import (  # noqa: E402
    METHODOLOGY_EVIDENCE_GAP_REPORT_SCHEMA_VERSION,
    METHODOLOGY_EVIDENCE_GAP_REPORT_VERSION,
    build_methodology_evidence_gap_report,
    validate_methodology_evidence_gap_report,
)
from asha_financial_lab.reviewed_methodologies import (  # noqa: E402
    build_reviewed_comparison_methodology_registry,
)


class MethodologyEvidenceGapReportTests(unittest.TestCase):
    def test_report_is_exact_separate_and_permanently_non_decisional(self) -> None:
        report = build_methodology_evidence_gap_report()
        self.assertEqual(
            report["reportId"],
            "ASHA_METHODOLOGY_EVIDENCE_GAP_REPORT_59e7c36d504e9ba89260a1417a7519d7fd5d5c7906e1196c0d1a6da2e63295f7",
        )
        self.assertEqual(
            report["schemaVersion"],
            METHODOLOGY_EVIDENCE_GAP_REPORT_SCHEMA_VERSION,
        )
        self.assertEqual(
            report["reportVersion"], METHODOLOGY_EVIDENCE_GAP_REPORT_VERSION
        )
        self.assertEqual(len(report["methods"]), 3)
        self.assertEqual(
            sum(len(item["criterionGaps"]) for item in report["methods"]), 30
        )
        self.assertEqual(report["summary"], {
            "methodologyCount": 3,
            "criterionCellCount": 30,
            "completenessScoreProduced": False,
            "rankingProduced": False,
            "selectionProduced": False,
        })
        self.assertFalse(report["financialUseAllowed"])
        self.assertFalse(report["executionAllowed"])
        self.assertFalse(report["selectionAllowed"])
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/methodology-evidence-gap-report.schema.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            METHODOLOGY_EVIDENCE_GAP_REPORT_SCHEMA_VERSION,
        )
        self.assertFalse(schema["properties"]["selectionAllowed"]["const"])
        self.assertFalse(schema["additionalProperties"])

    def test_every_registry_cell_is_exposed_with_plain_status(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        report = build_methodology_evidence_gap_report(registry)
        expected_status = {
            "documented_only": "documented",
            "synthetic_mechanics_only": "synthetic_only",
            "not_evaluated": "not_evaluated",
        }
        for registry_entry, method in zip(registry["entries"], report["methods"]):
            self.assertEqual(method["methodologyId"], registry_entry["methodologyId"])
            self.assertEqual(
                [cell["criterionId"] for cell in method["criterionGaps"]],
                [cell["criterionId"] for cell in registry_entry["criterionEvidence"]],
            )
            self.assertEqual(
                [cell["evidenceStatus"] for cell in method["criterionGaps"]],
                [
                    expected_status[cell["evidenceStatus"]]
                    for cell in registry_entry["criterionEvidence"]
                ],
            )

    def test_all_cells_and_methods_keep_unresolved_requirements_visible(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        report = build_methodology_evidence_gap_report(registry)
        for registry_entry, method in zip(registry["entries"], report["methods"]):
            self.assertEqual(
                method["unresolvedDataRequirements"],
                registry_entry["dataRequirements"],
            )
            self.assertEqual(
                method["iranSpecificGaps"], registry_entry["iranSpecificValidation"]
            )
            self.assertEqual(
                method["requiredRobustnessChecks"],
                registry_entry["robustness"]["requiredChecks"],
            )
            for cell in method["criterionGaps"]:
                self.assertTrue(cell["unresolvedRequirements"])
                self.assertIn(
                    cell["evidenceStatus"],
                    {"documented", "synthetic_only", "not_evaluated"},
                )

    def test_source_identity_is_explicitly_not_performance_evidence(self) -> None:
        report = build_methodology_evidence_gap_report()
        for method in report["methods"]:
            self.assertEqual(
                method["sourceIdentityMeaning"],
                "documented_context_only_not_real_or_iranian_performance_evidence",
            )
            self.assertEqual(
                method["selectionEligibility"],
                "blocked_owner_methodology_decision_required",
            )

    def test_canonical_report_round_trips_exactly(self) -> None:
        report = build_methodology_evidence_gap_report()
        document = encode_methodology_evidence_gap_report(report)
        self.assertEqual(decode_methodology_evidence_gap_report(document), report)
        self.assertEqual(build_methodology_evidence_gap_report(), report)

    def test_resealed_report_or_registry_drift_fails_closed(self) -> None:
        report = build_methodology_evidence_gap_report()
        changed = deepcopy(report)
        changed["methods"][0]["criterionGaps"][0]["limitations"] = [
            "Altered limitation"
        ]
        unsigned = {key: value for key, value in changed.items() if key != "reportId"}
        changed["reportId"] = (
            f"ASHA_METHODOLOGY_EVIDENCE_GAP_REPORT_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "not exact"):
            validate_methodology_evidence_gap_report(changed)

        registry = build_reviewed_comparison_methodology_registry()
        registry["entries"][0]["displayName"] += " altered"
        unsigned = {
            key: value for key, value in registry.items() if key != "registryId"
        }
        registry["registryId"] = (
            f"ASHA_METHODOLOGY_EVIDENCE_REGISTRY_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "not exact"):
            build_methodology_evidence_gap_report(registry)


if __name__ == "__main__":
    unittest.main()
