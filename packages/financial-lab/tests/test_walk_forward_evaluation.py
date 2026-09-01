from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_walk_forward_control_report,
    encode_walk_forward_control_report,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.comparison_weights import build_inverse_volatility_control_weights  # noqa: E402
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from asha_financial_lab.walk_forward import build_walk_forward_plan  # noqa: E402
from asha_financial_lab.walk_forward_evaluation import (  # noqa: E402
    WALK_FORWARD_EVALUATION_SCHEMA_VERSION,
    build_inverse_volatility_walk_forward_report,
    validate_inverse_volatility_walk_forward_report,
)
from normalization_fixtures import hand_dataset  # noqa: E402


def _inputs(dataset: dict) -> tuple[dict, dict]:
    matrix = build_point_in_time_return_matrix(dataset, 1, 5)
    plan = build_walk_forward_plan(
        dataset,
        minimum_train_periods=3,
        test_periods=1,
        step_periods=1,
        purge_periods=0,
        embargo_periods=0,
        mode="rolling",
    )
    return matrix, plan


class WalkForwardControlReportTests(unittest.TestCase):
    def test_all_folds_replay_with_separate_train_and_test_ranges(self) -> None:
        dataset = hand_dataset()
        matrix, plan = _inputs(dataset)
        report = build_inverse_volatility_walk_forward_report(dataset, matrix, plan)
        self.assertEqual(report["summary"], {
            "foldCount": 3,
            "evaluatedPeriodCount": 3,
            "firstTestIndex": 3,
            "lastTestIndex": 5,
            "aggregationPolicy": "none_fold_metrics_only",
        })
        self.assertEqual(
            [(item["trainingFeatureStartIndex"], item["trainingFeatureEndIndex"], item["testStartIndex"])
             for item in report["foldResults"]],
            [(1, 2, 3), (2, 3, 4), (3, 4, 5)],
        )
        self.assertEqual(
            [item["metrics"]["cumulativeChangePercent"] for item in report["foldResults"]],
            ["25.000000000000", "4.000000000000", "3.846153846200"],
        )
        self.assertEqual(report["decisionState"], "no_decision")
        self.assertFalse(report["financialUseAllowed"])
        self.assertFalse(report["executionAllowed"])
        self.assertEqual(
            report["reportId"],
            "ASHA_WALK_FORWARD_CONTROL_REPORT_9f0a5498deac002b27f130adc8aa5653e944afe3e71e3850c776884a32cdd003",
        )

    def test_future_test_change_cannot_refit_first_fold_weights(self) -> None:
        first_dataset = hand_dataset("250")
        changed_dataset = hand_dataset("400")
        first_matrix, first_plan = _inputs(first_dataset)
        changed_matrix, changed_plan = _inputs(changed_dataset)
        first = build_inverse_volatility_walk_forward_report(first_dataset, first_matrix, first_plan)
        changed = build_inverse_volatility_walk_forward_report(changed_dataset, changed_matrix, changed_plan)
        first_standardizer = fit_train_only_standardizer(first_dataset, first_matrix, first_plan, 0)
        changed_standardizer = fit_train_only_standardizer(changed_dataset, changed_matrix, changed_plan, 0)
        self.assertEqual(
            first_standardizer["instrumentStatistics"],
            changed_standardizer["instrumentStatistics"],
        )
        first_weights = build_inverse_volatility_control_weights(
            first_dataset, first_matrix, first_plan, first_standardizer
        )
        changed_weights = build_inverse_volatility_control_weights(
            changed_dataset, changed_matrix, changed_plan, changed_standardizer
        )
        self.assertEqual(first_weights["weights"], changed_weights["weights"])
        self.assertNotEqual(first["foldResults"][0]["evaluationId"], changed["foldResults"][0]["evaluationId"])

    def test_incomplete_matrix_and_resealed_tampering_fail_closed(self) -> None:
        dataset = hand_dataset()
        matrix, plan = _inputs(dataset)
        incomplete = build_point_in_time_return_matrix(dataset, 1, 4)
        with self.assertRaises(ContractViolation):
            build_inverse_volatility_walk_forward_report(dataset, incomplete, plan)

        report = build_inverse_volatility_walk_forward_report(dataset, matrix, plan)
        report["foldResults"].pop()
        report["summary"]["foldCount"] = 2
        unsigned = {key: value for key, value in report.items() if key != "reportId"}
        report["reportId"] = f"ASHA_WALK_FORWARD_CONTROL_REPORT_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact multi-fold replay"):
            validate_inverse_volatility_walk_forward_report(report, dataset, matrix, plan)

    def test_artifact_round_trip_requires_exact_inputs(self) -> None:
        dataset = hand_dataset()
        matrix, plan = _inputs(dataset)
        report = build_inverse_volatility_walk_forward_report(dataset, matrix, plan)
        document = encode_walk_forward_control_report(report, dataset, matrix, plan)
        self.assertEqual(
            decode_walk_forward_control_report(document, dataset, matrix, plan),
            report,
        )
        with self.assertRaises(ContractViolation):
            decode_walk_forward_control_report(
                document,
                deepcopy(dataset),
                build_point_in_time_return_matrix(dataset, 2, 5),
                plan,
            )

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/walk-forward-control-report.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            WALK_FORWARD_EVALUATION_SCHEMA_VERSION,
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
