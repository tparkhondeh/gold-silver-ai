import type { PortfolioSnapshot } from "../data/postgres-portfolio-repository.ts";
import { decodePortfolioSnapshot } from "./portfolio-persistence.ts";
import { evaluateOwnerDecisionConstraints } from "./decision-support.ts";
import { emptyPurchaseBook, type ExactRatio } from "./purchase-book.ts";
import { comparePersonalRatios, evaluatePersonalMarketValuation, personalRatioPercent, type PersonalMarketValuation } from "./personal-market-valuation.ts";
import type { MarketSnapshot } from "./market-test-contract.ts";

export const PERSONAL_PORTFOLIO_ANALYSIS_VERSION = "asha.personal_portfolio_analysis.v1";

// These references point to existing requirements, not evidence that the real
// gate passed. No synthetic artifact or decision engine is an input here.
export const personalAnalysisGaps = {
  empty_holdings: { label: "دارایی ثبت نشده است.", evidenceIds: [] },
  incomplete_valuation: { label: "ارزش جاری همهٔ دارایی‌های ثبت‌شده معلوم نیست؛ سهم کل قابل‌محاسبه نیست.", evidenceIds: ["CONCENTRATION_STALE_DOMESTIC_VALUATIONS_EXCLUDED"] },
  cash_not_recorded: { label: "ماندهٔ نقد قابل‌خرج، مستقل و تأییدشده ثبت نشده است؛ بودجه نامشخص است.", evidenceIds: [] },
  owner_constraints_missing: { label: "بخشی از محدودیت‌های ذخیره‌شدهٔ شما تکمیل نشده است.", evidenceIds: [] },
  short_horizon_missing: { label: "مدت کوتاه‌مدت در تنظیمات ذخیره نشده است.", evidenceIds: [] },
  medium_horizon_missing: { label: "مدت میان‌مدت در قرارداد فعلی ثبت نمی‌شود؛ تنظیم بلندمدت جای آن نیست.", evidenceIds: [] },
  licensed_history_missing: { label: "تاریخچهٔ مجاز با پوشش و زمان‌بندی لازم به این تحلیل متصل نیست.", evidenceIds: ["VALUATION_HISTORY_COVERAGE", "TREND_HISTORY_COVERAGE", "VOLATILITY_HISTORY_COVERAGE"] },
  trading_inputs_missing: { label: "قیمت قابل‌معامله، کارمزد، مالیات، فاصلهٔ خریدوفروش و نقدشوندگیِ آینده معلوم نیست.", evidenceIds: ["CONVERSION_COST_TAX_FEE_AND_SPREAD_COMPONENTS_NOT_NETTED_AWAY", "LIQUIDITY_DISPLAYED_QUOTE_NOT_ASSUMED_EXECUTABLE"] },
  factor_inputs_missing: { label: "ورودی‌های واقعی عوامل روش ثبت‌شده کامل و اعتبارسنجی نشده‌اند.", evidenceIds: ["CONCENTRATION_HISTORY_COVERAGE", "DRAWDOWN_HISTORY_COVERAGE", "CRISIS_RESILIENCE_HISTORY_COVERAGE"] },
  iran_validation_missing: { label: "کالیبراسیون ایران و اعتبارسنجی خارج از نمونه برای استفادهٔ واقعی پذیرفته نشده‌اند.", evidenceIds: ["G08_OUT_OF_SAMPLE_REPLAY"] },
  approval_missing: { label: "مجوز استفادهٔ مالی و پذیرش نهایی روش فعال نیست.", evidenceIds: ["G10_SHADOW_AND_OWNER_APPROVAL"] },
} as const;
export type PersonalAnalysisGap = keyof typeof personalAnalysisGaps;
export type PersonalLotInputGap = "unit_price" | "fees" | "historical_fx_rial" | "historical_fx_usd";
export type PersonalAnalysisAsset = {
  rowId: string;
  holdingsSharePercent: ExactRatio | null;
  savedLimitComparison: "above_saved_limit" | "within_saved_limit" | "unavailable";
  purchaseInputs: Array<{ lotId: string; purchaseDate: string; missing: PersonalLotInputGap[] }>;
};
export type PersonalAnalysisHorizon = {
  id: "short" | "medium"; state: "no_decision";
  savedDuration: { value: string; unit: "months" } | null;
  missingInputs: PersonalAnalysisGap[];
  budgetReference: "shared_unavailable_budget";
};
type AnalysisBoundary = {
  version: typeof PERSONAL_PORTFOLIO_ANALYSIS_VERSION;
  financialUseAllowed: false; executionAllowed: false;
};
export type PersonalPortfolioAnalysis = AnalysisBoundary & ({
  state: "invalid_input";
} | {
  state: "descriptive_only";
  source: { portfolioVersion: number; evaluatedAt: string; valuationVersion: string; purchaseBookVersion: string };
  valuation: PersonalMarketValuation;
  constraints: ReturnType<typeof evaluateOwnerDecisionConstraints>;
  savedMaximumAssetPercent: ExactRatio | null;
  concentrationDenominator: "all_registered_holdings_current_value";
  assets: PersonalAnalysisAsset[];
  horizons: [PersonalAnalysisHorizon, PersonalAnalysisHorizon];
  budget: {
    id: "shared_unavailable_budget"; state: "unavailable";
    cashRial: null; spendableRial: null; prospectiveTradingCostRial: null;
    proposedSpendRial: ExactRatio; orders: [];
  };
});

