import { calculateSandboxIntelligence, sandboxIntelligenceMethodology } from "./sandbox-intelligence-engine.ts";

export const ACTION_PLAN_VERSION = "asha.synthetic.action_plan.v1";
export const ACTION_INPUT_VERSION = "asha.synthetic.action_input.v1";
const BPS = 10_000n;
const UNIT = 1_000n;
const COST_PENALTY = 2n;
const CASH = "SYNTH_CASH";
export const actionScenarios = ["method", "entry", "exit", "peer", "cross", "hold", "wait", "missing"] as const;
export type ActionScenario = typeof actionScenarios[number];
export type PlanState = "proposed" | "hold" | "wait" | "undecidable";
export type AssetClass = "gold" | "silver";
export type ActionAsset = {
  id: string; name: string; assetClass: AssetClass; unit: "gram" | "piece";
  purityPermille: number; quantityMilli: number; lotMilli: number;
  referencePriceToman: number; bidToman: number | null; askToman: number | null;
  quotedOn: string; validUntil: string; capacityMilli: number;
  feeBps: number; taxBps: number;
};
export type ActionInput = {
  schemaVersion: typeof ACTION_INPUT_VERSION; datasetKind: "synthetic_fixture";
  fixtureId: string; scenario: ActionScenario; asOf: string;
  shortDays: number; mediumDays: number; shortBudgetBps: number;
  cashToman: number; minimumCashBps: number; maximumAssetBps: number;
  maximumTurnoverBps: number; noTradeBandBps: number;
  priceToleranceBps: number; slippageBps: number; minimumOrderToman: number;
  minimumImprovementBps: number; maximumDrawdownPercent: number;
  assets: ActionAsset[];
};
type Factor = { id: string; label: string; input: number; points: number; weight: number; weightedContribution: number };
export type HorizonPlan = {
  id: "short" | "medium"; days: number; startsOn: string; endsOn: string;
  targetsBps: Record<string, number>; factors: Record<string, Factor[]>;
  worstStressPercent: Record<string, number>;
};
export type Funding = { sourceId: string; saleOrderId: string | null; amountToman: string };
export type PlanOrder = {
  id: string; assetId: string; side: "buy" | "sell"; quantityMilli: string;
  referenceValueToman: string; priceToman: string; limitPriceToman: string;
  grossToman: string; feeToman: string; taxToman: string; spreadToman: string;
  slippageToman: string; roundingToman: string; totalCostToman: string;
  cashMovementToman: string; funding: Funding[];
};
export type PlanRow = {
  assetId: string; action: "increase" | "reduce" | "exit" | "hold" | "wait" | "undecidable";
  quantityMilli: string; conditionalQuantityMilli: string; currentQuantityMilli: string;
  afterQuantityMilli: string; currentValueToman: string; afterValueToman: string;
  currentWeightBps: number; targetWeightBps: number; afterWeightBps: number;
  changeOfSourceBps: number | null; changeOfPortfolioBps: number;
  entryLimitToman: string; exitLimitToman: string;
  reasonCode: string; orderIds: string[];
};
export type ActionPlan = {
  schemaVersion: typeof ACTION_PLAN_VERSION; methodologyId: string;
  state: PlanState; financialUseAllowed: false; executionAllowed: false;
  inputSnapshot: ActionInput; horizons: [HorizonPlan, HorizonPlan]; combinedTargetsBps: Record<string, number>;
  inputIssues: { assetId: string; code: "missing_bid" | "missing_ask" | "future_quote" | "expired_quote" }[];
  rows: PlanRow[]; orders: PlanOrder[];
  conversions: { sourceId: string; destinationId: string; kind: "same_class" | "cross_class"; amountToman: string; saleOrderId: string; buyOrderId: string }[];
  portfolio: { beforeToman: string; afterToman: string; cashBeforeToman: string; cashAfterToman: string; cashReserveToman: string; totalCostToman: string; turnoverBps: number; trackingErrorBeforeToman: string; trackingErrorAfterToman: string; objectiveImprovementToman: string; chosenFractionBps: number; stressLossBeforeToman: string; stressLossAfterToman: string; stressBoundAfterBps: number };
  alternatives: { fractionBps: number; state: "baseline" | "feasible" | "infeasible" | "not_evaluated"; objectiveToman: string | null; totalCostToman: string | null }[];
  objective: { id: "L1_TARGET_DISTANCE_PLUS_TWO_TIMES_COST_V1"; candidateFractionsBps: number[]; noReturnForecast: true };
  validUntil: string; reviewOn: string; reasonCodes: string[];
};

