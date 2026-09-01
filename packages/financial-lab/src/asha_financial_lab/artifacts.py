"""Canonical byte artifacts for deterministic, synthetic-only replay."""

from __future__ import annotations

import json
from typing import Any, Callable

from .contracts import (
    ContractViolation,
    canonical_json,
    validate_evaluation_result,
    validate_synthetic_dataset,
)
from .walk_forward import validate_walk_forward_plan


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
