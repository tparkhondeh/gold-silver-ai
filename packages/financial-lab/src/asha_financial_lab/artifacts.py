"""Canonical byte artifacts for deterministic, synthetic-only replay."""

from __future__ import annotations

import json
from typing import Any, Callable

from .comparison_weights import validate_inverse_volatility_control_weights
from .control_evaluation import (
    validate_hrp_comparison_control_evaluation,
    validate_inverse_volatility_control_evaluation,
    validate_minimum_cvar_comparison_control_evaluation,
)
from .correlation import validate_train_only_correlation
from .correlation_distance import validate_train_only_correlation_distance
from .hierarchical_clustering import validate_train_only_single_linkage_clustering
from .cluster_order import validate_train_only_cluster_leaf_order
from .hrp_control import validate_hrp_comparison_control_weights
from .hrp_walk_forward import validate_hrp_walk_forward_report
from .covariance import validate_train_only_covariance
from .contracts import (
    ContractViolation,
    canonical_json,
    validate_evaluation_result,
    validate_synthetic_dataset,
)
from .features import validate_point_in_time_return_matrix
from .normalization import validate_normalized_fold, validate_train_only_standardizer
from .minimum_cvar_control import validate_minimum_cvar_comparison_control_weights
from .minimum_cvar_walk_forward import validate_minimum_cvar_walk_forward_report
from .methodology_evidence import (
    validate_methodology_evaluation_rubric,
    validate_methodology_evidence_registry,
)
from .reviewed_methodologies import (
    validate_reviewed_comparison_methodology_registry,
)
from .synthetic_stress import (
    validate_stressed_return_matrix,
    validate_synthetic_stress_scenario,
)
from .stress_evaluation import (
    validate_hrp_stress_evaluation,
    validate_inverse_volatility_stress_evaluation,
    validate_minimum_cvar_stress_evaluation,
)
from .stress_suite import (
    validate_hrp_stress_suite,
    validate_inverse_volatility_stress_suite,
    validate_minimum_cvar_stress_suite,
)
from .stress_walk_forward import (
    validate_hrp_stress_walk_forward_report,
    validate_inverse_volatility_stress_walk_forward_report,
    validate_minimum_cvar_stress_walk_forward_report,
)
from .walk_forward import validate_walk_forward_plan
from .walk_forward_evaluation import validate_inverse_volatility_walk_forward_report


MAX_CONTRACT_BYTES = 16 * 1024 * 1024


