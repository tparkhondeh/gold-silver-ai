"""Versioned requirements for a future Iran-specific calibration, without real data."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .contracts import ContractViolation, fingerprint
from .transparent_decision import (
    TRANSPARENT_DECISION_METHOD_ID,
    TRANSPARENT_DECISION_METHOD_VERSION,
)


IRAN_CALIBRATION_MANIFEST_SCHEMA_VERSION = "asha.synthetic.iran_calibration_manifest.v1"
IRAN_CALIBRATION_MANIFEST_VERSION = 1
_MANIFEST_ID = re.compile(r"ASHA_IRAN_CALIBRATION_MANIFEST_[a-f0-9]{64}\Z")
_POINT_IN_TIME_FIELDS = (
    "available_at_utc",
    "observed_at_utc",
    "source_contract_id",
    "source_contract_version",
)

_FACTOR_SPECS = {
    "CONCENTRATION": {
        "requiredFields": (
            "available_at_utc", "instrument_id", "observed_at_utc",
            "portfolio_snapshot_id", "position_value_toman", "source_contract_id",
            "source_contract_version", "total_portfolio_value_toman",
        ),
        "minimumValidObservations": 252,
        "minimumCoveragePercent": "100.000000",
        "minimumIndependentSources": 1,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "portfolio_weight_and_hhi_distribution",
        "iranSpecificChecks": (
            "STALE_DOMESTIC_VALUATIONS_EXCLUDED",
            "OWNER_LEDGER_AND_MARKET_CUTOFF_ALIGNED",
        ),
    },
    "CONVERSION_COST": {
        "requiredFields": (
            "available_at_utc", "direct_fee_toman", "executable_ask_toman",
            "executable_bid_toman", "instrument_id", "minimum_order_size",
            "observed_at_utc", "physical_conversion_cost_toman", "source_contract_id",
            "source_contract_version", "tax_toman",
        ),
        "minimumValidObservations": 504,
        "minimumCoveragePercent": "95.000000",
        "minimumIndependentSources": 2,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "all_in_round_trip_cost_distribution",
        "iranSpecificChecks": (
            "PHYSICAL_AND_DIGITAL_ROUTES_SEPARATED",
            "TAX_FEE_AND_SPREAD_COMPONENTS_NOT_NETTED_AWAY",
        ),
    },
    "CRISIS_RESILIENCE": {
        "requiredFields": (
            "available_at_utc", "crisis_window_id", "instrument_id", "observed_at_utc",
            "source_contract_id", "source_contract_version", "synchronized_total_return",
            "tradable_flag",
        ),
        "minimumValidObservations": 1260,
        "minimumCoveragePercent": "95.000000",
        "minimumIndependentSources": 2,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "worst_crisis_window_return_distribution",
        "iranSpecificChecks": (
            "POLITICAL_FX_AND_MARKET_CLOSURE_WINDOWS_LABELLED",
            "NON_TRADABLE_DAYS_NOT_TREATED_AS_ZERO_RISK",
        ),
    },
    "DRAWDOWN": {
        "requiredFields": (
            "adjusted_total_return_index", "available_at_utc", "closure_reason",
            "instrument_id", "observed_at_utc", "source_contract_id",
            "source_contract_version", "tradable_flag",
        ),
        "minimumValidObservations": 1260,
        "minimumCoveragePercent": "98.000000",
        "minimumIndependentSources": 2,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "peak_to_trough_drawdown_distribution",
        "iranSpecificChecks": (
            "CLOSURES_AND_PRICE_LIMITS_RETAINED",
            "CORPORATE_AND_INSTRUMENT_SPEC_CHANGES_ADJUSTED_POINT_IN_TIME",
        ),
    },
    "LIQUIDITY": {
        "requiredFields": (
            "available_at_utc", "executable_ask_toman", "executable_bid_toman",
            "executable_depth_toman", "instrument_id", "minimum_lot_size",
            "observed_at_utc", "source_contract_id", "source_contract_version",
            "traded_value_toman", "tradable_flag", "volume",
        ),
        "minimumValidObservations": 756,
        "minimumCoveragePercent": "95.000000",
        "minimumIndependentSources": 2,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "executable_depth_spread_and_turnover_distribution",
        "iranSpecificChecks": (
            "THIN_MARKET_AND_PRICE_LIMIT_SESSIONS_SEPARATED",
            "DISPLAYED_QUOTE_NOT_ASSUMED_EXECUTABLE",
        ),
    },
    "TREND": {
        "requiredFields": (
            "adjusted_total_return_index", "available_at_utc", "instrument_id",
            "observed_at_utc", "source_contract_id", "source_contract_version",
            "tradable_flag",
        ),
        "minimumValidObservations": 1260,
        "minimumCoveragePercent": "98.000000",
        "minimumIndependentSources": 2,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "short_and_long_horizon_return_to_volatility_bands",
        "iranSpecificChecks": (
            "INFLATION_AND_FX_REGIMES_SEPARATED",
            "NON_SYNCHRONOUS_MARKET_CLOSES_ALIGNED_WITH_AVAILABILITY",
        ),
    },
    "VALUATION": {
        "requiredFields": (
            "available_at_utc", "global_spot_usd", "instrument_id",
            "local_unit_price_toman", "observed_at_utc", "product_premium_toman",
            "purity_fraction", "reference_weight_gram", "source_contract_id",
            "source_contract_version", "usd_irr_rate",
        ),
        "minimumValidObservations": 756,
        "minimumCoveragePercent": "95.000000",
        "minimumIndependentSources": 2,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "iran_specific_premium_and_percentile_distribution",
        "iranSpecificChecks": (
            "COIN_AND_BULLION_SPECIFICATIONS_VERSIONED_SEPARATELY",
            "GLOBAL_SPOT_AND_FX_TIMESTAMPS_SYNCHRONIZED",
        ),
    },
    "VOLATILITY": {
        "requiredFields": (
            "available_at_utc", "instrument_id", "observed_at_utc", "source_contract_id",
            "source_contract_version", "stale_flag", "synchronized_total_return",
            "tradable_flag",
        ),
        "minimumValidObservations": 1260,
        "minimumCoveragePercent": "98.000000",
        "minimumIndependentSources": 2,
        "minimumDistinctRegimes": 3,
        "calibrationTarget": "realized_volatility_distribution_by_regime",
        "iranSpecificChecks": (
            "STALE_AND_NON_TRADABLE_PERIODS_NOT_RECORDED_AS_ZERO_RETURN",
            "VOLATILITY_WINDOWS_FROZEN_BEFORE_TEST_ACCESS",
        ),
    },
}

_CONSTRAINT_SPECS = {
    "MAXIMUM_ACCEPTABLE_DRAWDOWN_RATE": (
        "0.25", ("OWNER_RISK_TOLERANCE", "IRAN_DRAWDOWN_DISTRIBUTION")
    ),
    "MAXIMUM_SINGLE_ASSET_WEIGHT": (
        "0.35", ("CONCENTRATION_DISTRIBUTION", "EXECUTABLE_LIQUIDITY_CAPACITY")
    ),
    "MAXIMUM_TURNOVER_WEIGHT": (
        "0.25", ("ALL_IN_CONVERSION_COST", "EXECUTABLE_MARKET_DEPTH")
    ),
    "MINIMUM_CASH_WEIGHT": (
        "0.15", ("OWNER_LIQUIDITY_NEED", "IRAN_CRISIS_LIQUIDITY_EVIDENCE")
    ),
    "NO_TRADE_BAND_WEIGHT": (
        "0.02", ("ALL_IN_CONVERSION_COST", "ESTIMATED_SLIPPAGE")
    ),
}

_GATES = (
    ("G01_SYNTHETIC_REAL_ISOLATION", "data", "no synthetic row exists in the real calibration dataset"),
    ("G02_LICENSE_AND_PROVENANCE", "data", "every row has an approved license and immutable source-contract lineage"),
    ("G03_POINT_IN_TIME_INTEGRITY", "data", "every feature uses only values available at its historical cutoff"),
    ("G04_HISTORY_AND_COVERAGE", "data", "every factor meets its minimum valid observations and coverage"),
    ("G05_IRAN_MARKET_EVIDENCE", "data", "every declared Iran-specific check has evidence"),
    ("G06_TRAIN_VALIDATION_TEST_ISOLATION", "fit", "chronological splits, purge and embargo have no overlap or leakage"),
    ("G07_PARAMETER_FREEZE", "fit", "weights bands windows and constraints are fingerprint-frozen before test access"),
    ("G08_OUT_OF_SAMPLE_REPLAY", "test", "all required walk-forward folds replay exactly on untouched test windows"),
    ("G09_PREDECLARED_ACCEPTANCE", "test", "owner-approved acceptance thresholds are registered before test access and all pass"),
    ("G10_SHADOW_AND_OWNER_APPROVAL", "promotion", "shadow review passes and a later owner ADR explicitly approves real use"),
)

_HISTORY_PLAN = {
    "frequency": "instrument_native_close_aligned_without_interpolation",
    "minimumValidObservations": 1260,
    "trainObservations": 756,
    "validationObservations": 252,
    "testObservations": 252,
    "minimumWalkForwardFolds": 6,
    "purgeObservations": 20,
    "embargoObservations": 5,
    "minimumDistinctRegimes": 3,
    "minimumCrisisWindows": 3,
    "walkForwardScope": "development_segment_only_test_untouched",
    "splitRule": "chronological_train_then_validation_then_untouched_test",
    "testAccessRule": "once_after_parameter_and_acceptance_threshold_freeze",
}

_FREEZE_ITEMS = (
    "ACCEPTANCE_THRESHOLDS", "CONSTRAINT_VALUES", "FACTOR_BANDS", "FACTOR_WEIGHTS",
    "HORIZON_WINDOWS", "MISSING_DATA_RULES", "REGIME_LABEL_RULES",
    "STRESS_WINDOW_REGISTRY", "TRANSACTION_COST_MODEL", "VALUATION_REFERENCE_RULES",
)

_TOP_KEYS = {
    "schemaVersion", "manifestId", "manifestVersion", "status", "jurisdiction",
    "methodReference", "boundary", "historyPlan", "factorRequirements",
    "constraintRequirements", "parameterFreeze", "validationGates", "promotionPolicy",
}


def _exact_mapping(value: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} has unexpected fields")
    return value


def _sorted_unique_strings(value: object, label: str) -> list[str]:
    if not isinstance(value, list) or not value or any(not isinstance(item, str) or not item for item in value):
        raise ContractViolation(f"{label} must be a non-empty string array")
    if value != sorted(set(value)):
        raise ContractViolation(f"{label} must be uniquely sorted")
    return value


def build_iran_calibration_manifest() -> dict[str, Any]:
    """Build the requirements-only manifest; it contains no market observations."""

    unsigned = {
        "schemaVersion": IRAN_CALIBRATION_MANIFEST_SCHEMA_VERSION,
        "manifestVersion": IRAN_CALIBRATION_MANIFEST_VERSION,
        "status": "requirements_only_not_started",
        "jurisdiction": "IRAN",
        "methodReference": {
            "methodId": TRANSPARENT_DECISION_METHOD_ID,
            "methodVersion": TRANSPARENT_DECISION_METHOD_VERSION,
            "currentWeightsAndBandsState": "frozen_laboratory_v1_not_iran_calibrated",
        },
        "boundary": {
            "datasetKind": "synthetic_contract_fixture",
            "containsMarketObservations": False,
            "providerSelected": False,
            "realDataIngestionAllowed": False,
            "financialUseAllowed": False,
            "executionAllowed": False,
        },
        "historyPlan": deepcopy(_HISTORY_PLAN),
        "factorRequirements": [
            {
                "factorId": factor_id,
                **{key: sorted(value) if isinstance(value, tuple) else value for key, value in spec.items()},
                "missingDataRule": "fail_closed_no_silent_fill",
                "finalCalibrationState": "not_started",
            }
            for factor_id, spec in sorted(_FACTOR_SPECS.items())
        ],
        "constraintRequirements": [
            {
                "constraintId": constraint_id,
                "laboratoryV1Value": value,
                "requiredEvidence": sorted(evidence),
                "valueSelectionRule": "train_and_validation_only_then_freeze",
                "ownerConstraintRequired": True,
                "finalCalibrationState": "not_started",
            }
            for constraint_id, (value, evidence) in sorted(_CONSTRAINT_SPECS.items())
        ],
        "parameterFreeze": {
            "items": list(_FREEZE_ITEMS),
            "freezePoint": "before_any_untouched_test_window_is_opened",
            "requiredArtifact": "canonical_parameter_bundle_with_sha256_fingerprint",
            "syntheticResultsMayChangeParameters": False,
            "testResultsMayChangeFrozenParameters": False,
        },
        "validationGates": [
            {
                "gateId": gate_id,
                "stage": stage,
                "passRule": pass_rule,
                "failRule": "any_missing_or_false_evidence_fails_closed",
                "currentState": "not_evaluated",
            }
            for gate_id, stage, pass_rule in _GATES
        ],
        "promotionPolicy": {
            "allGatesMustPass": True,
            "licensedIranDataRequired": True,
            "independentCrossCheckRequired": True,
            "frozenArtifactFingerprintRequired": True,
            "laterOwnerAdrRequired": True,
            "syntheticResultsCanProveFinancialPerformance": False,
            "currentFinancialUseAllowed": False,
            "currentExecutionAllowed": False,
        },
    }
    manifest = {**unsigned, "manifestId": f"ASHA_IRAN_CALIBRATION_MANIFEST_{fingerprint(unsigned)}"}
    return validate_iran_calibration_manifest(manifest)


def validate_iran_calibration_manifest(payload: object) -> dict[str, Any]:
    manifest = deepcopy(_exact_mapping(payload, _TOP_KEYS, "Iran calibration manifest"))
    if (
        manifest["schemaVersion"] != IRAN_CALIBRATION_MANIFEST_SCHEMA_VERSION
        or manifest["manifestVersion"] != IRAN_CALIBRATION_MANIFEST_VERSION
        or manifest["status"] != "requirements_only_not_started"
        or manifest["jurisdiction"] != "IRAN"
        or not isinstance(manifest["manifestId"], str)
        or not _MANIFEST_ID.fullmatch(manifest["manifestId"])
    ):
        raise ContractViolation("Iran calibration manifest identity or state is invalid")

    method = _exact_mapping(
        manifest["methodReference"],
        {"methodId", "methodVersion", "currentWeightsAndBandsState"},
        "methodReference",
    )
    if method != {
        "methodId": TRANSPARENT_DECISION_METHOD_ID,
        "methodVersion": TRANSPARENT_DECISION_METHOD_VERSION,
        "currentWeightsAndBandsState": "frozen_laboratory_v1_not_iran_calibrated",
    }:
        raise ContractViolation("calibration manifest must remain bound to laboratory method v1")

    boundary = _exact_mapping(
        manifest["boundary"],
        {"datasetKind", "containsMarketObservations", "providerSelected", "realDataIngestionAllowed", "financialUseAllowed", "executionAllowed"},
        "boundary",
    )
    if boundary != {
        "datasetKind": "synthetic_contract_fixture",
        "containsMarketObservations": False,
        "providerSelected": False,
        "realDataIngestionAllowed": False,
        "financialUseAllowed": False,
        "executionAllowed": False,
    }:
        raise ContractViolation("Iran calibration manifest crossed its no-real-data boundary")

    history = _exact_mapping(
        manifest["historyPlan"],
        {"frequency", "minimumValidObservations", "trainObservations", "validationObservations", "testObservations", "minimumWalkForwardFolds", "purgeObservations", "embargoObservations", "minimumDistinctRegimes", "minimumCrisisWindows", "walkForwardScope", "splitRule", "testAccessRule"},
        "historyPlan",
    )
    if history != _HISTORY_PLAN or sum(history[key] for key in ("trainObservations", "validationObservations", "testObservations")) != history["minimumValidObservations"]:
        raise ContractViolation("history and isolation plan drifted")

    factors = manifest["factorRequirements"]
    if not isinstance(factors, list) or [item.get("factorId") for item in factors if isinstance(item, dict)] != sorted(_FACTOR_SPECS):
        raise ContractViolation("all eight factor requirements must be uniquely sorted")
    for item in factors:
        factor = _exact_mapping(
            item,
            {"factorId", "requiredFields", "minimumValidObservations", "minimumCoveragePercent", "minimumIndependentSources", "minimumDistinctRegimes", "calibrationTarget", "iranSpecificChecks", "missingDataRule", "finalCalibrationState"},
            "factorRequirement",
        )
        spec = _FACTOR_SPECS[factor["factorId"]]
        expected = {
            "factorId": factor["factorId"],
            **{key: sorted(value) if isinstance(value, tuple) else value for key, value in spec.items()},
            "missingDataRule": "fail_closed_no_silent_fill",
            "finalCalibrationState": "not_started",
        }
        _sorted_unique_strings(factor["requiredFields"], "requiredFields")
        _sorted_unique_strings(factor["iranSpecificChecks"], "iranSpecificChecks")
        if factor != expected or not set(_POINT_IN_TIME_FIELDS).issubset(factor["requiredFields"]):
            raise ContractViolation("factor requirement drifted or lost point-in-time lineage")

    constraints = manifest["constraintRequirements"]
    if not isinstance(constraints, list) or [item.get("constraintId") for item in constraints if isinstance(item, dict)] != sorted(_CONSTRAINT_SPECS):
        raise ContractViolation("all five constraint requirements must be uniquely sorted")
    for item in constraints:
        constraint = _exact_mapping(
            item,
            {"constraintId", "laboratoryV1Value", "requiredEvidence", "valueSelectionRule", "ownerConstraintRequired", "finalCalibrationState"},
            "constraintRequirement",
        )
        value, evidence = _CONSTRAINT_SPECS[constraint["constraintId"]]
        if constraint != {
            "constraintId": constraint["constraintId"], "laboratoryV1Value": value,
            "requiredEvidence": sorted(evidence),
            "valueSelectionRule": "train_and_validation_only_then_freeze",
            "ownerConstraintRequired": True, "finalCalibrationState": "not_started",
        }:
            raise ContractViolation("constraint requirement drifted")
        _sorted_unique_strings(constraint["requiredEvidence"], "requiredEvidence")

    freeze = _exact_mapping(
        manifest["parameterFreeze"],
        {"items", "freezePoint", "requiredArtifact", "syntheticResultsMayChangeParameters", "testResultsMayChangeFrozenParameters"},
        "parameterFreeze",
    )
    _sorted_unique_strings(freeze["items"], "parameterFreeze.items")
    if freeze["items"] != list(_FREEZE_ITEMS) or freeze["freezePoint"] != "before_any_untouched_test_window_is_opened" or freeze["requiredArtifact"] != "canonical_parameter_bundle_with_sha256_fingerprint" or freeze["syntheticResultsMayChangeParameters"] is not False or freeze["testResultsMayChangeFrozenParameters"] is not False:
        raise ContractViolation("parameter freeze must prevent result chasing")

    gates = manifest["validationGates"]
    if not isinstance(gates, list) or [item.get("gateId") for item in gates if isinstance(item, dict)] != [item[0] for item in _GATES]:
        raise ContractViolation("all validation gates are required in declared order")
    for item, expected in zip(gates, _GATES, strict=True):
        gate = _exact_mapping(item, {"gateId", "stage", "passRule", "failRule", "currentState"}, "validationGate")
        if gate != {"gateId": expected[0], "stage": expected[1], "passRule": expected[2], "failRule": "any_missing_or_false_evidence_fails_closed", "currentState": "not_evaluated"}:
            raise ContractViolation("validation gate drifted or was prematurely passed")

    promotion = _exact_mapping(
        manifest["promotionPolicy"],
        {"allGatesMustPass", "licensedIranDataRequired", "independentCrossCheckRequired", "frozenArtifactFingerprintRequired", "laterOwnerAdrRequired", "syntheticResultsCanProveFinancialPerformance", "currentFinancialUseAllowed", "currentExecutionAllowed"},
        "promotionPolicy",
    )
    if promotion != {
        "allGatesMustPass": True, "licensedIranDataRequired": True,
        "independentCrossCheckRequired": True, "frozenArtifactFingerprintRequired": True,
        "laterOwnerAdrRequired": True, "syntheticResultsCanProveFinancialPerformance": False,
        "currentFinancialUseAllowed": False, "currentExecutionAllowed": False,
    }:
        raise ContractViolation("promotion policy cannot approve real or financial use")

    unsigned = {key: value for key, value in manifest.items() if key != "manifestId"}
    if manifest["manifestId"] != f"ASHA_IRAN_CALIBRATION_MANIFEST_{fingerprint(unsigned)}":
        raise ContractViolation("Iran calibration manifest fingerprint mismatch")
    return manifest
