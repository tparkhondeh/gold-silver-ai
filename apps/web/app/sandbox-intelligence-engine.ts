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
  conversionCostPercent: number;
  valuationPercentile: number;
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
    concentration: number;
    conversionCost: number;
    crisisResilience: number;
    drawdown: number;
    liquidity: number;
    trend: number;
    valuation: number;
    volatility: number;
  };
  factorContributions: Array<{
    id: string;
    label: string;
    input: number;
    points: number;
    weight: number;
    weightedContribution: number;
  }>;
  targetWeightPercent: number;
  changePercentPoint: number;
  evidenceAdequacyPercent: number;
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
  evidenceState: {
    syntheticFactorCoveragePercent: number;
    iranValidationStatus: "not_evaluated";
    missingRequirements: string[];
  };
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
  id: "ASHA_TRANSPARENT_GUARDED_DECISION_V1",
  version: "1.0.0-laboratory-ui",
  datasetId: "ASHA_SYNTHETIC_MARKET_V1",
  historyDatasetId: "ASHA_SYNTHETIC_HISTORY_90_V1",
  status: "synthetic_demo_only",
  executionAllowed: false,
  financialUseAllowed: false,
  observationCount: 90,
  factorWeights: {
    concentration: 0.125,
    conversionCost: 0.125,
    crisisResilience: 0.125,
    drawdown: 0.125,
    liquidity: 0.125,
    trend: 0.125,
    valuation: 0.125,
    volatility: 0.125,
  },
  thresholds: {
    increaseScore: 12.5,
    reduceScore: -12.5,
    noTradeBandPercentPoint: 2,
    maximumRotationPercent: 25,
    riskBreachMultiplier: 0.5,
    riskBreachCashTransferFraction: 0.5,
  },
  targetRule: "equal_anchor_times_one_plus_quarter_composite_then_normalize_and_cap",
  limitation: "تمام قیمت‌ها، تاریخچه، سناریوها، هزینه‌ها و ضرایب این موتور ساختگی و نسخه‌دارند. خروجی فقط پیشنهاد آزمایشگاهی است؛ هنوز برای ایران اعتبارسنجی و برای استفادهٔ مالی تأیید نشده است.",
} as const;

const historyProfiles: Record<string, SyntheticHistoryProfile> = {
  "طلای ۱۸ عیار": { trend90Percent: 8, wavePercent: 2.2, liquidityScore: 5, conversionCostPercent: 0.5, valuationPercentile: 0.35 },
  "سکه امامی": { trend90Percent: 10, wavePercent: 4.2, liquidityScore: 4, conversionCostPercent: 1, valuationPercentile: 0.65 },
  "شمش نقره ۹۹۹": { trend90Percent: 16, wavePercent: 6.4, liquidityScore: 3, conversionCostPercent: 2, valuationPercentile: 0.55 },
  "ارز خارجی": { trend90Percent: 9, wavePercent: 2.4, liquidityScore: 5, conversionCostPercent: 0.8, valuationPercentile: 0.5 },
  "وجه نقد و سپرده بانکی": { trend90Percent: 1.8, wavePercent: 0.15, liquidityScore: 5, conversionCostPercent: 0, valuationPercentile: 0.5 },
  "سهام": { trend90Percent: 7, wavePercent: 7.2, liquidityScore: 4, conversionCostPercent: 0.6, valuationPercentile: 0.5 },
  "صندوق سرمایه‌گذاری و ETF": { trend90Percent: 8, wavePercent: 4.4, liquidityScore: 5, conversionCostPercent: 0.3, valuationPercentile: 0.45 },
  "رمزارز": { trend90Percent: 18, wavePercent: 15, liquidityScore: 3, conversionCostPercent: 1.5, valuationPercentile: 0.8 },
  "ملک و زمین": { trend90Percent: 6, wavePercent: 1.4, liquidityScore: 2, conversionCostPercent: 5, valuationPercentile: 0.55 },
  "کسب‌وکار خصوصی": { trend90Percent: 9, wavePercent: 3.4, liquidityScore: 1, conversionCostPercent: 4, valuationPercentile: 0.6 },
};

