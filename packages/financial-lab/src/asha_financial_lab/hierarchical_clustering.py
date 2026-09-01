"""Deterministic single-linkage clustering of synthetic correlation distance."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .correlation import validate_train_only_correlation
from .correlation_distance import validate_train_only_correlation_distance
from .covariance import validate_train_only_covariance
from .features import validate_point_in_time_return_matrix
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


CLUSTERING_SCHEMA_VERSION = "asha.synthetic.single_linkage_clustering.v1"
_CLUSTERING_ID = re.compile(r"ASHA_SINGLE_LINKAGE_CLUSTERING_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_CLUSTERING_KEYS = {
    "schemaVersion", "clusteringId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "standardizerReference",
    "covarianceReference", "correlationReference", "distanceReference",
    "methodologyReference", "foldIndex", "trainingFeatureStartIndex",
    "trainingFeatureEndIndex", "parameters", "activeInstrumentIds",
    "excludedZeroVarianceInstrumentIds", "linkageSteps", "rootMemberIds",
    "reasonCodes",
}
_STEP_KEYS = {
    "stepIndex", "leftMemberIds", "rightMemberIds", "mergedMemberIds", "distance",
}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _cluster_distance(
    left: tuple[str, ...],
    right: tuple[str, ...],
    distances: dict[tuple[str, str], Decimal],
) -> Decimal:
    return min(distances[(left_member, right_member)] for left_member in left for right_member in right)


def _build_unsigned(distance: dict[str, Any]) -> dict[str, Any]:
    active = list(distance["activeInstrumentIds"])
    distances = {
        (row["instrumentId"], value["instrumentId"]): Decimal(value["value"])
        for row in distance["rows"]
        for value in row["values"]
    }
    expected_pairs = {(left, right) for left in active for right in active}
    if set(distances) != expected_pairs:
        raise ContractViolation("clustering needs an exact square distance matrix")

    clusters = [(instrument_id,) for instrument_id in active]
    steps = []
    while len(clusters) > 1:
        candidates = []
        for left_index, first in enumerate(clusters):
            for second in clusters[left_index + 1:]:
                left, right = (first, second) if first <= second else (second, first)
                candidates.append((_cluster_distance(left, right, distances), left, right))
        merge_distance, left, right = min(candidates, key=lambda item: (item[0], item[1], item[2]))
        merged = tuple(sorted((*left, *right)))
        steps.append({
            "stepIndex": len(steps),
            "leftMemberIds": list(left),
            "rightMemberIds": list(right),
            "mergedMemberIds": list(merged),
            "distance": _decimal_string(merge_distance),
        })
        clusters = sorted(
            [cluster for cluster in clusters if cluster not in {left, right}] + [merged]
        )

    return {
        "schemaVersion": CLUSTERING_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "datasetReference": deepcopy(distance["datasetReference"]),
        "returnMatrixReference": deepcopy(distance["returnMatrixReference"]),
        "walkForwardPlanReference": deepcopy(distance["walkForwardPlanReference"]),
        "standardizerReference": deepcopy(distance["standardizerReference"]),
        "covarianceReference": deepcopy(distance["covarianceReference"]),
        "correlationReference": deepcopy(distance["correlationReference"]),
        "distanceReference": {
            "distanceId": distance["distanceId"],
            "schemaVersion": distance["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "foldIndex": distance["foldIndex"],
        "trainingFeatureStartIndex": distance["trainingFeatureStartIndex"],
        "trainingFeatureEndIndex": distance["trainingFeatureEndIndex"],
        "parameters": {
            "linkage": "single_linkage_v1",
            "tieBreak": "distance_then_lexicographic_member_ids",
            "leafOrderPolicy": "not_computed",
        },
        "activeInstrumentIds": active,
        "excludedZeroVarianceInstrumentIds": deepcopy(
            distance["excludedZeroVarianceInstrumentIds"]
        ),
        "linkageSteps": steps,
        "rootMemberIds": list(clusters[0]),
        "reasonCodes": [
            "CLUSTERING_FEATURE_ONLY",
            "HRP_WEIGHTS_NOT_COMPUTED",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
        ],
    }


def build_train_only_single_linkage_clustering(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
) -> dict[str, Any]:
    """Cluster every active path without producing HRP weights or a decision."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    covariance = validate_train_only_covariance(
        covariance_payload, dataset, matrix, plan, standardizer
    )
    correlation = validate_train_only_correlation(
        correlation_payload, dataset, matrix, plan, standardizer, covariance
    )
    distance = validate_train_only_correlation_distance(
        distance_payload, dataset, matrix, plan, standardizer, covariance, correlation
    )
    unsigned = _build_unsigned(distance)
    clustering = {
        **unsigned,
        "clusteringId": f"ASHA_SINGLE_LINKAGE_CLUSTERING_{fingerprint(unsigned)}",
    }
    return validate_train_only_single_linkage_clustering(
        clustering, dataset, matrix, plan, standardizer, covariance, correlation, distance
    )


