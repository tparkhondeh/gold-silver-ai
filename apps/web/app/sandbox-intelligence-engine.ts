import {
  calculatePortfolioScenario,
  calculateScenarioMove,
  scenarioPresets,
  type ScenarioShocks,
} from "./scenario-engine.ts";

export type SandboxIntelligenceHorizon = "short" | "long";

export type SandboxIntelligenceCategory =
  | "summary"
  | "geopolitical"
  | "political"
  | "economic"
  | "industry"
  | "technical"
  | "bubble"
  | "portfolio";

export type SandboxIntelligenceInput = {
  id: string;
  name: string;
  assetClassId: string;
  assetClassLabel: string;
  valueToman: number;
  costToman: number | null;
  allocationPercent: number;
  returnPercent: number | null;
  riskScore: number;
  riskLabel: string;
  premium: {
    applicable: boolean;
    current: number | null;
    minimum: number | null;
    average: number | null;
    maximum: number | null;
  };
};

export type SandboxIntelligenceProfile = {
  liquidityReservePercent: number;
  maxSingleAssetPercent: number;
  maxAcceptableDrawdownPercent: number;
};

type SyntheticHistoryProfile = {
  trend90Percent: number;
  wavePercent: number;
  liquidityScore: number;
};

type ScenarioResult = {
  id: string;
  label: string;
  movePercent: number;
  impactToman: number;
};

type DecisionRoute = {
  code: "increase" | "hold" | "reduce" | "switch_peer" | "rotate";
  label: string;
  sourceName: string;
  destinationName: string | null;
  amountToman: number;
  reason: string;
};

export type SandboxAssetIntelligence = SandboxIntelligenceInput & {
  history: {
    observationCount: number;
    momentum20Percent: number;
    momentum60Percent: number;
    volatility20Percent: number;
    maxDrawdownPercent: number;
    movingAverage20: number;
    movingAverage60: number;
    liquidityScore: number;
  };
  valuation: {
    distanceFromAveragePercentPoint: number | null;
    rangePositionPercent: number | null;
    state: "below_average" | "near_average" | "above_average" | "not_applicable";
  };
  scenarios: ScenarioResult[];
  bestScenario: ScenarioResult;
  worstScenario: ScenarioResult;
  score: number;
  scoreBreakdown: {
    momentum: number;
    valuation: number;
    resilience: number;
    risk: number;
  };
  signal: "increase" | "hold" | "reduce";
  signalLabel: string;
  signalStrengthPercent: number;
  invalidation: string;
  homogeneousDecision: DecisionRoute;
  heterogeneousDecision: DecisionRoute;
};

export type SandboxIntelligenceResult = {
  methodologyId: string;
  methodologyVersion: string;
  datasetId: string;
  horizon: SandboxIntelligenceHorizon;
  profile: SandboxIntelligenceProfile;
  totalValueToman: number;
  assets: SandboxAssetIntelligence[];
  overallDecision: DecisionRoute;
};

export type SandboxAnalysisLens = {
  headline: string;
  verdict: string;
  metrics: Array<{ label: string; value: string; detail: string; tone: "positive" | "negative" | "neutral" }>;
  findings: string[];
  decision: string;
  invalidation: string;
  scenarioId: string | null;
};

export const sandboxIntelligenceMethodology = {
  id: "ASHA_SYNTHETIC_INTELLIGENCE_V1",
  version: "1.0.0",
  datasetId: "ASHA_SYNTHETIC_MARKET_V1",
  historyDatasetId: "ASHA_SYNTHETIC_HISTORY_90_V1",
  status: "synthetic_demo_only",
  executionAllowed: false,
  observationCount: 90,
  weights: {
    short: { momentum: 0.4, valuation: 0.2, resilience: 0.25, risk: 0.15 },
    long: { momentum: 0.25, valuation: 0.3, resilience: 0.3, risk: 0.15 },
  },
  thresholds: {
    increaseScore: 6,
    reduceScore: -4,
    peerSwitchGap: 8,
    crossClassRotationGap: 15,
    maximumRotationPercent: 25,
  },
  limitation: "تمام قیمت‌ها، تاریخچه، سناریوها و ضرایب این موتور ساختگی و نسخه‌دارند. خروجی برای ارزیابی منطق و تجربهٔ محصول است و اجرای معامله ندارد.",
} as const;

