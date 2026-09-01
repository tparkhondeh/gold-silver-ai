from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import decode_hrp_control_weights, encode_hrp_control_weights  # noqa: E402
from asha_financial_lab.cluster_order import build_train_only_cluster_leaf_order  # noqa: E402
from asha_financial_lab.contracts import (  # noqa: E402
    ContractViolation,
    fingerprint,
    seal_synthetic_dataset,
)
from asha_financial_lab.hrp_control import (  # noqa: E402
    HRP_CONTROL_ID,
    HRP_CONTROL_SCHEMA_VERSION,
    build_hrp_comparison_control_weights,
    validate_hrp_comparison_control_weights,
)
from asha_financial_lab.hierarchical_clustering import build_train_only_single_linkage_clustering  # noqa: E402
from test_hierarchical_clustering import _dataset, _inputs  # noqa: E402


def _all_inputs(dataset: dict) -> tuple:
    inputs = _inputs(dataset)
    clustering = build_train_only_single_linkage_clustering(dataset, *inputs)
    order = build_train_only_cluster_leaf_order(dataset, *inputs, clustering)
    return (*inputs, clustering, order)


class HrpComparisonControlTests(unittest.TestCase):
    def test_hand_computed_recursive_bisection_weights_sum_to_one(self) -> None:
        dataset = _dataset()
        inputs = _all_inputs(dataset)
        weights = build_hrp_comparison_control_weights(dataset, *inputs)
        self.assertEqual(weights["benchmarkId"], HRP_CONTROL_ID)
        self.assertEqual(weights["weights"], [
            {"instrumentId": "SYNTH_ALPHA", "weight": "0.038461538462"},
            {"instrumentId": "SYNTH_BETA", "weight": "0.192307692308"},
            {"instrumentId": "SYNTH_GAMMA", "weight": "0.769230769230"},
        ])
        self.assertEqual(sum(Decimal(item["weight"]) for item in weights["weights"]), Decimal("1"))
        self.assertEqual(weights["splitSteps"][0]["leftAllocation"], "0.038461538462")
        self.assertEqual(weights["splitSteps"][1]["leftAllocation"], "0.200000000000")
        self.assertEqual(weights["decisionState"], "no_decision")
        self.assertFalse(weights["financialUseAllowed"])
        self.assertFalse(weights["executionAllowed"])
        self.assertEqual(
            weights["weightSetId"],
            "ASHA_HRP_CONTROL_WEIGHTS_49d3b3fd2443f828a781a05fd4c7414a534e438733b8a892adbaed2fc6bf98c8",
        )

    def test_future_test_change_cannot_change_train_only_weights(self) -> None:
        first_dataset = _dataset("250")
        changed_dataset = _dataset("400")
        first = build_hrp_comparison_control_weights(first_dataset, *_all_inputs(first_dataset))
        changed = build_hrp_comparison_control_weights(changed_dataset, *_all_inputs(changed_dataset))
        self.assertEqual(first["weights"], changed["weights"])
        self.assertEqual(first["splitSteps"], changed["splitSteps"])
        self.assertNotEqual(first["weightSetId"], changed["weightSetId"])

    def test_zero_variance_path_is_excluded_with_zero_weight(self) -> None:
        dataset = _dataset()
        unsigned = deepcopy(dataset)
        unsigned.pop("contentFingerprint")
        unsigned["datasetId"] = "ASHA_SYNTHETIC_HRP_ZERO_PATH_V1"
        unsigned["instruments"].append({
            "instrumentId": "SYNTH_ZERO",
            "displayName": "[SYNTHETIC] SYNTH_ZERO",
            "unit": "synthetic_index_point",
        })
        for period_index in range(6):
            unsigned["observations"].append({
                "observationId": f"SYNTH_OBS_ZERO_{period_index:03d}",
                "instrumentId": "SYNTH_ZERO",
                "periodIndex": period_index,
                "availableAtIndex": period_index,
                "value": "100.00000000",
            })
        unsigned["observations"].sort(
            key=lambda item: (item["periodIndex"], item["instrumentId"], item["observationId"])
        )
        dataset = seal_synthetic_dataset(unsigned)
        weights = build_hrp_comparison_control_weights(dataset, *_all_inputs(dataset))
        self.assertEqual(weights["excludedZeroVarianceInstrumentIds"], ["SYNTH_ZERO"])
        self.assertEqual(weights["weights"][-1], {
            "instrumentId": "SYNTH_ZERO", "weight": "0.000000000000",
        })

    def test_artifact_replay_and_resealed_tampering_fail_closed(self) -> None:
        dataset = _dataset()
        inputs = _all_inputs(dataset)
        weights = build_hrp_comparison_control_weights(dataset, *inputs)
        document = encode_hrp_control_weights(weights, dataset, *inputs)
        self.assertEqual(decode_hrp_control_weights(document, dataset, *inputs), weights)
        tampered = deepcopy(weights)
        tampered["weights"][0]["weight"] = "0.100000000000"
        tampered["weights"][1]["weight"] = "0.100000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "weightSetId"}
        tampered["weightSetId"] = f"ASHA_HRP_CONTROL_WEIGHTS_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_hrp_comparison_control_weights(tampered, dataset, *inputs)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/hrp-control-weights.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], HRP_CONTROL_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
