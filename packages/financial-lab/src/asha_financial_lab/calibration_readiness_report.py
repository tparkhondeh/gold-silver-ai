"""Owner-readable, synthetic-only view of Iran calibration readiness."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .calibration_gate_evaluator import (
    evaluate_synthetic_calibration_evidence,
    validate_synthetic_calibration_evidence,
)
from .calibration_preflight import validate_synthetic_calibration_preflight
from .contracts import ContractViolation, fingerprint
from .iran_calibration_manifest import validate_iran_calibration_manifest
from .parameter_freeze import validate_parameter_freeze_bundle


CALIBRATION_READINESS_REPORT_SCHEMA_VERSION = (
    "asha.synthetic.calibration_readiness_report.v1"
)
_REPORT_ID = re.compile(r"ASHA_SYNTHETIC_CALIBRATION_READINESS_[a-f0-9]{64}\Z")

_TOP_KEYS = {
    "schemaVersion", "reportId", "status", "generatedFrom", "gateReadiness",
    "summary", "boundary", "financialUseAllowed", "executionAllowed",
    "parameterMutationAllowed",
}

_GATE_TEXT = {
    "G01_SYNTHETIC_REAL_ISOLATION": (
        "جداسازی دادهٔ ساختگی و واقعی",
        "باید ثابت شود هیچ ردیف ساختگی وارد مجموعهٔ واقعی نشده است.",
    ),
    "G02_LICENSE_AND_PROVENANCE": (
        "مجوز و شناسنامهٔ داده",
        "مجوز استفاده و مسیر تولید هر ردیف واقعی باید قابل پیگیری باشد.",
    ),
    "G03_POINT_IN_TIME_INTEGRITY": (
        "جلوگیری از دیدن آینده",
        "هر محاسبه باید فقط اطلاعات موجود در همان زمان تاریخی را ببیند.",
    ),
    "G04_HISTORY_AND_COVERAGE": (
        "طول و پوشش تاریخچه",
        "هر عامل باید حداقل تاریخچه و پوشش ازپیش‌تعیین‌شده را داشته باشد.",
    ),
    "G05_IRAN_MARKET_EVIDENCE": (
        "شواهد ویژهٔ بازار ایران",
        "فرض‌های مربوط به ایران باید جداگانه و با مدرک واقعی بررسی شوند.",
    ),
    "G06_TRAIN_VALIDATION_TEST_ISOLATION": (
        "جداسازی آموزش، تنظیم و آزمون",
        "سه بازه باید زمانی، بدون هم‌پوشانی و بدون نشت اطلاعات باشند.",
    ),
    "G07_PARAMETER_FREEZE": (
        "قفل پارامترها پیش از آزمون",
        "پارامترهای واقعی باید پیش از دیدن آزمون نهایی ثبت و قفل شوند.",
    ),
    "G08_OUT_OF_SAMPLE_REPLAY": (
        "بازآزمایی خارج از نمونه",
        "نتایج باید روی بازه‌های ندیده و مستقل دقیقاً قابل تکرار باشند.",
    ),
    "G09_PREDECLARED_ACCEPTANCE": (
        "معیار پذیرش ازپیش‌اعلام‌شده",
        "معیارها باید پیش از آزمون نهایی تعیین شوند و همه عبور کنند.",
    ),
    "G10_SHADOW_AND_OWNER_APPROVAL": (
        "اجرای سایه و تأیید مالک",
        "پس از مشاهدهٔ بدون معامله، تأیید جداگانهٔ مالک برای استفادهٔ واقعی لازم است.",
    ),
}

_IRAN_CHECK_FA = {
    "STALE_DOMESTIC_VALUATIONS_EXCLUDED": "اثبات حذف ارزش‌گذاری‌های داخلی کهنه",
    "OWNER_LEDGER_AND_MARKET_CUTOFF_ALIGNED": "اثبات هم‌زمانی دفتر دارایی مالک و برش بازار",
    "PHYSICAL_AND_DIGITAL_ROUTES_SEPARATED": "تفکیک مسیرهای فیزیکی و دیجیتال تبدیل",
    "TAX_FEE_AND_SPREAD_COMPONENTS_NOT_NETTED_AWAY": "تفکیک مالیات، کارمزد و فاصلهٔ خریدوفروش",
    "POLITICAL_FX_AND_MARKET_CLOSURE_WINDOWS_LABELLED": "برچسب‌گذاری بحران سیاسی، ارزی و تعطیلی بازار",
    "NON_TRADABLE_DAYS_NOT_TREATED_AS_ZERO_RISK": "اثبات اینکه روز غیرقابل‌معامله بدون ریسک فرض نشده است",
    "CLOSURES_AND_PRICE_LIMITS_RETAINED": "حفظ تعطیلی‌ها و محدودیت‌های قیمت در داده",
    "CORPORATE_AND_INSTRUMENT_SPEC_CHANGES_ADJUSTED_POINT_IN_TIME": "اصلاح زمانی تغییر مشخصات ابزار",
    "THIN_MARKET_AND_PRICE_LIMIT_SESSIONS_SEPARATED": "تفکیک بازار کم‌عمق و جلسات محدودیت قیمت",
    "DISPLAYED_QUOTE_NOT_ASSUMED_EXECUTABLE": "اثبات اینکه قیمت نمایشی قابل‌اجرا فرض نشده است",
    "INFLATION_AND_FX_REGIMES_SEPARATED": "تفکیک دوره‌های تورمی و ارزی ایران",
    "NON_SYNCHRONOUS_MARKET_CLOSES_ALIGNED_WITH_AVAILABILITY": "هم‌ترازی تعطیلی‌های ناهم‌زمان با زمان دسترسی",
    "COIN_AND_BULLION_SPECIFICATIONS_VERSIONED_SEPARATELY": "نسخه‌بندی جداگانهٔ مشخصات سکه و شمش",
    "GLOBAL_SPOT_AND_FX_TIMESTAMPS_SYNCHRONIZED": "هم‌زمان‌سازی قیمت جهانی و نرخ ارز",
    "STALE_AND_NON_TRADABLE_PERIODS_NOT_RECORDED_AS_ZERO_RETURN": "ثبت‌نشدن دورهٔ کهنه یا غیرقابل‌معامله به‌عنوان بازده صفر",
    "VOLATILITY_WINDOWS_FROZEN_BEFORE_TEST_ACCESS": "قفل پنجره‌های نوسان پیش از آزمون",
}

_FACTOR_FA = {
    "CONCENTRATION": "تمرکز سبد",
    "CONVERSION_COST": "هزینهٔ تبدیل",
    "CRISIS_RESILIENCE": "تاب‌آوری بحران",
    "DRAWDOWN": "افت سرمایه",
    "LIQUIDITY": "نقدشوندگی",
    "TREND": "روند",
    "VALUATION": "ارزش‌گذاری",
    "VOLATILITY": "نوسان",
}

_CONSTRAINT_EVIDENCE_FA = {
    "ALL_IN_CONVERSION_COST": "هزینهٔ کامل و قابل‌اجرای تبدیل",
    "CONCENTRATION_DISTRIBUTION": "توزیع واقعی تمرکز سبد",
    "ESTIMATED_SLIPPAGE": "لغزش قیمت برآوردشده از معاملهٔ قابل‌اجرا",
    "EXECUTABLE_LIQUIDITY_CAPACITY": "ظرفیت واقعی نقدشوندگی",
    "EXECUTABLE_MARKET_DEPTH": "عمق واقعی قابل‌معامله",
    "IRAN_CRISIS_LIQUIDITY_EVIDENCE": "نقدشوندگی در بحران‌های ایران",
    "IRAN_DRAWDOWN_DISTRIBUTION": "توزیع افت در بازار ایران",
    "OWNER_LIQUIDITY_NEED": "نیاز نقدینگی ثبت‌شدهٔ مالک",
    "OWNER_RISK_TOLERANCE": "تحمل ریسک ثبت‌شدهٔ مالک",
}

_THRESHOLD_FA = {
    "MAXIMUM_OUT_OF_SAMPLE_DRAWDOWN": "حداکثر افت خارج از نمونه",
    "MAXIMUM_REALIZED_ALL_IN_COST": "حداکثر هزینهٔ کامل تحقق‌یافته",
    "MAXIMUM_TURNOVER": "حداکثر حجم تغییر سبد",
    "MINIMUM_EVIDENCE_COVERAGE": "حداقل پوشش شواهد",
    "MINIMUM_OUT_OF_SAMPLE_STABILITY": "حداقل پایداری خارج از نمونه",
    "MINIMUM_SHADOW_OBSERVATIONS": "حداقل مشاهدات دورهٔ سایه",
}


def _exact_mapping(value: object, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} has unexpected fields")
    return value


def _evidence(evidence_id: str, owner_label_fa: str) -> dict[str, Any]:
    return {
        "evidenceId": evidence_id,
        "ownerLabelFa": owner_label_fa,
        "state": "required_not_supplied",
    }


def _remaining_evidence(
    gate_id: str,
    manifest: dict[str, Any],
    freeze: dict[str, Any],
) -> list[dict[str, Any]]:
    history = manifest["historyPlan"]
    if gate_id == "G01_SYNTHETIC_REAL_ISOLATION":
        return [
            _evidence("REAL_DATASET_BOUNDARY_DECLARATION", "تعریف رسمی مرز مجموعه‌دادهٔ واقعی"),
            _evidence("SYNTHETIC_ROW_EXCLUSION_AUDIT", "گزارش اثبات نبود ردیف ساختگی در دادهٔ واقعی"),
        ]
    if gate_id == "G02_LICENSE_AND_PROVENANCE":
        return [
            _evidence("OWNER_APPROVED_LICENSE_REFERENCES", "مجوزهای کتبی و تأییدشدهٔ منابع"),
            _evidence("IMMUTABLE_SOURCE_CONTRACT_LINEAGE", "شناسنامهٔ تغییرناپذیر قرارداد منبع برای هر ردیف"),
            _evidence("INDEPENDENT_IRAN_SOURCE_CROSS_CHECK", "تطبیق با یک منبع مستقل ایرانی"),
        ]
    if gate_id == "G03_POINT_IN_TIME_INTEGRITY":
        return [
            _evidence("OBSERVED_AT_UTC_LINEAGE", "زمان واقعی مشاهده برای هر ردیف"),
            _evidence("AVAILABLE_AT_UTC_LINEAGE", "زمان واقعی قابل‌دسترسی‌شدن هر ردیف"),
            _evidence("SOURCE_CONTRACT_VERSION_LINEAGE", "نسخهٔ قرارداد منبع در همان زمان"),
            _evidence("FUTURE_INFORMATION_EXCLUSION_AUDIT", "آزمون مستقل جلوگیری از ورود اطلاعات آینده"),
        ]
    if gate_id == "G04_HISTORY_AND_COVERAGE":
        return [
            _evidence(
                f"{factor['factorId']}_HISTORY_COVERAGE",
                (
                    f"{_FACTOR_FA[factor['factorId']]}: حداقل "
                    f"{factor['minimumValidObservations']} مشاهدهٔ معتبر، پوشش "
                    f"{factor['minimumCoveragePercent']}٪، "
                    f"{factor['minimumIndependentSources']} منبع و "
                    f"{factor['minimumDistinctRegimes']} دورهٔ متفاوت"
                ),
            )
            for factor in manifest["factorRequirements"]
        ]
    if gate_id == "G05_IRAN_MARKET_EVIDENCE":
        return [
            _evidence(
                f"{factor['factorId']}_{check_id}",
                f"{_FACTOR_FA[factor['factorId']]}: {_IRAN_CHECK_FA[check_id]}",
            )
            for factor in manifest["factorRequirements"]
            for check_id in factor["iranSpecificChecks"]
        ] + [
            _evidence(
                "MINIMUM_DISTINCT_IRAN_REGIMES",
                f"حداقل {history['minimumDistinctRegimes']} دورهٔ متفاوت بازار ایران",
            ),
            _evidence(
                "MINIMUM_IRAN_CRISIS_WINDOWS",
                f"حداقل {history['minimumCrisisWindows']} پنجرهٔ بحران ایران",
            ),
        ]
    if gate_id == "G06_TRAIN_VALIDATION_TEST_ISOLATION":
        return [
            _evidence("CHRONOLOGICAL_TRAIN_SPLIT", f"بازهٔ آموزش با {history['trainObservations']} مشاهده"),
            _evidence("CHRONOLOGICAL_VALIDATION_SPLIT", f"بازهٔ تنظیم با {history['validationObservations']} مشاهده"),
            _evidence("UNTOUCHED_TEST_SPLIT", f"بازهٔ آزمون دست‌نخورده با {history['testObservations']} مشاهده"),
            _evidence("PURGE_GAP", f"فاصلهٔ حذف {history['purgeObservations']} مشاهده‌ای"),
            _evidence("EMBARGO_GAP", f"فاصلهٔ محافظ {history['embargoObservations']} مشاهده‌ای"),
            _evidence("SPLIT_LEAKAGE_AUDIT", "گزارش نبود هم‌پوشانی یا نشت میان سه بازه"),
        ]
    if gate_id == "G07_PARAMETER_FREEZE":
        constraint_ids = sorted({
            evidence_id
            for item in manifest["constraintRequirements"]
            for evidence_id in item["requiredEvidence"]
        })
        return [
            _evidence("REAL_DATASET_FINGERPRINT", "اثر انگشت مجموعه‌دادهٔ مجاز ایران"),
            _evidence("REAL_PARAMETER_BUNDLE_FROZEN_BEFORE_TEST", "بستهٔ واقعی پارامترها پیش از بازشدن آزمون"),
            *[
                _evidence(evidence_id, _CONSTRAINT_EVIDENCE_FA[evidence_id])
                for evidence_id in constraint_ids
            ],
        ]
    if gate_id == "G08_OUT_OF_SAMPLE_REPLAY":
        return [
            _evidence(
                "REQUIRED_WALK_FORWARD_FOLDS",
                f"حداقل {history['minimumWalkForwardFolds']} دور آزمون حرکت در زمانِ خارج از نمونه",
            ),
            _evidence("UNTOUCHED_TEST_EXACT_REPLAY", "بازاجرای دقیق و مستقل بازهٔ آزمون دست‌نخورده"),
            _evidence("OUT_OF_SAMPLE_COST_AND_LIQUIDITY_RESULTS", "نتایج خارج از نمونه با هزینه و نقدشوندگی واقعی"),
        ]
    if gate_id == "G09_PREDECLARED_ACCEPTANCE":
        return [
            _evidence(
                f"{threshold['thresholdId']}_VALUE_AND_UNIT",
                f"مقدار و واحد ازپیش‌ثبت‌شده برای {_THRESHOLD_FA[threshold['thresholdId']]}",
            )
            for threshold in freeze["acceptanceThresholds"]
        ] + [
            _evidence("ALL_ACCEPTANCE_THRESHOLDS_PASS", "گزارش عبور همهٔ معیارهای پذیرش بدون تغییر پس از آزمون"),
        ]
    if gate_id == "G10_SHADOW_AND_OWNER_APPROVAL":
        return [
            _evidence("REAL_SHADOW_REVIEW_COMPLETE", "دورهٔ مشاهدهٔ واقعی بدون معامله و گزارش بازبینی"),
            _evidence("LATER_OWNER_APPROVAL_ADR", "تصمیم‌نامهٔ جداگانه و صریح مالک برای استفادهٔ واقعی"),
        ]
    raise ContractViolation("unsupported calibration gate in readiness report")


def _owner_state_fa(mechanical_state: str) -> str:
    if mechanical_state == "passed":
        return "تمرین نرم‌افزاری عبور کرد؛ بررسی واقعی انجام نشده است"
    if mechanical_state == "failed":
        return "تمرین نرم‌افزاری شکست خورد؛ بررسی واقعی نیز انجام نشده است"
    return "تمرین نرم‌افزاری متوقف است؛ بررسی واقعی انجام نشده است"


def _owner_headline_fa(mechanical_state: str) -> str:
    if mechanical_state == "passed":
        return "زیرساخت بررسی آماده است؛ اعتبارسنجی واقعی ایران هنوز شروع نشده است."
    if mechanical_state == "failed":
        return "تمرین نرم‌افزاری خطا دارد؛ اعتبارسنجی واقعی ایران هنوز شروع نشده است."
    return "تمرین نرم‌افزاری متوقف است؛ اعتبارسنجی واقعی ایران هنوز شروع نشده است."


def _unsigned_report(
    manifest: dict[str, Any],
    freeze: dict[str, Any],
    evidence: dict[str, Any],
    gate_result: dict[str, Any],
    preflight: dict[str, Any],
) -> dict[str, Any]:
    gate_results = {item["gateId"]: item for item in gate_result["gateResults"]}
    readiness = []
    for gate in manifest["validationGates"]:
        gate_id = gate["gateId"]
        mechanical_state = gate_results[gate_id]["mechanicalState"]
        title, explanation = _GATE_TEXT[gate_id]
        remaining = _remaining_evidence(gate_id, manifest, freeze)
        readiness.append({
            "gateId": gate_id,
            "stage": gate["stage"],
            "ownerTitleFa": title,
            "ownerStateFa": _owner_state_fa(mechanical_state),
            "ownerExplanationFa": explanation,
            "syntheticMechanicalState": mechanical_state,
            "realWorldState": "not_evaluated",
            "remainingEvidenceCount": len(remaining),
            "remainingEvidence": remaining,
        })

    return {
        "schemaVersion": CALIBRATION_READINESS_REPORT_SCHEMA_VERSION,
        "status": "synthetic_owner_readiness_view_only",
        "generatedFrom": {
            "manifestId": manifest["manifestId"],
            "freezeBundleId": freeze["bundleId"],
            "evidenceBundleId": evidence["bundleId"],
            "gateResultId": gate_result["resultId"],
            "preflightId": preflight["preflightId"],
        },
        "gateReadiness": readiness,
        "summary": {
            "ownerHeadlineFa": _owner_headline_fa(
                gate_result["summary"]["mechanicalState"]
            ),
            "ownerNextBoundaryFa": "گام واقعی فقط پس از مجوز داده، شواهد ایران و تأیید جداگانهٔ مالک باز می‌شود.",
            "syntheticGateMechanicsState": gate_result["summary"]["mechanicalState"],
            "syntheticPreflightMechanicalState": preflight["summary"]["preflightMechanicalState"],
            "realCalibrationState": "not_evaluated",
            "realReadinessState": "blocked_until_licensed_iran_evidence",
            "performanceClaimState": "not_evaluated",
            "promotionState": "blocked_in_synthetic_readiness_report",
        },
        "boundary": {
            "containsMarketObservations": False,
            "containsProviderSelection": False,
            "containsProviderCredentials": False,
            "realDataRequestCreated": False,
            "methodScoreProduced": False,
            "methodRankingProduced": False,
            "performanceClaimAllowed": False,
            "thresholdSelectionAllowed": False,
        },
        "financialUseAllowed": False,
        "executionAllowed": False,
        "parameterMutationAllowed": False,
    }


def build_calibration_readiness_report(
    manifest_payload: object,
    freeze_payload: object,
    evidence_payload: object,
    preflight_payload: object,
) -> dict[str, Any]:
    """Build a deterministic Persian view without changing any calibration state."""

    manifest = validate_iran_calibration_manifest(manifest_payload)
    freeze = validate_parameter_freeze_bundle(freeze_payload, manifest)
    evidence = validate_synthetic_calibration_evidence(evidence_payload, manifest)
    gate_result = evaluate_synthetic_calibration_evidence(evidence, manifest)
    preflight = validate_synthetic_calibration_preflight(
        preflight_payload, freeze, evidence, manifest
    )
    unsigned = _unsigned_report(manifest, freeze, evidence, gate_result, preflight)
    report = {
        **unsigned,
        "reportId": f"ASHA_SYNTHETIC_CALIBRATION_READINESS_{fingerprint(unsigned)}",
    }
    return validate_calibration_readiness_report(
        report, manifest, freeze, evidence, preflight
    )


def validate_calibration_readiness_report(
    payload: object,
    manifest_payload: object,
    freeze_payload: object,
    evidence_payload: object,
    preflight_payload: object,
) -> dict[str, Any]:
    manifest = validate_iran_calibration_manifest(manifest_payload)
    freeze = validate_parameter_freeze_bundle(freeze_payload, manifest)
    evidence = validate_synthetic_calibration_evidence(evidence_payload, manifest)
    gate_result = evaluate_synthetic_calibration_evidence(evidence, manifest)
    preflight = validate_synthetic_calibration_preflight(
        preflight_payload, freeze, evidence, manifest
    )
    report = deepcopy(_exact_mapping(payload, _TOP_KEYS, "calibration readiness report"))
    if (
        report["schemaVersion"] != CALIBRATION_READINESS_REPORT_SCHEMA_VERSION
        or not isinstance(report["reportId"], str)
        or not _REPORT_ID.fullmatch(report["reportId"])
    ):
        raise ContractViolation("calibration-readiness report identity is invalid")

    expected_unsigned = _unsigned_report(manifest, freeze, evidence, gate_result, preflight)
    expected = {
        **expected_unsigned,
        "reportId": f"ASHA_SYNTHETIC_CALIBRATION_READINESS_{fingerprint(expected_unsigned)}",
    }
    if report != expected:
        raise ContractViolation("calibration-readiness report does not exactly replay")
    return report