const historyProfiles: Record<string, SyntheticHistoryProfile> = {
  "طلای ۱۸ عیار": { trend90Percent: 8, wavePercent: 2.2, liquidityScore: 5 },
  "سکه امامی": { trend90Percent: 10, wavePercent: 4.2, liquidityScore: 4 },
  "شمش نقره ۹۹۹": { trend90Percent: 16, wavePercent: 6.4, liquidityScore: 3 },
  "ارز خارجی": { trend90Percent: 9, wavePercent: 2.4, liquidityScore: 5 },
  "وجه نقد و سپرده بانکی": { trend90Percent: 1.8, wavePercent: 0.15, liquidityScore: 5 },
  "سهام": { trend90Percent: 7, wavePercent: 7.2, liquidityScore: 4 },
  "صندوق سرمایه‌گذاری و ETF": { trend90Percent: 8, wavePercent: 4.4, liquidityScore: 5 },
  "رمزارز": { trend90Percent: 18, wavePercent: 15, liquidityScore: 3 },
  "ملک و زمین": { trend90Percent: 6, wavePercent: 1.4, liquidityScore: 2 },
  "کسب‌وکار خصوصی": { trend90Percent: 9, wavePercent: 3.4, liquidityScore: 1 },
};

const defaultHistoryProfile: SyntheticHistoryProfile = { trend90Percent: 5, wavePercent: 4, liquidityScore: 3 };