function integer(value: unknown, min: number, max: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error("ورودی عددی نامعتبر است؛ عدد صحیح در محدوده لازم است.");
}
function exactKeys(value: unknown, keys: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== keys.split(" ").sort().join(",")) throw new Error("ساختار ورودی با قرارداد این نسخه سازگار نیست.");
}
function date(value: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9997-12-31" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("تاریخ باید معتبر، بین سال‌های ۱۹۰۰ تا ۹۹۹۷ و به شکل سال-ماه-روز باشد.");
  return value;
}
function addDays(value: string, days: number) {
  return new Date(Date.parse(value) + days * 86_400_000).toISOString().slice(0, 10);
}
const abs = (value: bigint) => value < 0n ? -value : value;
const min = (a: bigint, b: bigint) => a < b ? a : b;
const max = (a: bigint, b: bigint) => a > b ? a : b;
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
const valueOf = (asset: ActionAsset, quantity = BigInt(asset.quantityMilli)) => quantity * BigInt(asset.referencePriceToman) / UNIT;
const ratio = (part: bigint, total: bigint) => total > 0n ? Number(part * BPS / total) : 0;
const lotFloor = (quantity: bigint, asset: ActionAsset) => quantity / BigInt(asset.lotMilli) * BigInt(asset.lotMilli);

export function validateActionInput(payload: unknown): ActionInput {
  exactKeys(payload, "schemaVersion datasetKind fixtureId scenario asOf shortDays mediumDays shortBudgetBps cashToman minimumCashBps maximumAssetBps maximumTurnoverBps noTradeBandBps priceToleranceBps slippageBps minimumOrderToman minimumImprovementBps maximumDrawdownPercent assets");
  const input = payload as ActionInput;
  if (input.schemaVersion !== ACTION_INPUT_VERSION || input.datasetKind !== "synthetic_fixture" || !/^ASHA_SYNTHETIC_ACTION_[A-Z0-9_]{1,40}_V1$/.test(input.fixtureId) || !actionScenarios.includes(input.scenario)) throw new Error("نسخه یا شناسهٔ دادهٔ ساختگی معتبر نیست.");
  date(input.asOf);
  integer(input.shortDays, 1, 90); integer(input.mediumDays, input.shortDays + 1, 730);
  integer(input.cashToman, 0, 1_000_000_000_000);
  integer(input.shortBudgetBps, 0, 10_000);
  integer(input.minimumCashBps, 0, 5_000); integer(input.maximumAssetBps, 100, 10_000);
  integer(input.maximumTurnoverBps, 0, 10_000); integer(input.noTradeBandBps, 0, 5_000);
  integer(input.priceToleranceBps, 0, 2_000); integer(input.slippageBps, 0, 1_000);
  integer(input.minimumOrderToman, 0, 1_000_000_000);
  integer(input.minimumImprovementBps, 0, 10_000); integer(input.maximumDrawdownPercent, 1, 100);
  if (!Array.isArray(input.assets) || input.assets.length < 2 || input.assets.length > 8) throw new Error("بین ۲ تا ۸ دارایی لازم است.");
  const ids = new Set<string>();
  for (const asset of input.assets) {
    exactKeys(asset, "id name assetClass unit purityPermille quantityMilli lotMilli referencePriceToman bidToman askToman quotedOn validUntil capacityMilli feeBps taxBps");
    if (!/^SYNTH_[A-Z0-9_]{1,30}$/.test(asset.id) || asset.id === CASH || ids.has(asset.id)) throw new Error("شناسهٔ دارایی باید ساختگی و یکتا باشد.");
    ids.add(asset.id);
    if (!Object.hasOwn({ gold: 1, silver: 1 }, asset.assetClass) || !["gram", "piece"].includes(asset.unit) || typeof asset.name !== "string" || !asset.name.startsWith("[ساختگی] ") || asset.name.length > 100) throw new Error("کلاس، واحد یا نام دارایی معتبر نیست.");
    integer(asset.purityPermille, 1, 1_000);
    integer(asset.quantityMilli, 0, 1_000_000_000); integer(asset.lotMilli, 1, 1_000_000);
    if (asset.quantityMilli % asset.lotMilli !== 0 || (asset.unit === "piece" && asset.lotMilli % 1000 !== 0)) throw new Error("مقدار باید با حداقل واحد دارایی سازگار باشد.");
    integer(asset.referencePriceToman, 1_000, 1_000_000_000);
    for (const price of [asset.bidToman, asset.askToman]) if (price !== null) integer(price, 1, 1_000_000_000);
    if (asset.bidToman !== null && asset.askToman !== null && (asset.bidToman > asset.referencePriceToman || asset.askToman < asset.referencePriceToman)) throw new Error("قیمت مبنا باید بین قیمت فروش و خرید باشد.");
    date(asset.quotedOn); date(asset.validUntil);
    if (asset.quotedOn > asset.validUntil) throw new Error("ترتیب تاریخ قیمت نامعتبر است.");
    integer(asset.capacityMilli, 0, 1_000_000_000); integer(asset.feeBps, 0, 2_000); integer(asset.taxBps, 0, 2_000);
  }
  if (input.assets.reduce((sum, asset) => sum + valueOf(asset), BigInt(input.cashToman)) <= 0n) throw new Error("ارزش کل باید مثبت باشد.");
  return structuredClone(input);
}

