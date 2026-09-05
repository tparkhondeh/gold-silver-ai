export type SandboxHorizon = "short" | "long";

export type SandboxHoldingInput = {
  id: string;
  name: string;
  valueToman: number | null;
  costToman: number | null;
};

export type SandboxConstraintInput = {
  liquidityReservePercent?: string;
  maxSingleAssetPercent?: string;
  maxAcceptableDrawdownPercent?: string;
  shortTermMonths?: string;
  longTermYears?: string;
};

export type SandboxQuote = {
  instrumentCode: string;
  value: number;
  currency: "USD" | "TOMAN";
  unit: "troy_ounce" | "gram" | "unit" | "usd";
  publishedAt: string;
  collectedAt: string;
  sourceId: "asha-sandbox";
  sourceName: "آزمایشگاه اشا · داده ساختگی";
  sourceUrl: "#asha-sandbox";
  quality: "informational";
  status: "valid";
};

export const sandboxMethodology = {
  id: "ASHA_SANDBOX_DECISION_V1",
  version: "1.0.0",
  datasetId: "ASHA_SYNTHETIC_MARKET_V1",
  status: "synthetic_demo_only",
  executionAllowed: false,
  parameters: {
    defaultLiquidityReservePercent: 15,
    defaultMaxSingleAssetPercent: 30,
    defaultMaxAcceptableDrawdownPercent: 20,
    profitReviewThresholdPercent: 12,
    lossReviewThresholdPercent: -8,
    maxRotationShareOfSourcePercent: 25,
  },
  limitation: "این روش فقط تجربهٔ رابط را با داده‌های ساختگی و قواعد تمرینی نسخه‌دار کامل می‌کند؛ روش سرمایه‌گذاری، پیش‌بینی یا توصیهٔ قابل اجرا نیست.",
} as const;

export const sandboxReadinessGates = [
  "سبد ساختگی نسخه‌دار",
  "ارزش‌گذاری ساختگی کامل",
  "خوراک ساختگی ایران",
  "قیود شخصی یا پیش‌فرض آزمایشگاه",
  "روش تمرینی نسخه‌دار",
  "اعتبارسنجی صوری رابط",
] as const;

export const sandboxPremiumMethodology = {
  id: "ASHA_SYNTHETIC_PREMIUM_HISTORY_V1",
  version: "1.0.0",
  status: "synthetic_demo_only",
  windowLabel: "۹۰ مشاهدهٔ ساختگی",
} as const;

const sandboxPremiumFixtures: Record<string, { current: number; minimum: number; average: number; maximum: number }> = {
  "طلای ۱۸ عیار": { current: 32.56, minimum: 18, average: 28, maximum: 42 },
  "سکه امامی": { current: 21, minimum: 8, average: 17, maximum: 30 },
  "شمش نقره ۹۹۹": { current: 58.1, minimum: 31, average: 47, maximum: 69 },
};

export function buildSandboxPremiumMetrics(name: string, calculatedCurrent: number | null) {
  const fixture = sandboxPremiumFixtures[name];
  if (!fixture) return { applicable: false, current: null, minimum: null, average: null, maximum: null } as const;
  return {
    applicable: true,
    current: calculatedCurrent ?? fixture.current,
    minimum: fixture.minimum,
    average: fixture.average,
    maximum: fixture.maximum,
  } as const;
}

const syntheticQuoteValues: Array<Pick<SandboxQuote, "instrumentCode" | "value" | "currency" | "unit">> = [
  { instrumentCode: "GOLD_18K_IRR", value: 21_480_700, currency: "TOMAN", unit: "gram" },
  { instrumentCode: "GOLD_24K_IRR", value: 28_640_900, currency: "TOMAN", unit: "gram" },
  { instrumentCode: "MESGHAL_IRR", value: 93_050_000, currency: "TOMAN", unit: "unit" },
  { instrumentCode: "EMAMI_COIN_IRR", value: 212_500_000, currency: "TOMAN", unit: "unit" },
  { instrumentCode: "AZADI_COIN_IRR", value: 205_000_000, currency: "TOMAN", unit: "unit" },
  { instrumentCode: "HALF_COIN_IRR", value: 108_000_000, currency: "TOMAN", unit: "unit" },
  { instrumentCode: "QUARTER_COIN_IRR", value: 57_500_000, currency: "TOMAN", unit: "unit" },
  { instrumentCode: "GRAM_COIN_IRR", value: 29_500_000, currency: "TOMAN", unit: "unit" },
  { instrumentCode: "SILVER_999_IRR", value: 446_860, currency: "TOMAN", unit: "gram" },
  { instrumentCode: "SILVER_925_IRR", value: 413_340, currency: "TOMAN", unit: "gram" },
  { instrumentCode: "USD_IRR", value: 160_000, currency: "TOMAN", unit: "usd" },
  { instrumentCode: "XAU_USD", value: 4_200, currency: "USD", unit: "troy_ounce" },
  { instrumentCode: "XAG_USD", value: 55, currency: "USD", unit: "troy_ounce" },
  { instrumentCode: "COPPER_USD", value: 5.1, currency: "USD", unit: "unit" },
];

const sandboxRiskScore: Record<string, number> = {
  "وجه نقد و سپرده بانکی": 1,
  "طلای ۱۸ عیار": 2,
  "سکه امامی": 3,
  "شمش نقره ۹۹۹": 3,
  "ارز خارجی": 3,
  "صندوق سرمایه‌گذاری و ETF": 3,
  "سهام": 4,
  "ملک و زمین": 4,
  "کسب‌وکار خصوصی": 4,
  "رمزارز": 5,
};

