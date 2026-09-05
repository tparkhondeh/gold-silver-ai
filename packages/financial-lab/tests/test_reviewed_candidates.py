from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_reviewed_candidate_discovery_catalog,
    encode_reviewed_candidate_discovery_catalog,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.reviewed_candidates import (  # noqa: E402
    REVIEWED_CANDIDATE_CATALOG_VERSION,
    REVIEWED_CANDIDATE_SEARCHED_ON,
    build_reviewed_candidate_discovery_catalog,
    validate_reviewed_candidate_discovery_catalog,
)


class ReviewedCandidateDiscoveryCatalogTests(unittest.TestCase):
    def test_catalog_is_exact_bounded_and_unranked(self) -> None:
        catalog = build_reviewed_candidate_discovery_catalog()
        self.assertEqual(
            catalog["intakeId"],
            "ASHA_RESEARCH_CANDIDATE_INTAKE_0cfb8780477986ebd4d4e67af7377d5a5dd3154119c57d56cea76f469b580244",
        )
        self.assertEqual(catalog["intakeVersion"], REVIEWED_CANDIDATE_CATALOG_VERSION)
        self.assertEqual(catalog["summary"], {
            "candidateCount": 4,
            "implementedCount": 0,
            "selectionEligibleCount": 0,
        })
        self.assertEqual(
            [candidate["candidateId"] for candidate in catalog["candidates"]],
            sorted(candidate["candidateId"] for candidate in catalog["candidates"]),
        )
        self.assertFalse(catalog["implementationAllowed"])
        self.assertFalse(catalog["selectionAllowed"])

    def test_exact_primary_publication_identifiers_and_dates_are_recorded(self) -> None:
        catalog = build_reviewed_candidate_discovery_catalog()
        sources = {
            candidate["candidateId"]: candidate["authoritativeSources"][0]
            for candidate in catalog["candidates"]
        }
        expected = {
            "ASHA_RESEARCH_CANDIDATE_FAST_HRP_V1": (
                "https://doi.org/10.1007/s10479-026-07149-2", "2026-03-09"
            ),
            "ASHA_RESEARCH_CANDIDATE_GENERALIZED_RISK_PARITY_V1": (
                "https://doi.org/10.1007/s10898-020-00915-x", "2020-06-19"
            ),
            "ASHA_RESEARCH_CANDIDATE_HCAA_V1": (
                "https://doi.org/10.3905/jpm.2018.44.2.089", "2017-12-22"
            ),
            "ASHA_RESEARCH_CANDIDATE_WASSERSTEIN_ROBUST_MV_V1": (
                "https://doi.org/10.1287/mnsc.2021.4155", "2021-12-30"
            ),
        }
        self.assertEqual(
            {key: (value["locator"], value["publishedOrRevisedOn"])
             for key, value in sources.items()},
            expected,
        )
        for source in sources.values():
            self.assertEqual(source["reviewedOn"], REVIEWED_CANDIDATE_SEARCHED_ON)
            self.assertEqual(source["currencyStatus"], "unknown_requires_review")
            self.assertEqual(source["sourceType"], "peer_reviewed_primary_research")

    def test_search_scope_and_method_limitations_remain_visible(self) -> None:
        catalog = build_reviewed_candidate_discovery_catalog()
        for candidate in catalog["candidates"]:
            search = candidate["searchRecord"]
            self.assertEqual(search["searchedOn"], REVIEWED_CANDIDATE_SEARCHED_ON)
            self.assertEqual(
                search["searchMethod"], "manual_recorded_no_network_automation"
            )
            self.assertIn("2017 through 2026", search["searchScope"])
            self.assertGreaterEqual(len(candidate["nonEquivalenceLimits"]), 2)
            self.assertEqual(candidate["implementationStatus"], "not_implemented")
            self.assertEqual(candidate["iranFitnessStatus"], "not_evaluated")

    def test_every_non_source_criterion_remains_not_evaluated(self) -> None:
        catalog = build_reviewed_candidate_discovery_catalog()
        self.assertEqual(
            sum(len(candidate["criterionGaps"]) for candidate in catalog["candidates"]),
            40,
        )
        for candidate in catalog["candidates"]:
            self.assertEqual(
                candidate["criterionGaps"][0]["evidenceStatus"], "documented_only"
            )
            self.assertTrue(candidate["criterionGaps"][0]["evidenceReferences"])
            for cell in candidate["criterionGaps"][1:]:
                self.assertEqual(cell["evidenceStatus"], "not_evaluated")
                self.assertEqual(cell["evidenceReferences"], [])
                self.assertTrue(cell["unresolvedRequirements"])

    def test_canonical_catalog_round_trips_exactly(self) -> None:
        catalog = build_reviewed_candidate_discovery_catalog()
        document = encode_reviewed_candidate_discovery_catalog(catalog)
        self.assertEqual(
            decode_reviewed_candidate_discovery_catalog(document), catalog
        )
        self.assertEqual(build_reviewed_candidate_discovery_catalog(), catalog)

    def test_resealed_source_or_scope_drift_fails_exact_review(self) -> None:
        catalog = build_reviewed_candidate_discovery_catalog()
        changed = deepcopy(catalog)
        changed["candidates"][0]["authoritativeSources"][0]["title"] += " altered"
        unsigned = {key: value for key, value in changed.items() if key != "intakeId"}
        changed["intakeId"] = (
            f"ASHA_RESEARCH_CANDIDATE_INTAKE_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "not exact"):
            validate_reviewed_candidate_discovery_catalog(changed)

        changed = deepcopy(catalog)
        changed["candidates"][0]["candidateScope"]["mechanismClaim"] += " altered"
        unsigned = {key: value for key, value in changed.items() if key != "intakeId"}
        changed["intakeId"] = (
            f"ASHA_RESEARCH_CANDIDATE_INTAKE_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "not exact"):
            validate_reviewed_candidate_discovery_catalog(changed)


if __name__ == "__main__":
    unittest.main()
