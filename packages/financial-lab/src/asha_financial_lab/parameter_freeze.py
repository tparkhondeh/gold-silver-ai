"""Canonical freeze of laboratory-v1 parameters before future calibration tests."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .contracts import ContractViolation, fingerprint
from .iran_calibration_manifest import validate_iran_calibration_manifest
from .transparent_decision import (
    TRANSPARENT_DECISION_METHOD_ID,
    TRANSPARENT_DECISION_METHOD_VERSION,
    build_transparent_decision_reference_input,
)


PARAMETER_FREEZE_SCHEMA_VERSION = "asha.synthetic.parameter_freeze.v1"
PARAMETER_FREEZE_VERSION = 1
_BUNDLE_ID = re.compile(r"ASHA_SYNTHETIC_PARAMETER_FREEZE_[a-f0-9]{64}\Z")

_FACTOR_PARAMETERS = (
    {
        "factorId": "CONCENTRATION", "weight": "0.125000000000",
        "inputMetric": "current_weight_divided_by_maximum_single_asset_weight",
        "scoringRule": "lower_is_better_five_band_leq",
        "cutoffs": ["0.50", "0.75", "1.00", "1.25"],
        "boundaryOperators": ["less_than_or_equal"] * 4,
        "pointsByRegion": [2, 1, 0, -1, -2],
    },
    {
        "factorId": "CONVERSION_COST", "weight": "0.125000000000",
        "inputMetric": "conversion_cost_rate",
        "scoringRule": "lower_is_better_five_band_leq",
        "cutoffs": ["0.0025", "0.0075", "0.015", "0.03"],
        "boundaryOperators": ["less_than_or_equal"] * 4,
        "pointsByRegion": [2, 1, 0, -1, -2],
    },
    {
        "factorId": "CRISIS_RESILIENCE", "weight": "0.125000000000",
        "inputMetric": "absolute_worst_stress_return_divided_by_drawdown_tolerance",
        "scoringRule": "lower_is_better_five_band_leq",
        "cutoffs": ["0.25", "0.50", "0.75", "1.00"],
        "boundaryOperators": ["less_than_or_equal"] * 4,
        "pointsByRegion": [2, 1, 0, -1, -2],
    },
    {
        "factorId": "DRAWDOWN", "weight": "0.125000000000",
        "inputMetric": "absolute_maximum_drawdown_divided_by_drawdown_tolerance",
        "scoringRule": "lower_is_better_five_band_leq",
        "cutoffs": ["0.25", "0.50", "0.75", "1.00"],
        "boundaryOperators": ["less_than_or_equal"] * 4,
        "pointsByRegion": [2, 1, 0, -1, -2],
    },
    {
        "factorId": "LIQUIDITY", "weight": "0.125000000000",
        "inputMetric": "integer_liquidity_score_one_to_five",
        "scoringRule": "points_equal_input_minus_three",
        "cutoffs": ["1", "2", "3", "4", "5"],
        "boundaryOperators": ["equal"] * 5,
        "pointsByRegion": [-2, -1, 0, 1, 2],
    },
    {
        "factorId": "TREND", "weight": "0.125000000000",
        "inputMetric": "selected_horizon_return_divided_by_volatility",
        "scoringRule": "mixed_boundary_five_band",
        "cutoffs": ["-1", "-0.25", "0.25", "1"],
        "boundaryOperators": [
            "less_than_or_equal", "less_than_or_equal", "less_than", "less_than",
        ],
        "pointsByRegion": [-2, -1, 0, 1, 2],
    },
    {
        "factorId": "VALUATION", "weight": "0.125000000000",
        "inputMetric": "valuation_percentile",
        "scoringRule": "lower_is_better_five_band_leq",
        "cutoffs": ["0.20", "0.40", "0.60", "0.80"],
        "boundaryOperators": ["less_than_or_equal"] * 4,
        "pointsByRegion": [2, 1, 0, -1, -2],
    },
    {
        "factorId": "VOLATILITY", "weight": "0.125000000000",
        "inputMetric": "volatility_divided_by_median_non_cash_volatility",
        "scoringRule": "lower_is_better_five_band_leq",
        "cutoffs": ["0.50", "0.85", "1.15", "1.50"],
        "boundaryOperators": ["less_than_or_equal"] * 4,
        "pointsByRegion": [2, 1, 0, -1, -2],
    },
)

_HORIZONS = (
    {
        "horizonId": "long", "inputField": "longTrendReturn",
        "laboratoryUiWindowObservations": 60,
        "pythonDecisionInputState": "precomputed_required",
        "iranCalibrationState": "not_started",
    },
    {
        "horizonId": "short", "inputField": "shortTrendReturn",
        "laboratoryUiWindowObservations": 20,
        "pythonDecisionInputState": "precomputed_required",
        "iranCalibrationState": "not_started",
    },
)

_STRESS_LABELS = (
    "COIN_BUBBLE_COMPRESSION", "COMBINED_IRAN_CRISIS", "FX_DISCONTINUITY",
    "LIQUIDITY_FREEZE", "POLITICAL_MARKET_CLOSURE",
)

_THRESHOLD_IDS = (
    "MAXIMUM_OUT_OF_SAMPLE_DRAWDOWN", "MAXIMUM_REALIZED_ALL_IN_COST",
    "MAXIMUM_TURNOVER", "MINIMUM_EVIDENCE_COVERAGE",
    "MINIMUM_OUT_OF_SAMPLE_STABILITY", "MINIMUM_SHADOW_OBSERVATIONS",
)

_TOP_KEYS = {
    "schemaVersion", "bundleId", "bundleVersion", "status", "methodReference",
    "manifestReference", "boundary", "factorParameters", "horizons", "constraints",
    "allocationRules", "costRules", "missingDataRules", "stressLabelRegistry",
    "acceptanceThresholds", "freezeLineage",
}


def _exact_mapping(value: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} has unexpected fields")
    return value


def _manifest_reference(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "manifestId": manifest["manifestId"],
        "manifestVersion": manifest["manifestVersion"],
        "schemaVersion": manifest["schemaVersion"],
    }


def _unsigned_bundle(manifest: dict[str, Any]) -> dict[str, Any]:
    reference = build_transparent_decision_reference_input()
    constraints = reference["constraints"]
    return {
        "schemaVersion": PARAMETER_FREEZE_SCHEMA_VERSION,
        "bundleVersion": PARAMETER_FREEZE_VERSION,
        "status": "laboratory_v1_frozen_real_thresholds_unset",
        "methodReference": {
            "methodId": TRANSPARENT_DECISION_METHOD_ID,
            "methodVersion": TRANSPARENT_DECISION_METHOD_VERSION,
            "iranCalibrationState": "not_started",
        },
        "manifestReference": _manifest_reference(manifest),
        "boundary": {
            "parameterSource": "laboratory_v1_code_and_owner_authorized_method",
            "containsMarketObservations": False,
            "containsProviderSelection": False,
            "containsProviderCredentials": False,
            "derivedFromSyntheticOutcomes": False,
            "realDataIngestionAllowed": False,
            "financialUseAllowed": False,
            "executionAllowed": False,
        },
        "factorParameters": deepcopy(list(_FACTOR_PARAMETERS)),
        "horizons": deepcopy(list(_HORIZONS)),
        "constraints": [
            {"constraintId": "MAXIMUM_ACCEPTABLE_DRAWDOWN_RATE", "value": constraints["maximumAcceptableDrawdownRate"]},
            {"constraintId": "MAXIMUM_SINGLE_ASSET_WEIGHT", "value": constraints["maximumSingleAssetWeight"]},
            {"constraintId": "MAXIMUM_TURNOVER_WEIGHT", "value": constraints["maximumTurnoverWeight"]},
            {"constraintId": "MINIMUM_CASH_WEIGHT", "value": constraints["minimumCashWeight"]},
            {"constraintId": "NO_TRADE_BAND_WEIGHT", "value": constraints["noTradeBandWeight"]},
        ],
        "allocationRules": {
            "scoreFormula": "50_times_sum_factor_points_times_weight",
            "preferenceFormula": "max_0.25_or_1_plus_0.25_times_composite",
            "preferenceFloor": "0.25",
            "preferenceCompositeMultiplier": "0.25",
            "riskBreachMultiplier": "0.50",
            "riskBreachCashTransferFraction": "0.50",
            "maximumTargetCashWeight": "0.50",
            "targetRule": "equal_anchor_then_preference_normalize_and_single_asset_cap",
            "turnoverDefinition": "half_sum_absolute_weight_changes",
            "turnoverRule": "scale_complete_target_delta_to_maximum_turnover",
            "noTradeComparison": "absolute_change_strictly_less_than_band",
            "weightRounding": "half_even_12_decimals",
            "percentRounding": "half_even_6_decimals",
            "moneyRounding": "half_even_whole_toman",
        },
        "costRules": {
            "decisionInput": "conversionCostRate",
            "decisionUse": "one_of_eight_equal_factor_scores",
            "syntheticComparisonReturnDeduction": "not_applied",
            "realAllInCostModelState": "STATUS_TBD_REQUIRES_LICENSED_IRAN_EVIDENCE",
            "slippageModelState": "STATUS_TBD_REQUIRES_EXECUTABLE_DEPTH_EVIDENCE",
        },
        "missingDataRules": {
            "requiredAssetDataStatus": "synthetic_complete",
            "missingRequiredInput": "fail_closed",
            "silentFillAllowed": False,
            "interpolationAllowed": False,
            "staleOrNonTradableReturn": "must_not_be_recorded_as_zero_without_explicit_rule",
            "cashFactorRule": "factor_score_not_applied_score_zero",
        },
        "stressLabelRegistry": [
            {
                "labelId": label,
                "magnitude": None,
                "probability": None,
                "realCalibrationState": "STATUS_TBD_REQUIRES_LICENSED_IRAN_EVIDENCE",
            }
            for label in _STRESS_LABELS
        ],
        "acceptanceThresholds": [
            {
                "thresholdId": threshold_id,
                "value": None,
                "unit": None,
                "state": "STATUS_TBD_REQUIRES_REAL_TRAIN_VALIDATION_AND_OWNER_APPROVAL",
                "syntheticOutcomesMaySetValue": False,
            }
            for threshold_id in _THRESHOLD_IDS
        ],
        "freezeLineage": {
            "freezePoint": "before_future_calibration_evidence_or_test_link",
            "fingerprintAlgorithm": "sha256_canonical_json",
            "linkedSyntheticEvidenceBundleIds": [],
            "linkedTestResultIds": [],
            "realDatasetFingerprint": None,
            "parameterMutationAllowed": False,
            "newVersionRequiredForAnyChange": True,
        },
    }


def build_parameter_freeze_bundle(manifest_payload: object) -> dict[str, Any]:
    """Freeze v1 inputs without using synthetic or real outcomes."""

    manifest = validate_iran_calibration_manifest(manifest_payload)
    unsigned = _unsigned_bundle(manifest)
    bundle = {
        **unsigned,
        "bundleId": f"ASHA_SYNTHETIC_PARAMETER_FREEZE_{fingerprint(unsigned)}",
    }
    return validate_parameter_freeze_bundle(bundle, manifest)


def validate_parameter_freeze_bundle(
    payload: object,
    manifest_payload: object,
) -> dict[str, Any]:
    manifest = validate_iran_calibration_manifest(manifest_payload)
    bundle = deepcopy(_exact_mapping(payload, _TOP_KEYS, "parameter-freeze bundle"))
    if (
        bundle["schemaVersion"] != PARAMETER_FREEZE_SCHEMA_VERSION
        or bundle["bundleVersion"] != PARAMETER_FREEZE_VERSION
        or bundle["status"] != "laboratory_v1_frozen_real_thresholds_unset"
        or not isinstance(bundle["bundleId"], str)
        or not _BUNDLE_ID.fullmatch(bundle["bundleId"])
    ):
        raise ContractViolation("parameter-freeze identity or state is invalid")

    expected_unsigned = _unsigned_bundle(manifest)
    expected = {
        **expected_unsigned,
        "bundleId": f"ASHA_SYNTHETIC_PARAMETER_FREEZE_{fingerprint(expected_unsigned)}",
    }
    if bundle != expected:
        raise ContractViolation("parameter-freeze bundle drifted from exact laboratory v1")
    return bundle