def validate_train_only_single_linkage_clustering(
    clustering_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
) -> dict[str, Any]:
    """Recompute all merges and reject tie-break drift or tampering."""

    dataset = validate_synthetic_dataset(dataset_payload)
    matrix = validate_point_in_time_return_matrix(matrix_payload, dataset)
    plan = validate_walk_forward_plan(plan_payload, dataset)
    standardizer = validate_train_only_standardizer(standardizer_payload, dataset, matrix, plan)
    covariance = validate_train_only_covariance(
        covariance_payload, dataset, matrix, plan, standardizer
    )
    correlation = validate_train_only_correlation(
        correlation_payload, dataset, matrix, plan, standardizer, covariance
    )
    distance = validate_train_only_correlation_distance(
        distance_payload, dataset, matrix, plan, standardizer, covariance, correlation
    )
    if not isinstance(clustering_payload, dict) or set(clustering_payload) != _CLUSTERING_KEYS:
        raise ContractViolation("single-linkage clustering has unexpected fields")
    clustering = deepcopy(clustering_payload)
    if clustering["schemaVersion"] != CLUSTERING_SCHEMA_VERSION:
        raise ContractViolation("unsupported single-linkage clustering schema version")
    if (
        clustering["status"] != "evaluation_only"
        or clustering["financialUseAllowed"] is not False
        or clustering["executionAllowed"] is not False
        or clustering["decisionState"] != "no_decision"
    ):
        raise ContractViolation("single-linkage clustering crossed its safety boundary")
    if clustering["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("single-linkage clustering cannot approve a methodology")
    if clustering["parameters"] != {
        "linkage": "single_linkage_v1",
        "tieBreak": "distance_then_lexicographic_member_ids",
        "leafOrderPolicy": "not_computed",
    }:
        raise ContractViolation("single-linkage parameters are not the reviewed mechanics")
    if clustering["reasonCodes"] != [
        "CLUSTERING_FEATURE_ONLY", "HRP_WEIGHTS_NOT_COMPUTED", "METHODOLOGY_NOT_APPROVED",
        "NO_FINANCIAL_DECISION", "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY",
        "TRAIN_ONLY_FIT",
    ]:
        raise ContractViolation("single-linkage clustering is missing permanent safety reasons")
    if not isinstance(clustering["linkageSteps"], list) or any(
        not isinstance(step, dict) or set(step) != _STEP_KEYS
        for step in clustering["linkageSteps"]
    ):
        raise ContractViolation("single-linkage step has unexpected fields")
    if not isinstance(clustering["rootMemberIds"], list):
        raise ContractViolation("single-linkage root members must be an array")
    clustering_id = clustering["clusteringId"]
    unsigned = {key: value for key, value in clustering.items() if key != "clusteringId"}
    if not isinstance(clustering_id, str) or not _CLUSTERING_ID.fullmatch(clustering_id):
        raise ContractViolation("single-linkage clustering ID is invalid")
    if clustering_id != f"ASHA_SINGLE_LINKAGE_CLUSTERING_{fingerprint(unsigned)}":
        raise ContractViolation("single-linkage clustering fingerprint mismatch")
    if unsigned != _build_unsigned(distance):
        raise ContractViolation("single-linkage clustering does not match exact replay")
    return clustering