function savedPercent(raw: string): ExactRatio | null {
  if (raw === "") return null;
  // Validation already enforces the persisted two-decimal, 1..100 contract.
  // Canonicalize its accepted text forms; no floating-point money arithmetic.
  const [whole, fraction = ""] = Number(raw).toString().split(".");
  return { numerator: whole + fraction, denominator: (10n ** BigInt(fraction.length)).toString() };
}

/** One validated saved snapshot and one valuation clock. This reports observed
 * holdings and gaps, never real data relabelled as a synthetic decision input. */
export function buildPersonalPortfolioAnalysis(
  input: PortfolioSnapshot, market: MarketSnapshot | null, nowMs: number,
): PersonalPortfolioAnalysis {
  const boundary: AnalysisBoundary = { version: PERSONAL_PORTFOLIO_ANALYSIS_VERSION, financialUseAllowed: false, executionAllowed: false };
  let snapshot: PortfolioSnapshot;
  let valuation: PersonalMarketValuation;
  try {
    snapshot = decodePortfolioSnapshot(input);
    valuation = evaluatePersonalMarketValuation(snapshot.purchaseBook ?? emptyPurchaseBook(), snapshot.holdings, market, nowMs);
  } catch {
    // Invalid identity, amount, preference, book or clock yields no diagnostic
    // numeric output. Invalid market snapshots are disclosed by the evaluator.
    return { ...boundary, state: "invalid_input" };
  }
  const book = snapshot.purchaseBook ?? emptyPurchaseBook();
  const constraints = evaluateOwnerDecisionConstraints(snapshot.preferences);
  const maximum = savedPercent(snapshot.preferences.maxSingleAssetPercent);
  const assets = valuation.rows.map((row): PersonalAnalysisAsset => {
    // Never renormalize only priced rows. Unknown holdings stay in the boundary.
    const percent = personalRatioPercent(row.currentValueRial, valuation.totals.currentValueRial);
    return {
      rowId: row.id, holdingsSharePercent: percent,
      savedLimitComparison: percent === null || maximum === null ? "unavailable"
        : comparePersonalRatios(percent, maximum) > 0 ? "above_saved_limit" : "within_saved_limit",
      purchaseInputs: book.lots.filter((lot) => row.lotIds.includes(lot.id)).map((lot) => {
        const missing: PersonalLotInputGap[] = [];
        if (lot.unitPrice === null) missing.push("unit_price");
        if (lot.fees === null) missing.push("fees");
        if (lot.fx === null) missing.push(lot.paymentCurrency === "USD" ? "historical_fx_rial" : "historical_fx_usd");
        return { lotId: lot.id, purchaseDate: lot.purchaseDate, missing };
      }),
    };
  });
  const sharedGaps: PersonalAnalysisGap[] = [];
  if (!valuation.rows.length) sharedGaps.push("empty_holdings");
  else if (valuation.totals.currentValueRial === null) sharedGaps.push("incomplete_valuation");
  sharedGaps.push("cash_not_recorded");
  if (!constraints.complete) sharedGaps.push("owner_constraints_missing");
  sharedGaps.push("licensed_history_missing", "trading_inputs_missing", "factor_inputs_missing", "iran_validation_missing", "approval_missing");
  const shortMonths = snapshot.preferences.shortTermMonths;
  return {
    ...boundary, state: "descriptive_only",
    source: { portfolioVersion: snapshot.version, evaluatedAt: valuation.evaluatedAt, valuationVersion: valuation.version, purchaseBookVersion: book.version },
    valuation, constraints, savedMaximumAssetPercent: maximum,
    concentrationDenominator: "all_registered_holdings_current_value", assets,
    horizons: [
      { id: "short", state: "no_decision", savedDuration: shortMonths === "" ? null : { value: String(Number(shortMonths)), unit: "months" }, missingInputs: [...sharedGaps, ...(shortMonths === "" ? ["short_horizon_missing" as const] : [])], budgetReference: "shared_unavailable_budget" },
      { id: "medium", state: "no_decision", savedDuration: null, missingInputs: [...sharedGaps, "medium_horizon_missing"], budgetReference: "shared_unavailable_budget" },
    ],
    budget: { id: "shared_unavailable_budget", state: "unavailable", cashRial: null, spendableRial: null, prospectiveTradingCostRial: null, proposedSpendRial: { numerator: "0", denominator: "1" }, orders: [] },
  };
}