def _unique_mapping(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContractViolation(f"duplicate JSON key is not allowed: {key}")
        result[key] = value
    return result


def _reject_non_finite(value: str) -> None:
    raise ContractViolation(f"non-finite JSON number is not allowed: {value}")


def _decode_canonical(document: object, validator: Callable[[Any], dict[str, Any]]) -> dict[str, Any]:
    if type(document) is not bytes or not 0 < len(document) <= MAX_CONTRACT_BYTES:
        raise ContractViolation("contract artifact must be bounded non-empty bytes")
    try:
        text = document.decode("utf-8", errors="strict")
        parsed = json.loads(
            text,
            object_pairs_hook=_unique_mapping,
            parse_constant=_reject_non_finite,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractViolation("contract artifact must be valid UTF-8 JSON") from error
    validated = validator(parsed)
    if text != f"{canonical_json(validated)}\n":
        raise ContractViolation("contract artifact is not in canonical JSON form")
    return validated


def _encode_canonical(payload: object, validator: Callable[[Any], dict[str, Any]]) -> bytes:
    validated = validator(payload)
    return f"{canonical_json(validated)}\n".encode("utf-8")


def encode_synthetic_dataset(payload: object) -> bytes:
    return _encode_canonical(payload, validate_synthetic_dataset)


def decode_synthetic_dataset(document: object) -> dict[str, Any]:
    return _decode_canonical(document, validate_synthetic_dataset)


def encode_evaluation_result(payload: object) -> bytes:
    return _encode_canonical(payload, validate_evaluation_result)


def decode_evaluation_result(document: object) -> dict[str, Any]:
    return _decode_canonical(document, validate_evaluation_result)


def encode_walk_forward_plan(payload: object, dataset_payload: object) -> bytes:
    return _encode_canonical(payload, lambda value: validate_walk_forward_plan(value, dataset_payload))


def decode_walk_forward_plan(document: object, dataset_payload: object) -> dict[str, Any]:
    return _decode_canonical(document, lambda value: validate_walk_forward_plan(value, dataset_payload))


def encode_return_matrix(payload: object, dataset_payload: object) -> bytes:
    return _encode_canonical(payload, lambda value: validate_point_in_time_return_matrix(value, dataset_payload))


def decode_return_matrix(document: object, dataset_payload: object) -> dict[str, Any]:
    return _decode_canonical(document, lambda value: validate_point_in_time_return_matrix(value, dataset_payload))


def encode_train_only_standardizer(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_train_only_standardizer(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
        ),
    )


def decode_train_only_standardizer(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_train_only_standardizer(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
        ),
    )


def encode_normalized_fold(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_normalized_fold(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
        ),
    )


def decode_normalized_fold(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_normalized_fold(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
        ),
    )


def encode_inverse_volatility_weights(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_inverse_volatility_control_weights(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
        ),
    )


def decode_inverse_volatility_weights(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_inverse_volatility_control_weights(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
        ),
    )


def encode_weighted_control_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_inverse_volatility_control_evaluation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            weight_set_payload,
        ),
    )


def decode_weighted_control_evaluation(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_inverse_volatility_control_evaluation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            weight_set_payload,
        ),
    )


def encode_walk_forward_control_report(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_inverse_volatility_walk_forward_report(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
        ),
    )


def decode_walk_forward_control_report(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_inverse_volatility_walk_forward_report(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
        ),
    )


def encode_train_only_covariance(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_train_only_covariance(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
        ),
    )


def decode_train_only_covariance(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_train_only_covariance(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
        ),
    )


def encode_train_only_correlation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_train_only_correlation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
        ),
    )


def decode_train_only_correlation(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_train_only_correlation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
        ),
    )


def encode_train_only_correlation_distance(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_train_only_correlation_distance(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
        ),
    )


def decode_train_only_correlation_distance(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_train_only_correlation_distance(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
        ),
    )


def encode_single_linkage_clustering(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_train_only_single_linkage_clustering(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
        ),
    )


def decode_single_linkage_clustering(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_train_only_single_linkage_clustering(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
        ),
    )


def encode_cluster_leaf_order(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_train_only_cluster_leaf_order(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
            clustering_payload,
        ),
    )


def decode_cluster_leaf_order(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_train_only_cluster_leaf_order(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
            clustering_payload,
        ),
    )


def encode_hrp_control_weights(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_hrp_comparison_control_weights(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
            clustering_payload,
            order_payload,
        ),
    )


def decode_hrp_control_weights(
    document: object,
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
    return _decode_canonical(
        document,
        lambda value: validate_hrp_comparison_control_weights(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
            clustering_payload,
            order_payload,
        ),
    )


def encode_hrp_control_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
    weight_set_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_hrp_comparison_control_evaluation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
            clustering_payload,
            order_payload,
            weight_set_payload,
        ),
    )


def decode_hrp_control_evaluation(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_hrp_comparison_control_evaluation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            standardizer_payload,
            covariance_payload,
            correlation_payload,
            distance_payload,
            clustering_payload,
            order_payload,
            weight_set_payload,
        ),
    )


def encode_minimum_cvar_control_weights(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_minimum_cvar_comparison_control_weights(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
        ),
    )


def decode_minimum_cvar_control_weights(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_minimum_cvar_comparison_control_weights(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
        ),
    )