export function buildActionFixture(scenario: ActionScenario = "method"): ActionInput {
  const asOf = "2000-01-01";
  const asset = (id: string, name: string, assetClass: AssetClass, unit: "gram" | "piece", price: number, quantity: number, lot: number, purity: number): ActionAsset => ({
    id, name: `[ساختگی] ${name}`, assetClass, unit, purityPermille: purity,
    quantityMilli: quantity, lotMilli: lot, referencePriceToman: price,
    bidToman: Math.floor(price * 9950 / 10_000), askToman: Math.ceil(price * 10050 / 10_000), quotedOn: asOf,
    validUntil: "2000-01-02", capacityMilli: 1_000_000, feeBps: 20, taxBps: 0,
  });
  const input: ActionInput = {
    schemaVersion: ACTION_INPUT_VERSION, datasetKind: "synthetic_fixture",
    fixtureId: "ASHA_SYNTHETIC_ACTION_REFERENCE_V1", scenario, asOf,
    shortDays: 30, mediumDays: 180, shortBudgetBps: 5_000,
    cashToman: scenario === "entry" ? 900_000 : 100_000,
    minimumCashBps: 1_000, maximumAssetBps: 7_000, maximumTurnoverBps: 10_000,
    noTradeBandBps: 200, priceToleranceBps: 150, slippageBps: 20,
    minimumOrderToman: 1_000, minimumImprovementBps: 10, maximumDrawdownPercent: 20,
    assets: [
      asset("SYNTH_GOLD", "طلای ۱۸ عیار", "gold", "gram", 10_000, 60_000, 100, 750),
      asset("SYNTH_COIN", "سکه امامی", "gold", "piece", 100_000, 2_000, 1_000, 900),
      asset("SYNTH_SILVER", "شمش نقره ۹۹۹", "silver", "gram", 1_000, 100_000, 1_000, 999),
    ],
  };
  if (scenario === "wait") input.assets[0].bidToman = 8_000;
  if (scenario === "missing") input.assets[0].bidToman = null;
  return input;
}

function normalizeTargets(targets: Record<string, number>, ids: string[]) {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const weight = targets[id];
    if (!Number.isFinite(weight) || weight < 0 || weight > 10_000) throw new Error("وزن هدف نامعتبر است.");
    out[id] = Math.floor(weight);
  }
  out[CASH] = 10_000 - Object.values(out).reduce((sum, v) => sum + v, 0);
  if (out[CASH] < 0) throw new Error("جمع وزن‌های هدف بیشتر از ۱۰۰٪ است.");
  return out;
}

