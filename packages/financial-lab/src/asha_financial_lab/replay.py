"""Exact replay verification for the locked no-decision baseline."""

from __future__ import annotations

from .artifacts import decode_evaluation_result, decode_synthetic_dataset
from .baseline import BASELINE_MODEL_ID, NO_DECISION_BENCHMARK_ID, evaluate_no_decision
from .contracts import ContractViolation
from .controls import CASH_CONTROL_ID, EQUAL_WEIGHT_CONTROL_ID, evaluate_comparison_controls


def _canonical_index(value: object, label: str) -> int:
    if not isinstance(value, str) or not value.isascii() or not value.isdecimal():
        raise ContractViolation(f"stored {label} is not a canonical non-negative integer")
    parsed = int(value)
    if str(parsed) != value:
        raise ContractViolation(f"stored {label} is not canonical")
    return parsed


def replay_no_decision_artifacts(dataset_document: object, result_document: object) -> dict:
    """Recompute a stored result and reject every mismatch."""

    dataset = decode_synthetic_dataset(dataset_document)
    stored_result = decode_evaluation_result(result_document)

    if stored_result["modelReference"]["entityId"] != BASELINE_MODEL_ID:
        raise ContractViolation("stored result does not use the no-decision baseline")
    benchmarks = stored_result["benchmarkResults"]
    if len(benchmarks) != 1 or benchmarks[0]["benchmarkId"] != NO_DECISION_BENCHMARK_ID:
        raise ContractViolation("stored result does not contain the expected baseline benchmark")

    cutoff_index = _canonical_index(benchmarks[0]["metrics"].get("cutoff_index"), "cutoff")

    replayed_result = evaluate_no_decision(dataset, cutoff_index)
    if replayed_result != stored_result:
        raise ContractViolation("stored result does not match exact deterministic replay")
    return replayed_result


def replay_comparison_control_artifacts(dataset_document: object, result_document: object) -> dict:
    """Recompute stored synthetic comparison controls and reject every mismatch."""

    dataset = decode_synthetic_dataset(dataset_document)
    stored_result = decode_evaluation_result(result_document)
    if stored_result["modelReference"]["entityId"] != BASELINE_MODEL_ID:
        raise ContractViolation("stored result does not use the deterministic baseline")
    benchmarks = stored_result["benchmarkResults"]
    if [item["benchmarkId"] for item in benchmarks] != [CASH_CONTROL_ID, EQUAL_WEIGHT_CONTROL_ID]:
        raise ContractViolation("stored result does not contain the expected comparison controls")

    start_index = _canonical_index(benchmarks[0]["metrics"].get("start_index"), "start index")
    end_index = _canonical_index(benchmarks[0]["metrics"].get("end_index"), "end index")
    for benchmark in benchmarks[1:]:
        if benchmark["metrics"].get("start_index") != str(start_index):
            raise ContractViolation("comparison controls disagree on their start index")
        if benchmark["metrics"].get("end_index") != str(end_index):
            raise ContractViolation("comparison controls disagree on their end index")

    replayed_result = evaluate_comparison_controls(dataset, start_index, end_index)
    if replayed_result != stored_result:
        raise ContractViolation("stored comparison controls do not match exact deterministic replay")
    return replayed_result
