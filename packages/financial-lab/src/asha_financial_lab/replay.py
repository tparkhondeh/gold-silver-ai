"""Exact replay verification for the locked no-decision baseline."""

from __future__ import annotations

from .artifacts import decode_evaluation_result, decode_synthetic_dataset
from .baseline import BASELINE_MODEL_ID, NO_DECISION_BENCHMARK_ID, evaluate_no_decision
from .contracts import ContractViolation


def replay_no_decision_artifacts(dataset_document: object, result_document: object) -> dict:
    """Recompute a stored result and reject every mismatch."""

    dataset = decode_synthetic_dataset(dataset_document)
    stored_result = decode_evaluation_result(result_document)

    if stored_result["modelReference"]["entityId"] != BASELINE_MODEL_ID:
        raise ContractViolation("stored result does not use the no-decision baseline")
    benchmarks = stored_result["benchmarkResults"]
    if len(benchmarks) != 1 or benchmarks[0]["benchmarkId"] != NO_DECISION_BENCHMARK_ID:
        raise ContractViolation("stored result does not contain the expected baseline benchmark")

    cutoff_text = benchmarks[0]["metrics"].get("cutoff_index")
    if not isinstance(cutoff_text, str) or not cutoff_text.isascii() or not cutoff_text.isdecimal():
        raise ContractViolation("stored cutoff is not a canonical non-negative integer")
    cutoff_index = int(cutoff_text)
    if str(cutoff_index) != cutoff_text:
        raise ContractViolation("stored cutoff is not canonical")

    replayed_result = evaluate_no_decision(dataset, cutoff_index)
    if replayed_result != stored_result:
        raise ContractViolation("stored result does not match exact deterministic replay")
    return replayed_result