function horizon(input: ActionInput, id: "short" | "medium"): HorizonPlan {
  const values = input.assets.map((asset) => Number(valueOf(asset)));
  const total = values.reduce((sum, value) => sum + value, input.cashToman);
  const analysis = calculateSandboxIntelligence([
    ...input.assets.map((asset, index) => ({
      id: asset.id, name: asset.name.replace("[ساختگی] ", ""), assetClassId: asset.assetClass,
      assetClassLabel: asset.assetClass === "gold" ? "طلا" : "نقره", valueToman: values[index],
      costToman: null, allocationPercent: values[index] / total * 100, returnPercent: null,
      riskScore: 3, riskLabel: "ساختگی", premium: { applicable: false, current: null, minimum: null, average: null, maximum: null },
    })),
    { id: CASH, name: "وجه نقد و سپرده بانکی", assetClassId: "cash", assetClassLabel: "نقد", valueToman: input.cashToman, costToman: null, allocationPercent: input.cashToman / total * 100, returnPercent: null, riskScore: 1, riskLabel: "ساختگی", premium: { applicable: false, current: null, minimum: null, average: null, maximum: null } },
  ], { liquidityReservePercent: input.minimumCashBps / 100, maxSingleAssetPercent: input.maximumAssetBps / 100, maxAcceptableDrawdownPercent: input.maximumDrawdownPercent }, id === "short" ? "short" : "long");
  let targets = Object.fromEntries(analysis.assets.map((row) => [row.id, row.targetWeightPercent * 100]));
  if (input.scenario !== "method") {
    const ids = input.assets.map((asset) => asset.id);
    if (ids.join(",") !== "SYNTH_GOLD,SYNTH_COIN,SYNTH_SILVER") throw new Error("سناریوی ثابت با این مجموعهٔ دارایی سازگار نیست.");
    const explicit: Record<string, number[]> = {
      entry: [4500, 2000, 2000], exit: [0, 2000, 2000], peer: [3000, 5000, 1000],
      cross: [3000, 1000, 5000], wait: [3000, 1000, 5000], missing: [3000, 1000, 5000],
      hold: values.map((value) => value / total * 10_000),
    };
    targets = Object.fromEntries(ids.map((key, index) => [key, explicit[input.scenario][index]]));
  }
  const days = id === "short" ? input.shortDays : input.mediumDays;
  return {
    id, days, startsOn: input.asOf, endsOn: addDays(input.asOf, days),
    targetsBps: normalizeTargets(targets, input.assets.map((asset) => asset.id)),
    factors: Object.fromEntries(analysis.assets.map((row) => [row.id, row.factorContributions])),
    worstStressPercent: Object.fromEntries(analysis.assets.map((row) => [row.id, row.worstScenario.movePercent])),
  };
}

function limits(input: ActionInput, asset: ActionAsset) {
  const reference = BigInt(asset.referencePriceToman);
  return { buy: reference * (BPS + BigInt(input.priceToleranceBps)) / BPS, sell: ceil(reference * (BPS - BigInt(input.priceToleranceBps)), BPS) };
}
function cost(input: ActionInput, asset: ActionAsset, side: "buy" | "sell", quantity: bigint) {
  const quote = BigInt((side === "buy" ? asset.askToman : asset.bidToman) ?? 0);
  const slipped = side === "buy" ? ceil(quote * (BPS + BigInt(input.slippageBps)), BPS) : quote * (BPS - BigInt(input.slippageBps)) / BPS;
  const exactNotional = quantity * slipped;
  const gross = side === "buy" ? ceil(exactNotional, UNIT) : exactNotional / UNIT;
  const quoteGross = quantity * quote / UNIT;
  const owned = BigInt(asset.quantityMilli);
  const mark = side === "buy" ? valueOf(asset, owned + quantity) - valueOf(asset)
    : valueOf(asset) - valueOf(asset, owned - quantity);
  const fee = ceil(gross * BigInt(asset.feeBps), BPS);
  const tax = ceil(gross * BigInt(asset.taxBps), BPS);
  const cash = side === "buy" ? gross + fee + tax : gross - fee - tax;
  const totalCost = side === "buy" ? cash - mark : mark - cash;
  const spread = abs(quoteGross - mark);
  const slippage = quantity * abs(slipped - quote) / UNIT;
  const rounding = totalCost - spread - slippage - fee - tax;
  return { slipped, gross, mark, fee, tax, cash, totalCost, spread, slippage, rounding };
}