function boundedNumber(raw: string | undefined, minimum: number, maximum: number, fallback: number) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function riskLabel(score: number) {
  if (score <= 1) return "کم · ساختگی";
  if (score <= 3) return "متوسط · ساختگی";
  if (score === 4) return "بالا · ساختگی";
  return "بسیار بالا · ساختگی";
}

export function buildSandboxQuotes(collectedAt: string): SandboxQuote[] {
  if (!Number.isFinite(Date.parse(collectedAt))) throw new Error("Sandbox quote timestamp must be ISO-8601");
  return syntheticQuoteValues.map((quote) => ({
    ...quote,
    publishedAt: collectedAt,
    collectedAt,
    sourceId: "asha-sandbox",
    sourceName: "آزمایشگاه اشا · داده ساختگی",
    sourceUrl: "#asha-sandbox",
    quality: "informational",
    status: "valid",
  }));
}

export function calculateSandboxDecision(
  inputs: SandboxHoldingInput[],
  constraints: SandboxConstraintInput,
  horizon: SandboxHorizon,
) {
  const holdings = inputs.filter((holding): holding is SandboxHoldingInput & { valueToman: number } => holding.valueToman !== null && Number.isFinite(holding.valueToman) && holding.valueToman >= 0);
  const totalValueToman = holdings.reduce((sum, holding) => sum + holding.valueToman, 0);
  const profile = {
    liquidityReservePercent: boundedNumber(constraints.liquidityReservePercent, 0, 100, sandboxMethodology.parameters.defaultLiquidityReservePercent),
    maxSingleAssetPercent: boundedNumber(constraints.maxSingleAssetPercent, 1, 100, sandboxMethodology.parameters.defaultMaxSingleAssetPercent),
    maxAcceptableDrawdownPercent: boundedNumber(constraints.maxAcceptableDrawdownPercent, 1, 100, sandboxMethodology.parameters.defaultMaxAcceptableDrawdownPercent),
    shortTermMonths: boundedNumber(constraints.shortTermMonths, 1, 24, 6),
    longTermYears: boundedNumber(constraints.longTermYears, 1, 20, 5),
  };

  const rows = holdings.map((holding) => {
    const allocationPercent = totalValueToman > 0 ? (holding.valueToman / totalValueToman) * 100 : 0;
    const returnPercent = holding.costToman !== null && Number.isFinite(holding.costToman) && holding.costToman > 0
      ? ((holding.valueToman - holding.costToman) / holding.costToman) * 100
      : null;
    const riskScore = sandboxRiskScore[holding.name] ?? 3;
    const homogeneousAction = returnPercent !== null && returnPercent >= sandboxMethodology.parameters.profitReviewThresholdPercent
      ? "protect_demo_gain"
      : returnPercent !== null && returnPercent <= sandboxMethodology.parameters.lossReviewThresholdPercent
        ? "compare_demo_peer"
        : "hold_demo";
    const heterogeneousAction = allocationPercent > profile.maxSingleAssetPercent
      ? "rebalance_demo_to_cash"
      : riskScore >= 4 && returnPercent !== null && returnPercent < 0
        ? "reduce_demo_risk"
        : "no_demo_conversion";
    return {
      ...holding,
      allocationPercent,
      returnPercent,
      riskScore,
      riskLabel: riskLabel(riskScore),
      homogeneousAction,
      heterogeneousAction,
    };
  });

  const cashValueToman = rows.find((holding) => holding.name === "وجه نقد و سپرده بانکی")?.valueToman ?? 0;
  const requiredCashToman = totalValueToman * (profile.liquidityReservePercent / 100);
  const cashGapToman = Math.max(0, requiredCashToman - cashValueToman);
  const largestNonCash = rows
    .filter((holding) => holding.name !== "وجه نقد و سپرده بانکی")
    .sort((left, right) => right.valueToman - left.valueToman)[0] ?? null;
  const concentrationTargetToman = totalValueToman * (profile.maxSingleAssetPercent / 100);
  const concentrationExcessToman = largestNonCash ? Math.max(0, largestNonCash.valueToman - concentrationTargetToman) : 0;
  const preferredAmountToman = horizon === "short" && cashGapToman > 0 ? cashGapToman : concentrationExcessToman;
  const cappedAmountToman = largestNonCash
    ? Math.min(preferredAmountToman, largestNonCash.valueToman * (sandboxMethodology.parameters.maxRotationShareOfSourcePercent / 100))
    : 0;
  const overallAction = cappedAmountToman > 0 && largestNonCash
    ? {
        code: horizon === "short" && cashGapToman > 0 ? "increase_demo_liquidity" : "reduce_demo_concentration",
        sourceHoldingId: largestNonCash.id,
        sourceName: largestNonCash.name,
        destinationName: "وجه نقد و سپرده بانکی",
        amountToman: Math.round(cappedAmountToman),
      }
    : {
        code: "hold_demo_portfolio",
        sourceHoldingId: null,
        sourceName: null,
        destinationName: null,
        amountToman: 0,
      };

  return {
    methodologyId: sandboxMethodology.id,
    datasetId: sandboxMethodology.datasetId,
    horizon,
    executionAllowed: false,
    profile,
    totalValueToman,
    cashValueToman,
    cashGapToman,
    rows,
    overallAction,
  };
}
