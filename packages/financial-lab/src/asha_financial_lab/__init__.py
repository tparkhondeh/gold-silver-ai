"""Synthetic-only deterministic financial laboratory."""

from .baseline import BASELINE_MODEL_ID, evaluate_no_decision
from .contracts import (
    ContractViolation,
    canonical_json,
    fingerprint,
    seal_evaluation_result,
    seal_synthetic_dataset,
    validate_evaluation_result,
    validate_synthetic_dataset,
)
from .synthetic import REFERENCE_DATASET_ID, REFERENCE_PERIODS, build_reference_dataset

__all__ = [
    "ContractViolation",
    "BASELINE_MODEL_ID",
    "REFERENCE_DATASET_ID",
    "REFERENCE_PERIODS",
    "build_reference_dataset",
    "canonical_json",
    "fingerprint",
    "evaluate_no_decision",
    "seal_evaluation_result",
    "seal_synthetic_dataset",
    "validate_evaluation_result",
    "validate_synthetic_dataset",
]
