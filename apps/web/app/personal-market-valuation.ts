import type { PortfolioHolding } from "../data/postgres-portfolio-repository.ts";
import { evaluatePurchaseBook, type ExactRatio, type PurchaseBook, type PurchaseCoverage } from "./purchase-book.ts";
import { MARKET_TTL_MS, validateMarketSnapshot, type MarketObservation, type MarketSnapshot } from "./market-test-contract.ts";

export const PERSONAL_MARKET_VALUATION_VERSION = "asha.personal_market_valuation.v1";
// ExactRatio's integer-string representation also carries signed P&L here.
// Acquisition inputs stay nonnegative; this does not change their contract.
export type SignedExactRatio = ExactRatio;
export type PersonalQuoteState = "fresh" | "stale" | "future" | "missing" | "unsupported_asset" | "unsupported_unit" | "unsupported_quantity" | "invalid_snapshot";
export type CoveredPersonalProfit = {
  quantity: ExactRatio; costRial: ExactRatio | null; valueRial: ExactRatio | null;
  profitLossRial: SignedExactRatio | null; profitLossPercent: SignedExactRatio | null; lotCount: number;
};
export type PersonalMarketRow = {
  id: string; name: string; assetId: string | null; unit: string; displayUnit: string; purityPermille: number | null;
  quantity: ExactRatio; lotIds: string[]; legacyIds: string[]; quoteState: PersonalQuoteState;
  observation: MarketObservation | null; recordedPriceRial: ExactRatio | null;
  currentValueRial: ExactRatio | null; currentValueUsd: ExactRatio | null;
  purchaseBasisRial: PurchaseCoverage; landedBasisRial: PurchaseCoverage; legacyRecordedCostRial: ExactRatio | null;
  costComplete: boolean; profitLossRial: SignedExactRatio | null; profitLossPercent: SignedExactRatio | null;
  covered: CoveredPersonalProfit;
};
export type PersonalMarketValuation = {
  version: typeof PERSONAL_MARKET_VALUATION_VERSION; evaluatedAt: string;
  snapshotState: "valid" | "missing" | "invalid"; issues: string[];
  rows: PersonalMarketRow[];
  totals: {
    knownCurrentValueRial: ExactRatio | null; currentValueRial: ExactRatio | null; currentValueUsd: ExactRatio | null;
    knownLandedCostRial: ExactRatio | null; landedCostRial: ExactRatio | null;
    profitLossRial: SignedExactRatio | null; profitLossPercent: SignedExactRatio | null;
    coveredCostRial: ExactRatio | null; coveredValueRial: ExactRatio | null;
    coveredProfitLossRial: SignedExactRatio | null; coveredProfitLossPercent: SignedExactRatio | null;
    valuedAssetCount: number; totalAssetCount: number; costCoveredLotCount: number; totalLotCount: number; legacyHoldingCount: number;
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

/** Latest indicative valuation only: never bid/ask proceeds, historical FX,
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
  const currentUsdRial = usd && quoteTimeState(usd, nowMs) === "fresh" ? { n: BigInt(usd.priceRial), d: 1n } : null;
  const consumedLegacy = new Set(purchases.assets.flatMap((asset) => asset.sourceLegacyIds));
  const bases = [
    ...purchases.assets.map((aggregate) => ({
      id: aggregate.id, name: aggregate.asset.name, assetId: aggregate.asset.id as string | null, unit: aggregate.asset.unit as string,
      displayUnit: aggregate.asset.displayUnit as string, purityPermille: aggregate.asset.purityPermille as number | null,
      quantity: aggregate.quantity, lotIds: aggregate.lotIds, legacyIds: aggregate.sourceLegacyIds,
      purchaseBasisRial: aggregate.purchaseRial, landedBasisRial: aggregate.landedRial,
      legacyRecordedCostRial: aggregate.sourceLegacyIds.length && aggregate.legacyCostToman !== null ? out(multiply(read(aggregate.legacyCostToman), TEN)) : null,
    })),
    ...legacy.filter((holding) => !consumedLegacy.has(holding.id)).map((holding) => {
      const quantity = out(legacyDecimal(holding.amount));
      return { id: holding.id, name: holding.name, assetId: null, unit: holding.unit, displayUnit: holding.unit, purityPermille: null,
        quantity, lotIds: [] as string[], legacyIds: [holding.id], purchaseBasisRial: unavailableBasis(quantity), landedBasisRial: unavailableBasis(quantity),
        legacyRecordedCostRial: holding.costToman === null ? null : out(multiply(legacyDecimal(holding.costToman), TEN)) };
    }),
  ];
  const pricedLots = new Set(purchases.lots.filter((row) => row.landedRial !== null).map((row) => row.lot.id));
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
    return { ...base, quoteState, observation, recordedPriceRial: optional(price), currentValueRial: optional(current), currentValueUsd: optional(currentValueUsd), costComplete,
      profitLossRial: optional(profit), profitLossPercent: profit !== null && cost !== null ? optional(profitPercent(profit, cost)) : null,
      covered: { quantity: coveredCost === null ? out(ZERO) : coveredQuantity, costRial: optional(coveredCost), valueRial: optional(coveredValue),
        profitLossRial: optional(coveredProfit), profitLossPercent: coveredProfit !== null && coveredCost !== null ? optional(profitPercent(coveredProfit, coveredCost)) : null,
        lotCount: coveredCost === null ? 0 : base.lotIds.filter((id) => pricedLots.has(id)).length } };
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
  return { version: PERSONAL_MARKET_VALUATION_VERSION, evaluatedAt, snapshotState, issues, rows,
    totals: { knownCurrentValueRial: optional(knownCurrent), currentValueRial: optional(current), currentValueUsd: current !== null && currentUsdRial !== null ? out(divide(current, currentUsdRial)) : null,
      knownLandedCostRial: optional(knownLandedCost), landedCostRial: optional(totalCost),
      profitLossRial: optional(totalProfit), profitLossPercent: totalProfit !== null && totalCost !== null ? optional(profitPercent(totalProfit, totalCost)) : null,
      coveredCostRial: optional(coveredCost), coveredValueRial: optional(coveredValue), coveredProfitLossRial: optional(coveredProfit),
      coveredProfitLossPercent: coveredProfit !== null && coveredCost !== null ? optional(profitPercent(coveredProfit, coveredCost)) : null,
      valuedAssetCount, totalAssetCount: rows.length, costCoveredLotCount: rows.reduce((count, row) => count + row.covered.lotCount, 0), totalLotCount: book.lots.length, legacyHoldingCount: legacy.length },
    financialUseAllowed: false };
}
