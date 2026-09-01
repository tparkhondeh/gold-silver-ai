from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.contracts import (  # noqa: E402
    ContractViolation,
    DATASET_SCHEMA_VERSION,
    RESULT_SCHEMA_VERSION,
    canonical_json,
    fingerprint,
    seal_evaluation_result,
    seal_synthetic_dataset,
    validate_evaluation_result,
    validate_synthetic_dataset,
)


def unsigned_dataset() -> dict:
    return {
        "schemaVersion": DATASET_SCHEMA_VERSION,
        "datasetId": "ASHA_SYNTHETIC_CONTRACT_FIXTURE_V1",
        "datasetVersion": 1,
        "datasetKind": "synthetic_fixture",
        "purpose": "contract_test",
        "financialUseAllowed": False,
        "instruments": [
            {
                "instrumentId": "SYNTH_ALPHA",
                "displayName": "[SYNTHETIC] Alpha index",
                "unit": "synthetic_index_point",
            },
            {
                "instrumentId": "SYNTH_BETA",
                "displayName": "[SYNTHETIC] Beta index",
                "unit": "synthetic_index_point",
            },
        ],
        "observations": [
            {"observationId": "SYNTH_OBS_ALPHA_000", "instrumentId": "SYNTH_ALPHA", "periodIndex": 0, "availableAtIndex": 0, "value": "100.00000000"},
            {"observationId": "SYNTH_OBS_BETA_000", "instrumentId": "SYNTH_BETA", "periodIndex": 0, "availableAtIndex": 0, "value": "100.00000000"},
            {"observationId": "SYNTH_OBS_ALPHA_001", "instrumentId": "SYNTH_ALPHA", "periodIndex": 1, "availableAtIndex": 1, "value": "101.00000000"},
            {"observationId": "SYNTH_OBS_BETA_001", "instrumentId": "SYNTH_BETA", "periodIndex": 1, "availableAtIndex": 2, "value": "99.00000000"},
            {"observationId": "SYNTH_OBS_ALPHA_002", "instrumentId": "SYNTH_ALPHA", "periodIndex": 2, "availableAtIndex": 2, "value": "102.00000000"},
            {"observationId": "SYNTH_OBS_BETA_002", "instrumentId": "SYNTH_BETA", "periodIndex": 2, "availableAtIndex": 2, "value": "98.00000000"},
        ],
        "assumptionReferences": [
            {
                "entityId": "ASHA_SYNTHETIC_ASSUMPTION_ZERO_COST",
                "version": 1,
                "status": "synthetic_only",
            }
        ],
    }


