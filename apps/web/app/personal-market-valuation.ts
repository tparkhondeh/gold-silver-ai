import type { PortfolioHolding } from "../data/postgres-portfolio-repository.ts";
import { evaluatePurchaseBook, type ExactRatio, type PurchaseBook, type PurchaseCoverage, type PurchaseCurrency, type PurchaseFx } from "./purchase-book.ts";
import { MARKET_TTL_MS, validateMarketSnapshot, type MarketObservation, type MarketSnapshot } from "./market-test-contract.ts";

export const PERSONAL_MARKET_VALUATION_VERSION = "asha.personal_market_valuation.v2";
// ExactRatio's integer-string representation also carries signed P&L here.
// Acquisition inputs stay nonnegative; this does not change their contract.
export type SignedExactRatio = ExactRatio;
export type PersonalQuoteState = "fresh" | "stale" | "future" | "missing" | "unsupported_asset" | "unsupported_unit" | "unsupported_quantity" | "invalid_snapshot";
export type CoveredPersonalProfit = {
  quantity: ExactRatio; costRial: ExactRatio | null; valueRial: ExactRatio | null;
  profitLossRial: SignedExactRatio | null; profitLossPercent: SignedExactRatio | null; lotCount: number;
};
export type PersonalUsdBasisSource = {
  lotId: string; purchaseDate: string; paymentCurrency: PurchaseCurrency;
  kind: "actual_payment" | "historical_equivalent"; fx: PurchaseFx | null;
  missingInputs: Array<"unit_price" | "fees" | "historical_fx">;
};
export type CoveredPersonalUsdProfit = {
  quantity: ExactRatio; costUsd: ExactRatio | null; valueUsd: ExactRatio | null;
  profitLossUsd: SignedExactRatio | null; profitLossPercent: SignedExactRatio | null; lotCount: number; lotIds: string[];
};
export type PersonalMarketRow = {
  id: string; name: string; assetId: string | null; unit: string; displayUnit: string; purityPermille: number | null;
  quantity: ExactRatio; lotIds: string[]; legacyIds: string[]; quoteState: PersonalQuoteState;
  observation: MarketObservation | null; recordedPriceRial: ExactRatio | null;
  currentValueRial: ExactRatio | null; currentValueUsd: ExactRatio | null;
  purchaseBasisRial: PurchaseCoverage; landedBasisRial: PurchaseCoverage; legacyRecordedCostRial: ExactRatio | null;
  landedBasisUsd: PurchaseCoverage; paidBasisUsd: PurchaseCoverage; equivalentBasisUsd: PurchaseCoverage;
  usdBasisSources: PersonalUsdBasisSource[]; usdCostComplete: boolean;
  costComplete: boolean; profitLossRial: SignedExactRatio | null; profitLossPercent: SignedExactRatio | null;
  profitLossUsd: SignedExactRatio | null; profitLossUsdPercent: SignedExactRatio | null;
  covered: CoveredPersonalProfit; coveredUsd: CoveredPersonalUsdProfit;
};
export type PersonalMarketValuation = {
  version: typeof PERSONAL_MARKET_VALUATION_VERSION; evaluatedAt: string;
  snapshotState: "valid" | "missing" | "invalid"; issues: string[];
  usdConversion: {
    quoteState: "fresh" | "stale" | "future" | "missing" | "invalid_snapshot";
    observation: MarketObservation | null; currentRialPerUsd: ExactRatio | null;
  };
  rows: PersonalMarketRow[];
  totals: {
    knownCurrentValueRial: ExactRatio | null; currentValueRial: ExactRatio | null; currentValueUsd: ExactRatio | null;
    knownLandedCostRial: ExactRatio | null; landedCostRial: ExactRatio | null;
    knownCurrentValueUsd: ExactRatio | null; knownLandedCostUsd: ExactRatio | null; landedCostUsd: ExactRatio | null;
    profitLossRial: SignedExactRatio | null; profitLossPercent: SignedExactRatio | null;
    profitLossUsd: SignedExactRatio | null; profitLossUsdPercent: SignedExactRatio | null;
    coveredCostRial: ExactRatio | null; coveredValueRial: ExactRatio | null;
    coveredProfitLossRial: SignedExactRatio | null; coveredProfitLossPercent: SignedExactRatio | null;
    coveredCostUsd: ExactRatio | null; coveredValueUsd: ExactRatio | null;
    coveredProfitLossUsd: SignedExactRatio | null; coveredProfitLossUsdPercent: SignedExactRatio | null;
    valuedAssetCount: number; totalAssetCount: number; costCoveredLotCount: number; usdCostCoveredLotCount: number; totalLotCount: number; legacyHoldingCount: number;
  };
  financialUseAllowed: false;
};

