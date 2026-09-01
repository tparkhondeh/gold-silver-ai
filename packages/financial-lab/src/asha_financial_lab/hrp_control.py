"""Synthetic-only HRP-style recursive-bisection comparison weights."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .cluster_order import validate_train_only_cluster_leaf_order
from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset
from .correlation import validate_train_only_correlation
from .correlation_distance import validate_train_only_correlation_distance
from .covariance import validate_train_only_covariance
from .features import validate_point_in_time_return_matrix
from .hierarchical_clustering import validate_train_only_single_linkage_clustering
from .normalization import validate_train_only_standardizer
from .walk_forward import validate_walk_forward_plan


HRP_CONTROL_SCHEMA_VERSION = "asha.synthetic.hrp_control_weights.v1"
HRP_CONTROL_ID = "ASHA_BENCHMARK_HRP_CONTROL_V1"
_WEIGHT_SET_ID = re.compile(r"ASHA_HRP_CONTROL_WEIGHTS_[a-f0-9]{64}\Z")
_QUANTUM = Decimal("0.000000000001")
_NEGATIVE_VARIANCE_TOLERANCE = Decimal("0.000000001000")
_WEIGHT_SET_KEYS = {
    "schemaVersion", "weightSetId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "benchmarkId", "datasetReference",
    "returnMatrixReference", "walkForwardPlanReference", "standardizerReference",
    "covarianceReference", "correlationReference", "distanceReference",
    "clusteringReference", "orderReference", "methodologyReference", "foldIndex",
    "parameters", "orderedActiveInstrumentIds", "excludedZeroVarianceInstrumentIds",
    "splitSteps", "weights", "reasonCodes",
}
_SPLIT_KEYS = {
    "stepIndex", "leftMemberIds", "rightMemberIds", "leftClusterVariance",
    "rightClusterVariance", "leftAllocation", "rightAllocation",
}
_WEIGHT_KEYS = {"instrumentId", "weight"}


def _decimal_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _cluster_variance(
    members: list[str],
    covariance: dict[tuple[str, str], Decimal],
) -> Decimal:
    diagonal = {member: covariance[(member, member)] for member in members}
    if any(value <= 0 for value in diagonal.values()):
        raise ContractViolation("HRP control clusters require positive active variances")
    inverse = {member: Decimal("1") / diagonal[member] for member in members}
    inverse_total = sum(inverse.values())
    inverse_variance_weights = {
        member: inverse[member] / inverse_total for member in members
    }
    variance = sum(
        inverse_variance_weights[left]
        * inverse_variance_weights[right]
        * covariance[(left, right)]
        for left in members
        for right in members
    )
    if variance < 0:
        if abs(variance) > _NEGATIVE_VARIANCE_TOLERANCE:
            raise ContractViolation("HRP control cluster variance is materially negative")
        return Decimal("0")
    return variance


def _build_unsigned(
    covariance_artifact: dict[str, Any],
    order: dict[str, Any],
) -> dict[str, Any]:
    ordered_active = list(order["orderedInstrumentIds"])
    covariance = {
        (row["instrumentId"], value["instrumentId"]): Decimal(value["value"])
        for row in covariance_artifact["rows"]
        for value in row["values"]
    }
    expected_pairs = {
        (left, right)
        for left in covariance_artifact["instrumentIds"]
        for right in covariance_artifact["instrumentIds"]
    }
    if set(covariance) != expected_pairs:
        raise ContractViolation("HRP control needs an exact square covariance matrix")

    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        raw_weights = {instrument_id: Decimal("1") for instrument_id in ordered_active}
        pending = [ordered_active]
        split_steps = []
        while pending:
            next_pending = []
            for members in pending:
                if len(members) <= 1:
                    continue
                split_index = len(members) // 2
                left = members[:split_index]
                right = members[split_index:]
                left_variance = _cluster_variance(left, covariance)
                right_variance = _cluster_variance(right, covariance)
                total_variance = left_variance + right_variance
                if total_variance <= 0:
                    raise ContractViolation("HRP control cannot split two zero-variance clusters")
                left_allocation = right_variance / total_variance
                right_allocation = Decimal("1") - left_allocation
                for instrument_id in left:
                    raw_weights[instrument_id] *= left_allocation
                for instrument_id in right:
                    raw_weights[instrument_id] *= right_allocation
                split_steps.append({
                    "stepIndex": len(split_steps),
                    "leftMemberIds": list(left),
                    "rightMemberIds": list(right),
                    "leftClusterVariance": _decimal_string(left_variance),
                    "rightClusterVariance": _decimal_string(right_variance),
                    "leftAllocation": _decimal_string(left_allocation),
                    "rightAllocation": _decimal_string(right_allocation),
                })
                if len(left) > 1:
                    next_pending.append(left)
                if len(right) > 1:
                    next_pending.append(right)
            pending = next_pending

        if sum(raw_weights.values()) != Decimal("1"):
            raise ContractViolation("raw HRP comparison weights must sum to one")
        rounded = {
            instrument_id: raw_weights[instrument_id].quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
            for instrument_id in ordered_active
        }
        residual_target = min(
            ordered_active,
            key=lambda instrument_id: (-raw_weights[instrument_id], instrument_id),
        )
        rounded[residual_target] += Decimal("1") - sum(rounded.values())

    weights = [
        {
            "instrumentId": instrument_id,
            "weight": _decimal_string(rounded.get(instrument_id, Decimal("0"))),
        }
        for instrument_id in covariance_artifact["instrumentIds"]
    ]
    if sum(Decimal(item["weight"]) for item in weights) != Decimal("1"):
        raise ContractViolation("HRP comparison weights must sum exactly to one")

    return {
        "schemaVersion": HRP_CONTROL_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "benchmarkId": HRP_CONTROL_ID,
        "datasetReference": deepcopy(order["datasetReference"]),
        "returnMatrixReference": deepcopy(order["returnMatrixReference"]),
        "walkForwardPlanReference": deepcopy(order["walkForwardPlanReference"]),
        "standardizerReference": deepcopy(order["standardizerReference"]),
        "covarianceReference": deepcopy(order["covarianceReference"]),
        "correlationReference": deepcopy(order["correlationReference"]),
        "distanceReference": deepcopy(order["distanceReference"]),
        "clusteringReference": deepcopy(order["clusteringReference"]),
        "orderReference": {
            "orderId": order["orderId"],
            "schemaVersion": order["schemaVersion"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "foldIndex": order["foldIndex"],
        "parameters": {
            "kind": "hrp_style_recursive_bisection_control_v1",
            "clusterVariance": "inverse_variance_portfolio_on_population_covariance",
            "split": "ordered_halves_floor_left_v1",
            "allocation": "opposite_cluster_variance_share",
            "rounding": "half_even_12_decimals",
            "residualPolicy": "largest_raw_weight_then_instrument_id",
            "zeroVariancePolicy": "excluded_zero_weight",
        },
        "orderedActiveInstrumentIds": ordered_active,
        "excludedZeroVarianceInstrumentIds": deepcopy(
            order["excludedZeroVarianceInstrumentIds"]
        ),
        "splitSteps": split_steps,
        "weights": weights,
        "reasonCodes": [
            "COMPARISON_CONTROL_ONLY",
            "HRP_STYLE_BENCHMARK_ONLY",
            "METHODOLOGY_NOT_APPROVED",
            "NO_FINANCIAL_DECISION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "TRAIN_ONLY_FIT",
        ],
    }


def build_hrp_comparison_control_weights(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
) -> dict[str, Any]:
    """Build an HRP-style synthetic comparison control, never a real allocation."""

    validated = _validate_inputs(
        dataset_payload,
        matrix_payload,
        plan_payload,
        standardizer_payload,
        covariance_payload,
        correlation_payload,
        distance_payload,
        clustering_payload,
        order_payload,
    )
    covariance, order = validated[4], validated[8]
    unsigned = _build_unsigned(covariance, order)
    weight_set = {
        **unsigned,
        "weightSetId": f"ASHA_HRP_CONTROL_WEIGHTS_{fingerprint(unsigned)}",
    }
    return validate_hrp_comparison_control_weights(weight_set, *validated)


def _validate_inputs(
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
) -> tuple[dict[str, Any], ...]:
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
    order = validate_train_only_cluster_leaf_order(
        order_payload,
        dataset,
        matrix,
        plan,
        standardizer,
        covariance,
        correlation,
        distance,
        clustering,
    )
    return dataset, matrix, plan, standardizer, covariance, correlation, distance, clustering, order


def validate_hrp_comparison_control_weights(
    weight_set_payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
) -> dict[str, Any]:
    """Recompute every split and reject provenance drift or tampering."""

    validated = _validate_inputs(
        dataset_payload,
        matrix_payload,
        plan_payload,
        standardizer_payload,
        covariance_payload,
        correlation_payload,
        distance_payload,
        clustering_payload,
        order_payload,
    )
    covariance, order = validated[4], validated[8]
    if not isinstance(weight_set_payload, dict) or set(weight_set_payload) != _WEIGHT_SET_KEYS:
        raise ContractViolation("HRP comparison weight set has unexpected fields")
    weight_set = deepcopy(weight_set_payload)
    if weight_set["schemaVersion"] != HRP_CONTROL_SCHEMA_VERSION:
        raise ContractViolation("unsupported HRP comparison-control schema version")
    if (
        weight_set["status"] != "evaluation_only"
        or weight_set["financialUseAllowed"] is not False
        or weight_set["executionAllowed"] is not False
        or weight_set["decisionState"] != "no_decision"
        or weight_set["benchmarkId"] != HRP_CONTROL_ID
    ):
        raise ContractViolation("HRP comparison control crossed its safety boundary")
    if weight_set["methodologyReference"] != {
        "entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved",
    }:
        raise ContractViolation("HRP comparison control cannot approve a methodology")
    if weight_set["parameters"] != {
        "kind": "hrp_style_recursive_bisection_control_v1",
        "clusterVariance": "inverse_variance_portfolio_on_population_covariance",
        "split": "ordered_halves_floor_left_v1",
        "allocation": "opposite_cluster_variance_share",
        "rounding": "half_even_12_decimals",
        "residualPolicy": "largest_raw_weight_then_instrument_id",
        "zeroVariancePolicy": "excluded_zero_weight",
    }:
        raise ContractViolation("HRP comparison parameters are not the reviewed exact mechanics")
    if weight_set["reasonCodes"] != [
        "COMPARISON_CONTROL_ONLY", "HRP_STYLE_BENCHMARK_ONLY", "METHODOLOGY_NOT_APPROVED",
        "NO_FINANCIAL_DECISION", "REAL_FINANCIAL_USE_DISABLED", "SYNTHETIC_DATA_ONLY",
        "TRAIN_ONLY_FIT",
    ]:
        raise ContractViolation("HRP comparison control is missing permanent safety reasons")
    if not isinstance(weight_set["splitSteps"], list) or any(
        not isinstance(step, dict) or set(step) != _SPLIT_KEYS for step in weight_set["splitSteps"]
    ):
        raise ContractViolation("HRP comparison split step has unexpected fields")
    if not isinstance(weight_set["weights"], list) or any(
        not isinstance(item, dict) or set(item) != _WEIGHT_KEYS for item in weight_set["weights"]
    ):
        raise ContractViolation("HRP comparison weight has unexpected fields")
    weight_set_id = weight_set["weightSetId"]
    unsigned = {key: value for key, value in weight_set.items() if key != "weightSetId"}
    if not isinstance(weight_set_id, str) or not _WEIGHT_SET_ID.fullmatch(weight_set_id):
        raise ContractViolation("HRP comparison weight-set ID is invalid")
    if weight_set_id != f"ASHA_HRP_CONTROL_WEIGHTS_{fingerprint(unsigned)}":
        raise ContractViolation("HRP comparison weight-set fingerprint mismatch")
    if unsigned != _build_unsigned(covariance, order):
        raise ContractViolation("HRP comparison weights do not match exact replay")
    return weight_set
