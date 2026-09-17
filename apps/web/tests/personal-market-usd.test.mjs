import assert from "node:assert/strict";
import test from "node:test";
import { emptyPurchaseBook, purchaseAssetCatalog } from "../app/purchase-book.ts";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";
import { evaluatePersonalMarketValuation, PERSONAL_MARKET_VALUATION_VERSION } from "../app/personal-market-valuation.ts";

// Invented, explicitly synthetic contracts: no account, provider or real data.
const now = Date.parse("2000-01-03T12:00:00.000Z");
const time = new Date(now).toISOString();
const exact = (numerator, denominator = 1) => ({ numerator: String(numerator), denominator: String(denominator) });
const fx = (tomanPerUsd = "100000", rateDate = "2000-01-01") => ({ tomanPerUsd, rateDate, rateType: "synthetic manual", source: "synthetic historical input", receivedAt: time, validity: "user_entered_unverified" });
function lot(fields = {}) {
  const asset = purchaseAssetCatalog.find(item => item.id === (fields.assetId ?? "GOLD_18K_IRR"));
  return { id: "synthetic-gold", assetId: asset.id, assetClass: asset.assetClass, unit: asset.unit, purityPermille: asset.purityPermille,
    quantity: "1", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "10000000", fees: "0",
    note: "synthetic USD regression", source: { kind: "manual", reference: null }, fx: fx(), ...fields };
}
const book = (...lots) => ({ ...emptyPurchaseBook(), lots });
function snapshot(values = { "18ayar": "12000000", usd_sell: "200000" }, usdAt = now) {
  return makeNavasanSnapshot(Object.fromEntries(Object.entries(values).map(([symbol, value]) => [symbol, { value, timestamp: (symbol === "usd_sell" ? usdAt : now) / 1000 }])), "TOMAN", time);
}
const evaluate = (input = book(lot()), quotes = snapshot(), legacy = [], at = now) => evaluatePersonalMarketValuation(input, legacy, quotes, at);

test("USD performance compares historical USD basis to current USD value, not converted Rial profit", () => {
  const result = evaluate(); const row = result.rows[0];
  assert.equal(PERSONAL_MARKET_VALUATION_VERSION, "asha.personal_market_valuation.v2");
  assert.equal(result.version, PERSONAL_MARKET_VALUATION_VERSION);
  assert.deepEqual(row.profitLossRial, exact(20_000_000));
  assert.deepEqual(row.landedBasisUsd.total, exact(100));
  assert.deepEqual(row.currentValueUsd, exact(60));
  assert.deepEqual(row.profitLossUsd, exact(-40)); assert.deepEqual(row.profitLossUsdPercent, exact(-40));
  assert.deepEqual(result.totals.profitLossUsd, row.profitLossUsd);
  assert.deepEqual(result.totals.profitLossUsdPercent, row.profitLossUsdPercent);
  assert.deepEqual(result.totals.landedCostUsd, exact(100));
  assert.equal(row.usdCostComplete, true); assert.equal(result.financialUseAllowed, false);
  assert.deepEqual(result.usdConversion.currentRialPerUsd, exact(2_000_000));
  assert.equal(result.usdConversion.quoteState, "fresh");
  assert.equal(result.usdConversion.observation.providerSymbol, "usd_sell");
  assert.equal(result.usdConversion.observation.publishedAt, time);
});

test("different dated rates are applied per lot before summing with native USD payments", () => {
  const input = book(
    lot({ unitPrice: "8000000", fees: "100000", fx: fx("90000") }),
    lot({ id: "irr", quantity: "2", paymentCurrency: "IRR", unitPrice: "45000000", fees: "10000000", purchaseDate: "2000-01-02", fx: fx("125000", "2000-01-02") }),
    lot({ id: "usd", quantity: "0.5", paymentCurrency: "USD", unitPrice: "100", fees: "5", fx: null }),
  );
  const result = evaluate(input); const row = result.rows[0];
  assert.deepEqual(row.landedBasisUsd.total, exact(225)); assert.deepEqual(row.landedBasisUsd.coveredQuantity, exact(7, 2));
  assert.deepEqual(row.landedBasisUsd.average, exact(450, 7));
  assert.deepEqual(row.paidBasisUsd.total, exact(55)); assert.deepEqual(row.equivalentBasisUsd.total, exact(170));
  assert.deepEqual(row.currentValueUsd, exact(210)); assert.deepEqual(row.profitLossUsd, exact(-15));
  assert.deepEqual(row.profitLossUsdPercent, exact(-20, 3));
  assert.deepEqual(row.usdBasisSources.map(source => [source.kind, source.fx?.rateDate ?? null, source.fx?.validity ?? null]), [
    ["historical_equivalent", "2000-01-01", "user_entered_unverified"], ["historical_equivalent", "2000-01-02", "user_entered_unverified"], ["actual_payment", null, null],
  ]);
  assert.deepEqual(row.coveredUsd.lotIds, input.lots.map(item => item.id));
  assert.equal(result.totals.usdCostCoveredLotCount, 3);
});

