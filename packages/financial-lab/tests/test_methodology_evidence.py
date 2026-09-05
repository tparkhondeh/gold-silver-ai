from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_methodology_evaluation_rubric,
    decode_methodology_evidence_registry,
    encode_methodology_evaluation_rubric,
    encode_methodology_evidence_registry,
)
from asha_financial_lab.comparison_weights import (  # noqa: E402
    INVERSE_VOLATILITY_CONTROL_ID,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.hrp_control import HRP_CONTROL_ID  # noqa: E402
from asha_financial_lab.methodology_evidence import (  # noqa: E402
    METHODOLOGY_EVIDENCE_REGISTRY_SCHEMA_VERSION,
    METHODOLOGY_RUBRIC_SCHEMA_VERSION,
    build_methodology_evaluation_rubric,
    build_methodology_evidence_registry,
    validate_methodology_evaluation_rubric,
    validate_methodology_evidence_registry,
)
from asha_financial_lab.minimum_cvar_control import (  # noqa: E402
    MINIMUM_CVAR_CONTROL_ID,
)


def _entry(methodology_id: str, token: str, criterion_ids: list[str]) -> dict:
    source_id = f"ASHA_METHODOLOGY_SOURCE_{token}_PRIMARY_V1"
    artifact_id = f"ASHA_TEST_ARTIFACT_{token}_V1"
    cells = []
    for criterion_id in criterion_ids:
        if criterion_id == "IRAN_SPECIFIC_VALIDATION":
            status = "not_evaluated"
            references = []
            limitations = ["Iran-specific evidence is deliberately absent"]
        elif criterion_id == "SOURCE_AUTHORITY_AND_CURRENCY":
            status = "documented_only"
            references = [source_id]
            limitations = ["Synthetic contract fixture does not prove source authority"]
        else:
            status = "synthetic_mechanics_only"
            references = [artifact_id]
            limitations = ["Synthetic mechanics cannot establish financial performance"]
        cells.append({
            "criterionId": criterion_id,
            "evidenceStatus": status,
            "evidenceReferences": references,
            "limitations": limitations,
        })
    return {
        "methodologyId": methodology_id,
        "methodologyVersion": 1,
        "displayName": f"[LAB ONLY] {token} comparison control",
        "role": "comparison_control",
        "implementationStatus": "comparison_control_implemented",
        "authoritativeSources": [{
            "sourceId": source_id,
            "sourceVersion": 1,
            "sourceType": "peer_reviewed_primary_research",
            "title": f"[SYNTHETIC CONTRACT FIXTURE] {token} source",
            "authoringBody": "Synthetic Test Authority",
            "locator": f"https://example.invalid/{token.lower()}",
            "publishedOrRevisedOn": "2025-01-01",
            "reviewedOn": "2026-01-01",
            "currencyStatus": "unknown_requires_review",
        }],
        "assumptions": [{
            "assumptionId": f"ASHA_METHOD_ASSUMPTION_{token}_INPUT_STABILITY",
            "statement": "Input relationships remain stable over the evaluated interval",
            "evidenceStatus": "synthetic_mechanics_only",
            "sourceReferences": [source_id],
        }],
        "explainability": {
            "mechanismSummary": "Produces deterministic comparison weights from training-only inputs",
            "requiredDisclosures": [
                "No real financial use is allowed",
                "Training inputs and limitations must be shown",
            ],
            "knownFailureModes": [
                "Input instability can invalidate fitted weights",
                "Synthetic results may not transfer to Iran",
            ],
        },
        "dataRequirements": [{
            "requirementId": f"{token}_POINT_IN_TIME_HISTORY",
            "description": "Licensed point-in-time Iranian observations with explicit availability",
            "minimumEvidenceRule": "STATUS_TBD_OWNER_APPROVAL",
            "iranDataStatus": "synthetic_only",
        }],
        "iranSpecificValidation": {
            "status": "requirements_documented",
            "requiredEvidence": [
                "Licensed Iranian point-in-time history",
                "Separate Iranian out-of-sample validation",
            ],
            "gapCodes": [
                "IRAN_CALIBRATION_NOT_STARTED",
                "IRAN_HISTORY_NOT_AUTHORIZED",
            ],
        },
        "robustness": {
            "status": "synthetic_mechanics_only",
            "requiredChecks": [
                "Point-in-time walk-forward evaluation",
                "Separate stress and regime evaluation",
            ],
            "evidenceArtifactReferences": [artifact_id],
        },
        "criterionEvidence": cells,
        "selectionEligibility": "blocked_owner_methodology_decision_required",
    }


def _inputs() -> tuple[dict, list[dict]]:
    rubric = build_methodology_evaluation_rubric()
    criterion_ids = [item["criterionId"] for item in rubric["criteria"]]
    entries = [
        _entry(HRP_CONTROL_ID, "HRP", criterion_ids),
        _entry(INVERSE_VOLATILITY_CONTROL_ID, "INVERSE_VOLATILITY", criterion_ids),
        _entry(MINIMUM_CVAR_CONTROL_ID, "MINIMUM_CVAR", criterion_ids),
    ]
    return rubric, entries


class MethodologyEvidenceTests(unittest.TestCase):
    def test_rubric_is_predeclared_without_score_threshold_or_selection(self) -> None:
        rubric = build_methodology_evaluation_rubric()
        self.assertEqual(
            rubric["rubricId"],
            "ASHA_METHODOLOGY_RUBRIC_a274da2204ec17ced3825282df10a9e5660bf3a79e1e29e2098fc1de51a74e26",
        )
        self.assertEqual(rubric["schemaVersion"], METHODOLOGY_RUBRIC_SCHEMA_VERSION)
        self.assertEqual(len(rubric["criteria"]), 10)
        self.assertEqual(rubric["scoringPolicy"], "not_defined_owner_approval_required")
        self.assertEqual(rubric["thresholdPolicy"], "not_defined_owner_approval_required")
        self.assertEqual(rubric["aggregationPolicy"], "none_criterion_evidence_only")
        self.assertFalse(rubric["selectionAllowed"])
        self.assertNotIn("winner", rubric)
        self.assertNotIn("weights", rubric)

    def test_registry_keeps_three_methods_and_thirty_evidence_cells_separate(self) -> None:
        rubric, entries = _inputs()
        registry = build_methodology_evidence_registry(1, rubric, entries)
        self.assertEqual(
            registry["registryId"],
            "ASHA_METHODOLOGY_EVIDENCE_REGISTRY_0a39471415212dffc818284e30a8664ecd1b6a922f3b0c9b48a7f9c6cf79c823",
        )
        self.assertEqual(
            registry["schemaVersion"],
            METHODOLOGY_EVIDENCE_REGISTRY_SCHEMA_VERSION,
        )
        self.assertEqual(registry["summary"], {
            "methodologyCount": 3,
            "sourceReferenceCount": 3,
            "criterionCellCount": 30,
            "selectionEligibleCount": 0,
        })
        self.assertEqual(
            [entry["methodologyId"] for entry in registry["entries"]],
            sorted([HRP_CONTROL_ID, INVERSE_VOLATILITY_CONTROL_ID, MINIMUM_CVAR_CONTROL_ID]),
        )
        self.assertFalse(registry["financialUseAllowed"])
        self.assertFalse(registry["executionAllowed"])
        self.assertFalse(registry["selectionAllowed"])

    def test_rubric_and_registry_canonical_artifacts_round_trip(self) -> None:
        rubric, entries = _inputs()
        registry = build_methodology_evidence_registry(1, rubric, entries)
        self.assertEqual(
            decode_methodology_evaluation_rubric(
                encode_methodology_evaluation_rubric(rubric)
            ),
            rubric,
        )
        self.assertEqual(
            decode_methodology_evidence_registry(
                encode_methodology_evidence_registry(registry, rubric), rubric
            ),
            registry,
        )

    def test_resealed_rubric_cannot_add_a_score_or_change_a_criterion(self) -> None:
        rubric = build_methodology_evaluation_rubric()
        rubric["criteria"][0]["requiredEvidenceKinds"].append("weighted_score")
        unsigned = {key: value for key, value in rubric.items() if key != "rubricId"}
        rubric["rubricId"] = f"ASHA_METHODOLOGY_RUBRIC_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "alter criteria"):
            validate_methodology_evaluation_rubric(rubric)

    def test_sources_require_version_authority_and_review_date(self) -> None:
        rubric, entries = _inputs()
        entries[0]["authoritativeSources"] = []
        with self.assertRaisesRegex(ContractViolation, "authoritative source records"):
            build_methodology_evidence_registry(1, rubric, entries)

        rubric, entries = _inputs()
        entries[0]["authoritativeSources"][0]["sourceVersion"] = 2
        with self.assertRaisesRegex(ContractViolation, "ID and version"):
            build_methodology_evidence_registry(1, rubric, entries)

        rubric, entries = _inputs()
        entries[0]["authoritativeSources"][0]["sourceType"] = "marketing_blog"
        with self.assertRaisesRegex(ContractViolation, "not authoritative"):
            build_methodology_evidence_registry(1, rubric, entries)

        rubric, entries = _inputs()
        entries[0]["authoritativeSources"][0]["reviewedOn"] = "2024-01-01"
        with self.assertRaisesRegex(ContractViolation, "precede publication"):
            build_methodology_evidence_registry(1, rubric, entries)

    def test_every_method_needs_every_criterion_in_exact_order(self) -> None:
        rubric, entries = _inputs()
        entries[0]["criterionEvidence"].pop()
        with self.assertRaisesRegex(ContractViolation, "one evidence cell"):
            build_methodology_evidence_registry(1, rubric, entries)

        rubric, entries = _inputs()
        entries[0]["criterionEvidence"][0], entries[0]["criterionEvidence"][1] = (
            entries[0]["criterionEvidence"][1],
            entries[0]["criterionEvidence"][0],
        )
        with self.assertRaisesRegex(ContractViolation, "exact rubric order"):
            build_methodology_evidence_registry(1, rubric, entries)

        rubric, entries = _inputs()
        entries.reverse()
        with self.assertRaisesRegex(ContractViolation, "unique and sorted"):
            build_methodology_evidence_registry(1, rubric, entries)

    def test_resealed_registry_cannot_enable_selection_or_claim_iran_validation(self) -> None:
        rubric, entries = _inputs()
        registry = build_methodology_evidence_registry(1, rubric, entries)
        registry["selectionAllowed"] = True
        unsigned = {key: value for key, value in registry.items() if key != "registryId"}
        registry["registryId"] = (
            f"ASHA_METHODOLOGY_EVIDENCE_REGISTRY_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "no-selection contract"):
            validate_methodology_evidence_registry(registry, rubric)

        rubric, entries = _inputs()
        entries[0]["iranSpecificValidation"]["status"] = "validated"
        with self.assertRaisesRegex(ContractViolation, "cannot be claimed"):
            build_methodology_evidence_registry(1, rubric, entries)

    def test_machine_readable_schemas_preserve_the_safety_boundary(self) -> None:
        rubric_schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/methodology-evaluation-rubric.schema.json")
            .read_text(encoding="utf-8")
        )
        registry_schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/methodology-evidence-registry.schema.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            rubric_schema["properties"]["schemaVersion"]["const"],
            METHODOLOGY_RUBRIC_SCHEMA_VERSION,
        )
        self.assertFalse(rubric_schema["properties"]["selectionAllowed"]["const"])
        self.assertFalse(registry_schema["properties"]["selectionAllowed"]["const"])
        self.assertEqual(
            registry_schema["properties"]["summary"]["properties"]
            ["selectionEligibleCount"]["const"],
            0,
        )
        self.assertFalse(rubric_schema["additionalProperties"])
        self.assertFalse(registry_schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
