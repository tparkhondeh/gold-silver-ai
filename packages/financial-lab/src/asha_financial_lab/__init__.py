"""Synthetic-only deterministic financial laboratory."""

from .artifacts import (
    decode_evaluation_result,
    decode_synthetic_dataset,
    encode_evaluation_result,
    encode_synthetic_dataset,
)
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
from .replay import replay_no_decision_artifacts

__all__ = [
    "ContractViolation",
    "BASELINE_MODEL_ID",
    "REFERENCE_DATASET_ID",
    "REFERENCE_PERIODS",
    "build_reference_dataset",
    "canonical_json",
    "decode_evaluation_result",
    "decode_synthetic_dataset",
    "encode_evaluation_result",
    "encode_synthetic_dataset",
    "fingerprint",
    "evaluate_no_decision",
    "replay_no_decision_artifacts",
    "seal_evaluation_result",
    "seal_synthetic_dataset",
    "validate_evaluation_result",
    "validate_synthetic_dataset",
]
