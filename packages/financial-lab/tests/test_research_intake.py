from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_research_candidate_intake,
    encode_research_candidate_intake,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.methodology_evidence import (  # noqa: E402
    build_methodology_evaluation_rubric,
)
from asha_financial_lab.methodology_gaps import (  # noqa: E402
    build_methodology_evidence_gap_report,
)
from asha_financial_lab.research_intake import (  # noqa: E402
    RESEARCH_CANDIDATE_INTAKE_SCHEMA_VERSION,
    build_research_candidate_intake,
    validate_research_candidate_intake,
)


def _candidate(token: str, reviewed_on: str = "2026-09-05") -> dict:
    source_id = f"ASHA_METHODOLOGY_SOURCE_{token}_PRIMARY_V1"
    criterion_ids = [
        item["criterionId"]
        for item in build_methodology_evaluation_rubric()["criteria"]
    ]
    cells = []
    for criterion_id in criterion_ids:
        is_source = criterion_id == "SOURCE_AUTHORITY_AND_CURRENCY"
        cells.append({
            "criterionId": criterion_id,
            "evidenceStatus": "documented_only" if is_source else "not_evaluated",
            "evidenceReferences": [source_id] if is_source else [],
            "unresolvedRequirements": [
                "PRIMARY_SOURCE_SUPERSESSION_REVIEW_REMAINS_REQUIRED"
                if is_source else f"{criterion_id}_EVIDENCE_NOT_EVALUATED"
            ],
        })
    return {
        "candidateId": f"ASHA_RESEARCH_CANDIDATE_{token}_V1",
        "candidateVersion": 1,
        "displayName": f"[RESEARCH ONLY] {token} synthetic contract fixture",
        "researchQuestion": "Could this defined mechanism merit later independent evaluation?",
        "searchRecord": {
            "searchedOn": "2026-09-04",
            "searchMethod": "manual_recorded_no_network_automation",
            "searchScope": "Primary research and official method documentation only",
            "reviewedByRole": "human_researcher_with_ai_discovery_support",
        },
        "authoritativeSources": [{
            "sourceId": source_id,
            "sourceVersion": 1,
            "sourceType": "peer_reviewed_primary_research",
            "title": f"[SYNTHETIC CONTRACT FIXTURE] {token} source",
            "authoringBody": "Synthetic Test Authority",
            "locator": f"https://example.invalid/{token.lower()}",
            "publishedOrRevisedOn": "2025-01-01",
            "reviewedOn": reviewed_on,
            "currencyStatus": "unknown_requires_review",
        }],
        "candidateScope": {
            "mechanismClaim": "A bounded mechanism definition for research intake testing",
            "comparisonBoundary": "May later be compared only after a separate implementation gate",
            "excludedClaims": [
                "CURRENT_BEST_METHOD",
                "IRAN_FITNESS",
                "OPERATIONAL_PERFORMANCE",
                "SELECTION_OR_APPROVAL",
            ],
        },
        "nonEquivalenceLimits": [
            "The fixture does not represent or validate any real methodology",
        ],
        "criterionGaps": cells,
        "implementationStatus": "not_implemented",
        "iranFitnessStatus": "not_evaluated",
        "selectionEligibility": "blocked_owner_methodology_decision_required",
    }


def _inputs() -> tuple[dict, list[dict]]:
    gap_report = build_methodology_evidence_gap_report()
    candidates = sorted(
        [_candidate("ALPHA"), _candidate("BETA")],
        key=lambda item: (item["candidateId"], item["candidateVersion"]),
    )
    return gap_report, candidates