type Candidate = { quantities: Map<string, bigint>; cash: bigint; orders: PlanOrder[]; total: bigint; costs: bigint; turnover: bigint; error: bigint; objective: bigint; fraction: number; stressLoss: bigint };

function candidate(input: ActionInput, targets: Record<string, bigint>, before: bigint, fraction: number, stressRatesBps: Record<string, number>): Candidate | null {
  const quantities = new Map(input.assets.map((asset) => [asset.id, BigInt(asset.quantityMilli)]));
  let cash = BigInt(input.cashToman);
  let costs = 0n, bought = 0n, sold = 0n;
  const orders: PlanOrder[] = [];
  const reserve = ceil(before * BigInt(input.minimumCashBps), BPS);
  const buckets = [{ sourceId: CASH, saleOrderId: null as string | null, remaining: max(0n, cash - reserve) }];
  const assets = [...input.assets].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const desired = (asset: ActionAsset) => {
    const delta = targets[asset.id] - valueOf(asset);
    if (abs(delta) * BPS < before * BigInt(input.noTradeBandBps)) return 0n;
    return lotFloor(min(abs(delta) * UNIT / BigInt(asset.referencePriceToman) * BigInt(fraction) / BPS, BigInt(asset.capacityMilli)), asset);
  };
  const addOrder = (asset: ActionAsset, side: "buy" | "sell", quantity: bigint, funding: Funding[]) => {
    const quote = cost(input, asset, side, quantity);
    const order: PlanOrder = {
      id: `${side.toUpperCase()}_${asset.id}`, assetId: asset.id, side, quantityMilli: String(quantity),
      referenceValueToman: String(quote.mark), priceToman: String(quote.slipped), limitPriceToman: String(limits(input, asset)[side]),
      grossToman: String(quote.gross), feeToman: String(quote.fee), taxToman: String(quote.tax),
      spreadToman: String(quote.spread), slippageToman: String(quote.slippage), roundingToman: String(quote.rounding),
      totalCostToman: String(quote.totalCost), cashMovementToman: String(quote.cash), funding,
    };
    orders.push(order); costs += quote.totalCost;
    quantities.set(asset.id, (quantities.get(asset.id) ?? 0n) + (side === "buy" ? quantity : -quantity));
    cash += side === "buy" ? -quote.cash : quote.cash;
    if (side === "buy") bought += quote.mark; else sold += quote.mark;
    return order;
  };
  for (const asset of assets) {
    if (targets[asset.id] >= valueOf(asset)) continue;
    const quantity = min(desired(asset), BigInt(asset.quantityMilli));
    const quote = cost(input, asset, "sell", quantity);
    if (quantity === 0n || quote.gross < BigInt(input.minimumOrderToman)) continue;
    if (quote.slipped < limits(input, asset).sell || quote.cash <= 0n) return null;
    const cashBefore = cash;
    const order = addOrder(asset, "sell", quantity, []);
    const freeProceeds = max(0n, cash - max(reserve, cashBefore));
    buckets.push({ sourceId: asset.id, saleOrderId: order.id, remaining: freeProceeds });
  }
  for (const asset of assets) {
    if (targets[asset.id] <= valueOf(asset)) continue;
    const lot = BigInt(asset.lotMilli);
    let low = 0n, high = desired(asset) / lot;
    const currentTotal = before - costs;
    const feasible = (quantity: bigint) => {
      const quote = cost(input, asset, "buy", quantity);
      const afterTotal = currentTotal - quote.totalCost;
      const afterValue = valueOf(asset, (quantities.get(asset.id) ?? 0n) + quantity);
      const fundingAvailable = buckets.reduce((sum, bucket) => sum + bucket.remaining, 0n);
      return quote.cash <= min(max(0n, cash - reserve), fundingAvailable)
        && afterValue * BPS <= afterTotal * BigInt(input.maximumAssetBps);
    };
    while (low < high) {
      const middle = (low + high + 1n) / 2n;
      if (feasible(middle * lot)) low = middle; else high = middle - 1n;
    }
    const quantity = low * lot;
    const quote = cost(input, asset, "buy", quantity);
    if (!quantity || quote.gross < BigInt(input.minimumOrderToman)) continue;
    if (quote.slipped > limits(input, asset).buy) return null;
    let needed = quote.cash;
    const funding: Funding[] = [];
    for (const bucket of buckets) {
      const amount = min(needed, bucket.remaining);
      if (amount > 0n) funding.push({ sourceId: bucket.sourceId, saleOrderId: bucket.saleOrderId, amountToman: String(amount) });
      bucket.remaining -= amount; needed -= amount;
    }
    if (needed !== 0n) throw new Error("خطای داخلی در تخصیص نقد.");
    addOrder(asset, "buy", quantity, funding);
  }
  const total = input.assets.reduce((sum, asset) => sum + valueOf(asset, quantities.get(asset.id)), cash);
  if (total + costs !== before || cash < 0n) throw new Error("جمع ارزش سبد و هزینه تطبیق ندارد.");
  const turnover = max(bought, sold);
  const stressLoss = ceil(assets.reduce((sum, asset) => sum + valueOf(asset, quantities.get(asset.id)) * BigInt(stressRatesBps[asset.id]), 0n), BPS);
  if (orders.length && (cash * BPS < total * BigInt(input.minimumCashBps)
    || turnover * BPS > before * BigInt(input.maximumTurnoverBps)
    || stressLoss * 100n > total * BigInt(input.maximumDrawdownPercent)
    || assets.some((asset) => valueOf(asset, quantities.get(asset.id)) * BPS > total * BigInt(input.maximumAssetBps)))) return null;
  const error = assets.reduce((sum, asset) => sum + abs(valueOf(asset, quantities.get(asset.id)) - targets[asset.id]), abs(cash - targets[CASH]));
  return { quantities, cash, orders, total, costs, turnover, error, objective: error + COST_PENALTY * costs, fraction, stressLoss };
}

