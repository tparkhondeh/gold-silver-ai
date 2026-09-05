from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_reviewed_comparison_methodology_registry,
    encode_reviewed_comparison_methodology_registry,
)
from asha_financial_lab.comparison_weights import (  # noqa: E402
    INVERSE_VOLATILITY_CONTROL_ID,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.hrp_control import HRP_CONTROL_ID  # noqa: E402
from asha_financial_lab.minimum_cvar_control import (  # noqa: E402
    MINIMUM_CVAR_CONTROL_ID,
)
from asha_financial_lab.reviewed_methodologies import (  # noqa: E402
    REVIEWED_COMPARISON_REGISTRY_VERSION,
    REVIEWED_ON,
    build_reviewed_comparison_methodology_registry,
    validate_reviewed_comparison_methodology_registry,
)


class ReviewedComparisonMethodologiesTests(unittest.TestCase):
    def test_catalog_has_three_exact_unselected_controls(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        self.assertEqual(
            registry["registryId"],
            "ASHA_METHODOLOGY_EVIDENCE_REGISTRY_838eccb3822124eadd5f6e42de4544af1cd2d2c825f688d0207803b3e2a574a6",
        )
        self.assertEqual(registry["registryVersion"], REVIEWED_COMPARISON_REGISTRY_VERSION)
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
        self.assertFalse(registry["selectionAllowed"])
        self.assertEqual(registry["methodologyApprovalState"], "unapproved")

    def test_primary_source_identity_version_and_review_date_are_explicit(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        sources = {
            entry["methodologyId"]: entry["authoritativeSources"][0]
            for entry in registry["entries"]
        }
        self.assertEqual(
            sources[HRP_CONTROL_ID]["locator"],
            "https://doi.org/10.3905/jpm.2016.42.4.059",
        )
        self.assertEqual(
            sources[INVERSE_VOLATILITY_CONTROL_ID]["locator"],
            "https://doi.org/10.3905/jpm.2010.36.4.060",
        )
        self.assertEqual(
            sources[MINIMUM_CVAR_CONTROL_ID]["locator"],
            "https://doi.org/10.21314/JOR.2000.038",
        )
        for source in sources.values():
            self.assertEqual(source["sourceVersion"], 1)
            self.assertEqual(source["sourceType"], "peer_reviewed_primary_research")
            self.assertEqual(source["reviewedOn"], REVIEWED_ON)
            self.assertEqual(source["currencyStatus"], "current_at_review_date")

    def test_real_data_criteria_remain_explicitly_unmet_for_every_method(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        blocked = {
            "DATA_SUFFICIENCY_AND_QUALITY",
            "IRAN_SPECIFIC_VALIDATION",
            "COST_LIQUIDITY_AND_CONSTRAINTS",
        }
        for entry in registry["entries"]:
            cells = {cell["criterionId"]: cell for cell in entry["criterionEvidence"]}
            self.assertEqual(set(cells), {
                item["criterionId"]
                for item in build_reviewed_comparison_methodology_registry()["entries"][0]
                ["criterionEvidence"]
            })
            for criterion_id in blocked:
                self.assertEqual(cells[criterion_id]["evidenceStatus"], "not_evaluated")
                self.assertEqual(cells[criterion_id]["evidenceReferences"], [])
            self.assertEqual(entry["iranSpecificValidation"]["status"], "requirements_documented")
            self.assertEqual(entry["dataRequirements"][0]["iranDataStatus"], "not_available")

    def test_method_specific_limitations_prevent_equivalence_claims(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        by_id = {entry["methodologyId"]: entry for entry in registry["entries"]}
        inverse = by_id[INVERSE_VOLATILITY_CONTROL_ID]
        cvar = by_id[MINIMUM_CVAR_CONTROL_ID]
        hrp = by_id[HRP_CONTROL_ID]
        self.assertIn(
            "not full equal risk contribution",
            inverse["criterionEvidence"][8]["limitations"][0],
        )
        self.assertIn(
            "not the full continuous optimizer",
            cvar["criterionEvidence"][8]["limitations"][0],
        )
        self.assertIn(
            "not every published extension",
            hrp["criterionEvidence"][8]["limitations"][0],
        )

    def test_canonical_reviewed_catalog_round_trips_exactly(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        document = encode_reviewed_comparison_methodology_registry(registry)
        self.assertEqual(
            decode_reviewed_comparison_methodology_registry(document), registry
        )
        self.assertEqual(build_reviewed_comparison_methodology_registry(), registry)

    def test_resealed_source_or_evidence_changes_fail_exact_review(self) -> None:
        registry = build_reviewed_comparison_methodology_registry()
        changed = deepcopy(registry)
        changed["entries"][0]["authoritativeSources"][0]["title"] += " altered"
        unsigned = {key: value for key, value in changed.items() if key != "registryId"}
        changed["registryId"] = (
            f"ASHA_METHODOLOGY_EVIDENCE_REGISTRY_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "not exact"):
            validate_reviewed_comparison_methodology_registry(changed)

        changed = deepcopy(registry)
        changed["entries"][0]["criterionEvidence"][0]["limitations"] = [
            "Altered limitation"
        ]
        unsigned = {key: value for key, value in changed.items() if key != "registryId"}
        changed["registryId"] = (
            f"ASHA_METHODOLOGY_EVIDENCE_REGISTRY_{fingerprint(unsigned)}"
        )
        with self.assertRaisesRegex(ContractViolation, "not exact"):
            validate_reviewed_comparison_methodology_registry(changed)


if __name__ == "__main__":
    unittest.main()