type Fraction = { n: bigint; d: bigint };
const ZERO: Fraction = { n: 0n, d: 1n };
const TEN: Fraction = { n: 10n, d: 1n };
const HUNDRED: Fraction = { n: 100n, d: 1n };
const abs = (n: bigint) => n < 0n ? -n : n;
function gcd(a: bigint, b: bigint): bigint { a = abs(a); while (b) { const remainder = a % b; a = b; b = remainder; } return a; }
function reduced(n: bigint, d: bigint): Fraction {
  if (d <= 0n) throw new Error("Invalid exact valuation denominator");
  const factor = gcd(n, d); return { n: n / factor, d: d / factor };
}
function read(value: ExactRatio): Fraction { return { n: BigInt(value.numerator), d: BigInt(value.denominator) }; }
function out(value: Fraction): ExactRatio { return { numerator: value.n.toString(), denominator: value.d.toString() }; }
function optional(value: Fraction | null): ExactRatio | null { return value === null ? null : out(value); }
function add(a: Fraction, b: Fraction): Fraction {
  const common = gcd(a.d, b.d); const numerator = a.n * (b.d / common) + b.n * (a.d / common); const factor = gcd(numerator, common);
  return { n: numerator / factor, d: (a.d / common) * (b.d / factor) };
}
function multiply(a: Fraction, b: Fraction): Fraction {
  const left = gcd(a.n, b.d); const right = gcd(b.n, a.d);
  return { n: (a.n / left) * (b.n / right), d: (a.d / right) * (b.d / left) };
}
function divide(a: Fraction, b: Fraction): Fraction {
  if (b.n <= 0n) throw new Error("Invalid valuation divisor");
  const left = gcd(a.n, b.n); const right = gcd(b.d, a.d);
  return { n: (a.n / left) * (b.d / right), d: (a.d / right) * (b.n / left) };
}
function subtract(a: Fraction, b: Fraction): Fraction { return add(a, { n: -b.n, d: b.d }); }
function profitPercent(profit: Fraction, cost: Fraction): Fraction | null { return cost.n > 0n ? multiply(divide(profit, cost), HUNDRED) : null; }
// Ascending exact order, with unavailable values last. The caller can reverse
// numeric ordering for descending views without manufacturing missing zeros.
export function comparePersonalRatios(a: ExactRatio | null, b: ExactRatio | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  const left = read(a), right = read(b); const difference = left.n * right.d - right.n * left.d;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
// Group totals are whole-group values, unlike the explicitly named known
// subtotals below: one unavailable child leaves the group total unavailable.
export function sumPersonalRatios(values: readonly (ExactRatio | null)[]): ExactRatio | null {
  if (!values.length || values.some((value) => value === null)) return null;
  return out(values.reduce<Fraction>((total, value) => add(total, read(value!)), ZERO));
}
// Legacy numbers have already passed the existing numeric persistence contract.
// Read their decimal representation exactly, including supported exponent forms.
function legacyDecimal(value: number): Fraction {
  const [coefficient, exponentText = "0"] = value.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split("."); const exponent = Number(exponentText) - fraction.length;
  return exponent < 0 ? reduced(BigInt(whole + fraction), 10n ** BigInt(-exponent)) : reduced(BigInt(whole + fraction) * 10n ** BigInt(exponent), 1n);
}
function unavailableBasis(quantity: ExactRatio): PurchaseCoverage {
  return { total: null, coveredQuantity: out(ZERO), totalQuantity: quantity, complete: false, averageCovered: null, average: null };
}
function quoteTimeState(observation: MarketObservation, nowMs: number): "fresh" | "stale" | "future" {
  const published = Date.parse(observation.publishedAt);
  if (published > nowMs || Date.parse(observation.receivedAt) > nowMs) return "future";
  return nowMs - published > MARKET_TTL_MS ? "stale" : "fresh";
}

/** Latest indicative valuation only: never bid/ask proceeds, invented historical FX,
 *  market-test positions, a financial recommendation or an execution input. */
export function evaluatePersonalMarketValuation(
  book: PurchaseBook, legacy: readonly PortfolioHolding[], snapshot: MarketSnapshot | null, nowMs: number,
): PersonalMarketValuation {
  if (!Number.isFinite(nowMs) || !Number.isFinite(new Date(nowMs).getTime())) throw new Error("Invalid valuation time");
  const evaluatedAt = new Date(nowMs).toISOString();
  const purchases = evaluatePurchaseBook(book, legacy);
  const issues: string[] = [];
  let snapshotState: PersonalMarketValuation["snapshotState"] = snapshot === null ? "missing" : "valid";
  let observations: MarketObservation[] = [];
  if (snapshot !== null) {
    try { validateMarketSnapshot(snapshot, nowMs); observations = structuredClone(snapshot.observations); }
    catch { snapshotState = "invalid"; issues.push("نسخهٔ قیمت معتبر نیست؛ تمام ارزش‌گذاری‌های جاری متوقف شد."); }
  }
  const quotes = new Map(observations.map((observation) => [observation.instrumentCode, observation]));
  const usd = quotes.get("USD_IRR");
  const usdQuoteState = snapshotState === "invalid" ? "invalid_snapshot" : usd ? quoteTimeState(usd, nowMs) : "missing";
  const currentUsdRial = usd && usdQuoteState === "fresh" ? { n: BigInt(usd.priceRial), d: 1n } : null;
  const usdBasisSources = new Map(purchases.lots.map(({ lot }): [string, PersonalUsdBasisSource] => {
    const missingInputs: PersonalUsdBasisSource["missingInputs"] = [];
    if (lot.unitPrice === null) missingInputs.push("unit_price");
    if (lot.fees === null) missingInputs.push("fees");
    if (lot.paymentCurrency !== "USD" && lot.fx === null) missingInputs.push("historical_fx");
    return [lot.id, { lotId: lot.id, purchaseDate: lot.purchaseDate, paymentCurrency: lot.paymentCurrency,
      kind: lot.paymentCurrency === "USD" ? "actual_payment" : "historical_equivalent",
      fx: lot.paymentCurrency === "USD" ? null : lot.fx, missingInputs }];
  }));
  const consumedLegacy = new Set(purchases.assets.flatMap((asset) => asset.sourceLegacyIds));
  const bases = [
    ...purchases.assets.map((aggregate) => ({
      id: aggregate.id, name: aggregate.asset.name, assetId: aggregate.asset.id as string | null, unit: aggregate.asset.unit as string,
      displayUnit: aggregate.asset.displayUnit as string, purityPermille: aggregate.asset.purityPermille as number | null,
      quantity: aggregate.quantity, lotIds: aggregate.lotIds, legacyIds: aggregate.sourceLegacyIds,
      purchaseBasisRial: aggregate.purchaseRial, landedBasisRial: aggregate.landedRial,
      landedBasisUsd: aggregate.usd, paidBasisUsd: aggregate.paidUsd, equivalentBasisUsd: aggregate.equivalentUsd,
      usdBasisSources: aggregate.lotIds.map((id) => usdBasisSources.get(id)!),
      legacyRecordedCostRial: aggregate.sourceLegacyIds.length && aggregate.legacyCostToman !== null ? out(multiply(read(aggregate.legacyCostToman), TEN)) : null,
    })),
    ...legacy.filter((holding) => !consumedLegacy.has(holding.id)).map((holding) => {
      const quantity = out(legacyDecimal(holding.amount));
      return { id: holding.id, name: holding.name, assetId: null, unit: holding.unit, displayUnit: holding.unit, purityPermille: null,
        quantity, lotIds: [] as string[], legacyIds: [holding.id], purchaseBasisRial: unavailableBasis(quantity), landedBasisRial: unavailableBasis(quantity),
        landedBasisUsd: unavailableBasis(quantity), paidBasisUsd: unavailableBasis(quantity), equivalentBasisUsd: unavailableBasis(quantity), usdBasisSources: [] as PersonalUsdBasisSource[],
        legacyRecordedCostRial: holding.costToman === null ? null : out(multiply(legacyDecimal(holding.costToman), TEN)) };
    }),
  ];
  const pricedLots = new Set(purchases.lots.filter((row) => row.landedRial !== null).map((row) => row.lot.id));
  const usdPricedLots = new Set(purchases.lots.filter((row) => row.landedUsd !== null).map((row) => row.lot.id));
  const legacyById = new Map(legacy.map((holding) => [holding.id, holding]));
  const rows: PersonalMarketRow[] = bases.map((base) => {
    const observation = base.assetId === null ? null : quotes.get(base.assetId) ?? null;
    // No implicit mesghal<->unit bridge, purity conversion, name alias or global
    // ounce substitute. The snapshot validator already binds provider symbols.
    const invalidWholeQuantity = base.unit === "unit" && base.legacyIds.some((id) => !Number.isInteger(legacyById.get(id)!.amount));
    const quoteState: PersonalQuoteState = snapshotState === "invalid" ? "invalid_snapshot" : base.assetId === null ? "unsupported_asset" : invalidWholeQuantity ? "unsupported_quantity"
      : !observation ? "missing" : observation.unit !== base.unit || observation.purityPermille !== base.purityPermille ? "unsupported_unit" : quoteTimeState(observation, nowMs);
    const price = observation && observation.unit === base.unit && observation.purityPermille === base.purityPermille ? { n: BigInt(observation.priceRial), d: 1n } : null;
    const current = quoteState === "fresh" && price !== null ? multiply(read(base.quantity), price) : null;
    const currentValueUsd = current !== null && currentUsdRial !== null ? divide(current, currentUsdRial) : null;
    const costComplete = base.landedBasisRial.complete;
    const cost = costComplete && base.landedBasisRial.total !== null ? read(base.landedBasisRial.total) : null;
    const profit = current !== null && cost !== null ? subtract(current, cost) : null;
    const coveredQuantity = base.landedBasisRial.coveredQuantity;
    const coveredCost = current !== null && base.landedBasisRial.total !== null ? read(base.landedBasisRial.total) : null;
    const coveredValue = coveredCost !== null && price !== null ? multiply(read(coveredQuantity), price) : null;
    const coveredProfit = coveredValue !== null && coveredCost !== null ? subtract(coveredValue, coveredCost) : null;
    // Historical USD cost is computed per purchase by the purchase book. It is
    // never Rial P&L divided by today's FX, and its covered lot set may differ.
    const usdCostComplete = base.landedBasisUsd.complete;
    const usdCost = usdCostComplete && base.landedBasisUsd.total !== null ? read(base.landedBasisUsd.total) : null;
    const usdProfit = currentValueUsd !== null && usdCost !== null ? subtract(currentValueUsd, usdCost) : null;
    const coveredUsdCost = currentValueUsd !== null && base.landedBasisUsd.total !== null ? read(base.landedBasisUsd.total) : null;
    const coveredUsdValue = coveredUsdCost !== null && price !== null && currentUsdRial !== null ? divide(multiply(read(base.landedBasisUsd.coveredQuantity), price), currentUsdRial) : null;
    const coveredUsdProfit = coveredUsdValue !== null && coveredUsdCost !== null ? subtract(coveredUsdValue, coveredUsdCost) : null;
    const coveredUsdLotIds = coveredUsdCost === null ? [] : base.lotIds.filter((id) => usdPricedLots.has(id));
    return { ...base, quoteState, observation, recordedPriceRial: optional(price), currentValueRial: optional(current), currentValueUsd: optional(currentValueUsd), costComplete, usdCostComplete,
      profitLossRial: optional(profit), profitLossPercent: profit !== null && cost !== null ? optional(profitPercent(profit, cost)) : null,
      profitLossUsd: optional(usdProfit), profitLossUsdPercent: usdProfit !== null && usdCost !== null ? optional(profitPercent(usdProfit, usdCost)) : null,
      covered: { quantity: coveredCost === null ? out(ZERO) : coveredQuantity, costRial: optional(coveredCost), valueRial: optional(coveredValue),
        profitLossRial: optional(coveredProfit), profitLossPercent: coveredProfit !== null && coveredCost !== null ? optional(profitPercent(coveredProfit, coveredCost)) : null,
        lotCount: coveredCost === null ? 0 : base.lotIds.filter((id) => pricedLots.has(id)).length },
      coveredUsd: { quantity: coveredUsdCost === null ? out(ZERO) : base.landedBasisUsd.coveredQuantity, costUsd: optional(coveredUsdCost), valueUsd: optional(coveredUsdValue),
        profitLossUsd: optional(coveredUsdProfit), profitLossPercent: coveredUsdProfit !== null && coveredUsdCost !== null ? optional(profitPercent(coveredUsdProfit, coveredUsdCost)) : null,
        lotCount: coveredUsdLotIds.length, lotIds: coveredUsdLotIds } };
  });
  const sum = (values: Array<ExactRatio | null>): Fraction | null => {
    const known = values.filter((value): value is ExactRatio => value !== null);
    return known.length ? known.reduce((total, value) => add(total, read(value)), ZERO) : null;
  };
  const knownCurrent = sum(rows.map((row) => row.currentValueRial));
  const valuedAssetCount = rows.filter((row) => row.currentValueRial !== null).length;
  const current = rows.length > 0 && valuedAssetCount === rows.length ? knownCurrent : null;
  const completeCost = rows.length > 0 && rows.every((row) => row.costComplete);
  const knownLandedCost = sum(rows.map((row) => row.landedBasisRial.total));
  const totalCost = completeCost ? knownLandedCost : null;
  const totalProfit = current !== null && totalCost !== null ? subtract(current, totalCost) : null;
  const coveredCost = sum(rows.map((row) => row.covered.costRial));
  const coveredValue = sum(rows.map((row) => row.covered.valueRial));
  const coveredProfit = coveredCost !== null && coveredValue !== null ? subtract(coveredValue, coveredCost) : null;
  const knownCurrentUsd = sum(rows.map((row) => row.currentValueUsd));
  const currentUsd = current !== null && currentUsdRial !== null ? divide(current, currentUsdRial) : null;
  const knownLandedUsdCost = sum(rows.map((row) => row.landedBasisUsd.total));
  const totalUsdCost = rows.length > 0 && rows.every((row) => row.usdCostComplete) ? knownLandedUsdCost : null;
  const totalUsdProfit = currentUsd !== null && totalUsdCost !== null ? subtract(currentUsd, totalUsdCost) : null;
  const coveredUsdCost = sum(rows.map((row) => row.coveredUsd.costUsd));
  const coveredUsdValue = sum(rows.map((row) => row.coveredUsd.valueUsd));
  const coveredUsdProfit = coveredUsdCost !== null && coveredUsdValue !== null ? subtract(coveredUsdValue, coveredUsdCost) : null;
  return { version: PERSONAL_MARKET_VALUATION_VERSION, evaluatedAt, snapshotState, issues, rows,
    usdConversion: { quoteState: usdQuoteState, observation: usd ?? null, currentRialPerUsd: optional(currentUsdRial) },
    totals: { knownCurrentValueRial: optional(knownCurrent), currentValueRial: optional(current), currentValueUsd: optional(currentUsd),
      knownLandedCostRial: optional(knownLandedCost), landedCostRial: optional(totalCost),
      knownCurrentValueUsd: optional(knownCurrentUsd), knownLandedCostUsd: optional(knownLandedUsdCost), landedCostUsd: optional(totalUsdCost),
      profitLossRial: optional(totalProfit), profitLossPercent: totalProfit !== null && totalCost !== null ? optional(profitPercent(totalProfit, totalCost)) : null,
      profitLossUsd: optional(totalUsdProfit), profitLossUsdPercent: totalUsdProfit !== null && totalUsdCost !== null ? optional(profitPercent(totalUsdProfit, totalUsdCost)) : null,
      coveredCostRial: optional(coveredCost), coveredValueRial: optional(coveredValue), coveredProfitLossRial: optional(coveredProfit),
      coveredProfitLossPercent: coveredProfit !== null && coveredCost !== null ? optional(profitPercent(coveredProfit, coveredCost)) : null,
      coveredCostUsd: optional(coveredUsdCost), coveredValueUsd: optional(coveredUsdValue), coveredProfitLossUsd: optional(coveredUsdProfit),
      coveredProfitLossUsdPercent: coveredUsdProfit !== null && coveredUsdCost !== null ? optional(profitPercent(coveredUsdProfit, coveredUsdCost)) : null,
      valuedAssetCount, totalAssetCount: rows.length, costCoveredLotCount: rows.reduce((count, row) => count + row.covered.lotCount, 0),
      usdCostCoveredLotCount: rows.reduce((count, row) => count + row.coveredUsd.lotCount, 0), totalLotCount: book.lots.length, legacyHoldingCount: legacy.length },
    financialUseAllowed: false };
}
