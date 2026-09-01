"""Versioned assumptions permitted in the synthetic laboratory only."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .contracts import fingerprint


def _entry(entity_id: str, description: str, value: str, unit: str) -> dict[str, Any]:
    content = {
        "description": description,
        "source": "ADR_0009_SYNTHETIC_LAB_ONLY",
        "status": "synthetic_only",
        "unit": unit,
        "value": value,
    }
    return {
        "entityId": entity_id,
        "version": 1,
        "status": "synthetic_only",
        "content": content,
        "contentFingerprint": fingerprint(content),
    }


_REGISTRY = {
    ("ASHA_SYNTHETIC_ASSUMPTION_FULL_LIQUIDITY", 1): _entry(
        "ASHA_SYNTHETIC_ASSUMPTION_FULL_LIQUIDITY",
        "Every synthetic benchmark position can be rebalanced at a period boundary.",
        "1",
        "synthetic_boolean",
    ),
    ("ASHA_SYNTHETIC_ASSUMPTION_ZERO_COST", 1): _entry(
        "ASHA_SYNTHETIC_ASSUMPTION_ZERO_COST",
        "The first contract fixture has zero synthetic transaction cost.",
        "0",
        "synthetic_rate",
    ),
}

def assumption_reference(entity_id: str, version: int) -> dict[str, Any]:
    try:
        entry = _REGISTRY[(entity_id, version)]
    except KeyError as error:
        raise ValueError("unknown synthetic assumption reference") from error
    return {key: deepcopy(entry[key]) for key in ("entityId", "version", "status")}


def resolve_assumption(entity_id: str, version: int) -> dict[str, Any]:
    try:
        return deepcopy(_REGISTRY[(entity_id, version)])
    except KeyError as error:
        raise ValueError("unknown synthetic assumption reference") from error