test("Rial-covered and USD-covered quantities are separate and each P&L denominator matches its subset", () => {
  const result = evaluate(book(
    lot({ id: "rial-only", quantity: "2", fx: null }),
    lot({ id: "usd-only", quantity: "3", paymentCurrency: "USD", unitPrice: "30", fx: null }),
    lot({ id: "unknown-fees", quantity: "4", fees: null }),
  )); const row = result.rows[0];
  assert.deepEqual(row.quantity, exact(9));
  assert.deepEqual(row.covered.quantity, exact(2)); assert.deepEqual(row.covered.costRial, exact(200_000_000));
  assert.deepEqual(row.coveredUsd.quantity, exact(3)); assert.deepEqual(row.coveredUsd.costUsd, exact(90));
  assert.deepEqual(row.coveredUsd.valueUsd, exact(180)); assert.deepEqual(row.coveredUsd.profitLossUsd, exact(90));
  assert.deepEqual(row.coveredUsd.profitLossPercent, exact(100)); assert.deepEqual(row.coveredUsd.lotIds, ["usd-only"]);
  assert.equal(row.usdCostComplete, false); assert.equal(row.profitLossUsd, null); assert.equal(result.totals.landedCostUsd, null);
  assert.deepEqual(result.totals.knownLandedCostUsd, exact(90)); assert.deepEqual(result.totals.coveredProfitLossUsd, exact(90));
  assert.deepEqual(result.totals.coveredProfitLossUsdPercent, exact(100)); assert.equal(result.totals.usdCostCoveredLotCount, 1);
});

test("complete native USD cost needs explicit fees but no historical FX or complete Rial cost", () => {
  const row = evaluate(book(lot({ paymentCurrency: "USD", unitPrice: "55", fx: null }))).rows[0];
  assert.equal(row.costComplete, false); assert.equal(row.profitLossRial, null); assert.equal(row.usdCostComplete, true);
  assert.deepEqual(row.landedBasisUsd.total, exact(55)); assert.deepEqual(row.profitLossUsd, exact(5));
  assert.deepEqual(row.profitLossUsdPercent, exact(100, 11));
  assert.deepEqual(row.usdBasisSources[0], { lotId: "synthetic-gold", purchaseDate: "2000-01-01", paymentCurrency: "USD", kind: "actual_payment", fx: null, missingInputs: [] });
  const withUnusedFx = evaluate(book(lot({ paymentCurrency: "USD", unitPrice: "55", fx: fx("333333") }))).rows[0];
  assert.deepEqual(withUnusedFx.profitLossUsd, row.profitLossUsd); assert.equal(withUnusedFx.usdBasisSources[0].fx, null);
});

test("missing unit price, fees and historical FX are explicit rather than manufactured zeros", () => {
  const row = evaluate(book(lot({ unitPrice: null, fees: null, fx: null }))).rows[0];
  assert.deepEqual(row.usdBasisSources[0].missingInputs, ["unit_price", "fees", "historical_fx"]);
  assert.equal(row.landedBasisUsd.total, null); assert.equal(row.profitLossUsd, null);
  assert.deepEqual(row.coveredUsd.quantity, exact(0)); assert.equal(row.coveredUsd.costUsd, null);
  const paid = evaluate(book(lot({ paymentCurrency: "USD", fees: null, fx: null }))).rows[0];
  assert.deepEqual(paid.usdBasisSources[0].missingInputs, ["fees"]); assert.equal(paid.usdCostComplete, false);
  const invalidDate = book(lot({ fx: fx("100000", "1999-12-31") }));
  assert.throws(() => evaluate(invalidDate));
});

