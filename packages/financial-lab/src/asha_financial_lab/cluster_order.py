"""Deterministic leaf order from reviewed synthetic linkage clustering."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .correlation import validate_train_only_correlation
from .correlation_distance import validate_train_only_correlation_distance
from .covariance import validate_train_only_covariance
from .features import validate_point_in_time_return_matrix
from .hierarchical_clustering import validate_train_only_single_linkage_clustering
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


CLUSTER_ORDER_SCHEMA_VERSION = "asha.synthetic.cluster_leaf_order.v1"
_ORDER_ID = re.compile(r"ASHA_CLUSTER_LEAF_ORDER_[a-f0-9]{64}\Z")
_ORDER_KEYS = {
    "schemaVersion", "orderId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "standardizerReference",
    "covarianceReference", "correlationReference", "distanceReference",
    "clusteringReference", "methodologyReference", "foldIndex",
    "trainingFeatureStartIndex", "trainingFeatureEndIndex", "parameters",
    "orderedInstrumentIds", "excludedZeroVarianceInstrumentIds", "reasonCodes",
}


def _build_unsigned(clustering: dict[str, Any]) -> dict[str, Any]:
    tree = {
        tuple(step["mergedMemberIds"]): (
            tuple(step["leftMemberIds"]),
            tuple(step["rightMemberIds"]),
        )
        for step in clustering["linkageSteps"]
    }

    def traverse(members: tuple[str, ...]) -> list[str]:
        if len(members) == 1:
            return [members[0]]
        if members not in tree:
            raise ContractViolation("cluster leaf order cannot reconstruct the linkage tree")
        left, right = tree[members]
        return [*traverse(left), *traverse(right)]

    root = tuple(clustering["rootMemberIds"])
    ordered = traverse(root)
    if sorted(ordered) != clustering["activeInstrumentIds"] or len(set(ordered)) != len(ordered):
        raise ContractViolation("cluster leaf order must contain every active instrument exactly once")

    return {
        "schemaVersion": CLUSTER_ORDER_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "datasetReference": deepcopy(clustering["datasetReference"]),
        "returnMatrixReference": deepcopy(clustering["returnMatrixReference"]),
        "walkForwardPlanReference": deepcopy(clustering["walkForwardPlanReference"]),
        "standardizerReference": deepcopy(clustering["standardizerReference"]),
        "covarianceReference": deepcopy(clustering["covarianceReference"]),
        "correlationReference": deepcopy(clustering["correlationReference"]),
        "distanceReference": deepcopy(clustering["distanceReference"]),
        "clusteringReference": {
            "clusteringId": clustering["clusteringId"],
            "schemaVersion": clustering["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "foldIndex": clustering["foldIndex"],
        "trainingFeatureStartIndex": clustering["trainingFeatureStartIndex"],
        "trainingFeatureEndIndex": clustering["trainingFeatureEndIndex"],
        "parameters": {
            "traversal": "left_then_right_linkage_tree_v1",
            "weightingPolicy": "not_computed",
        },
        "orderedInstrumentIds": ordered,
        "excludedZeroVarianceInstrumentIds": deepcopy(
            clustering["excludedZeroVarianceInstrumentIds"]
        ),
        "reasonCodes": [
            "CLUSTER_ORDER_FEATURE_ONLY",
            "HRP_WEIGHTS_NOT_COMPUTED",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
        ],
    }


def build_train_only_cluster_leaf_order(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
) -> dict[str, Any]:
    """Traverse the exact linkage tree without producing portfolio weights."""

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
    clustering = validate_train_only_single_linkage_clustering(
        clustering_payload,
        dataset,
        matrix,
        plan,
        standardizer,
        covariance,
        correlation,
        distance,
    )
    unsigned = _build_unsigned(clustering)
    order = {**unsigned, "orderId": f"ASHA_CLUSTER_LEAF_ORDER_{fingerprint(unsigned)}"}
    return validate_train_only_cluster_leaf_order(
        order, dataset, matrix, plan, standardizer, covariance, correlation, distance, clustering
    )


def validate_train_only_cluster_leaf_order(
    order_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
) -> dict[str, Any]:
    """Recompute the leaf traversal and reject omission, drift, or tampering."""

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
    clustering = validate_train_only_single_linkage_clustering(
        clustering_payload,
        dataset,
        matrix,
        plan,
        standardizer,
        covariance,
        correlation,
        distance,
    )
    if not isinstance(order_payload, dict) or set(order_payload) != _ORDER_KEYS:
        raise ContractViolation("cluster leaf order has unexpected fields")
    order = deepcopy(order_payload)
    if order["schemaVersion"] != CLUSTER_ORDER_SCHEMA_VERSION:
        raise ContractViolation("unsupported cluster-leaf-order schema version")
    if (
        order["status"] != "evaluation_only"
        or order["financialUseAllowed"] is not False
        or order["executionAllowed"] is not False
        or order["decisionState"] != "no_decision"
    ):
        raise ContractViolation("cluster leaf order crossed its safety boundary")
    if order["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("cluster leaf order cannot approve a methodology")
    if order["parameters"] != {
        "traversal": "left_then_right_linkage_tree_v1",
        "weightingPolicy": "not_computed",
    }:
        raise ContractViolation("cluster leaf-order parameters are not the reviewed mechanics")
    if order["reasonCodes"] != [
        "CLUSTER_ORDER_FEATURE_ONLY", "HRP_WEIGHTS_NOT_COMPUTED", "METHODOLOGY_NOT_APPROVED",
        "NO_FINANCIAL_DECISION", "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY",
        "TRAIN_ONLY_FIT",
    ]:
        raise ContractViolation("cluster leaf order is missing permanent safety reasons")
    if not isinstance(order["orderedInstrumentIds"], list) or len(order["orderedInstrumentIds"]) < 2:
        raise ContractViolation("cluster leaf order needs at least two instruments")
    if not isinstance(order["excludedZeroVarianceInstrumentIds"], list):
        raise ContractViolation("excluded zero-variance instruments must be an array")
    order_id = order["orderId"]
    unsigned = {key: value for key, value in order.items() if key != "orderId"}
    if not isinstance(order_id, str) or not _ORDER_ID.fullmatch(order_id):
        raise ContractViolation("cluster leaf-order ID is invalid")
    if order_id != f"ASHA_CLUSTER_LEAF_ORDER_{fingerprint(unsigned)}":
        raise ContractViolation("cluster leaf-order fingerprint mismatch")
    if unsigned != _build_unsigned(clustering):
        raise ContractViolation("cluster leaf order does not match exact replay")
    return order