export function buildActionPlan(payload: unknown): ActionPlan {
  const input = validateActionInput(payload);
  const short = horizon(input, "short"), medium = horizon(input, "medium");
  const combined = normalizeTargets(Object.fromEntries(input.assets.map((asset) => [asset.id,
    (short.targetsBps[asset.id] * input.shortBudgetBps + medium.targetsBps[asset.id] * (10_000 - input.shortBudgetBps)) / 10_000,
  ])), input.assets.map((asset) => asset.id));
  return buildPlanForTargets(input, short, medium, combined,
    input.scenario === "method" ? sandboxIntelligenceMethodology.id : "ASHA_EXPLICIT_TARGET_SIZING_FIXTURE_V1");
}

function buildPlanForTargets(input: ActionInput, short: HorizonPlan, medium: HorizonPlan, combined: Record<string, number>, methodologyId: string): ActionPlan {
  const before = input.assets.reduce((sum, asset) => sum + valueOf(asset), BigInt(input.cashToman));
  const targets = Object.fromEntries(input.assets.map((asset) => [asset.id, before * BigInt(combined[asset.id]) / BPS]));
  targets[CASH] = before - Object.values(targets).reduce((sum, v) => sum + v, 0n);
  const stressRatesBps = Object.fromEntries(input.assets.map((asset) => [asset.id, Math.round(Math.abs(short.worstStressPercent[asset.id]) * 100)]));
  const baseline = candidate(input, targets, before, 0, stressRatesBps)!;
  const reasons: string[] = [];
  const inputIssues: ActionPlan["inputIssues"] = [];
  for (const asset of input.assets) {
    if (asset.bidToman === null) inputIssues.push({ assetId: asset.id, code: "missing_bid" });
    if (asset.askToman === null) inputIssues.push({ assetId: asset.id, code: "missing_ask" });
    if (asset.quotedOn > input.asOf) inputIssues.push({ assetId: asset.id, code: "future_quote" });
    if (asset.validUntil < input.asOf) inputIssues.push({ assetId: asset.id, code: "expired_quote" });
  }
  const invalid = inputIssues.length > 0;
  const outOfLimits = input.assets.some((asset) => {
    const delta = targets[asset.id] - valueOf(asset);
    if (abs(delta) * BPS < before * BigInt(input.noTradeBandBps) || delta === 0n) return false;
    const side = delta > 0n ? "buy" : "sell";
    const price = cost(input, asset, side, BigInt(asset.lotMilli)).slipped;
    return side === "buy" ? price > limits(input, asset).buy : price < limits(input, asset).sell;
  });
  let chosen = baseline;
  let state: PlanState = "hold";
  const fractions = [0, 2500, 5000, 7500, 10_000];
  const alternatives: ActionPlan["alternatives"] = fractions.map((fractionBps) => ({ fractionBps, state: fractionBps === 0 ? "baseline" : "not_evaluated", objectiveToman: fractionBps === 0 ? String(baseline.objective) : null, totalCostToman: fractionBps === 0 ? "0" : null }));
  if (invalid) { state = "undecidable"; reasons.push("MISSING_STALE_OR_FUTURE_QUOTE"); }
  else if (outOfLimits) { state = "wait"; reasons.push("WAIT_FOR_ACCEPTABLE_QUOTE"); }
  else {
    for (const fraction of fractions.slice(1)) {
      const result = candidate(input, targets, before, fraction, stressRatesBps);
      const alternative = alternatives.find((item) => item.fractionBps === fraction)!;
      alternative.state = result ? "feasible" : "infeasible";
      alternative.objectiveToman = result ? String(result.objective) : null;
      alternative.totalCostToman = result ? String(result.costs) : null;
      if (result && (result.objective < chosen.objective || (result.objective === chosen.objective && result.turnover < chosen.turnover))) chosen = result;
    }
    const improvement = baseline.objective - chosen.objective;
    if (chosen.orders.length && improvement * BPS > before * BigInt(input.minimumImprovementBps)) {
      state = "proposed"; reasons.push("NET_TARGET_DISTANCE_IMPROVEMENT");
    } else {
      chosen = baseline; reasons.push("NO_SUFFICIENT_NET_IMPROVEMENT_OR_FEASIBLE_LOT");
    }
  }
  if (input.assets.some((asset) => valueOf(asset, chosen.quantities.get(asset.id)) * BPS > chosen.total * BigInt(input.maximumAssetBps)) || chosen.cash * BPS < chosen.total * BigInt(input.minimumCashBps)) {
    reasons.push("CONSTRAINT_BREACH_REMAINS");
    if (state === "hold") state = "wait";
  }
  if (chosen.stressLoss * 100n > chosen.total * BigInt(input.maximumDrawdownPercent)) {
    reasons.push("STRESS_BUDGET_BREACH_REMAINS");
    if (state === "hold") state = "wait";
  }
  const rows: PlanRow[] = input.assets.map((asset) => {
    const owned = BigInt(asset.quantityMilli), after = chosen.quantities.get(asset.id)!;
    const quantity = abs(after - owned), currentValue = valueOf(asset), afterValue = valueOf(asset, after);
    const conditional = lotFloor(abs(targets[asset.id] - currentValue) * UNIT / BigInt(asset.referencePriceToman), asset);
    const action = state === "undecidable" || state === "wait" ? state : quantity === 0n ? "hold" : after === 0n ? "exit" : after > owned ? "increase" : "reduce";
    return {
      assetId: asset.id, action, quantityMilli: String(quantity), conditionalQuantityMilli: String(conditional),
      currentQuantityMilli: String(owned), afterQuantityMilli: String(after), currentValueToman: String(currentValue), afterValueToman: String(afterValue),
      currentWeightBps: ratio(currentValue, before), targetWeightBps: combined[asset.id], afterWeightBps: ratio(afterValue, chosen.total),
      changeOfSourceBps: owned ? ratio(quantity, owned) : null,
      changeOfPortfolioBps: ratio(abs(afterValue - currentValue), before),
      entryLimitToman: String(limits(input, asset).buy), exitLimitToman: String(limits(input, asset).sell),
      reasonCode: action !== "hold" ? reasons[0]
        : targets[asset.id] === currentValue ? "ALREADY_AT_TARGET"
        : abs(targets[asset.id] - currentValue) * BPS < before * BigInt(input.noTradeBandBps) ? "INSIDE_NO_TRADE_BAND"
        : "LOT_CAPACITY_COST_OR_BUDGET_LIMIT",
      orderIds: chosen.orders.filter((order) => order.assetId === asset.id).map((order) => order.id),
    };
  });
  const conversions = chosen.orders.filter((order) => order.side === "buy").flatMap((order) => order.funding.filter((fund) => fund.saleOrderId !== null).map((fund) => ({
    sourceId: fund.sourceId, destinationId: order.assetId,
    kind: input.assets.find((asset) => asset.id === fund.sourceId)!.assetClass === input.assets.find((asset) => asset.id === order.assetId)!.assetClass ? "same_class" as const : "cross_class" as const,
    amountToman: fund.amountToman, saleOrderId: fund.saleOrderId!, buyOrderId: order.id,
  })));
  return {
    schemaVersion: ACTION_PLAN_VERSION, methodologyId,
    state, financialUseAllowed: false, executionAllowed: false, inputSnapshot: input, inputIssues,
    horizons: [short, medium], combinedTargetsBps: combined, rows, orders: chosen.orders, conversions, alternatives,
    portfolio: {
      beforeToman: String(before), afterToman: String(chosen.total), cashBeforeToman: String(input.cashToman), cashAfterToman: String(chosen.cash),
      cashReserveToman: String(ceil(before * BigInt(input.minimumCashBps), BPS)), totalCostToman: String(chosen.costs),
      turnoverBps: ratio(chosen.turnover, before), trackingErrorBeforeToman: String(baseline.error), trackingErrorAfterToman: String(chosen.error),
      objectiveImprovementToman: String(baseline.objective - chosen.objective), chosenFractionBps: chosen.fraction,
      stressLossBeforeToman: String(baseline.stressLoss), stressLossAfterToman: String(chosen.stressLoss), stressBoundAfterBps: ratio(chosen.stressLoss, chosen.total),
    },
    objective: { id: "L1_TARGET_DISTANCE_PLUS_TWO_TIMES_COST_V1", candidateFractionsBps: fractions, noReturnForecast: true },
    validUntil: input.assets.map((asset) => asset.validUntil).sort()[0],
    reviewOn: [addDays(input.asOf, 1), short.endsOn, medium.endsOn].sort()[0], reasonCodes: reasons,
  };
}