def encode_minimum_cvar_control_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    weight_set_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_minimum_cvar_comparison_control_evaluation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            weight_set_payload,
        ),
    )


def decode_minimum_cvar_control_evaluation(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_minimum_cvar_comparison_control_evaluation(
            value,
            dataset_payload,
            matrix_payload,
            plan_payload,
            weight_set_payload,
        ),
    )


def encode_minimum_cvar_walk_forward_report(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_minimum_cvar_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload
        ),
    )


def decode_minimum_cvar_walk_forward_report(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_minimum_cvar_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload
        ),
    )


def encode_hrp_walk_forward_report(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_hrp_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload
        ),
    )


def decode_hrp_walk_forward_report(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    plan_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_hrp_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload
        ),
    )


def encode_synthetic_stress_scenario(payload: object) -> bytes:
    return _encode_canonical(payload, validate_synthetic_stress_scenario)


def decode_synthetic_stress_scenario(document: object) -> dict[str, Any]:
    return _decode_canonical(document, validate_synthetic_stress_scenario)


def encode_stressed_return_matrix(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    scenario_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_stressed_return_matrix(
            value, dataset_payload, matrix_payload, scenario_payload
        ),
    )


def decode_stressed_return_matrix(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    scenario_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_stressed_return_matrix(
            value, dataset_payload, matrix_payload, scenario_payload
        ),
    )


def encode_inverse_volatility_stress_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_inverse_volatility_stress_evaluation(
            value, dataset_payload, matrix_payload, stressed_matrix_payload,
            scenario_payload, plan_payload, standardizer_payload, weight_set_payload,
        ),
    )


def decode_inverse_volatility_stress_evaluation(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_inverse_volatility_stress_evaluation(
            value, dataset_payload, matrix_payload, stressed_matrix_payload,
            scenario_payload, plan_payload, standardizer_payload, weight_set_payload,
        ),
    )


def encode_minimum_cvar_stress_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    weight_set_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_minimum_cvar_stress_evaluation(
            value, dataset_payload, matrix_payload, stressed_matrix_payload,
            scenario_payload, plan_payload, weight_set_payload,
        ),
    )


def decode_minimum_cvar_stress_evaluation(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_minimum_cvar_stress_evaluation(
            value, dataset_payload, matrix_payload, stressed_matrix_payload,
            scenario_payload, plan_payload, weight_set_payload,
        ),
    )


def encode_hrp_stress_evaluation(
    payload: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
    weight_set_payload: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_hrp_stress_evaluation(
            value, dataset_payload, matrix_payload, stressed_matrix_payload,
            scenario_payload, plan_payload, standardizer_payload, covariance_payload,
            correlation_payload, distance_payload, clustering_payload, order_payload,
            weight_set_payload,
        ),
    )


def decode_hrp_stress_evaluation(
    document: object,
    dataset_payload: object,
    matrix_payload: object,
    stressed_matrix_payload: object,
    scenario_payload: object,
    plan_payload: object,
    standardizer_payload: object,
    covariance_payload: object,
    correlation_payload: object,
    distance_payload: object,
    clustering_payload: object,
    order_payload: object,
    weight_set_payload: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_hrp_stress_evaluation(
            value, dataset_payload, matrix_payload, stressed_matrix_payload,
            scenario_payload, plan_payload, standardizer_payload, covariance_payload,
            correlation_payload, distance_payload, clustering_payload, order_payload,
            weight_set_payload,
        ),
    )


def encode_inverse_volatility_stress_suite(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, standardizer_payload: object, weight_set_payload: object,
    scenario_payloads: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_inverse_volatility_stress_suite(
            value, dataset_payload, matrix_payload, plan_payload, standardizer_payload,
            weight_set_payload, scenario_payloads,
        ),
    )


