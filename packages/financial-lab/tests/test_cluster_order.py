from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import decode_cluster_leaf_order, encode_cluster_leaf_order  # noqa: E402
from asha_financial_lab.cluster_order import (  # noqa: E402
    CLUSTER_ORDER_SCHEMA_VERSION,
    build_train_only_cluster_leaf_order,
    validate_train_only_cluster_leaf_order,
)
from asha_financial_lab.contracts import ContractViolation, fingerprint  # noqa: E402
from asha_financial_lab.hierarchical_clustering import build_train_only_single_linkage_clustering  # noqa: E402
from test_hierarchical_clustering import _dataset, _inputs  # noqa: E402


def _all_inputs(dataset: dict) -> tuple:
    inputs = _inputs(dataset)
    clustering = build_train_only_single_linkage_clustering(dataset, *inputs)
    return (*inputs, clustering)


class ClusterLeafOrderTests(unittest.TestCase):
    def test_linkage_tree_traverses_each_active_path_once(self) -> None:
        dataset = _dataset()
        order = build_train_only_cluster_leaf_order(dataset, *_all_inputs(dataset))
        self.assertEqual(
            order["orderedInstrumentIds"],
            ["SYNTH_ALPHA", "SYNTH_BETA", "SYNTH_GAMMA"],
        )
        self.assertEqual(order["decisionState"], "no_decision")
        self.assertFalse(order["financialUseAllowed"])
        self.assertFalse(order["executionAllowed"])
        self.assertEqual(order["parameters"]["weightingPolicy"], "not_computed")
        self.assertEqual(
            order["orderId"],
            "ASHA_CLUSTER_LEAF_ORDER_fd465f7b2bcc07e5674e410a72a84a73979fc0bbbc460c09d81d16caece9d156",
        )

    def test_equal_distance_tree_has_deterministic_order(self) -> None:
        dataset = _dataset(identical=True)
        order = build_train_only_cluster_leaf_order(dataset, *_all_inputs(dataset))
        self.assertEqual(
            order["orderedInstrumentIds"],
            ["SYNTH_ALPHA", "SYNTH_BETA", "SYNTH_GAMMA"],
        )

    def test_future_test_change_cannot_change_train_only_order(self) -> None:
        first_dataset = _dataset("250")
        changed_dataset = _dataset("400")
        first = build_train_only_cluster_leaf_order(first_dataset, *_all_inputs(first_dataset))
        changed = build_train_only_cluster_leaf_order(changed_dataset, *_all_inputs(changed_dataset))
        self.assertEqual(first["orderedInstrumentIds"], changed["orderedInstrumentIds"])
        self.assertNotEqual(first["orderId"], changed["orderId"])

    def test_artifact_replay_and_resealed_tampering_fail_closed(self) -> None:
        dataset = _dataset()
        inputs = _all_inputs(dataset)
        order = build_train_only_cluster_leaf_order(dataset, *inputs)
        document = encode_cluster_leaf_order(order, dataset, *inputs)
        self.assertEqual(decode_cluster_leaf_order(document, dataset, *inputs), order)
        tampered = deepcopy(order)
        tampered["orderedInstrumentIds"].reverse()
        unsigned = {key: value for key, value in tampered.items() if key != "orderId"}
        tampered["orderId"] = f"ASHA_CLUSTER_LEAF_ORDER_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_train_only_cluster_leaf_order(tampered, dataset, *inputs)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/cluster-leaf-order.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], CLUSTER_ORDER_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