const defaultHistoryProfile: SyntheticHistoryProfile = { trend90Percent: 5, wavePercent: 4, liquidityScore: 3, conversionCostPercent: 1.5, valuationPercentile: 0.5 };

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
  const amount = asset.signal === "hold" ? 0 : Math.round(Math.abs(asset.changePercentPoint) * asset.valueToman / Math.max(asset.allocationPercent, 0.000001));
  return {
    code: asset.signal,
    label: actionLabel(asset.signal),
    sourceName: asset.name,
    destinationName: asset.signal === "increase" ? asset.name : null,
    amountToman: amount,
    reason: asset.name === "وجه نقد و سپرده بانکی"
      ? `وزن هدف ${formatPercent(asset.targetWeightPercent)} از قاعدهٔ ذخیرهٔ نقد و انتقال ریسک محاسبه شده است؛ امتیازهای دارایی برای نقد اعمال نمی‌شوند.`
      : `امتیاز ${asset.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از ۸ عامل هم‌وزن ساخته و وزن هدف ${formatPercent(asset.targetWeightPercent)} محاسبه شده است.`,
  };
}

function fiveBand(value: number, boundaries: readonly [number, number, number, number], lowerGood: boolean) {
  const bucket = value <= boundaries[0] ? 2 : value <= boundaries[1] ? 1 : value <= boundaries[2] ? 0 : value <= boundaries[3] ? -1 : -2;
  return lowerGood ? bucket : -bucket;
}

function trendPoints(trendPercent: number, volatilityPercent: number) {
  const ratio = trendPercent / Math.max(volatilityPercent, 0.000001);
  return { points: ratio <= -1 ? -2 : ratio <= -0.25 ? -1 : ratio < 0.25 ? 0 : ratio < 1 ? 1 : 2, ratio };
}

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function cappedTargets(preferences: Map<string, number>, pool: number, cap: number) {
  const remaining = new Set(preferences.keys());
  const result = new Map<string, number>();
  let remainingPool = pool;
  while (remaining.size) {
    const preferenceTotal = [...remaining].reduce((sum, id) => sum + (preferences.get(id) ?? 0), 0);
    const tentative = new Map([...remaining].map((id) => [id, remainingPool * (preferences.get(id) ?? 0) / preferenceTotal]));
    const over = [...remaining].filter((id) => (tentative.get(id) ?? 0) > cap).sort();
    if (!over.length) {
      tentative.forEach((weight, id) => result.set(id, weight));
      break;
    }
    over.forEach((id) => {
      result.set(id, cap);
      remaining.delete(id);
      remainingPool -= cap;
    });
  }
  return result;
}