class ResearchCandidateIntakeTests(unittest.TestCase):
    def test_intake_lists_candidates_without_advancing_them(self) -> None:
        gap_report, candidates = _inputs()
        intake = build_research_candidate_intake(1, gap_report, candidates)
        self.assertEqual(
            intake["intakeId"],
            "ASHA_RESEARCH_CANDIDATE_INTAKE_d3d61f506890a198fe1c49b981345a4fe2d2782be7c99f892f69f79e51ab8511",
        )
        self.assertEqual(intake["schemaVersion"], RESEARCH_CANDIDATE_INTAKE_SCHEMA_VERSION)
        self.assertEqual(intake["summary"], {
            "candidateCount": 2,
            "implementedCount": 0,
            "selectionEligibleCount": 0,
        })
        self.assertFalse(intake["implementationAllowed"])
        self.assertFalse(intake["selectionAllowed"])
        self.assertFalse(intake["financialUseAllowed"])

    def test_primary_source_and_review_chronology_are_required(self) -> None:
        gap_report, candidates = _inputs()
        candidates[0]["authoritativeSources"][0]["sourceType"] = "marketing_blog"
        with self.assertRaisesRegex(ContractViolation, "not authoritative"):
            build_research_candidate_intake(1, gap_report, candidates)

        gap_report, candidates = _inputs()
        candidates[0]["authoritativeSources"][0]["reviewedOn"] = "2026-09-03"
        with self.assertRaisesRegex(ContractViolation, "chronology"):
            build_research_candidate_intake(1, gap_report, candidates)

    def test_scope_and_non_equivalence_are_mandatory(self) -> None:
        gap_report, candidates = _inputs()
        candidates[0]["candidateScope"]["excludedClaims"].pop()
        with self.assertRaisesRegex(ContractViolation, "prohibited claim"):
            build_research_candidate_intake(1, gap_report, candidates)

        gap_report, candidates = _inputs()
        candidates[0]["nonEquivalenceLimits"] = []
        with self.assertRaisesRegex(ContractViolation, "bounded list"):
            build_research_candidate_intake(1, gap_report, candidates)

    def test_all_criteria_remain_explicit_and_not_evaluated(self) -> None:
        gap_report, candidates = _inputs()
        intake = build_research_candidate_intake(1, gap_report, candidates)
        for candidate in intake["candidates"]:
            self.assertEqual(len(candidate["criterionGaps"]), 10)
            self.assertEqual(
                candidate["criterionGaps"][0]["evidenceStatus"], "documented_only"
            )
            for cell in candidate["criterionGaps"][1:]:
                self.assertEqual(cell["evidenceStatus"], "not_evaluated")
                self.assertEqual(cell["evidenceReferences"], [])
                self.assertTrue(cell["unresolvedRequirements"])

        changed = deepcopy(candidates)
        changed[0]["criterionGaps"].pop()
        with self.assertRaisesRegex(ContractViolation, "every criterion gap"):
            build_research_candidate_intake(1, gap_report, changed)

    def test_implementation_iran_fitness_and_selection_fail_closed(self) -> None:
        gap_report, candidates = _inputs()
        candidates[0]["implementationStatus"] = "implemented"
        with self.assertRaisesRegex(ContractViolation, "cannot authorize implementation"):
            build_research_candidate_intake(1, gap_report, candidates)

        gap_report, candidates = _inputs()
        candidates[0]["iranFitnessStatus"] = "validated"
        with self.assertRaisesRegex(ContractViolation, "Iranian fitness"):
            build_research_candidate_intake(1, gap_report, candidates)

        gap_report, candidates = _inputs()
        candidates[0]["selectionEligibility"] = "eligible"
        with self.assertRaisesRegex(ContractViolation, "cannot enable candidate selection"):
            build_research_candidate_intake(1, gap_report, candidates)

        gap_report, candidates = _inputs()
        intake = build_research_candidate_intake(1, gap_report, candidates)
        intake["candidates"][0]["score"] = 1
        unsigned = {key: value for key, value in intake.items() if key != "intakeId"}
        intake["intakeId"] = (
            f"ASHA_RESEARCH_CANDIDATE_INTAKE_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "unexpected fields"):
            validate_research_candidate_intake(intake, gap_report)

    def test_search_is_recorded_but_never_automated(self) -> None:
        gap_report, candidates = _inputs()
        candidates[0]["searchRecord"]["searchMethod"] = "automatic_network_search"
        with self.assertRaisesRegex(ContractViolation, "cannot be automated"):
            build_research_candidate_intake(1, gap_report, candidates)

    def test_canonical_artifact_is_bound_to_exact_gap_report(self) -> None:
        gap_report, candidates = _inputs()
        intake = build_research_candidate_intake(1, gap_report, candidates)
        document = encode_research_candidate_intake(intake, gap_report)
        self.assertEqual(
            decode_research_candidate_intake(document, gap_report), intake
        )
        changed = deepcopy(intake)
        changed["candidates"][0]["researchQuestion"] += " altered"
        unsigned = {key: value for key, value in changed.items() if key != "intakeId"}
        changed["intakeId"] = (
            f"ASHA_RESEARCH_CANDIDATE_INTAKE_{fingerprint(unsigned)}"
        )
        self.assertEqual(
            validate_research_candidate_intake(changed, gap_report), changed
        )

        foreign = deepcopy(gap_report)
        foreign["summary"]["methodologyCount"] = 99
        with self.assertRaises(ContractViolation):
            validate_research_candidate_intake(intake, foreign)

    def test_machine_schema_preserves_every_safety_lock(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/research-candidate-intake.schema.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            RESEARCH_CANDIDATE_INTAKE_SCHEMA_VERSION,
        )
        self.assertFalse(schema["properties"]["implementationAllowed"]["const"])
        self.assertFalse(schema["properties"]["selectionAllowed"]["const"])
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
