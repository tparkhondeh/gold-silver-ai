from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_minimum_cvar_walk_forward_report,
    encode_minimum_cvar_walk_forward_report,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.minimum_cvar_control import (  # noqa: E402
    build_minimum_cvar_comparison_control_weights,
)
from asha_financial_lab.minimum_cvar_walk_forward import (  # noqa: E402
    MINIMUM_CVAR_WALK_FORWARD_SCHEMA_VERSION,
    build_minimum_cvar_walk_forward_report,
    validate_minimum_cvar_walk_forward_report,
)
from test_minimum_cvar_control import _dataset, _inputs  # noqa: E402


def _build_report(dataset: dict) -> dict:
    matrix, plan = _inputs(dataset)
    return build_minimum_cvar_walk_forward_report(
        dataset,
        matrix,
        plan,
        tail_count=1,
        weight_step="0.500000000000",
    )


class MinimumCvarWalkForwardTests(unittest.TestCase):
    def test_every_fold_refits_then_evaluates_without_aggregation(self) -> None:
        report = _build_report(_dataset())
        self.assertEqual(report["summary"], {
            "foldCount": 3,
            "evaluatedPeriodCount": 3,
            "firstTestIndex": 3,
            "lastTestIndex": 5,
            "aggregationPolicy": "none_fold_metrics_only",
        })
        self.assertEqual(
            [
                (item["trainStartIndex"], item["trainEndIndex"], item["testStartIndex"])
                for item in report["foldResults"]
            ],
            [(1, 2, 3), (1, 3, 4), (2, 4, 5)],
        )
        self.assertEqual([item["candidateCount"] for item in report["foldResults"]], [3, 3, 3])
        self.assertEqual(
            [item["metrics"]["cumulativeChangePercent"] for item in report["foldResults"]],
            ["7.631578947350", "1.414141414150", "1.785714285700"],
        )
        self.assertEqual(
            report["reportId"],
            "ASHA_MIN_CVAR_WALK_FORWARD_REPORT_d870890508b365c3c7cfd5e0457d1bdd9d6b7124d1a637b6ab273302559b97d9",
        )
        self.assertEqual(report["decisionState"], "no_decision")
        self.assertFalse(report["financialUseAllowed"])
        self.assertFalse(report["executionAllowed"])

    def test_future_first_test_change_does_not_refit_first_fold_weights(self) -> None:
        first_dataset = _dataset("118.80000000")
        changed_dataset = _dataset("140.00000000")
        first_matrix, first_plan = _inputs(first_dataset)
        changed_matrix, changed_plan = _inputs(changed_dataset)
        first_weights = build_minimum_cvar_comparison_control_weights(
            first_dataset,
            first_matrix,
            first_plan,
            fold_index=0,
            tail_count=1,
            weight_step="0.500000000000",
        )
        changed_weights = build_minimum_cvar_comparison_control_weights(
            changed_dataset,
            changed_matrix,
            changed_plan,
            fold_index=0,
            tail_count=1,
            weight_step="0.500000000000",
        )
        self.assertEqual(first_weights["weights"], changed_weights["weights"])
        first = _build_report(first_dataset)
        changed = _build_report(changed_dataset)
        self.assertNotEqual(
            first["foldResults"][0]["evaluationId"],
            changed["foldResults"][0]["evaluationId"],
        )

    def test_invalid_fold_parameter_and_resealed_omission_fail_closed(self) -> None:
        dataset = _dataset()
        matrix, plan = _inputs(dataset)
        with self.assertRaises(ValueError):
            build_minimum_cvar_walk_forward_report(
                dataset, matrix, plan, tail_count=3, weight_step="0.500000000000"
            )
        report = _build_report(dataset)
        report["foldResults"].pop()
        report["summary"]["foldCount"] = 2
        unsigned = {key: value for key, value in report.items() if key != "reportId"}
        report["reportId"] = f"ASHA_MIN_CVAR_WALK_FORWARD_REPORT_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_minimum_cvar_walk_forward_report(report, dataset, matrix, plan)

    def test_artifact_round_trip_requires_complete_matrix(self) -> None:
        dataset = _dataset()
        matrix, plan = _inputs(dataset)
        report = _build_report(dataset)
        document = encode_minimum_cvar_walk_forward_report(
            report, dataset, matrix, plan
        )
        self.assertEqual(
            decode_minimum_cvar_walk_forward_report(document, dataset, matrix, plan),
            report,
        )
        incomplete = build_point_in_time_return_matrix(dataset, 1, 4)
        with self.assertRaises(ContractViolation):
            decode_minimum_cvar_walk_forward_report(
                document, deepcopy(dataset), incomplete, plan
            )

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/minimum-cvar-walk-forward-report.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"],
            MINIMUM_CVAR_WALK_FORWARD_SCHEMA_VERSION,
        )
        self.assertEqual(
            schema["properties"]["summary"]["properties"]["aggregationPolicy"]["const"],
            "none_fold_metrics_only",
        )
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
