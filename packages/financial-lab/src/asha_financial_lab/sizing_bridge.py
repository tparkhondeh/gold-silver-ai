"""Exact synthetic-only research weights/path bridge to the integer-lot web harness.

No economic equivalence between synthetic index names and physical-metal fixtures
is implied. The mapping only exercises unit/cost accounting using reviewed controls.
"""
from __future__ import annotations

from copy import deepcopy
from functools import lru_cache
import json
from typing import Any

from .contracts import ContractViolation, canonical_json, fingerprint
from .controls import known_levels
from .method_comparison import build_method_comparison_report
from .synthetic import build_reference_dataset

SCHEMA_VERSION = "asha.synthetic.physical_sizing_bridge.v1"
PATH_MAPPING = {
    "SYNTH_DEFENSIVE": "SYNTH_GOLD",
    "SYNTH_TREND": "SYNTH_COIN",
    "SYNTH_VOLATILE": "SYNTH_SILVER",
    "SYNTH_CASH": "SYNTH_CASH",
}


@lru_cache(maxsize=1)
def _canonical_reference() -> str:
    report = build_method_comparison_report()
    dataset = build_reference_dataset()
    folds = []
    for fold in report["foldResults"]:
        cutoff = fold["testStartIndex"] - 1
        starting, carried = known_levels(dataset, cutoff)
        points = []
        for period in range(fold["testStartIndex"], fold["testEndIndex"] + 1):
            levels, delayed = known_levels(dataset, period)
            points.append({
                "periodIndex": period,
                "levels": {key: str(levels[key]) for key in PATH_MAPPING},
                "carriedForwardInstrumentIds": list(delayed),
            })
        folds.append({
            "foldIndex": fold["foldIndex"],
            "trainEndIndex": fold["trainEndIndex"],
            "executionCutoffIndex": cutoff,
            "testStartIndex": fold["testStartIndex"],
            "testEndIndex": fold["testEndIndex"],
            "startingLevels": {key: str(starting[key]) for key in PATH_MAPPING},
            "startingCarriedForwardInstrumentIds": list(carried),
            "methods": [{"methodId": item["methodId"], "weights": item["weights"]}
                        for item in fold["methodResults"]],
            "evaluationPoints": points,
        })
    unsigned = {
        "schemaVersion": SCHEMA_VERSION,
        "datasetKind": "synthetic_fixture",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "methodComparisonId": report["reportId"],
        "datasetReference": report["datasetReference"],
        "walkForwardPlanReference": report["walkForwardPlanReference"],
        "mappingPurpose": "mechanics_only_no_economic_equivalence",
        "pathMapping": PATH_MAPPING,
        "folds": folds,
    }
    return canonical_json({**unsigned, "bridgeId": f"ASHA_PHYSICAL_SIZING_BRIDGE_{fingerprint(unsigned)}"})


def build_sizing_bridge() -> dict[str, Any]:
    return json.loads(_canonical_reference())


def validate_sizing_bridge(payload: object) -> dict[str, Any]:
    if canonical_json(payload) != _canonical_reference():
        raise ContractViolation("physical sizing bridge must match exact synthetic replay")
    return deepcopy(payload)


if __name__ == "__main__":
    print(_canonical_reference())