def unsigned_result(dataset: dict) -> dict:
    return {
        "schemaVersion": RESULT_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "riskState": "execution_disabled",
        "datasetReference": {
            "datasetId": dataset["datasetId"],
            "version": dataset["datasetVersion"],
            "contentFingerprint": dataset["contentFingerprint"],
        },
        "modelReference": {
            "entityId": "ASHA_NO_DECISION_BASELINE_V1",
            "version": 1,
            "lifecycle": "evaluation_only",
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "assumptionReferences": dataset["assumptionReferences"],
        "benchmarkResults": [
            {
                "benchmarkId": "ASHA_BENCHMARK_NO_TRADE_V1",
                "status": "computed",
                "metrics": {"synthetic_change": "-2.00000000"},
                "reasonCodes": [],
            }
        ],
        "reasonCodes": [
            "METHODOLOGY_NOT_APPROVED",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


class CanonicalContractTests(unittest.TestCase):
    def test_canonical_json_and_fingerprint_ignore_mapping_order(self) -> None:
        left = {"b": "synthetic", "a": [2, 1]}
        right = {"a": [2, 1], "b": "synthetic"}
        self.assertEqual(canonical_json(left), '{"a":[2,1],"b":"synthetic"}')
        self.assertEqual(fingerprint(left), fingerprint(right))
        self.assertRegex(fingerprint(left), r"^[a-f0-9]{64}$")
        with self.assertRaises(ContractViolation):
            canonical_json({"invalid": float("nan")})

    def test_dataset_seal_is_deterministic_and_defensive(self) -> None:
        unsigned = unsigned_dataset()
        sealed = seal_synthetic_dataset(unsigned)
        replay = seal_synthetic_dataset(deepcopy(unsigned))
        self.assertEqual(sealed, replay)
        self.assertEqual(validate_synthetic_dataset(sealed), sealed)
        self.assertNotIn("contentFingerprint", unsigned)

        sealed["observations"][0]["value"] = "999.00000000"
        with self.assertRaisesRegex(ContractViolation, "fingerprint mismatch"):
            validate_synthetic_dataset(sealed)

    def test_dataset_rejects_real_namespace_financial_use_and_lookahead(self) -> None:
        cases = []
        real_namespace = unsigned_dataset()
        real_namespace["datasetId"] = "REAL_MARKET_HISTORY_V1"
        cases.append(real_namespace)
        financial_use = unsigned_dataset()
        financial_use["financialUseAllowed"] = True
        cases.append(financial_use)
        impossible_availability = unsigned_dataset()
        impossible_availability["observations"][2]["availableAtIndex"] = 0
        cases.append(impossible_availability)
        real_unit = unsigned_dataset()
        real_unit["instruments"][0]["unit"] = "TOMAN"
        cases.append(real_unit)

        for payload in cases:
            with self.subTest(payload=payload):
                with self.assertRaises(ContractViolation):
                    seal_synthetic_dataset(payload)

    def test_result_is_replayable_and_permanently_no_decision(self) -> None:
        dataset = seal_synthetic_dataset(unsigned_dataset())
        sealed = seal_evaluation_result(unsigned_result(dataset))
        self.assertEqual(validate_evaluation_result(sealed), sealed)
        self.assertRegex(sealed["resultId"], r"^ASHA_EVAL_[a-f0-9]{64}$")
        self.assertEqual(sealed["decisionState"], "no_decision")
        self.assertFalse(sealed["financialUseAllowed"])
        self.assertFalse(sealed["executionAllowed"])

    def test_result_rejects_execution_methodology_promotion_and_tampering(self) -> None:
        dataset = seal_synthetic_dataset(unsigned_dataset())
        base = unsigned_result(dataset)
        execution = deepcopy(base)
        execution["executionAllowed"] = True
        approved_method = deepcopy(base)
        approved_method["methodologyReference"] = {
            "entityId": "UNAPPROVED_METHOD",
            "version": 1,
            "approvalState": "approved",
        }
        missing_safety_reason = deepcopy(base)
        missing_safety_reason["reasonCodes"].remove("METHODOLOGY_NOT_APPROVED")

        for payload in (execution, approved_method, missing_safety_reason):
            with self.subTest(payload=payload):
                with self.assertRaises(ContractViolation):
                    seal_evaluation_result(payload)

        sealed = seal_evaluation_result(base)
        sealed["benchmarkResults"][0]["metrics"]["synthetic_change"] = "42.00000000"
        with self.assertRaisesRegex(ContractViolation, "fingerprint mismatch"):
            validate_evaluation_result(sealed)

    def test_machine_readable_schemas_match_runtime_versions(self) -> None:
        dataset_schema = json.loads((PACKAGE_ROOT / "schemas/v1/synthetic-dataset.schema.json").read_text(encoding="utf-8"))
        result_schema = json.loads((PACKAGE_ROOT / "schemas/v1/evaluation-result.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(dataset_schema["properties"]["schemaVersion"]["const"], DATASET_SCHEMA_VERSION)
        self.assertEqual(result_schema["properties"]["schemaVersion"]["const"], RESULT_SCHEMA_VERSION)
        self.assertFalse(dataset_schema["additionalProperties"])
        self.assertFalse(result_schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
