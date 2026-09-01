from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.artifacts import (  # noqa: E402
    decode_single_linkage_clustering,
    encode_single_linkage_clustering,
)
from asha_financial_lab.contracts import (  # noqa: E402
    ContractViolation,
    DATASET_SCHEMA_VERSION,
    fingerprint,
    seal_synthetic_dataset,
)
from asha_financial_lab.correlation import build_train_only_correlation  # noqa: E402
from asha_financial_lab.correlation_distance import build_train_only_correlation_distance  # noqa: E402
from asha_financial_lab.covariance import build_train_only_covariance  # noqa: E402
from asha_financial_lab.features import build_point_in_time_return_matrix  # noqa: E402
from asha_financial_lab.hierarchical_clustering import (  # noqa: E402
    CLUSTERING_SCHEMA_VERSION,
    build_train_only_single_linkage_clustering,
    validate_train_only_single_linkage_clustering,
)
from asha_financial_lab.normalization import fit_train_only_standardizer  # noqa: E402
from asha_financial_lab.walk_forward import build_walk_forward_plan  # noqa: E402


def _dataset(alpha_tail: str = "250", *, identical: bool = False) -> dict:
    paths = {
        "SYNTH_ALPHA": ("100", "200", "200", alpha_tail, "260", "270"),
        "SYNTH_BETA": ("100", "200", "200", "240", "250", "260"),
        "SYNTH_GAMMA": (
            ("100", "200", "200", "230", "240", "250")
            if identical else ("100", "50", "50", "55", "60", "65")
        ),
    }
    observations = []
    for period_index in range(6):
        for instrument_id in sorted(paths):
            observations.append({
                "observationId": f"SYNTH_OBS_{instrument_id.removeprefix('SYNTH_')}_{period_index:03d}",
                "instrumentId": instrument_id,
                "periodIndex": period_index,
                "availableAtIndex": period_index,
                "value": f"{paths[instrument_id][period_index]}.00000000",
            })
    return seal_synthetic_dataset({
        "schemaVersion": DATASET_SCHEMA_VERSION,
        "datasetId": "ASHA_SYNTHETIC_CLUSTER_HAND_V1",
        "datasetVersion": 1,
        "datasetKind": "synthetic_fixture",
        "purpose": "walk_forward_mechanics_test",
        "financialUseAllowed": False,
        "instruments": [
            {
                "instrumentId": instrument_id,
                "displayName": f"[SYNTHETIC] {instrument_id}",
                "unit": "synthetic_index_point",
            }
            for instrument_id in sorted(paths)
        ],
        "observations": observations,
        "assumptionReferences": [],
    })


def _inputs(dataset: dict) -> tuple[dict, dict, dict, dict, dict, dict]:
    matrix = build_point_in_time_return_matrix(dataset, 1, 5)
    plan = build_walk_forward_plan(
        dataset, minimum_train_periods=3, test_periods=1, step_periods=1,
        purge_periods=0, embargo_periods=0, mode="rolling",
    )
    standardizer = fit_train_only_standardizer(dataset, matrix, plan, 0)
    covariance = build_train_only_covariance(dataset, matrix, plan, standardizer)
    correlation = build_train_only_correlation(dataset, matrix, plan, standardizer, covariance)
    distance = build_train_only_correlation_distance(
        dataset, matrix, plan, standardizer, covariance, correlation
    )
    return matrix, plan, standardizer, covariance, correlation, distance


class SingleLinkageClusteringTests(unittest.TestCase):
    def test_nearest_pair_merges_first_and_opposite_path_last(self) -> None:
        dataset = _dataset()
        inputs = _inputs(dataset)
        clustering = build_train_only_single_linkage_clustering(dataset, *inputs)
        self.assertEqual(clustering["linkageSteps"], [
            {
                "stepIndex": 0,
                "leftMemberIds": ["SYNTH_ALPHA"],
                "rightMemberIds": ["SYNTH_BETA"],
                "mergedMemberIds": ["SYNTH_ALPHA", "SYNTH_BETA"],
                "distance": "0.000000000000",
            },
            {
                "stepIndex": 1,
                "leftMemberIds": ["SYNTH_ALPHA", "SYNTH_BETA"],
                "rightMemberIds": ["SYNTH_GAMMA"],
                "mergedMemberIds": ["SYNTH_ALPHA", "SYNTH_BETA", "SYNTH_GAMMA"],
                "distance": "1.000000000000",
            },
        ])
        self.assertEqual(clustering["rootMemberIds"], ["SYNTH_ALPHA", "SYNTH_BETA", "SYNTH_GAMMA"])
        self.assertEqual(clustering["decisionState"], "no_decision")
        self.assertFalse(clustering["financialUseAllowed"])
        self.assertFalse(clustering["executionAllowed"])
        self.assertEqual(
            clustering["clusteringId"],
            "ASHA_SINGLE_LINKAGE_CLUSTERING_a3ec54622a2df05de1d5296523f81c818acb3c6114f78eaac9a5fe3b493b9750",
        )

    def test_equal_distance_ties_use_lexicographic_members(self) -> None:
        dataset = _dataset(identical=True)
        clustering = build_train_only_single_linkage_clustering(dataset, *_inputs(dataset))
        self.assertEqual(clustering["linkageSteps"][0]["leftMemberIds"], ["SYNTH_ALPHA"])
        self.assertEqual(clustering["linkageSteps"][0]["rightMemberIds"], ["SYNTH_BETA"])
        self.assertEqual(clustering["linkageSteps"][0]["distance"], "0.000000000000")

    def test_future_test_change_cannot_change_train_only_merges(self) -> None:
        first_dataset = _dataset("250")
        changed_dataset = _dataset("400")
        first = build_train_only_single_linkage_clustering(first_dataset, *_inputs(first_dataset))
        changed = build_train_only_single_linkage_clustering(changed_dataset, *_inputs(changed_dataset))
        self.assertEqual(first["linkageSteps"], changed["linkageSteps"])
        self.assertNotEqual(first["clusteringId"], changed["clusteringId"])

    def test_artifact_replay_and_resealed_tampering_fail_closed(self) -> None:
        dataset = _dataset()
        inputs = _inputs(dataset)
        clustering = build_train_only_single_linkage_clustering(dataset, *inputs)
        document = encode_single_linkage_clustering(clustering, dataset, *inputs)
        self.assertEqual(decode_single_linkage_clustering(document, dataset, *inputs), clustering)
        tampered = deepcopy(clustering)
        tampered["linkageSteps"][0]["distance"] = "0.500000000000"
        unsigned = {key: value for key, value in tampered.items() if key != "clusteringId"}
        tampered["clusteringId"] = f"ASHA_SINGLE_LINKAGE_CLUSTERING_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact replay"):
            validate_train_only_single_linkage_clustering(tampered, dataset, *inputs)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads(
            (PACKAGE_ROOT / "schemas/v1/single-linkage-clustering.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], CLUSTERING_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
