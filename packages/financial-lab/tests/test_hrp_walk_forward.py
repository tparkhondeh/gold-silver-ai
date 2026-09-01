from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_hrp_walk_forward_report,
    encode_hrp_walk_forward_report,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.hrp_control import build_hrp_comparison_control_weights  # noqa: E402
from asha_financial_lab.hrp_walk_forward import (  # noqa: E402
    HRP_WALK_FORWARD_SCHEMA_VERSION,
    build_hrp_walk_forward_report,
    validate_hrp_walk_forward_report,
)
from test_hierarchical_clustering import _dataset, _inputs  # noqa: E402
from test_hrp_control import _all_inputs  # noqa: E402


class HrpWalkForwardTests(unittest.TestCase):
    def test_every_fold_replays_complete_chain_without_aggregation(self) -> None:
        dataset = _dataset()
        matrix, plan, *_ = _inputs(dataset)
        report = build_hrp_walk_forward_report(dataset, matrix, plan)
        self.assertEqual(report["summary"], {
            "foldCount": 3,
            "evaluatedPeriodCount": 3,
            "firstTestIndex": 3,
            "lastTestIndex": 5,
            "aggregationPolicy": "none_fold_metrics_only",
        })
        self.assertEqual(
            [
                (
                    item["trainingFeatureStartIndex"],
                    item["trainingFeatureEndIndex"],
                    item["testStartIndex"],
                )
                for item in report["foldResults"]
            ],
            [(1, 2, 3), (2, 3, 4), (3, 4, 5)],
        )
        self.assertEqual(
            [item["metrics"]["cumulativeChangePercent"] for item in report["foldResults"]],
            ["12.500000000010", "7.337175395044", "8.309803095273"],
        )
        self.assertEqual(
            report["reportId"],
            "ASHA_HRP_WALK_FORWARD_REPORT_93c197745ed510291504d615dd12a675f9411c78d9e6e68c7e86acff6d6508a0",
        )
        for fold in report["foldResults"]:
            for key in (
                "standardizerId", "covarianceId", "correlationId", "distanceId",
                "clusteringId", "orderId", "weightSetId", "evaluationId",
            ):
                self.assertIsInstance(fold[key], str)
        self.assertEqual(report["decisionState"], "no_decision")
        self.assertFalse(report["financialUseAllowed"])
        self.assertFalse(report["executionAllowed"])

    def test_future_first_test_change_does_not_refit_first_fold_weights(self) -> None:
        first_dataset = _dataset("250")
        changed_dataset = _dataset("400")
        first_weights = build_hrp_comparison_control_weights(
            first_dataset, *_all_inputs(first_dataset)
        )
        changed_weights = build_hrp_comparison_control_weights(
            changed_dataset, *_all_inputs(changed_dataset)
        )
        self.assertEqual(first_weights["weights"], changed_weights["weights"])
        first_matrix, first_plan, *_ = _inputs(first_dataset)
        changed_matrix, changed_plan, *_ = _inputs(changed_dataset)
        first = build_hrp_walk_forward_report(first_dataset, first_matrix, first_plan)
        changed = build_hrp_walk_forward_report(changed_dataset, changed_matrix, changed_plan)
        self.assertNotEqual(
            first["foldResults"][0]["evaluationId"],
            changed["foldResults"][0]["evaluationId"],
        )

    def test_incomplete_matrix_and_resealed_omission_fail_closed(self) -> None:
        dataset = _dataset()
        matrix, plan, *_ = _inputs(dataset)
        incomplete = build_point_in_time_return_matrix(dataset, 1, 4)
        with self.assertRaises(ContractViolation):
            build_hrp_walk_forward_report(dataset, incomplete, plan)
        report = build_hrp_walk_forward_report(dataset, matrix, plan)
        report["foldResults"].pop()
        report["summary"]["foldCount"] = 2
        unsigned = {key: value for key, value in report.items() if key != "reportId"}
        report["reportId"] = f"ASHA_HRP_WALK_FORWARD_REPORT_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_hrp_walk_forward_report(report, dataset, matrix, plan)

    def test_artifact_round_trip_requires_exact_inputs(self) -> None:
        dataset = _dataset()
        matrix, plan, *_ = _inputs(dataset)
        report = build_hrp_walk_forward_report(dataset, matrix, plan)
        document = encode_hrp_walk_forward_report(report, dataset, matrix, plan)
        self.assertEqual(
            decode_hrp_walk_forward_report(document, dataset, matrix, plan),
            report,
        )
        with self.assertRaises(ContractViolation):
            decode_hrp_walk_forward_report(
                document,
                deepcopy(dataset),
                build_point_in_time_return_matrix(dataset, 2, 5),
                plan,
            )

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/hrp-walk-forward-report.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            HRP_WALK_FORWARD_SCHEMA_VERSION,
        )
        self.assertEqual(
            schema["properties"]["summary"]["properties"]["aggregationPolicy"]["const"],
            "none_fold_metrics_only",
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