/** Research harness only: supplied targets never masquerade as the UI method. */
export function buildSyntheticSizingTrial(payload: unknown, targetPayload: unknown) {
  const input = validateActionInput(payload);
  const ids = [...input.assets.map((asset) => asset.id), CASH];
  exactKeys(targetPayload, ids.join(" "));
  const targets = targetPayload as Record<string, number>;
  for (const id of ids) integer(targets[id], 0, 10_000);
  if (Object.values(targets).reduce((sum, weight) => sum + weight, 0) !== 10_000) throw new Error("جمع وزن‌های مقایسه باید دقیقاً ۱۰۰٪ باشد.");
  const plan = buildPlanForTargets(input, horizon(input, "short"), horizon(input, "medium"), { ...targets }, "ASHA_EXTERNAL_SYNTHETIC_TARGET_TRIAL_V1");
  return {
    schemaVersion: "asha.synthetic.sizing_trial.v1" as const,
    financialUseAllowed: false as const, executionAllowed: false as const,
    inputSnapshot: plan.inputSnapshot, targetWeightsBps: plan.combinedTargetsBps,
    state: plan.state, orders: plan.orders, rows: plan.rows, portfolio: plan.portfolio,
    inputIssues: plan.inputIssues, reasonCodes: plan.reasonCodes,
  };
}

export function encodeActionPlan(plan: ActionPlan): string {
  const expected = buildActionPlan(plan.inputSnapshot);
  if (JSON.stringify(plan) !== JSON.stringify(expected)) throw new Error("نتیجه با ورودی ذخیره‌شده تطبیق ندارد.");
  return JSON.stringify(expected);
}
export function decodeActionPlan(document: string): ActionPlan {
  if (typeof document !== "string" || document.length > 200_000) throw new Error("اندازهٔ فایل نسخهٔ ذخیره‌شده نامعتبر است.");
  const parsed = JSON.parse(document) as ActionPlan;
  if (!parsed || typeof parsed !== "object" || !parsed.inputSnapshot) throw new Error("نسخهٔ ذخیره‌شده نامعتبر است.");
  const expected = buildActionPlan(parsed.inputSnapshot);
  if (document !== JSON.stringify(expected)) throw new Error("نسخهٔ ذخیره‌شده تغییر کرده یا کامل نیست.");
  return expected;
}
