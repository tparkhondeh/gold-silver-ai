import bridge from "../data/physical-sizing-bridge-v1.json" with { type: "json" };
import { buildActionFixture, buildSyntheticSizingTrial } from "./decision-action-plan.ts";

const SCALE = 1_000_000_000_000n;
const BPS = 10_000n;
const mappings = { SYNTH_DEFENSIVE: "SYNTH_GOLD", SYNTH_TREND: "SYNTH_COIN", SYNTH_VOLATILE: "SYNTH_SILVER", SYNTH_CASH: "SYNTH_CASH" } as const;
type PathId = keyof typeof mappings;
export type SizingTrial = ReturnType<typeof buildSyntheticSizingTrial>;
export type SizingPoint = { periodIndex: number; levels: Record<string, string>; carriedForwardInstrumentIds: string[] };

function fixed(value: string): bigint {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,12})?$/.test(value)) throw new Error("مقدار مسیر ساختگی نامعتبر است.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, "0"));
}
function levels(value: Record<string, string>): Record<PathId, bigint> {
  if (!value || Object.keys(value).sort().join(",") !== Object.keys(mappings).sort().join(",")) throw new Error("عضویت مسیرهای مقایسه تغییر کرده است.");
  const parsed = Object.fromEntries(Object.keys(mappings).map((key) => [key, fixed(value[key])])) as Record<PathId, bigint>;
  if (Object.values(parsed).some((entry) => entry <= 0n) || parsed.SYNTH_CASH !== 100n * SCALE) throw new Error("سطح مسیر یا نقد ساختگی نامعتبر است.");
  return parsed;
}

/** Evaluation-only values cannot enter the independently constructed sizing trial. */
export function evaluateSyntheticSizingTrial(trial: SizingTrial, starting: Record<string, string>, points: SizingPoint[], cutoff: number) {
  if (JSON.stringify(trial) !== JSON.stringify(buildSyntheticSizingTrial(trial.inputSnapshot, trial.targetWeightsBps))) throw new Error("برنامهٔ مقایسه با بازسازی تطبیق ندارد.");
  const start = levels(starting);
  if (!Number.isSafeInteger(cutoff) || cutoff < 0 || !Array.isArray(points) || !points.length || points.length > 120) throw new Error("بازهٔ ارزیابی نامعتبر است.");
  const initial = BigInt(trial.portfolio.beforeToman), afterCost = BigInt(trial.portfolio.afterToman);
  let peak = initial, maximumDrawdownBps = 0, finalValue = afterCost;
  const paths: { periodIndex: number; valueToman: string }[] = [];
  const updateDrawdown = (nav: bigint) => {
    if (nav > peak) peak = nav;
    const loss = peak - nav;
    const bps = Number((loss * BPS + peak - 1n) / peak);
    maximumDrawdownBps = Math.max(maximumDrawdownBps, bps);
  };
  updateDrawdown(afterCost);
  points.forEach((point, index) => {
    if (point.periodIndex !== cutoff + index + 1) throw new Error("دادهٔ آینده فقط بعد از زمان تصمیم و به‌ترتیب ارزیابی می‌شود.");
    const at = levels(point.levels);
    finalValue = BigInt(trial.portfolio.cashAfterToman);
    for (const [path, assetId] of Object.entries(mappings)) {
      if (assetId === "SYNTH_CASH") continue;
      const asset = trial.inputSnapshot.assets.find((item) => item.id === assetId);
      const row = trial.rows.find((item) => item.assetId === assetId);
      if (!asset || !row) throw new Error("دارایی متناظر با مسیر ساختگی یافت نشد.");
      const price = BigInt(asset.referencePriceToman) * at[path as PathId] / start[path as PathId];
      finalValue += BigInt(row.afterQuantityMilli) * price / 1_000n;
    }
    paths.push({ periodIndex: point.periodIndex, valueToman: String(finalValue) });
    updateDrawdown(finalValue);
  });
  return { initialToman: String(initial), afterCostToman: String(afterCost), finalToman: String(finalValue), changeToman: String(finalValue - initial), changeBps: Number((finalValue - initial) * BPS / initial), maximumDrawdownBps, paths };
}

export function buildActionSizingComparison(payload: unknown = bridge) {
  // The checked-in bridge is also regenerated and checked by the Python CI job.
  if (JSON.stringify(payload) !== JSON.stringify(bridge)) throw new Error("پل مقایسهٔ پژوهشی با نسخهٔ بررسی‌شده تطبیق ندارد.");
  const folds = bridge.folds.map((fold) => {
    if (fold.trainEndIndex > fold.executionCutoffIndex || fold.executionCutoffIndex >= fold.testStartIndex) throw new Error("ترتیب آموزش و ارزیابی معتبر نیست.");
    const input = buildActionFixture();
    input.asOf = new Date(Date.UTC(2000, 0, 1) + fold.executionCutoffIndex * 86_400_000).toISOString().slice(0, 10);
    for (const asset of input.assets) { asset.quotedOn = input.asOf; asset.validUntil = input.asOf; }
    const methods = fold.methods.map((method) => {
      const targets: Record<string, number> = {};
      // Holding means the common starting holdings, not rebalancing to an older
      // research fixture's different starting weights.
      const hold = method.methodId === "ASHA_BENCHMARK_NO_TRADE_CONTROL_V1";
      const initial = BigInt(input.cashToman) + input.assets.reduce((sum, asset) => sum + BigInt(asset.quantityMilli) * BigInt(asset.referencePriceToman) / 1000n, 0n);
      for (const [path, assetId] of Object.entries(mappings)) {
        if (assetId === "SYNTH_CASH") continue;
        const asset = input.assets.find((item) => item.id === assetId)!;
        const weight = method.weights.find((item) => item.instrumentId === path);
        if (!weight) throw new Error("وزن کنترل پژوهشی موجود نیست.");
        targets[assetId] = hold ? Number(BigInt(asset.quantityMilli) * BigInt(asset.referencePriceToman) / 1000n * BPS / initial) : Number(fixed(weight.weight) * BPS / SCALE);
      }
      targets.SYNTH_CASH = 10_000 - Object.values(targets).reduce((sum, value) => sum + value, 0);
      // This call has no reference to evaluationPoints or any future return.
      const trial = buildSyntheticSizingTrial(input, targets);
      return { methodId: method.methodId, targetSource: hold ? "common_starting_holdings" : "train_only_python_bridge_weights", trial,
        evaluation: evaluateSyntheticSizingTrial(trial, fold.startingLevels, fold.evaluationPoints, fold.executionCutoffIndex) };
    });
    return { foldIndex: fold.foldIndex, trainEndIndex: fold.trainEndIndex, executionCutoffIndex: fold.executionCutoffIndex, testStartIndex: fold.testStartIndex, testEndIndex: fold.testEndIndex, methods };
  });
  return { schemaVersion: "asha.synthetic.costed_sizing_comparison.v1" as const, bridgeId: bridge.bridgeId, methodComparisonId: bridge.methodComparisonId,
    financialUseAllowed: false as const, executionAllowed: false as const, rankingPolicy: "none" as const, aggregationPolicy: "none" as const,
    policyId: "COMMON_START_COST_LOT_GUARD_SINGLE_REBALANCE_THEN_FIXED_QUANTITY_V1", folds };
}

export function encodeActionSizingComparison(value: ReturnType<typeof buildActionSizingComparison>): string {
  const expected = buildActionSizingComparison();
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("نتیجهٔ مقایسه با بازسازی دقیق تطبیق ندارد.");
  return JSON.stringify(expected);
}
