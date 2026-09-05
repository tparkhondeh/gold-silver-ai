"""Transparent, constraint-aware synthetic decision proposal with exact replay."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import re
from typing import Any

from .contracts import ContractViolation, fingerprint


TRANSPARENT_DECISION_INPUT_SCHEMA_VERSION = "asha.synthetic.decision_input.v1"
TRANSPARENT_DECISION_SCHEMA_VERSION = "asha.synthetic.transparent_decision.v1"
TRANSPARENT_DECISION_METHOD_ID = "ASHA_TRANSPARENT_GUARDED_DECISION_V1"
TRANSPARENT_DECISION_METHOD_VERSION = 1

_INPUT_ID = re.compile(r"ASHA_SYNTHETIC_DECISION_[A-Z0-9_]{3,48}_V[1-9][0-9]*\Z")
_INSTRUMENT_ID = re.compile(r"SYNTH_[A-Z0-9_]{2,48}\Z")
_CLASS_ID = re.compile(r"SYNTH_CLASS_[A-Z0-9_]{2,48}\Z")
_DECISION_ID = re.compile(r"ASHA_TRANSPARENT_DECISION_[a-f0-9]{64}\Z")
_MONEY = re.compile(r"(?:0|[1-9][0-9]{0,14})\Z")
_RATE = re.compile(r"(?:0|1)(?:\.[0-9]{1,12})?\Z")
_SIGNED_RATE = re.compile(r"-?(?:0|1)(?:\.[0-9]{1,12})?\Z")
_QUANTUM = Decimal("0.000000000001")
_PERCENT_QUANTUM = Decimal("0.000001")

_INPUT_KEYS = {
    "schemaVersion", "datasetId", "datasetVersion", "datasetKind",
    "financialUseAllowed", "horizon", "totalValueToman", "constraints",
    "assets", "contentFingerprint",
}
_CONSTRAINT_KEYS = {
    "cashInstrumentId", "minimumCashWeight", "maximumSingleAssetWeight",
    "maximumTurnoverWeight", "noTradeBandWeight", "maximumAcceptableDrawdownRate",
}
_ASSET_KEYS = {
    "instrumentId", "displayName", "assetClassId", "currentValueToman",
    "shortTrendReturn", "longTrendReturn", "volatilityRate", "maximumDrawdownRate",
    "worstStressReturn", "valuationPercentile", "liquidityScore",
    "conversionCostRate", "dataStatus",
}
_RESULT_KEYS = {
    "schemaVersion", "decisionId", "status", "financialUseAllowed",
    "executionAllowed", "decisionState", "methodologyReference", "inputReference",
    "horizon", "parameters", "assetDecisions", "overallDecision",
    "portfolioMetrics", "evidenceState", "reasonCodes",
}
_FACTOR_IDS = (
    "CONCENTRATION", "CONVERSION_COST", "CRISIS_RESILIENCE", "DRAWDOWN",
    "LIQUIDITY", "TREND", "VALUATION", "VOLATILITY",
)
_FACTOR_WEIGHT = Decimal("0.125")


def _rate(value: Any, label: str, *, signed: bool = False) -> Decimal:
    pattern = _SIGNED_RATE if signed else _RATE
    if not isinstance(value, str) or not pattern.fullmatch(value) or value in {"-0", "-0.0"}:
        raise ContractViolation(f"{label} must be a canonical bounded decimal rate")
    parsed = Decimal(value)
    if not Decimal("-1") <= parsed <= Decimal("1"):
        raise ContractViolation(f"{label} must stay between -1 and 1")
    return parsed


def _money(value: Any, label: str) -> Decimal:
    if not isinstance(value, str) or not _MONEY.fullmatch(value):
        raise ContractViolation(f"{label} must be a non-negative whole-toman string")
    return Decimal(value)


def _weight_string(value: Decimal) -> str:
    normalized = value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.12f}"


def _percent_string(value: Decimal) -> str:
    normalized = value.quantize(_PERCENT_QUANTUM, rounding=ROUND_HALF_EVEN)
    if normalized == 0:
        normalized = abs(normalized)
    return f"{normalized:.6f}"


def _validate_asset(asset: Any, index: int) -> dict[str, Any]:
    if not isinstance(asset, dict) or set(asset) != _ASSET_KEYS:
        raise ContractViolation(f"assets[{index}] has unexpected fields")
    instrument_id = asset["instrumentId"]
    if not isinstance(instrument_id, str) or not _INSTRUMENT_ID.fullmatch(instrument_id):
        raise ContractViolation("decision assets must use synthetic instrument IDs")
    if (
        not isinstance(asset["displayName"], str)
        or not asset["displayName"].startswith("[SYNTHETIC] ")
        or not 14 <= len(asset["displayName"]) <= 100
    ):
        raise ContractViolation("decision asset names must be visibly synthetic")
    if not isinstance(asset["assetClassId"], str) or not _CLASS_ID.fullmatch(asset["assetClassId"]):
        raise ContractViolation("asset class must use the synthetic namespace")
    _money(asset["currentValueToman"], "currentValueToman")
    for key in (
        "shortTrendReturn", "longTrendReturn", "maximumDrawdownRate", "worstStressReturn",
    ):
        _rate(asset[key], key, signed=True)
    for key in ("volatilityRate", "valuationPercentile", "conversionCostRate"):
        _rate(asset[key], key)
    if _rate(asset["volatilityRate"], "volatilityRate") <= 0:
        raise ContractViolation("volatilityRate must be positive even for the synthetic cash path")
    if _rate(asset["maximumDrawdownRate"], "maximumDrawdownRate", signed=True) > 0:
        raise ContractViolation("maximumDrawdownRate cannot be positive")
    if _rate(asset["worstStressReturn"], "worstStressReturn", signed=True) > 0:
        raise ContractViolation("worstStressReturn cannot be positive")
    if type(asset["liquidityScore"]) is not int or not 1 <= asset["liquidityScore"] <= 5:
        raise ContractViolation("liquidityScore must be an integer from 1 to 5")
    if asset["dataStatus"] != "synthetic_complete":
        raise ContractViolation("decision inputs must remain explicitly synthetic")
    return asset


def validate_transparent_decision_input(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != _INPUT_KEYS:
        raise ContractViolation("transparent decision input has unexpected fields")
    value = deepcopy(payload)
    if value["schemaVersion"] != TRANSPARENT_DECISION_INPUT_SCHEMA_VERSION:
        raise ContractViolation("unsupported transparent decision-input schema")
    if (
        not isinstance(value["datasetId"], str)
        or not _INPUT_ID.fullmatch(value["datasetId"])
        or type(value["datasetVersion"]) is not int
        or value["datasetVersion"] < 1
        or value["datasetKind"] != "synthetic_fixture"
        or value["financialUseAllowed"] is not False
        or value["horizon"] not in {"short", "long"}
    ):
        raise ContractViolation("transparent decision input crossed its synthetic boundary")
    total = _money(value["totalValueToman"], "totalValueToman")
    if total <= 0:
        raise ContractViolation("totalValueToman must be positive")
    constraints = value["constraints"]
    if not isinstance(constraints, dict) or set(constraints) != _CONSTRAINT_KEYS:
        raise ContractViolation("decision constraints have unexpected fields")
    rates = {
        key: _rate(constraints[key], key)
        for key in _CONSTRAINT_KEYS if key != "cashInstrumentId"
    }
    if any(rate <= 0 for rate in rates.values()):
        raise ContractViolation("every decision constraint rate must be positive")
    if rates["minimumCashWeight"] >= Decimal("1"):
        raise ContractViolation("minimum cash weight must be below one")
    if rates["noTradeBandWeight"] > rates["maximumTurnoverWeight"]:
        raise ContractViolation("no-trade band cannot exceed maximum turnover")
    assets = value["assets"]
    if not isinstance(assets, list) or not 3 <= len(assets) <= 32:
        raise ContractViolation("transparent decision input needs 3 to 32 assets")
    validated_assets = [_validate_asset(asset, index) for index, asset in enumerate(assets)]
    ids = [asset["instrumentId"] for asset in validated_assets]
    if ids != sorted(set(ids)):
        raise ContractViolation("decision assets must be uniquely sorted")
    if constraints["cashInstrumentId"] not in ids:
        raise ContractViolation("cashInstrumentId must identify an input asset")
    if sum(_money(asset["currentValueToman"], "currentValueToman") for asset in assets) != total:
        raise ContractViolation("asset values must sum exactly to totalValueToman")
    non_cash_count = len(ids) - 1
    if rates["maximumSingleAssetWeight"] * non_cash_count < Decimal("1") - rates["minimumCashWeight"]:
        raise ContractViolation("single-asset cap cannot hold the investable pool")
    supplied_fingerprint = value["contentFingerprint"]
    unsigned = {key: item for key, item in value.items() if key != "contentFingerprint"}
    if supplied_fingerprint != fingerprint(unsigned):
        raise ContractViolation("transparent decision-input fingerprint mismatch")
    return value


def seal_transparent_decision_input(unsigned_payload: object) -> dict[str, Any]:
    if not isinstance(unsigned_payload, dict) or set(unsigned_payload) != _INPUT_KEYS - {"contentFingerprint"}:
        raise ContractViolation("unsigned transparent decision input has unexpected fields")
    sealed = deepcopy(unsigned_payload)
    sealed["contentFingerprint"] = fingerprint(sealed)
    return validate_transparent_decision_input(sealed)


def build_transparent_decision_reference_input(horizon: str = "short") -> dict[str, Any]:
    """Build a visibly synthetic, hand-checkable portfolio decision fixture."""

    return seal_transparent_decision_input({
        "schemaVersion": TRANSPARENT_DECISION_INPUT_SCHEMA_VERSION,
        "datasetId": "ASHA_SYNTHETIC_DECISION_FACTORS_V1",
        "datasetVersion": 1,
        "datasetKind": "synthetic_fixture",
        "financialUseAllowed": False,
        "horizon": horizon,
        "totalValueToman": "100000000",
        "constraints": {
            "cashInstrumentId": "SYNTH_CASH",
            "minimumCashWeight": "0.15",
            "maximumSingleAssetWeight": "0.35",
            "maximumTurnoverWeight": "0.25",
            "noTradeBandWeight": "0.02",
            "maximumAcceptableDrawdownRate": "0.25",
        },
        "assets": [
            {
                "instrumentId": "SYNTH_CASH",
                "displayName": "[SYNTHETIC] Cash-like reserve",
                "assetClassId": "SYNTH_CLASS_CASH",
                "currentValueToman": "10000000",
                "shortTrendReturn": "0.001",
                "longTrendReturn": "0.005",
                "volatilityRate": "0.002",
                "maximumDrawdownRate": "0",
                "worstStressReturn": "0",
                "valuationPercentile": "0.5",
                "liquidityScore": 5,
                "conversionCostRate": "0",
                "dataStatus": "synthetic_complete",
            },
            {
                "instrumentId": "SYNTH_DEFENSIVE",
                "displayName": "[SYNTHETIC] Defensive path",
                "assetClassId": "SYNTH_CLASS_METAL",
                "currentValueToman": "35000000",
                "shortTrendReturn": "0.03",
                "longTrendReturn": "0.08",
                "volatilityRate": "0.04",
                "maximumDrawdownRate": "-0.06",
                "worstStressReturn": "-0.10",
                "valuationPercentile": "0.35",
                "liquidityScore": 4,
                "conversionCostRate": "0.005",
                "dataStatus": "synthetic_complete",
            },
            {
                "instrumentId": "SYNTH_TREND",
                "displayName": "[SYNTHETIC] Trend path",
                "assetClassId": "SYNTH_CLASS_GROWTH",
                "currentValueToman": "40000000",
                "shortTrendReturn": "0.08",
                "longTrendReturn": "0.18",
                "volatilityRate": "0.08",
                "maximumDrawdownRate": "-0.12",
                "worstStressReturn": "-0.18",
                "valuationPercentile": "0.65",
                "liquidityScore": 4,
                "conversionCostRate": "0.008",
                "dataStatus": "synthetic_complete",
            },
            {
                "instrumentId": "SYNTH_VOLATILE",
                "displayName": "[SYNTHETIC] Volatile path",
                "assetClassId": "SYNTH_CLASS_GROWTH",
                "currentValueToman": "15000000",
                "shortTrendReturn": "-0.05",
                "longTrendReturn": "0.10",
                "volatilityRate": "0.18",
                "maximumDrawdownRate": "-0.30",
                "worstStressReturn": "-0.40",
                "valuationPercentile": "0.85",
                "liquidityScore": 2,
                "conversionCostRate": "0.025",
                "dataStatus": "synthetic_complete",
            },
        ],
    })


def _five_band(value: Decimal, boundaries: tuple[Decimal, Decimal, Decimal, Decimal], *, lower_good: bool) -> int:
    if value <= boundaries[0]:
        bucket = 2
    elif value <= boundaries[1]:
        bucket = 1
    elif value <= boundaries[2]:
        bucket = 0
    elif value <= boundaries[3]:
        bucket = -1
    else:
        bucket = -2
    return bucket if lower_good else -bucket


def _trend_points(trend: Decimal, volatility: Decimal) -> tuple[int, Decimal]:
    ratio = trend / volatility
    if ratio <= Decimal("-1"):
        return -2, ratio
    if ratio <= Decimal("-0.25"):
        return -1, ratio
    if ratio < Decimal("0.25"):
        return 0, ratio
    if ratio < Decimal("1"):
        return 1, ratio
    return 2, ratio


def _median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / Decimal("2")


def _factor_points(
    asset: dict[str, Any], current_weight: Decimal, median_volatility: Decimal,
    constraints: dict[str, Any], horizon: str,
) -> dict[str, tuple[int, Decimal]]:
    volatility = _rate(asset["volatilityRate"], "volatilityRate")
    tolerance = _rate(constraints["maximumAcceptableDrawdownRate"], "maximumAcceptableDrawdownRate")
    trend = _rate(asset["shortTrendReturn"] if horizon == "short" else asset["longTrendReturn"], "trend", signed=True)
    trend_score, trend_ratio = _trend_points(trend, volatility)
    return {
        "CONCENTRATION": (
            _five_band(
                current_weight / _rate(constraints["maximumSingleAssetWeight"], "maximumSingleAssetWeight"),
                (Decimal("0.50"), Decimal("0.75"), Decimal("1.00"), Decimal("1.25")),
                lower_good=True,
            ),
            current_weight,
        ),
        "CONVERSION_COST": (
            _five_band(
                _rate(asset["conversionCostRate"], "conversionCostRate"),
                (Decimal("0.0025"), Decimal("0.0075"), Decimal("0.015"), Decimal("0.03")),
                lower_good=True,
            ),
            _rate(asset["conversionCostRate"], "conversionCostRate"),
        ),
        "CRISIS_RESILIENCE": (
            _five_band(
                abs(_rate(asset["worstStressReturn"], "worstStressReturn", signed=True)) / tolerance,
                (Decimal("0.25"), Decimal("0.50"), Decimal("0.75"), Decimal("1.00")),
                lower_good=True,
            ),
            _rate(asset["worstStressReturn"], "worstStressReturn", signed=True),
        ),
        "DRAWDOWN": (
            _five_band(
                abs(_rate(asset["maximumDrawdownRate"], "maximumDrawdownRate", signed=True)) / tolerance,
                (Decimal("0.25"), Decimal("0.50"), Decimal("0.75"), Decimal("1.00")),
                lower_good=True,
            ),
            _rate(asset["maximumDrawdownRate"], "maximumDrawdownRate", signed=True),
        ),
        "LIQUIDITY": (asset["liquidityScore"] - 3, Decimal(asset["liquidityScore"])),
        "TREND": (trend_score, trend_ratio),
        "VALUATION": (
            _five_band(
                _rate(asset["valuationPercentile"], "valuationPercentile"),
                (Decimal("0.20"), Decimal("0.40"), Decimal("0.60"), Decimal("0.80")),
                lower_good=True,
            ),
            _rate(asset["valuationPercentile"], "valuationPercentile"),
        ),
        "VOLATILITY": (
            _five_band(
                volatility / median_volatility,
                (Decimal("0.50"), Decimal("0.85"), Decimal("1.15"), Decimal("1.50")),
                lower_good=True,
            ),
            volatility,
        ),
    }


def _capped_targets(preferences: dict[str, Decimal], pool: Decimal, cap: Decimal) -> dict[str, Decimal]:
    remaining = set(preferences)
    result: dict[str, Decimal] = {}
    remaining_pool = pool
    while remaining:
        preference_total = sum(preferences[item] for item in remaining)
        tentative = {
            item: remaining_pool * preferences[item] / preference_total
            for item in remaining
        }
        over = sorted(item for item, weight in tentative.items() if weight > cap)
        if not over:
            result.update(tentative)
            break
        for item in over:
            result[item] = cap
            remaining.remove(item)
            remaining_pool -= cap
    return result


def _quantized_weights(weights: dict[str, Decimal], residual_id: str) -> dict[str, Decimal]:
    rounded = {key: value.quantize(_QUANTUM, rounding=ROUND_HALF_EVEN) for key, value in weights.items()}
    rounded[residual_id] += Decimal("1") - sum(rounded.values())
    return rounded


def _hhi(weights: dict[str, Decimal]) -> Decimal:
    return sum(weight * weight for weight in weights.values())


def _build_unsigned(value: dict[str, Any]) -> dict[str, Any]:
    total = _money(value["totalValueToman"], "totalValueToman")
    constraints = value["constraints"]
    cash_id = constraints["cashInstrumentId"]
    current = {
        asset["instrumentId"]: _money(asset["currentValueToman"], "currentValueToman") / total
        for asset in value["assets"]
    }
    non_cash = [asset for asset in value["assets"] if asset["instrumentId"] != cash_id]
    median_volatility = _median([
        _rate(asset["volatilityRate"], "volatilityRate") for asset in non_cash
    ])
    factors: dict[str, dict[str, tuple[int, Decimal]]] = {}
    composite: dict[str, Decimal] = {}
    preferences: dict[str, Decimal] = {}
    risk_breached_ids: set[str] = set()
    tolerance = _rate(constraints["maximumAcceptableDrawdownRate"], "maximumAcceptableDrawdownRate")
    for asset in non_cash:
        instrument_id = asset["instrumentId"]
        factor_map = _factor_points(
            asset, current[instrument_id], median_volatility, constraints, value["horizon"]
        )
        factors[instrument_id] = factor_map
        composite[instrument_id] = sum(
            Decimal(points) * _FACTOR_WEIGHT for points, _ in factor_map.values()
        )
        preference = Decimal("1") + Decimal("0.25") * composite[instrument_id]
        if (
            abs(_rate(asset["maximumDrawdownRate"], "maximumDrawdownRate", signed=True)) > tolerance
            or abs(_rate(asset["worstStressReturn"], "worstStressReturn", signed=True)) > tolerance
        ):
            preference *= Decimal("0.50")
            risk_breached_ids.add(instrument_id)
        preferences[instrument_id] = max(Decimal("0.25"), preference)

    minimum_cash = _rate(constraints["minimumCashWeight"], "minimumCashWeight")
    target_cash = min(
        Decimal("0.50"),
        minimum_cash + sum(current[item] * Decimal("0.50") for item in risk_breached_ids),
    )
    target = _capped_targets(
        preferences,
        Decimal("1") - target_cash,
        _rate(constraints["maximumSingleAssetWeight"], "maximumSingleAssetWeight"),
    )
    target[cash_id] = target_cash
    raw_turnover = sum(abs(target[item] - current[item]) for item in current) / Decimal("2")
    maximum_turnover = _rate(constraints["maximumTurnoverWeight"], "maximumTurnoverWeight")
    scale = Decimal("1") if raw_turnover <= maximum_turnover else maximum_turnover / raw_turnover
    staged = _quantized_weights(
        {item: current[item] + scale * (target[item] - current[item]) for item in current},
        cash_id,
    )
    applied_turnover = sum(abs(staged[item] - current[item]) for item in current) / Decimal("2")
    no_trade_band = _rate(constraints["noTradeBandWeight"], "noTradeBandWeight")

    asset_decisions = []
    for asset in value["assets"]:
        instrument_id = asset["instrumentId"]
        delta = staged[instrument_id] - current[instrument_id]
        if abs(delta) < no_trade_band:
            action = "hold"
            actionable_delta = Decimal("0")
            action_reasons = ["CHANGE_INSIDE_NO_TRADE_BAND"]
        else:
            action = "increase" if delta > 0 else "reduce"
            actionable_delta = abs(delta)
            action_reasons = ["PROPOSED_WEIGHT_ABOVE_CURRENT" if delta > 0 else "PROPOSED_WEIGHT_BELOW_CURRENT"]
        if current[instrument_id] > _rate(constraints["maximumSingleAssetWeight"], "maximumSingleAssetWeight"):
            action_reasons.append("CURRENT_WEIGHT_ABOVE_SINGLE_ASSET_CAP")
        if instrument_id in risk_breached_ids:
            action_reasons.append("DRAWDOWN_OR_STRESS_TOLERANCE_BREACHED")
        if instrument_id == cash_id:
            action_reasons.append("CASH_RESERVE_AND_RISK_BUFFER_RULE")
        if instrument_id == cash_id:
            factor_contributions = []
            score = Decimal("0")
            primary_reasons = ["MINIMUM_CASH_RESERVE_CONSTRAINT"]
        else:
            factor_contributions = [
                {
                    "factorId": factor_id,
                    "inputValue": _weight_string(factors[instrument_id][factor_id][1]),
                    "points": factors[instrument_id][factor_id][0],
                    "weight": _weight_string(_FACTOR_WEIGHT),
                    "weightedContribution": _weight_string(
                        Decimal(factors[instrument_id][factor_id][0]) * _FACTOR_WEIGHT
                    ),
                }
                for factor_id in _FACTOR_IDS
            ]
            score = composite[instrument_id] * Decimal("50")
            primary_reasons = [
                item[0] for item in sorted(
                    factors[instrument_id].items(),
                    key=lambda entry: (-abs(entry[1][0]), entry[0]),
                )[:3]
            ]
        same_class = [
            other for other in value["assets"]
            if other["instrumentId"] != instrument_id
            and other["assetClassId"] == asset["assetClassId"]
        ]
        cross_class = [
            other for other in value["assets"]
            if other["instrumentId"] != instrument_id
            and other["assetClassId"] != asset["assetClassId"]
        ]
        alternative_key = lambda other: (
            -(staged[other["instrumentId"]] - current[other["instrumentId"]]),
            other["instrumentId"],
        )
        asset_decisions.append({
            "instrumentId": instrument_id,
            "displayName": asset["displayName"],
            "assetClassId": asset["assetClassId"],
            "action": action,
            "horizon": value["horizon"],
            "currentWeightPercent": _percent_string(current[instrument_id] * Decimal("100")),
            "proposedWeightPercent": _percent_string(staged[instrument_id] * Decimal("100")),
            "changePercentPoint": _percent_string(delta * Decimal("100")),
            "suggestedAmountToman": str(
                (total * actionable_delta).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
            ),
            "decisionScore": _percent_string(score),
            "factorContributions": factor_contributions,
            "primaryReasonCodes": sorted(primary_reasons),
            "actionReasonCodes": sorted(action_reasons),
            "invalidationRules": [
                "RECOMPUTE_IF_ANY_FACTOR_CROSSES_A_PREDECLARED_BAND",
                "RECOMPUTE_IF_OWNER_CONSTRAINTS_CHANGE",
                "STOP_IF_DATA_OR_PROVENANCE_BECOMES_INCOMPLETE",
            ],
            "sameClassAlternativeId": sorted(same_class, key=alternative_key)[0]["instrumentId"] if same_class else None,
            "crossClassAlternativeId": sorted(cross_class, key=alternative_key)[0]["instrumentId"] if cross_class else None,
            "evidenceAdequacyPercent": "100.000000",
            "iranValidationStatus": "not_evaluated",
        })

    decreases = sorted(
        (item for item in asset_decisions if item["action"] == "reduce"),
        key=lambda item: (Decimal(item["changePercentPoint"]), item["instrumentId"]),
    )
    increases = sorted(
        (item for item in asset_decisions if item["action"] == "increase"),
        key=lambda item: (-Decimal(item["changePercentPoint"]), item["instrumentId"]),
    )
    if decreases and increases:
        transfer = min(
            abs(Decimal(decreases[0]["changePercentPoint"])),
            Decimal(increases[0]["changePercentPoint"]),
        )
        overall = {
            "action": "convert",
            "sourceInstrumentId": decreases[0]["instrumentId"],
            "destinationInstrumentId": increases[0]["instrumentId"],
            "changePercentPoint": _percent_string(transfer),
            "suggestedAmountToman": str(
                (total * transfer / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
            ),
            "reasonCodes": ["LARGEST_STAGED_REDUCTION_TO_LARGEST_STAGED_INCREASE"],
        }
    else:
        overall = {
            "action": "hold",
            "sourceInstrumentId": None,
            "destinationInstrumentId": None,
            "changePercentPoint": "0.000000",
            "suggestedAmountToman": "0",
            "reasonCodes": ["NO_ACTION_OUTSIDE_NO_TRADE_BAND"],
        }

    current_hhi = _hhi(current)
    proposed_hhi = _hhi(staged)
    return {
        "schemaVersion": TRANSPARENT_DECISION_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "synthetic_proposal_only",
        "methodologyReference": {
            "entityId": TRANSPARENT_DECISION_METHOD_ID,
            "version": TRANSPARENT_DECISION_METHOD_VERSION,
            "selectionState": "owner_authorized_laboratory_proposal",
            "realUseApprovalState": "not_approved",
        },
        "inputReference": {
            "datasetId": value["datasetId"],
            "version": value["datasetVersion"],
            "contentFingerprint": value["contentFingerprint"],
        },
        "horizon": value["horizon"],
        "parameters": {
            "factorIds": list(_FACTOR_IDS),
            "factorWeight": "0.125000000000",
            "factorPointRange": [-2, 2],
            "scoreScale": "factor_weighted_sum_times_50",
            "targetRule": "equal_anchor_times_one_plus_quarter_composite_then_normalize_and_cap",
            "riskBreachMultiplier": "0.500000000000",
            "riskBreachCashTransferFraction": "0.500000000000",
            "turnoverRule": "scale_complete_target_delta_to_maximum_turnover",
            "rounding": "half_even_weights_12_percent_6_money_whole_toman",
        },
        "assetDecisions": asset_decisions,
        "overallDecision": overall,
        "portfolioMetrics": {
            "currentConcentrationHhi": _weight_string(current_hhi),
            "proposedConcentrationHhi": _weight_string(proposed_hhi),
            "currentEffectiveHoldingCount": _percent_string(Decimal("1") / current_hhi),
            "proposedEffectiveHoldingCount": _percent_string(Decimal("1") / proposed_hhi),
            "unconstrainedTargetTurnoverPercent": _percent_string(raw_turnover * Decimal("100")),
            "appliedTurnoverPercent": _percent_string(applied_turnover * Decimal("100")),
            "minimumCashPercent": _percent_string(minimum_cash * Decimal("100")),
            "maximumSingleAssetPercent": _percent_string(
                _rate(constraints["maximumSingleAssetWeight"], "maximumSingleAssetWeight") * Decimal("100")
            ),
        },
        "evidenceState": {
            "syntheticFactorCoveragePercent": "100.000000",
            "realMarketEvidenceStatus": "not_evaluated",
            "iranCalibrationStatus": "not_evaluated",
            "missingRequirements": [
                "IRAN_COIN_AND_GOLD_PREMIUM_HISTORY",
                "IRAN_LIQUIDITY_SPREAD_AND_MARKET_DEPTH",
                "IRAN_POINT_IN_TIME_LICENSED_HISTORY",
                "IRAN_REGIME_AND_POLITICAL_SHOCK_CALIBRATION",
                "IRAN_TRANSACTION_TAX_FEE_AND_CONVERSION_COSTS",
                "OUT_OF_SAMPLE_WALK_FORWARD_AND_SHADOW_VALIDATION",
            ],
        },
        "reasonCodes": [
            "DETERMINISTIC_CODE_ONLY",
            "FINANCIAL_PERFORMANCE_NOT_ESTABLISHED",
            "IRAN_VALIDATION_REQUIRED",
            "LABORATORY_PROPOSAL_NOT_REAL_RECOMMENDATION",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    }


def build_transparent_guarded_decision(input_payload: object) -> dict[str, Any]:
    """Compute an exact synthetic proposal; never authorize real financial use."""

    value = validate_transparent_decision_input(input_payload)
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        unsigned = _build_unsigned(value)
    result = {
        **unsigned,
        "decisionId": f"ASHA_TRANSPARENT_DECISION_{fingerprint(unsigned)}",
    }
    return validate_transparent_guarded_decision(result, value)


def validate_transparent_guarded_decision(
    result_payload: object, input_payload: object
) -> dict[str, Any]:
    value = validate_transparent_decision_input(input_payload)
    if not isinstance(result_payload, dict) or set(result_payload) != _RESULT_KEYS:
        raise ContractViolation("transparent decision result has unexpected fields")
    result = deepcopy(result_payload)
    if (
        result["schemaVersion"] != TRANSPARENT_DECISION_SCHEMA_VERSION
        or result["status"] != "evaluation_only"
        or result["financialUseAllowed"] is not False
        or result["executionAllowed"] is not False
        or result["decisionState"] != "synthetic_proposal_only"
    ):
        raise ContractViolation("transparent decision crossed its laboratory boundary")
    decision_id = result["decisionId"]
    unsigned = {key: item for key, item in result.items() if key != "decisionId"}
    if not isinstance(decision_id, str) or not _DECISION_ID.fullmatch(decision_id):
        raise ContractViolation("transparent decision ID is invalid")
    if decision_id != f"ASHA_TRANSPARENT_DECISION_{fingerprint(unsigned)}":
        raise ContractViolation("transparent decision fingerprint mismatch")
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_EVEN
        expected = _build_unsigned(value)
    if unsigned != expected:
        raise ContractViolation("transparent decision does not match exact replay")
    return result
