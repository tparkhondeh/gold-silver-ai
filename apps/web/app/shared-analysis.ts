import { analyzeActionHorizon } from "./decision-action-plan.ts";
import { sandboxIntelligenceMethodology } from "./sandbox-intelligence-engine.ts";
import { evaluateSharedPortfolio, validateSharedPortfolio, type SharedPortfolio } from "./shared-portfolio.ts";
import { buildRawMetalDiagnostics } from "./shared-metal-reference.ts";

export const SHARED_ANALYSIS_VERSION = "asha.synthetic.shared_analysis.v2";

// Exact fractions are kept alongside display values: no rounded display feeds decisions.
function fraction(numerator: bigint, denominator: bigint) {
  return { numerator: String(numerator), denominator: String(denominator), scaled10000: String(numerator * 10_000n / denominator) };
}

export function buildSharedAnalysis(draft: SharedPortfolio) {
  const portfolio = validateSharedPortfolio(draft);
  const evaluation = evaluateSharedPortfolio(portfolio);
  const input = portfolio.input;
  const quotes = input.assets.map((asset) => {
    const issues = [
      ...(asset.bidToman === null ? ["missing_bid"] : []),
      ...(asset.askToman === null ? ["missing_ask"] : []),
      ...(asset.quotedOn > input.asOf ? ["future_quote"] : []),
      ...(asset.validUntil < input.asOf ? ["expired_quote"] : []),
    ];
    return {
      assetId: asset.id, unit: asset.unit, purityPermille: asset.purityPermille,
      referencePriceToman: asset.referencePriceToman, quotedOn: asset.quotedOn,
      validUntil: asset.validUntil, issues, state: issues.length ? "unusable" as const : "usable" as const,
      // A missing/stale quote cannot become a current executable spread.
      spread: issues.length ? null : fraction(BigInt(asset.askToman! - asset.bidToman!), BigInt(asset.referencePriceToman)),
      capacityMilli: asset.capacityMilli, feeBps: asset.feeBps, taxBps: asset.taxBps,
    };
  });
  const gold = input.assets[0], silver = input.assets[2];
  const ratioReady = quotes[0].state === "usable" && quotes[2].state === "usable" && gold.quotedOn === silver.quotedOn;
  const metalRatio = ratioReady ? fraction(
    BigInt(gold.referencePriceToman) * BigInt(silver.purityPermille),
    BigInt(silver.referencePriceToman) * BigInt(gold.purityPermille),
  ) : null;
  const total = evaluation.totalToman === null ? null : BigInt(evaluation.totalToman);
  // Concentration uses exact values, not already floored UI percentages.
  const concentration = total === null ? null : Object.entries(evaluation.values).map(([assetId, value]) => ({
    assetId, weightBps: evaluation.weightsBps[assetId],
    aboveLimit: BigInt(value!) * 10_000n > total * BigInt(input.maximumAssetBps),
  }));
  const horizons = (["short", "medium"] as const).map((id) => {
    const analysis = analyzeActionHorizon(input, id);
    return {
      id, days: id === "short" ? input.shortDays : input.mediumDays,
      featureObservations: id === "short" ? 20 : 60,
      targetSource: input.scenario === "method" ? "eight_factor_method" as const : "explicit_test_targets" as const,
      assets: analysis.assets.filter((asset) => asset.id !== "SYNTH_CASH").map((asset) => ({
        assetId: asset.id, history: asset.history, factors: asset.factorContributions,
        // Retain explanatory scenarios, not the sandbox's second set of amounts/routes.
        scenarios: asset.scenarios, invalidation: asset.invalidation,
      })),
    };
  });
  return {
    schemaVersion: SHARED_ANALYSIS_VERSION, datasetKind: "synthetic_fixture" as const,
    financialUseAllowed: false as const, executionAllowed: false as const,
    source: { portfolioVersion: portfolio.schemaVersion, revision: portfolio.revision,
      fixtureId: input.fixtureId, inputSnapshot: input, methodologyId: sandboxIntelligenceMethodology.id,
      historyDatasetId: sandboxIntelligenceMethodology.historyDatasetId },
    planState: evaluation.state, quotes, metalRatio,
    metalRatioFormula: "(gold_toman_per_gram / gold_purity) / (silver_toman_per_gram / silver_purity)",
    metalRatioMissing: ratioReady ? null : "قیمت معتبر هم‌تاریخِ طلا و نقره لازم است.",
    concentration, horizons, rawMetal: buildRawMetalDiagnostics(input, portfolio.metalReferences),
    gaps: [
      { id: "intrinsic_bubble", state: "partial" as const, reason: "اختلاف قیمت با ارزش فلز خام برای گرم طلا و نقره، تنها با مراجع کامل و هم‌تاریخ محاسبه می‌شود. حباب تاریخی، هزینهٔ ساخت و حباب سکه پوشش داده نمی‌شوند؛ این تشخیص وارد وزن‌ها یا سفارش‌ها نشده است." },
      { id: "market_regime", state: "missing" as const, reason: "روش مصوب تشخیص وضعیت بازار در این قرارداد وجود ندارد؛ از نسبت طلا/نقره سیگنال ساخته نمی‌شود." },
      { id: "empirical_history", state: "fixture_only" as const, reason: "روند، نوسان، افت، ارزش‌گذاری نسبی و بحران از تاریخچه و پروفایل ساختگی نسخه‌دارِ موتور موجود می‌آیند، نه قیمت‌های ویرایش‌شده یا بازار." },
      { id: "liquidity_and_cost", state: "fixture_only" as const, reason: "امتیاز نقدشوندگی و هزینهٔ عامل تحلیل از پروفایل مرجع است؛ ظرفیت و هزینهٔ سفارش نهایی جداگانه از ورودی همین سبد محاسبه می‌شوند." },
    ],
  };
}
