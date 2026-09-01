"""Synthetic-only deterministic financial laboratory."""

from .artifacts import (
    decode_evaluation_result,
    decode_inverse_volatility_weights,
    decode_normalized_fold,
    decode_return_matrix,
    decode_synthetic_dataset,
    decode_train_only_standardizer,
    decode_walk_forward_plan,
    decode_walk_forward_control_report,
    decode_weighted_control_evaluation,
    encode_evaluation_result,
    encode_inverse_volatility_weights,
    encode_normalized_fold,
    encode_return_matrix,
    encode_synthetic_dataset,
    encode_train_only_standardizer,
    encode_walk_forward_plan,
    encode_walk_forward_control_report,
    encode_weighted_control_evaluation,
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
from .comparison_weights import (
    INVERSE_VOLATILITY_CONTROL_ID,
    INVERSE_VOLATILITY_SCHEMA_VERSION,
    build_inverse_volatility_control_weights,
    validate_inverse_volatility_control_weights,
)
from .control_evaluation import (
    WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION,
    evaluate_inverse_volatility_control_fold,
    validate_inverse_volatility_control_evaluation,
)
from .features import (
    RETURN_MATRIX_SCHEMA_VERSION,
    build_point_in_time_return_matrix,
    validate_point_in_time_return_matrix,
)
from .synthetic import REFERENCE_DATASET_ID, REFERENCE_PERIODS, build_reference_dataset
from .replay import replay_comparison_control_artifacts, replay_no_decision_artifacts
from .parquet_transport import (
    PARQUET_SCHEMA_VERSION,
    decode_synthetic_dataset_parquet,
    encode_synthetic_dataset_parquet,
)
from .normalization import (
    NORMALIZED_FOLD_SCHEMA_VERSION,
    STANDARDIZER_SCHEMA_VERSION,
    apply_train_fitted_standardizer,
    fit_train_only_standardizer,
    validate_normalized_fold,
    validate_train_only_standardizer,
)
from .walk_forward import WALK_FORWARD_SCHEMA_VERSION, build_walk_forward_plan, validate_walk_forward_plan
from .walk_forward_evaluation import (
    WALK_FORWARD_EVALUATION_SCHEMA_VERSION,
    build_inverse_volatility_walk_forward_report,
    validate_inverse_volatility_walk_forward_report,
)

__all__ = [
    "ContractViolation",
    "BASELINE_MODEL_ID",
    "CASH_CONTROL_ID",
    "EQUAL_WEIGHT_CONTROL_ID",
    "INVERSE_VOLATILITY_CONTROL_ID",
    "INVERSE_VOLATILITY_SCHEMA_VERSION",
    "NO_TRADE_CONTROL_ID",
    "NORMALIZED_FOLD_SCHEMA_VERSION",
    "PARQUET_SCHEMA_VERSION",
    "REFERENCE_DATASET_ID",
    "REFERENCE_PERIODS",
    "RETURN_MATRIX_SCHEMA_VERSION",
    "STANDARDIZER_SCHEMA_VERSION",
    "WALK_FORWARD_SCHEMA_VERSION",
    "WALK_FORWARD_EVALUATION_SCHEMA_VERSION",
    "WEIGHTED_CONTROL_EVALUATION_SCHEMA_VERSION",
    "build_reference_dataset",
    "build_inverse_volatility_control_weights",
    "build_inverse_volatility_walk_forward_report",
    "apply_train_fitted_standardizer",
    "build_walk_forward_plan",
    "build_point_in_time_return_matrix",
    "canonical_json",
    "decode_evaluation_result",
    "decode_inverse_volatility_weights",
    "decode_normalized_fold",
    "decode_return_matrix",
    "decode_synthetic_dataset",
    "decode_train_only_standardizer",
    "decode_synthetic_dataset_parquet",
    "decode_walk_forward_plan",
    "decode_walk_forward_control_report",
    "decode_weighted_control_evaluation",
    "encode_evaluation_result",
    "encode_inverse_volatility_weights",
    "encode_normalized_fold",
    "encode_return_matrix",
    "encode_synthetic_dataset",
    "encode_train_only_standardizer",
    "encode_synthetic_dataset_parquet",
    "encode_walk_forward_plan",
    "encode_walk_forward_control_report",
    "encode_weighted_control_evaluation",
    "evaluate_comparison_controls",
    "evaluate_inverse_volatility_control_fold",
    "fingerprint",
    "fit_train_only_standardizer",
    "evaluate_no_decision",
    "replay_no_decision_artifacts",
    "replay_comparison_control_artifacts",
    "seal_evaluation_result",
    "seal_synthetic_dataset",
    "validate_evaluation_result",
    "validate_synthetic_dataset",
    "validate_walk_forward_plan",
    "validate_inverse_volatility_walk_forward_report",
    "validate_point_in_time_return_matrix",
    "validate_normalized_fold",
    "validate_inverse_volatility_control_weights",
    "validate_inverse_volatility_control_evaluation",
    "validate_train_only_standardizer",
]