test("legacy inventory stays valued but cannot inherit dated USD basis or fees from new purchases", () => {
  const legacy = [{ id: "old", name: "طلای ۱۸ عیار", unit: "گرم", amount: 2, costToman: 10000000, purchaseDate: "2000-01-01", note: "synthetic legacy" }];
  const result = evaluate(book(lot()), snapshot(), legacy); const row = result.rows[0];
  assert.deepEqual(row.quantity, exact(3)); assert.deepEqual(row.currentValueUsd, exact(180));
  assert.deepEqual(row.legacyIds, ["old"]); assert.equal(row.usdCostComplete, false); assert.equal(row.profitLossUsd, null);
  assert.deepEqual(row.landedBasisUsd.totalQuantity, exact(3)); assert.deepEqual(row.landedBasisUsd.coveredQuantity, exact(1));
  assert.deepEqual(row.coveredUsd.valueUsd, exact(60)); assert.deepEqual(row.coveredUsd.profitLossUsd, exact(-40));
  assert.equal(result.totals.landedCostUsd, null); assert.equal(result.totals.profitLossUsd, null);
  assert.equal(result.totals.legacyHoldingCount, 1); assert.deepEqual(row.usdBasisSources.map(item => item.lotId), ["synthetic-gold"]);
  const unknown = evaluate(emptyPurchaseBook(), snapshot(), [{ ...legacy[0], name: "unregistered synthetic asset" }]).rows[0];
  assert.equal(unknown.quoteState, "unsupported_asset"); assert.equal(unknown.landedBasisUsd.total, null);
  assert.deepEqual(unknown.usdBasisSources, []); assert.equal(unknown.profitLossUsd, null);
});

test("unpriced assets retain known acquisition cost but are excluded from covered current USD P&L", () => {
  const result = evaluate(book(lot(), lot({ id: "silver", assetId: "SILVER_999_IRR", paymentCurrency: "USD", unitPrice: "20", fx: null })));
  assert.deepEqual(result.totals.knownLandedCostUsd, exact(120)); assert.deepEqual(result.totals.landedCostUsd, exact(120));
  assert.deepEqual(result.totals.knownCurrentValueUsd, exact(60)); assert.equal(result.totals.currentValueUsd, null);
  assert.equal(result.totals.profitLossUsd, null); assert.deepEqual(result.totals.coveredCostUsd, exact(100));
  assert.deepEqual(result.totals.coveredValueUsd, exact(60)); assert.deepEqual(result.totals.coveredProfitLossUsd, exact(-40));
  assert.equal(result.totals.usdCostCoveredLotCount, 1); assert.equal(result.totals.totalLotCount, 2);
  const silver = result.rows.find(row => row.assetId === "SILVER_999_IRR");
  assert.deepEqual(silver.landedBasisUsd.total, exact(20)); assert.equal(silver.coveredUsd.costUsd, null);
});

test("whole portfolio USD percent uses summed matching monetary basis, not mean asset returns or mixed units", () => {
  const input = book(lot(), lot({ id: "coin", assetId: "EMAMI_COIN_IRR", paymentCurrency: "USD", unitPrice: "200", fx: null }));
  const result = evaluate(input, snapshot({ "18ayar": "12000000", sekkeh: "100000", usd_sell: "200000" }));
  assert.deepEqual(result.rows.map(row => row.profitLossUsdPercent), [exact(-40), exact(150)]);
  assert.deepEqual(result.totals.landedCostUsd, exact(300)); assert.deepEqual(result.totals.currentValueUsd, exact(560));
  assert.deepEqual(result.totals.profitLossUsd, exact(260)); assert.deepEqual(result.totals.profitLossUsdPercent, exact(260, 3));
  assert.deepEqual(result.totals.coveredCostUsd, exact(300)); assert.deepEqual(result.totals.coveredValueUsd, exact(560));
  assert.deepEqual(result.totals.coveredProfitLossUsdPercent, exact(260, 3));
  assert.equal(result.totals.valuedAssetCount, 2); assert.equal(result.totals.usdCostCoveredLotCount, 2);
});

test("missing, stale or future current USD suppresses USD performance but not historical cost or Rial valuation", () => {
  for (const [quotes, state] of [
    [snapshot({ "18ayar": "12000000" }), "missing"],
    [snapshot(undefined, now - MARKET_TTL_MS - 1000), "stale"],
    [snapshot(undefined, now + 1000), "future"],
  ]) {
    const result = evaluate(book(lot()), quotes); const row = result.rows[0];
    assert.equal(result.usdConversion.quoteState, state); assert.equal(result.usdConversion.currentRialPerUsd, null);
    assert.deepEqual(row.currentValueRial, exact(120_000_000)); assert.deepEqual(row.landedBasisUsd.total, exact(100));
    assert.equal(row.currentValueUsd, null); assert.equal(row.profitLossUsd, null); assert.equal(row.coveredUsd.profitLossUsd, null);
    assert.equal(result.totals.knownCurrentValueUsd, null); assert.equal(result.totals.profitLossUsd, null);
    assert.deepEqual(result.totals.landedCostUsd, exact(100)); assert.equal(result.totals.usdCostCoveredLotCount, 0);
  }
  assert.deepEqual(evaluate(book(lot()), snapshot(undefined, now - MARKET_TTL_MS)).rows[0].profitLossUsd, exact(-40));
});

