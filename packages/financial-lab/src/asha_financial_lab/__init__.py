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
from .controls import (
    CASH_CONTROL_ID,
    EQUAL_WEIGHT_CONTROL_ID,
    NO_TRADE_CONTROL_ID,
    evaluate_comparison_controls,
)
from .synthetic import REFERENCE_DATASET_ID, REFERENCE_PERIODS, build_reference_dataset
from .replay import replay_comparison_control_artifacts, replay_no_decision_artifacts

__all__ = [
    "ContractViolation",
    "BASELINE_MODEL_ID",
    "CASH_CONTROL_ID",
    "EQUAL_WEIGHT_CONTROL_ID",
    "NO_TRADE_CONTROL_ID",
    "REFERENCE_DATASET_ID",
    "REFERENCE_PERIODS",
    "build_reference_dataset",
    "canonical_json",
    "decode_evaluation_result",
    "decode_synthetic_dataset",
    "encode_evaluation_result",
    "encode_synthetic_dataset",
    "evaluate_comparison_controls",
    "fingerprint",
    "evaluate_no_decision",
    "replay_no_decision_artifacts",
    "replay_comparison_control_artifacts",
    "seal_evaluation_result",
    "seal_synthetic_dataset",
    "validate_evaluation_result",
    "validate_synthetic_dataset",
]