def decode_inverse_volatility_stress_suite(
    document: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, standardizer_payload: object, weight_set_payload: object,
    scenario_payloads: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_inverse_volatility_stress_suite(
            value, dataset_payload, matrix_payload, plan_payload, standardizer_payload,
            weight_set_payload, scenario_payloads,
        ),
    )


def encode_minimum_cvar_stress_suite(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, weight_set_payload: object, scenario_payloads: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_minimum_cvar_stress_suite(
            value, dataset_payload, matrix_payload, plan_payload, weight_set_payload,
            scenario_payloads,
        ),
    )


def decode_minimum_cvar_stress_suite(
    document: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, weight_set_payload: object, scenario_payloads: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_minimum_cvar_stress_suite(
            value, dataset_payload, matrix_payload, plan_payload, weight_set_payload,
            scenario_payloads,
        ),
    )


def encode_hrp_stress_suite(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, standardizer_payload: object, covariance_payload: object,
    correlation_payload: object, distance_payload: object, clustering_payload: object,
    order_payload: object, weight_set_payload: object, scenario_payloads: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_hrp_stress_suite(
            value, dataset_payload, matrix_payload, plan_payload, standardizer_payload,
            covariance_payload, correlation_payload, distance_payload, clustering_payload,
            order_payload, weight_set_payload, scenario_payloads,
        ),
    )


def decode_hrp_stress_suite(
    document: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, standardizer_payload: object, covariance_payload: object,
    correlation_payload: object, distance_payload: object, clustering_payload: object,
    order_payload: object, weight_set_payload: object, scenario_payloads: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_hrp_stress_suite(
            value, dataset_payload, matrix_payload, plan_payload, standardizer_payload,
            covariance_payload, correlation_payload, distance_payload, clustering_payload,
            order_payload, weight_set_payload, scenario_payloads,
        ),
    )


def encode_inverse_volatility_stress_walk_forward_report(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_inverse_volatility_stress_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload, fold_scenario_payloads
        ),
    )


def decode_inverse_volatility_stress_walk_forward_report(
    document: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_inverse_volatility_stress_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload, fold_scenario_payloads
        ),
    )


def encode_minimum_cvar_stress_walk_forward_report(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_minimum_cvar_stress_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload, fold_scenario_payloads
        ),
    )


def decode_minimum_cvar_stress_walk_forward_report(
    document: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_minimum_cvar_stress_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload, fold_scenario_payloads
        ),
    )


def encode_hrp_stress_walk_forward_report(
    payload: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_hrp_stress_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload, fold_scenario_payloads
        ),
    )


def decode_hrp_stress_walk_forward_report(
    document: object, dataset_payload: object, matrix_payload: object,
    plan_payload: object, fold_scenario_payloads: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_hrp_stress_walk_forward_report(
            value, dataset_payload, matrix_payload, plan_payload, fold_scenario_payloads
        ),
    )


def encode_methodology_evaluation_rubric(payload: object) -> bytes:
    return _encode_canonical(payload, validate_methodology_evaluation_rubric)


def decode_methodology_evaluation_rubric(document: object) -> dict[str, Any]:
    return _decode_canonical(document, validate_methodology_evaluation_rubric)


def encode_methodology_evidence_registry(
    payload: object, rubric_payload: object
) -> bytes:
    return _encode_canonical(
        payload,
        lambda value: validate_methodology_evidence_registry(value, rubric_payload),
    )


def decode_methodology_evidence_registry(
    document: object, rubric_payload: object
) -> dict[str, Any]:
    return _decode_canonical(
        document,
        lambda value: validate_methodology_evidence_registry(value, rubric_payload),
    )


def encode_reviewed_comparison_methodology_registry(payload: object) -> bytes:
    return _encode_canonical(
        payload, validate_reviewed_comparison_methodology_registry
    )


def decode_reviewed_comparison_methodology_registry(
    document: object,
) -> dict[str, Any]:
    return _decode_canonical(
        document, validate_reviewed_comparison_methodology_registry
    )