test("invalid snapshots and future receipt fail closed without erasing acquisition provenance", () => {
  const invalid = snapshot(); invalid.observations[0].purityPermille = 999;
  const result = evaluate(book(lot()), invalid);
  assert.equal(result.usdConversion.quoteState, "invalid_snapshot"); assert.equal(result.usdConversion.observation, null);
  assert.equal(result.rows[0].profitLossUsd, null); assert.deepEqual(result.rows[0].landedBasisUsd.total, exact(100));
  const future = snapshot(); future.receivedAt = new Date(now + 1).toISOString();
  future.observations.forEach(item => { item.receivedAt = future.receivedAt; });
  const waiting = evaluate(book(lot()), future);
  assert.equal(waiting.usdConversion.quoteState, "future"); assert.equal(waiting.totals.profitLossUsd, null);
  assert.deepEqual(evaluate(book(lot()), future, [], now + 1).totals.profitLossUsd, exact(-40));
});

test("zero and break-even USD costs keep exact signs and never divide by a zero cost", () => {
  const zero = evaluate(book(lot({ paymentCurrency: "USD", unitPrice: "0", fx: null })));
  assert.deepEqual(zero.rows[0].profitLossUsd, exact(60)); assert.equal(zero.rows[0].profitLossUsdPercent, null);
  assert.equal(zero.rows[0].coveredUsd.profitLossPercent, null); assert.equal(zero.totals.profitLossUsdPercent, null);
  assert.equal(zero.totals.coveredProfitLossUsdPercent, null);
  const equal = evaluate(book(lot({ paymentCurrency: "USD", unitPrice: "60", fx: null })));
  assert.deepEqual(equal.rows[0].profitLossUsd, exact(0)); assert.deepEqual(equal.rows[0].profitLossUsdPercent, exact(0));
});

test("huge and 12-decimal quantities preserve exact USD values without Number projection", () => {
  const huge = evaluate(book(lot({ quantity: "9007199254740993", paymentCurrency: "USD", unitPrice: "55", fx: null })));
  const quantity = 9007199254740993n;
  assert.deepEqual(huge.rows[0].currentValueUsd, exact(quantity * 60n));
  assert.deepEqual(huge.rows[0].landedBasisUsd.total, exact(quantity * 55n));
  assert.deepEqual(huge.rows[0].profitLossUsd, exact(quantity * 5n));
  assert.deepEqual(huge.rows[0].profitLossUsdPercent, exact(100, 11));
  const tiny = evaluate(book(lot({ quantity: "0.000000000001", paymentCurrency: "USD", unitPrice: "55", fx: null })));
  assert.deepEqual(tiny.rows[0].currentValueUsd, exact(3, 50_000_000_000));
  assert.deepEqual(tiny.rows[0].landedBasisUsd.total, exact(11, 200_000_000_000));
  assert.deepEqual(tiny.rows[0].profitLossUsd, exact(1, 200_000_000_000));
});

test("USD asset valuation stays in its own units and current FX changes never rewrite historical basis", () => {
  const input = book(lot({ assetId: "USD_IRR", quantity: "10", unitPrice: "100000" }));
  const first = evaluate(input); const changed = evaluate(input, snapshot({ "18ayar": "12000000", usd_sell: "300000" }));
  assert.deepEqual(first.rows[0].currentValueUsd, exact(10)); assert.deepEqual(changed.rows[0].currentValueUsd, exact(10));
  assert.deepEqual(first.rows[0].landedBasisUsd.total, exact(10)); assert.deepEqual(changed.rows[0].landedBasisUsd, first.rows[0].landedBasisUsd);
  assert.deepEqual(first.rows[0].profitLossUsd, exact(0)); assert.deepEqual(changed.rows[0].profitLossUsd, exact(0));
});

test("empty inputs stay unknown and returned historical/current provenance cannot mutate inputs", () => {
  const empty = evaluate(emptyPurchaseBook(), null);
  for (const key of ["knownLandedCostUsd", "landedCostUsd", "knownCurrentValueUsd", "currentValueUsd", "profitLossUsd", "coveredProfitLossUsd"]) assert.equal(empty.totals[key], null);
  assert.equal(empty.totals.usdCostCoveredLotCount, 0); assert.equal(empty.usdConversion.quoteState, "missing");
  const input = book(lot()); const quotes = snapshot(); const before = JSON.stringify({ input, quotes });
  const result = evaluate(input, quotes);
  result.rows[0].usdBasisSources[0].fx.source = "changed output only";
  result.usdConversion.observation.priceRial = "1";
  assert.equal(JSON.stringify({ input, quotes }), before);
});