export function calculateSandboxIntelligence(
  inputs: SandboxIntelligenceInput[],
  profile: SandboxIntelligenceProfile,
  horizon: SandboxIntelligenceHorizon,
): SandboxIntelligenceResult {
  const totalValueToman = inputs.reduce((sum, input) => sum + input.valueToman, 0);
  const cashInput = inputs.find((input) => input.name === "وجه نقد و سپرده بانکی") ?? null;
  const prepared = inputs.map((input) => {
    const history = calculateHistoryMetrics(input.name, input.valueToman);
    const syntheticProfile = historyProfiles[input.name] ?? defaultHistoryProfile;
    const valuation = valuationMetrics(input.premium);
    const scenarios = scenarioResults(input);
    const bestScenario = [...scenarios].sort((left, right) => right.movePercent - left.movePercent)[0];
    const worstScenario = [...scenarios].sort((left, right) => left.movePercent - right.movePercent)[0];
    return { input, history, syntheticProfile, valuation, scenarios, bestScenario, worstScenario };
  });
  const nonCashPrepared = prepared.filter(({ input }) => input.id !== cashInput?.id);
  const medianVolatility = Math.max(0.000001, median(nonCashPrepared.map(({ history }) => history.volatility20Percent)));
  const tolerance = Math.max(profile.maxAcceptableDrawdownPercent, 0.000001);
  const currentWeights = new Map(inputs.map((input) => [input.id, totalValueToman > 0 ? input.valueToman / totalValueToman : 0]));
  const preferenceById = new Map<string, number>();
  const riskBreachedIds = new Set<string>();

  const scored = prepared.map(({ input, history, syntheticProfile, valuation, scenarios, bestScenario, worstScenario }) => {
    const selectedMomentum = horizon === "short" ? history.momentum20Percent : history.momentum60Percent;
    const currentWeight = currentWeights.get(input.id) ?? 0;
    const valuationPercentile = valuation.rangePositionPercent === null ? syntheticProfile.valuationPercentile : valuation.rangePositionPercent / 100;
    const trend = trendPoints(selectedMomentum, history.volatility20Percent);
    const rawFactors = {
      concentration: { id: "CONCENTRATION", label: "تمرکز سبد", input: currentWeight, points: fiveBand(currentWeight / Math.max(profile.maxSingleAssetPercent / 100, 0.000001), [0.5, 0.75, 1, 1.25], true) },
      conversionCost: { id: "CONVERSION_COST", label: "هزینهٔ تبدیل", input: syntheticProfile.conversionCostPercent / 100, points: fiveBand(syntheticProfile.conversionCostPercent / 100, [0.0025, 0.0075, 0.015, 0.03], true) },
      crisisResilience: { id: "CRISIS_RESILIENCE", label: "تاب‌آوری بحران", input: worstScenario.movePercent / 100, points: fiveBand(Math.abs(worstScenario.movePercent) / tolerance, [0.25, 0.5, 0.75, 1], true) },
      drawdown: { id: "DRAWDOWN", label: "افت", input: history.maxDrawdownPercent / 100, points: fiveBand(Math.abs(history.maxDrawdownPercent) / tolerance, [0.25, 0.5, 0.75, 1], true) },
      liquidity: { id: "LIQUIDITY", label: "نقدشوندگی", input: history.liquidityScore, points: history.liquidityScore - 3 },
      trend: { id: "TREND", label: "روند نسبت به نوسان", input: trend.ratio, points: trend.points },
      valuation: { id: "VALUATION", label: "ارزش‌گذاری", input: valuationPercentile, points: fiveBand(valuationPercentile, [0.2, 0.4, 0.6, 0.8], true) },
      volatility: { id: "VOLATILITY", label: "نوسان", input: history.volatility20Percent / 100, points: fiveBand(history.volatility20Percent / medianVolatility, [0.5, 0.85, 1.15, 1.5], true) },
    };
    const isCash = input.id === cashInput?.id;
    const scoreBreakdown = Object.fromEntries(Object.entries(rawFactors).map(([key, factor]) => [key, isCash ? 0 : factor.points])) as SandboxAssetIntelligence["scoreBreakdown"];
    const composite = isCash ? 0 : Object.values(rawFactors).reduce((sum, factor) => sum + factor.points * 0.125, 0);
    const score = round(composite * 50, 6);
    const riskBreached = !isCash && (Math.abs(worstScenario.movePercent) > tolerance || Math.abs(history.maxDrawdownPercent) > tolerance);
    if (riskBreached) riskBreachedIds.add(input.id);
    if (input.id !== cashInput?.id) {
      preferenceById.set(input.id, Math.max(0.25, (1 + 0.25 * composite) * (riskBreached ? 0.5 : 1)));
    }
    return {
      ...input,
      history,
      valuation,
      scenarios,
      bestScenario,
      worstScenario,
      score,
      scoreBreakdown,
      factorContributions: Object.values(rawFactors).map((factor) => isCash
        ? { ...factor, label: `${factor.label} (برای نقد اعمال نمی‌شود)`, points: 0, weight: 0.125, weightedContribution: 0 }
        : { ...factor, weight: 0.125, weightedContribution: round(factor.points * 0.125, 6) }),
      targetWeightPercent: 0,
      changePercentPoint: 0,
      evidenceAdequacyPercent: 100,
      signal: "hold" as const,
      signalLabel: actionLabel("hold"),
      signalStrengthPercent: round(clamp(50 + Math.abs(score), 50, 95)),
      invalidation: "با عبور هر عامل از یکی از بازه‌های ازپیش‌تعریف‌شده، تغییر محدودیت‌های مالک یا ناقص‌شدن منشأ داده، تصمیم دوباره محاسبه می‌شود.",
      riskBreached,
    };
  });

  const targetWeights = new Map<string, number>();
  const minimumCashWeight = cashInput ? profile.liquidityReservePercent / 100 : 0;
  const targetCashWeight = cashInput ? Math.min(0.5, minimumCashWeight + [...riskBreachedIds].reduce((sum, id) => sum + (currentWeights.get(id) ?? 0) * 0.5, 0)) : 0;
  cappedTargets(preferenceById, 1 - targetCashWeight, profile.maxSingleAssetPercent / 100).forEach((weight, id) => targetWeights.set(id, weight));
  if (cashInput) targetWeights.set(cashInput.id, targetCashWeight);
  const rawTurnover = inputs.reduce((sum, input) => sum + Math.abs((targetWeights.get(input.id) ?? 0) - (currentWeights.get(input.id) ?? 0)), 0) / 2;
  const turnoverScale = rawTurnover <= 0.25 ? 1 : 0.25 / rawTurnover;
  const stagedWeights = new Map(inputs.map((input) => [input.id, (currentWeights.get(input.id) ?? 0) + turnoverScale * ((targetWeights.get(input.id) ?? 0) - (currentWeights.get(input.id) ?? 0))]));

  const baseAssets = scored.map((asset) => {
    const changePercentPoint = round(((stagedWeights.get(asset.id) ?? 0) - (currentWeights.get(asset.id) ?? 0)) * 100, 6);
    const signal = Math.abs(changePercentPoint) < sandboxIntelligenceMethodology.thresholds.noTradeBandPercentPoint
      ? "hold" as const : changePercentPoint > 0 ? "increase" as const : "reduce" as const;
    return {
      ...asset,
      targetWeightPercent: round((stagedWeights.get(asset.id) ?? 0) * 100, 6),
      changePercentPoint,
      signal,
      signalLabel: actionLabel(signal),
      invalidation: asset.riskBreached
        ? `اگر بدترین فشار و افت هر دو دوباره داخل تحمل ${formatPercent(-profile.maxAcceptableDrawdownPercent)} قرار گیرند، کاهش متوقف و همهٔ عوامل دوباره محاسبه می‌شوند.`
        : asset.invalidation,
    };
  });

  const assets: SandboxAssetIntelligence[] = baseAssets.map((asset) => {
    const base = baseRoute(asset);
    const peer = baseAssets
      .filter((candidate) => candidate.id !== asset.id && candidate.assetClassId === asset.assetClassId)
      .sort((left, right) => right.score - left.score)[0] ?? null;
    const peerGain = peer ? peer.changePercentPoint : 0;
    const homogeneousDecision = asset.signal === "reduce" && peer && peerGain > 0
      ? {
          code: "switch_peer" as const,
          label: `تعویض آزمایشی بخشی به ${peer.name}`,
          sourceName: asset.name,
          destinationName: peer.name,
          amountToman: Math.round(Math.min(Math.abs(asset.changePercentPoint), peerGain) * totalValueToman / 100),
          reason: `موتور وزن ${asset.name} را ${formatPercent(Math.abs(asset.changePercentPoint))} کم و وزن هم‌کلاس ${peer.name} را ${formatPercent(peerGain)} زیاد کرده است.`,
        }
      : base;
    const crossClass = baseAssets
      .filter((candidate) => candidate.id !== asset.id && candidate.assetClassId !== asset.assetClassId && candidate.riskScore <= asset.riskScore)
      .sort((left, right) => right.score - left.score)[0] ?? null;
    const cashDestination = baseAssets.find((candidate) => candidate.id === cashInput?.id) ?? null;
    const destination = asset.riskBreached && cashDestination?.changePercentPoint && cashDestination.changePercentPoint > 0 ? cashDestination : crossClass;
    const destinationGain = destination?.changePercentPoint ?? 0;
    const heterogeneousDecision = asset.signal === "reduce" && destination && destinationGain > 0
      ? {
          code: "rotate" as const,
          label: `تبدیل آزمایشی بخشی به ${destination.name}`,
          sourceName: asset.name,
          destinationName: destination.name,
          amountToman: Math.round(Math.min(Math.abs(asset.changePercentPoint), destinationGain) * totalValueToman / 100),
          reason: asset.riskBreached
            ? `افت یا فشار ساختگی از تحمل ${formatPercent(-profile.maxAcceptableDrawdownPercent)} عبور کرده و قاعدهٔ ثابت، نیمی از وزن موقعیت پرریسک را به ذخیرهٔ نقد هدایت می‌کند.`
            : `وزن هدف مبدأ ${formatPercent(asset.targetWeightPercent)} و مقصد ${formatPercent(destination.targetWeightPercent)} است؛ مبلغ از تغییر وزن محدودشده محاسبه شده است.`,
        }
      : {
          code: "hold" as const,
          label: "عدم تبدیل بین‌کلاسی",
          sourceName: asset.name,
          destinationName: null,
          amountToman: 0,
          reason: crossClass
            ? "پس از اعمال امتیازها، سقف تمرکز، ذخیرهٔ نقد، باند عدم معامله و سقف گردش، انتقال بین‌کلاسی لازم نیست."
            : "مقصدی با کلاس متفاوت و ریسک مساوی یا کمتر در سبد ساختگی وجود ندارد.",
        };
    return { ...asset, homogeneousDecision, heterogeneousDecision };
  });

  const decreases = [...assets].filter((asset) => asset.changePercentPoint < -sandboxIntelligenceMethodology.thresholds.noTradeBandPercentPoint).sort((left, right) => left.changePercentPoint - right.changePercentPoint);
  const increases = [...assets].filter((asset) => asset.changePercentPoint > sandboxIntelligenceMethodology.thresholds.noTradeBandPercentPoint).sort((left, right) => right.changePercentPoint - left.changePercentPoint);
  let overallDecision: DecisionRoute = {
    code: "hold",
    label: "حفظ ترکیب و پایش روزانه",
    sourceName: "سبد",
    destinationName: null,
    amountToman: 0,
    reason: "پس از اعمال هشت عامل و همهٔ قیود، هیچ تغییر وزنی بیرون از باند ۲ واحد درصد باقی نمانده است.",
  };
  if (decreases.length && increases.length) {
    const source = decreases[0];
    const destination = increases[0];
    const transferPercent = Math.min(Math.abs(source.changePercentPoint), destination.changePercentPoint);
    overallDecision = {
      code: "rotate",
      label: `تبدیل آزمایشی از ${source.name} به ${destination.name}`,
      sourceName: source.name,
      destinationName: destination.name,
      amountToman: Math.round(totalValueToman * transferPercent / 100),
      reason: `بزرگ‌ترین کاهش ${formatPercent(Math.abs(source.changePercentPoint))} و بزرگ‌ترین افزایش ${formatPercent(destination.changePercentPoint)} است؛ مبلغ دقیق از کوچک‌ترِ این دو تغییر محاسبه می‌شود.`,
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
    evidenceState: {
      syntheticFactorCoveragePercent: 100,
      iranValidationStatus: "not_evaluated",
      missingRequirements: [
        "تاریخچهٔ مجاز و نقطه‌به‌زمان بازار ایران",
        "فاصلهٔ خریدوفروش، عمق و نقدشوندگی ایران",
        "هزینه، مالیات و کارمزد واقعی تبدیل",
        "تاریخچهٔ حباب سکه و طلای ایران",
        "کالیبراسیون رژیم تورم، ارز و شوک سیاسی",
        "آزمون خارج از نمونه و اجرای سایه‌ای",
      ],
    },
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
      verdict: `امتیاز مرکب ${asset.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} است؛ تصمیم از ۸ عامل هم‌وزن و قیود ثابت ساخته شده و با تغییر افق دوباره محاسبه می‌شود.`,
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
        `امتیاز ارزش‌گذاری پیش از وزن‌دهی: ${formatScore(asset.scoreBreakdown.valuation)} از بازهٔ ۲- تا ۲+.`,
      ] : [
        "برای این کلاس دارایی قیمت مرجع همگن با فرمول حباب تعریف نشده است.",
        `بازده بهای خرید ${asset.returnPercent === null ? "نامشخص" : formatPercent(asset.returnPercent)} است.`,
        `امتیاز ارزش‌گذاری جایگزین پیش از وزن‌دهی: ${formatScore(asset.scoreBreakdown.valuation)} از بازهٔ ۲- تا ۲+.`,
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
      { label: "امتیاز تاب‌آوری", value: formatScore(asset.scoreBreakdown.crisisResilience), detail: "از بازهٔ ۲- تا ۲+، پیش از وزن‌دهی ۱۲٫۵٪", tone: metricTone(asset.scoreBreakdown.crisisResilience) },
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