const lensScenario: Record<Exclude<SandboxIntelligenceCategory, "summary" | "technical" | "bubble" | "portfolio">, string> = {
  geopolitical: "fx-stress",
  political: "policy-tightening",
  economic: "liquidity",
  industry: "metals-up",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`;
}

function formatScore(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}`;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("fa-IR")} تومان`;
}

function buildSyntheticHistory(name: string, currentValue: number) {
  const profile = historyProfiles[name] ?? defaultHistoryProfile;
  const count = sandboxIntelligenceMethodology.observationCount;
  const values = Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const trend = 1 + (profile.trend90Percent / 100) * progress;
    const wave = (profile.wavePercent / 100)
      * (Math.sin(progress * Math.PI * 4) + 0.45 * Math.sin(progress * Math.PI * 10));
    return Math.max(0.01, trend + wave);
  });
  const scale = currentValue / values[values.length - 1];
  return { values: values.map((value) => value * scale), profile };
}

function calculateHistoryMetrics(name: string, currentValue: number) {
  const { values, profile } = buildSyntheticHistory(name, currentValue);
  const lastIndex = values.length - 1;
  const momentum = (lookback: number) => ((values[lastIndex] / values[lastIndex - lookback]) - 1) * 100;
  const average = (lookback: number) => values.slice(-lookback).reduce((sum, value) => sum + value, 0) / lookback;
  const returns = values.slice(1).map((value, index) => ((value / values[index]) - 1) * 100);
  const recentReturns = returns.slice(-20);
  const returnAverage = recentReturns.reduce((sum, value) => sum + value, 0) / recentReturns.length;
  const variance = recentReturns.reduce((sum, value) => sum + (value - returnAverage) ** 2, 0) / recentReturns.length;
  let peak = values[0];
  let maxDrawdown = 0;
  values.forEach((value) => {
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, ((value / peak) - 1) * 100);
  });
  return {
    observationCount: values.length,
    momentum20Percent: round(momentum(20)),
    momentum60Percent: round(momentum(60)),
    volatility20Percent: round(Math.sqrt(variance)),
    maxDrawdownPercent: round(maxDrawdown),
    movingAverage20: round(average(20)),
    movingAverage60: round(average(60)),
    liquidityScore: profile.liquidityScore,
  };
}

function valuationMetrics(premium: SandboxIntelligenceInput["premium"]) {
  if (!premium.applicable || premium.current === null || premium.average === null) {
    return { distanceFromAveragePercentPoint: null, rangePositionPercent: null, state: "not_applicable" as const };
  }
  const distance = premium.current - premium.average;
  const range = premium.minimum !== null && premium.maximum !== null ? premium.maximum - premium.minimum : 0;
  const rangePosition = range > 0 && premium.minimum !== null
    ? clamp(((premium.current - premium.minimum) / range) * 100, 0, 100)
    : null;
  return {
    distanceFromAveragePercentPoint: round(distance),
    rangePositionPercent: rangePosition === null ? null : round(rangePosition),
    state: distance >= 5 ? "above_average" as const : distance <= -5 ? "below_average" as const : "near_average" as const,
  };
}

function scenarioResults(input: SandboxIntelligenceInput) {
  return scenarioPresets
    .filter((preset) => preset.id !== "neutral")
    .map((preset) => {
      const movePercent = calculateScenarioMove(input.name, preset.shocks);
      return {
        id: preset.id,
        label: preset.label,
        movePercent: round(movePercent),
        impactToman: Math.round(input.valueToman * (movePercent / 100)),
      };
    });
}

function actionLabel(signal: SandboxAssetIntelligence["signal"]) {
  if (signal === "increase") return "افزایش آزمایشی مرحله‌ای";
  if (signal === "reduce") return "کاهش آزمایشی ریسک";
  return "نگهداری و پایش";
}

function baseRoute(asset: Omit<SandboxAssetIntelligence, "homogeneousDecision" | "heterogeneousDecision">): DecisionRoute {
  const amount = asset.signal === "hold" ? 0 : Math.round(asset.valueToman * (asset.signal === "increase" ? 0.1 : 0.15));
  return {
    code: asset.signal,
    label: actionLabel(asset.signal),
    sourceName: asset.name,
    destinationName: asset.signal === "increase" ? asset.name : null,
    amountToman: amount,
    reason: `امتیاز مرکب ${asset.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از مومنتوم، ارزش‌گذاری، تاب‌آوری سناریویی و ریسک به‌دست آمده است.`,
  };
}

export function calculateSandboxIntelligence(
  inputs: SandboxIntelligenceInput[],
  profile: SandboxIntelligenceProfile,
  horizon: SandboxIntelligenceHorizon,
): SandboxIntelligenceResult {
  const totalValueToman = inputs.reduce((sum, input) => sum + input.valueToman, 0);
  const weights = sandboxIntelligenceMethodology.weights[horizon];

  const baseAssets = inputs.map((input) => {
    const history = calculateHistoryMetrics(input.name, input.valueToman);
    const valuation = valuationMetrics(input.premium);
    const scenarios = scenarioResults(input);
    const bestScenario = [...scenarios].sort((left, right) => right.movePercent - left.movePercent)[0];
    const worstScenario = [...scenarios].sort((left, right) => left.movePercent - right.movePercent)[0];
    const selectedMomentum = horizon === "short" ? history.momentum20Percent : history.momentum60Percent;
    const momentum = clamp(selectedMomentum * 5, -100, 100);
    const valuationScore = valuation.distanceFromAveragePercentPoint !== null
      ? clamp(-valuation.distanceFromAveragePercentPoint * 4, -100, 100)
      : clamp((input.returnPercent ?? 0) * 2, -100, 100);
    const resilience = clamp(worstScenario.movePercent * 3, -100, 100);
    const risk = (3 - input.riskScore) * 20;
    const score = round(
      momentum * weights.momentum
      + valuationScore * weights.valuation
      + resilience * weights.resilience
      + risk * weights.risk,
    );
    const stressToleranceBreached = Math.abs(worstScenario.movePercent) > profile.maxAcceptableDrawdownPercent;
    const signal = input.name === "وجه نقد و سپرده بانکی"
      ? "hold" as const
      : stressToleranceBreached
        ? "reduce" as const
        : score >= sandboxIntelligenceMethodology.thresholds.increaseScore
          ? "increase" as const
          : score <= sandboxIntelligenceMethodology.thresholds.reduceScore
            ? "reduce" as const
            : "hold" as const;
    const invalidation = stressToleranceBreached
      ? `اگر بدترین فشار به داخل تحمل ${formatPercent(-profile.maxAcceptableDrawdownPercent)} برگردد، کاهش ریسک متوقف و تصمیم دوباره محاسبه می‌شود.`
      : signal === "increase"
      ? `اگر مومنتوم ${horizon === "short" ? "۲۰" : "۶۰"} مشاهده‌ای صفر یا منفی شود، یا افت سناریویی از ${formatPercent(-profile.maxAcceptableDrawdownPercent)} عبور کند.`
      : signal === "reduce"
        ? "اگر امتیاز مرکب به بالاتر از ۵- برسد و مومنتوم انتخاب‌شده مثبت شود، کاهش متوقف و تصمیم دوباره محاسبه می‌شود."
        : `اگر امتیاز به ${sandboxIntelligenceMethodology.thresholds.increaseScore.toLocaleString("fa-IR")} یا ${Math.abs(sandboxIntelligenceMethodology.thresholds.reduceScore).toLocaleString("fa-IR")}− برسد، نگهداری بازبینی می‌شود.`;
    return {
      ...input,
      history,
      valuation,
      scenarios,
      bestScenario,
      worstScenario,
      score,
      scoreBreakdown: { momentum: round(momentum), valuation: round(valuationScore), resilience: round(resilience), risk: round(risk) },
      signal,
      signalLabel: actionLabel(signal),
      signalStrengthPercent: round(clamp(50 + Math.abs(score), 50, 95)),
      invalidation,
    };
  });

  const assets: SandboxAssetIntelligence[] = baseAssets.map((asset) => {
    const base = baseRoute(asset);
    const peer = baseAssets
      .filter((candidate) => candidate.id !== asset.id && candidate.assetClassId === asset.assetClassId)
      .sort((left, right) => right.score - left.score)[0] ?? null;
    const homogeneousDecision = peer && peer.score - asset.score >= sandboxIntelligenceMethodology.thresholds.peerSwitchGap
      ? {
          code: "switch_peer" as const,
          label: `تعویض آزمایشی بخشی به ${peer.name}`,
          sourceName: asset.name,
          destinationName: peer.name,
          amountToman: Math.round(asset.valueToman * 0.15),
          reason: `امتیاز هم‌کلاس ${peer.name} برابر ${formatScore(peer.score)} و ${formatScore(peer.score - asset.score)} واحد بالاتر از دارایی مبدأ است.`,
        }
      : base;
    const crossClass = baseAssets
      .filter((candidate) => candidate.id !== asset.id && candidate.assetClassId !== asset.assetClassId && candidate.riskScore <= asset.riskScore)
      .sort((left, right) => right.score - left.score)[0] ?? null;
    const scoreGap = crossClass ? crossClass.score - asset.score : 0;
    const stressToleranceBreached = Math.abs(asset.worstScenario.movePercent) > profile.maxAcceptableDrawdownPercent;
    const heterogeneousDecision = crossClass && (stressToleranceBreached || scoreGap >= sandboxIntelligenceMethodology.thresholds.crossClassRotationGap)
      ? {
          code: "rotate" as const,
          label: `تبدیل آزمایشی بخشی به ${crossClass.name}`,
          sourceName: asset.name,
          destinationName: crossClass.name,
          amountToman: Math.round(asset.valueToman * Math.min(0.25, Math.max(0.08, scoreGap / 200))),
          reason: stressToleranceBreached
            ? `بدترین فشار ${formatPercent(asset.worstScenario.movePercent)} از تحمل افت ${formatPercent(-profile.maxAcceptableDrawdownPercent)} عبور می‌کند و ریسک مقصد (${crossClass.riskScore.toLocaleString("fa-IR")}/۵) بیشتر نیست.`
            : `اختلاف امتیاز ${formatScore(scoreGap)} واحد است و ریسک مقصد (${crossClass.riskScore.toLocaleString("fa-IR")}/۵) از مبدأ بیشتر نیست.`,
        }
      : {
          code: "hold" as const,
          label: "عدم تبدیل بین‌کلاسی",
          sourceName: asset.name,
          destinationName: null,
          amountToman: 0,
          reason: crossClass
            ? `اختلاف امتیاز بهترین مقصد کم‌ریسک‌تر ${formatScore(scoreGap)} واحد و کمتر از آستانهٔ ${formatScore(sandboxIntelligenceMethodology.thresholds.crossClassRotationGap)} واحد است.`
            : "مقصدی با کلاس متفاوت و ریسک مساوی یا کمتر در سبد ساختگی وجود ندارد.",
        };
    return { ...asset, homogeneousDecision, heterogeneousDecision };
  });

  const cash = assets.find((asset) => asset.name === "وجه نقد و سپرده بانکی") ?? null;
  const requiredCashToman = totalValueToman * (profile.liquidityReservePercent / 100);
  const cashGapToman = Math.max(0, requiredCashToman - (cash?.valueToman ?? 0));
  const largestNonCash = [...assets]
    .filter((asset) => asset.name !== "وجه نقد و سپرده بانکی")
    .sort((left, right) => right.allocationPercent - left.allocationPercent)[0] ?? null;
  const concentrationExcessToman = largestNonCash
    ? Math.max(0, largestNonCash.valueToman - totalValueToman * (profile.maxSingleAssetPercent / 100))
    : 0;
  const weakest = [...assets].filter((asset) => asset.name !== "وجه نقد و سپرده بانکی").sort((left, right) => left.score - right.score)[0] ?? null;
  const strongest = [...assets].sort((left, right) => right.score - left.score)[0] ?? null;
  let overallDecision: DecisionRoute = {
    code: "hold",
    label: "حفظ ترکیب و پایش روزانه",
    sourceName: "سبد",
    destinationName: null,
    amountToman: 0,
    reason: "ذخیرهٔ نقد، تمرکز و اختلاف امتیاز دارایی‌ها در محدودهٔ قواعد آزمایشگاه است.",
  };
  if (horizon === "short" && cashGapToman > 0 && weakest && cash) {
    overallDecision = {
      code: "rotate",
      label: `افزایش ذخیرهٔ نقد از محل ${weakest.name}`,
      sourceName: weakest.name,
      destinationName: cash.name,
      amountToman: Math.round(Math.min(cashGapToman, weakest.valueToman * 0.25)),
      reason: `ذخیرهٔ نقد ${formatMoney(cashGapToman)} کمتر از هدف ${formatPercent(profile.liquidityReservePercent)} است؛ ضعیف‌ترین امتیاز متعلق به ${weakest.name} است.`,
    };
  } else if (concentrationExcessToman > 0 && largestNonCash && strongest) {
    const destination = strongest.id === largestNonCash.id ? cash ?? strongest : strongest;
    overallDecision = {
      code: "rotate",
      label: `کاهش تمرکز ${largestNonCash.name}`,
      sourceName: largestNonCash.name,
      destinationName: destination.name,
      amountToman: Math.round(Math.min(concentrationExcessToman, largestNonCash.valueToman * 0.25)),
      reason: `وزن ${formatPercent(largestNonCash.allocationPercent)} از سقف ${formatPercent(profile.maxSingleAssetPercent)} بیشتر است؛ مقصد از میان امتیازهای بهتر انتخاب شده است.`,
    };
  } else if (weakest && strongest && strongest.score - weakest.score >= 25) {
    overallDecision = {
      code: "rotate",
      label: `چرخش محدود از ${weakest.name} به ${strongest.name}`,
      sourceName: weakest.name,
      destinationName: strongest.name,
      amountToman: Math.round(weakest.valueToman * 0.1),
      reason: `اختلاف امتیاز دو موقعیت ${formatScore(strongest.score - weakest.score)} واحد است؛ اندازهٔ چرخش به ۱۰٪ موقعیت ضعیف محدود شده است.`,
    };
  }

  return {
    methodologyId: sandboxIntelligenceMethodology.id,
    methodologyVersion: sandboxIntelligenceMethodology.version,
    datasetId: sandboxIntelligenceMethodology.datasetId,
    horizon,
    profile,
    totalValueToman,
    assets,
    overallDecision,
  };
}

function metricTone(value: number): "positive" | "negative" | "neutral" {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

function scenarioForLens(asset: SandboxAssetIntelligence, category: keyof typeof lensScenario) {
  const id = lensScenario[category];
  return asset.scenarios.find((scenario) => scenario.id === id) ?? asset.worstScenario;
}

export function buildSandboxAnalysisLens(
  result: SandboxIntelligenceResult,
  selectedAssetId: string,
  category: SandboxIntelligenceCategory,
): SandboxAnalysisLens | null {
  const asset = result.assets.find((item) => item.id === selectedAssetId);
  if (!asset) return null;
  const momentum = result.horizon === "short" ? asset.history.momentum20Percent : asset.history.momentum60Percent;
  const baseMetrics: SandboxAnalysisLens["metrics"] = [
    { label: "امتیاز تصمیم", value: asset.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 }), detail: "دامنهٔ ۱۰۰- تا ۱۰۰+", tone: metricTone(asset.score) },
    { label: `مومنتوم ${result.horizon === "short" ? "۲۰" : "۶۰"} مشاهده`, value: formatPercent(momentum), detail: sandboxIntelligenceMethodology.historyDatasetId, tone: metricTone(momentum) },
    { label: "بدترین فشار", value: formatPercent(asset.worstScenario.movePercent), detail: asset.worstScenario.label, tone: metricTone(asset.worstScenario.movePercent) },
    { label: "وزن در سبد", value: formatPercent(asset.allocationPercent), detail: `بزرگ‌ترین وزن فعلی ${formatPercent(result.assets.length ? Math.max(...result.assets.map((item) => item.allocationPercent)) : 0)}`, tone: "neutral" },
  ];
  const decision = `${asset.homogeneousDecision.label}${asset.homogeneousDecision.amountToman > 0 ? ` · ${formatMoney(asset.homogeneousDecision.amountToman)}` : ""}`;

  if (category === "summary") {
    return {
      headline: `${asset.signalLabel} برای ${asset.name}`,
      verdict: `امتیاز مرکب ${asset.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} است؛ تصمیم از چهار مؤلفهٔ عددی ساخته شده و با تغییر افق دوباره محاسبه می‌شود.`,
      metrics: baseMetrics,
      findings: [
        `بازده نسبت به بهای خرید: ${asset.returnPercent === null ? "نامشخص" : formatPercent(asset.returnPercent)}.`,
        `بهترین سناریوی فعال: ${asset.bestScenario.label} با اثر ${formatPercent(asset.bestScenario.movePercent)} (${formatMoney(asset.bestScenario.impactToman)}).`,
        `تصمیم ناهمگن: ${asset.heterogeneousDecision.label}؛ ${asset.heterogeneousDecision.reason}`,
      ],
      decision,
      invalidation: asset.invalidation,
      scenarioId: null,
    };
  }

  if (category === "technical") {
    const trendState = asset.history.movingAverage20 >= asset.history.movingAverage60 ? "روند کوتاه بالاتر از میانگین بلندتر است" : "روند کوتاه زیر میانگین بلندتر است";
    return {
      headline: `${trendState}؛ سیگنال ${asset.signalLabel}`,
      verdict: `روی ${asset.history.observationCount.toLocaleString("fa-IR")} مشاهدهٔ ساختگی، مومنتوم و افت مستقیماً از سری ارزش نرمال‌شدهٔ موقعیت محاسبه شده‌اند.`,
      metrics: [
        { label: "مومنتوم ۲۰ مشاهده", value: formatPercent(asset.history.momentum20Percent), detail: "تغییر ارزش نرمال‌شده نسبت به ۲۰ مشاهده قبل", tone: metricTone(asset.history.momentum20Percent) },
        { label: "مومنتوم ۶۰ مشاهده", value: formatPercent(asset.history.momentum60Percent), detail: "تغییر ارزش نرمال‌شده نسبت به ۶۰ مشاهده قبل", tone: metricTone(asset.history.momentum60Percent) },
        { label: "نوسان روزانهٔ ۲۰ مشاهده", value: formatPercent(asset.history.volatility20Percent), detail: "انحراف معیار بازده؛ بدون سالانه‌سازی", tone: "neutral" },
        { label: "بیشترین افت مسیر", value: formatPercent(asset.history.maxDrawdownPercent), detail: "از قله تا دره در تاریخچهٔ تمرینی", tone: "negative" },
      ],
      findings: [
        `میانگین ارزش موقعیت در ۲۰ مشاهده: ${formatMoney(asset.history.movingAverage20)}؛ در ۶۰ مشاهده: ${formatMoney(asset.history.movingAverage60)}.`,
        `افت مشاهده‌شده ${formatPercent(asset.history.maxDrawdownPercent)} در برابر تحمل ${formatPercent(-result.profile.maxAcceptableDrawdownPercent)} گزارش شده و VaR جعلی تولید نشده است.`,
        `قدرت سیگنال: ${formatPercent(asset.signalStrengthPercent)}؛ این عدد اطمینان آماری نیست.`,
      ],
      decision,
      invalidation: asset.invalidation,
      scenarioId: null,
    };
  }

  if (category === "bubble") {
    const applicable = asset.valuation.distanceFromAveragePercentPoint !== null;
    const stateLabel = asset.valuation.state === "above_average" ? "بالاتر از میانگین" : asset.valuation.state === "below_average" ? "پایین‌تر از میانگین" : asset.valuation.state === "near_average" ? "نزدیک میانگین" : "برای این دارایی نامرتبط";
    return {
      headline: applicable ? `حباب ${stateLabel} است` : "حباب فلز/سکه برای این کلاس دارایی تعریف نشده است",
      verdict: applicable
        ? `حباب فعلی ${formatPercent(asset.premium.current ?? 0)} و فاصلهٔ آن از میانگین ${formatPercent(asset.valuation.distanceFromAveragePercentPoint ?? 0)} واحد درصد است.`
        : "این موتور به‌جای ساختن حباب نامعتبر، ارزش‌گذاری این کلاس را از بازده، سناریو و ریسک می‌سازد.",
      metrics: applicable ? [
        { label: "حباب فعلی", value: formatPercent(asset.premium.current ?? 0), detail: "قیمت بازار منهای ارزش مرجع", tone: metricTone(asset.premium.current ?? 0) },
        { label: "فاصله از میانگین", value: formatPercent(asset.valuation.distanceFromAveragePercentPoint ?? 0), detail: "واحد درصد", tone: metricTone(-(asset.valuation.distanceFromAveragePercentPoint ?? 0)) },
        { label: "موقعیت در دامنه", value: formatPercent(asset.valuation.rangePositionPercent ?? 0), detail: "کمینه تا بیشینه؛ نه صدک آماری", tone: "neutral" },
        { label: "دامنهٔ تمرینی", value: `${formatPercent(asset.premium.minimum ?? 0)} تا ${formatPercent(asset.premium.maximum ?? 0)}`, detail: "۹۰ مشاهدهٔ ساختگی", tone: "neutral" },
      ] : baseMetrics,
      findings: applicable ? [
        `میانگین حباب ${formatPercent(asset.premium.average ?? 0)} است.`,
        `کمینه ${formatPercent(asset.premium.minimum ?? 0)} و بیشینه ${formatPercent(asset.premium.maximum ?? 0)} است.`,
        `اثر ارزش‌گذاری پیش از وزن‌دهی: ${formatScore(asset.scoreBreakdown.valuation)} امتیاز.`,
      ] : [
        "برای این کلاس دارایی قیمت مرجع همگن با فرمول حباب تعریف نشده است.",
        `بازده بهای خرید ${asset.returnPercent === null ? "نامشخص" : formatPercent(asset.returnPercent)} است.`,
        `اثر ارزش‌گذاری جایگزین پیش از وزن‌دهی: ${formatScore(asset.scoreBreakdown.valuation)} امتیاز.`,
      ],
      decision,
      invalidation: asset.invalidation,
      scenarioId: null,
    };
  }

  if (category === "portfolio") {
    const portfolioScenarios = scenarioPresets.filter((preset) => preset.id !== "neutral").map((preset) => ({
      id: preset.id,
      label: preset.label,
      result: calculatePortfolioScenario(result.assets.map((item) => ({ id: item.id, name: item.name, valueToman: item.valueToman })), preset.shocks),
    }));
    const worstPortfolio = portfolioScenarios.sort((left, right) => left.result.impactPercent - right.result.impactPercent)[0];
    return {
      headline: result.overallDecision.label,
      verdict: result.overallDecision.reason,
      metrics: [
        { label: "وزن دارایی منتخب", value: formatPercent(asset.allocationPercent), detail: asset.name, tone: "neutral" },
        { label: "نقدشوندگی", value: `${asset.history.liquidityScore.toLocaleString("fa-IR")} / ۵`, detail: "امتیاز ساختگی خروج", tone: asset.history.liquidityScore >= 4 ? "positive" : asset.history.liquidityScore <= 2 ? "negative" : "neutral" },
        { label: "بدترین فشار کل سبد", value: formatPercent(worstPortfolio.result.impactPercent), detail: worstPortfolio.label, tone: metricTone(worstPortfolio.result.impactPercent) },
        { label: "اثر ریالی فشار", value: formatMoney(worstPortfolio.result.impactToman), detail: `پوشش ${worstPortfolio.result.coverageCount.toLocaleString("fa-IR")} موقعیت`, tone: metricTone(worstPortfolio.result.impactToman) },
      ],
      findings: [
        `اقدام کل سبد: ${result.overallDecision.label}.`,
        `مبلغ گردش: ${formatMoney(result.overallDecision.amountToman)}؛ مبدأ ${result.overallDecision.sourceName}${result.overallDecision.destinationName ? ` و مقصد ${result.overallDecision.destinationName}` : ""}.`,
        `تصمیم ناهمگن دارایی منتخب: ${asset.heterogeneousDecision.label}.`,
      ],
      decision: result.overallDecision.label,
      invalidation: "با تغییر ارزش روز، قیود مالک یا جابه‌جایی امتیاز بهترین/ضعیف‌ترین دارایی، تصمیم کل سبد دوباره محاسبه می‌شود.",
      scenarioId: worstPortfolio.id,
    };
  }

  const scenario = scenarioForLens(asset, category);
  const lensLabels: Record<typeof category, { title: string; channel: string }> = {
    geopolitical: { title: "انتقال شوک ژئوپلیتیک", channel: "ارز، فلز، پریمیوم و فشار دارایی ریسکی" },
    political: { title: "اثر سیاست‌گذاری", channel: "سیاست ارزی/انقباضی و قیمت دارایی" },
    economic: { title: "تاب‌آوری کلان", channel: "نقدینگی، ارز و افت دارایی‌های ریسکی" },
    industry: { title: "عرضه و تقاضای صنعت", channel: "رونق فلزات و انتقال به ابزار منتخب" },
  };
  const label = lensLabels[category];
  const preset = scenarioPresets.find((item) => item.id === scenario.id);
  const activeDrivers = preset ? Object.entries(preset.shocks).filter(([, value]) => value !== 0).sort((left, right) => Math.abs(right[1]) - Math.abs(left[1])).slice(0, 3) : [];
  return {
    headline: `${label.title}: اثر ${formatPercent(scenario.movePercent)} بر ${asset.name}`,
    verdict: `در سناریوی «${scenario.label}»، مسیر ${label.channel} به اثر ${formatMoney(scenario.impactToman)} روی موقعیت منتخب می‌رسد.`,
    metrics: [
      { label: "اثر روی دارایی", value: formatPercent(scenario.movePercent), detail: scenario.label, tone: metricTone(scenario.movePercent) },
      { label: "اثر ریالی", value: formatMoney(scenario.impactToman), detail: `ارزش پایه ${formatMoney(asset.valueToman)}`, tone: metricTone(scenario.impactToman) },
      { label: "امتیاز تاب‌آوری", value: formatScore(asset.scoreBreakdown.resilience), detail: "واحد امتیاز قبل از وزن‌دهی", tone: metricTone(asset.scoreBreakdown.resilience) },
      { label: "بدترین سناریو", value: formatPercent(asset.worstScenario.movePercent), detail: asset.worstScenario.label, tone: metricTone(asset.worstScenario.movePercent) },
    ],
    findings: [
      `سه شوک غالب ورودی: ${activeDrivers.map(([driver, value]) => `${driver} ${formatPercent(value)}`).join("، ") || "بدون شوک"}.`,
      `بهترین حالت دارایی در سناریوهای فعال ${asset.bestScenario.label} با ${formatPercent(asset.bestScenario.movePercent)} است.`,
      `این سناریو به امتیاز نهایی ${asset.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} و تصمیم «${asset.signalLabel}» منتهی شده است.`,
    ],
    decision,
    invalidation: asset.invalidation,
    scenarioId: scenario.id,
  };
}

export function calculateSingleScenarioImpact(name: string, valueToman: number, shocks: ScenarioShocks) {
  const movePercent = calculateScenarioMove(name, shocks);
  return { movePercent, impactToman: valueToman * (movePercent / 100) };
}
