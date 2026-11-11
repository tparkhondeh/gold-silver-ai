import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalPortfolioAnalysis } from "../app/personal-portfolio-analysis.ts";
import { emptyPurchaseBook, purchaseAssetCatalog } from "../app/purchase-book.ts";
import { evaluatePersonalMarketValuation, personalRatioPercent, sumPersonalRatios } from "../app/personal-market-valuation.ts";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";

// Explicit synthetic fixtures exercise the actual personal-data contract in
// memory. They are never forwarded to synthetic decision engines or providers.
const time = "2000-01-03T12:00:00.000Z", now = Date.parse(time);
const exact = (n, d = 1) => ({ numerator: String(n), denominator: String(d) });
const fx = { tomanPerUsd: "10", rateDate: "2000-01-02", rateType: "synthetic", source: "synthetic fixture", receivedAt: time, validity: "user_entered_unverified" };
function lot({ assetId = "GOLD_18K_IRR", ...fields } = {}) {
  const asset = purchaseAssetCatalog.find(item => item.id === assetId);
  return { id: "synthetic-gold", assetId, assetClass: asset.assetClass, unit: asset.unit, purityPermille: asset.purityPermille,
    quantity: "3", purchaseDate: "2000-01-02", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "7", fees: "0.5",
    note: "synthetic personal analysis fixture", source: { kind: "manual", reference: null }, fx: { ...fx }, ...fields };
}
function input() {
  return { version: 7, holdings: [], purchaseBook: { ...emptyPurchaseBook(), lots: [lot(), lot({ id: "synthetic-usd", assetId: "USD_IRR", quantity: "10", paymentCurrency: "USD", unitPrice: "0.1", fees: "0" })] },
    preferences: { liquidityReservePercent: "10", maxSingleAssetPercent: "60", maxAcceptableDrawdownPercent: "20", shortTermMonths: "3", longTermYears: "5", analysisHorizon: "short", decisionHorizon: "long" } };
}
function quotes(at = now, gold = "1000000") {
  return makeNavasanSnapshot({ "18ayar": { value: gold, timestamp: at / 1000 }, usd_sell: { value: "200000", timestamp: at / 1000 } }, "TOMAN", new Date(at).toISOString());
}
function analyze(snapshot = input(), market = quotes(), at = now) {
  const result = buildPersonalPortfolioAnalysis(snapshot, market, at);
  assert.equal(result.state, "descriptive_only"); return result;
}

test("same saved data uses exact valuation, costs and a single unavailable budget without mutation", () => {
  const snapshot = input(), market = quotes(), before = structuredClone({ snapshot, market });
  const result = analyze(snapshot, market);
  assert.deepEqual(result.valuation, evaluatePersonalMarketValuation(snapshot.purchaseBook, snapshot.holdings, market, now));
  assert.deepEqual(result.valuation.totals.currentValueRial, exact(50000000));
  assert.deepEqual(result.valuation.totals.landedCostRial, exact(315));
  assert.deepEqual(result.assets.map(row => row.holdingsSharePercent), [exact(60), exact(40)]);
  assert.deepEqual(sumPersonalRatios(result.assets.map(row => row.holdingsSharePercent)), exact(100));
  assert.deepEqual(result.assets.map(row => row.savedLimitComparison), ["within_saved_limit", "within_saved_limit"]);
  assert.equal(result.source.portfolioVersion, 7); assert.equal(result.source.evaluatedAt, time);
  assert.deepEqual(result.budget, { id: "shared_unavailable_budget", state: "unavailable", cashRial: null, spendableRial: null, prospectiveTradingCostRial: null, proposedSpendRial: exact(0), orders: [] });
  assert.ok(result.horizons.every(horizon => horizon.state === "no_decision" && horizon.budgetReference === result.budget.id));
  assert.equal(result.financialUseAllowed, false); assert.equal(result.executionAllowed, false);
  assert.deepEqual({ snapshot, market }, before);
  result.valuation.rows[0].quantity.numerator = "tampered";
  assert.deepEqual({ snapshot, market }, before);
});

test("legacy amounts and multiple purchases are conserved once, with fee-incomplete legacy basis visible", () => {
  const snapshot = input();
  snapshot.holdings.push({ id: "synthetic-opening", name: "طلای ۱۸ عیار", amount: 2, unit: "گرم", costToman: 8, purchaseDate: null, note: "synthetic opening balance" });
  snapshot.purchaseBook.lots.push(lot({ id: "synthetic-extra", quantity: "0.25", unitPrice: "8", fees: "0.125" }));
  const before = structuredClone(snapshot), result = analyze(snapshot);
  assert.equal(result.valuation.rows.length, 2);
  assert.deepEqual(result.valuation.rows[0].quantity, exact(21, 4));
  assert.deepEqual(result.valuation.rows[0].currentValueRial, exact(52500000));
  assert.deepEqual(result.valuation.totals.currentValueRial, exact(72500000));
  assert.deepEqual(result.valuation.rows[0].landedBasisRial.total, exact(945, 4));
  assert.equal(result.valuation.rows[0].profitLossRial, null);
  assert.deepEqual(result.valuation.rows[0].legacyIds, ["synthetic-opening"]);
  assert.deepEqual(result.valuation.rows[0].lotIds, ["synthetic-gold", "synthetic-extra"]);
  assert.deepEqual(sumPersonalRatios(result.assets.map(row => row.holdingsSharePercent)), exact(100));
  assert.deepEqual(snapshot, before);
});

test("huge and 12-decimal amounts retain exact ratios and do not pass through numeric allocation math", () => {
  const snapshot = input();
  snapshot.purchaseBook.lots[0].quantity = "9007199254740993.000000000001";
  const result = analyze(snapshot);
  assert.deepEqual(result.valuation.rows[0].quantity, exact("9007199254740993000000000001", "1000000000000"));
  assert.deepEqual(result.valuation.rows[0].currentValueRial, exact("9007199254740993000000000001", "100000"));
  assert.deepEqual(sumPersonalRatios(result.assets.map(row => row.holdingsSharePercent)), exact(100));
  assert.equal(result.assets[0].savedLimitComparison, "above_saved_limit");
  assert.deepEqual(personalRatioPercent(exact(1), exact(3)), exact(100, 3));
  for (const denominator of [null, exact(0), exact(-1)]) assert.equal(personalRatioPercent(exact(1), denominator), null);
  assert.equal(personalRatioPercent(null, exact(3)), null);
});

test("unpriced holdings prevent renormalization and cash labels, USD assets or cost never become cash", () => {
  const snapshot = input();
  snapshot.holdings.push({ id: "synthetic-cash", name: "وجه نقد و سپرده بانکی", amount: 100000, unit: "تومان", costToman: 100000, purchaseDate: null, note: "synthetic unclassified cash/deposit" });
  const result = analyze(snapshot);
  assert.equal(result.valuation.totals.currentValueRial, null);
  assert.deepEqual(result.valuation.totals.knownCurrentValueRial, exact(50000000));
  assert.ok(result.assets.every(row => row.holdingsSharePercent === null && row.savedLimitComparison === "unavailable"));
  assert.equal(result.budget.cashRial, null); assert.equal(result.budget.spendableRial, null);
  assert.ok(result.horizons.every(horizon => horizon.missingInputs.includes("cash_not_recorded") && horizon.missingInputs.includes("incomplete_valuation")));
});

test("only validated saved maximum is compared; absent and malformed values are never defaults", () => {
  const snapshot = input(); snapshot.preferences.maxSingleAssetPercent = "";
  const missing = analyze(snapshot);
  assert.equal(missing.savedMaximumAssetPercent, null);
  assert.ok(missing.assets.every(row => row.savedLimitComparison === "unavailable"));
  assert.ok(missing.horizons[0].missingInputs.includes("owner_constraints_missing"));
  for (const value of ["NaN", "60.001", "101", "0x40", null]) {
    snapshot.preferences.maxSingleAssetPercent = value;
    assert.deepEqual(buildPersonalPortfolioAnalysis(snapshot, quotes(), now), { version: "asha.personal_portfolio_analysis.v2", financialUseAllowed: false, executionAllowed: false, state: "invalid_input" });
  }
  for (const value of ["59.99", "+59.990", "5.999e1", " 59.99 "]) {
    snapshot.preferences.maxSingleAssetPercent = value;
    const result = analyze(snapshot);
    assert.deepEqual(result.savedMaximumAssetPercent, exact(5999, 100));
    assert.equal(result.assets[0].savedLimitComparison, "above_saved_limit");
  }
});

test("invalid persisted identities, purchase contracts and clocks fail without numeric output", () => {
  const invalid = [null, {}, { ...input(), version: -1 }, { ...input(), preferences: null }];
  const duplicate = input(); duplicate.purchaseBook.lots.push(structuredClone(duplicate.purchaseBook.lots[0])); invalid.push(duplicate);
  const mismatched = input(); mismatched.purchaseBook.lots[0].purityPermille = 999; invalid.push(mismatched);
  const malformedHolding = input(); malformedHolding.holdings = [{ id: "x" }]; invalid.push(malformedHolding);
  for (const snapshot of invalid) {
    const result = buildPersonalPortfolioAnalysis(snapshot, quotes(), now);
    assert.equal(result.state, "invalid_input"); assert.equal(Object.hasOwn(result, "valuation"), false);
  }
  for (const at of [NaN, Infinity, Number.MAX_VALUE]) assert.equal(buildPersonalPortfolioAnalysis(input(), quotes(), at).state, "invalid_input");
});

test("invalid market snapshots preserve purchase analysis but cannot yield current values or shares", () => {
  const market = quotes(); market.observations[0].priceRial = "corrupted";
  const result = analyze(input(), market);
  assert.equal(result.valuation.snapshotState, "invalid");
  assert.deepEqual(result.valuation.totals.landedCostRial, exact(315));
  assert.ok(result.valuation.rows.every(row => row.quoteState === "invalid_snapshot" && row.currentValueRial === null));
  assert.ok(result.assets.every(row => row.holdingsSharePercent === null));
});

test("the same retained snapshot expires at TTL+1ms; costs and holdings survive while shares disappear", () => {
  const snapshot = input(), market = quotes();
  const fresh = analyze(snapshot, market, now + MARKET_TTL_MS);
  const stale = analyze(snapshot, market, now + MARKET_TTL_MS + 1);
  assert.deepEqual(fresh.assets[0].holdingsSharePercent, exact(60));
  assert.equal(stale.valuation.totals.currentValueRial, null);
  assert.ok(stale.assets.every(row => row.holdingsSharePercent === null));
  assert.deepEqual(stale.valuation.totals.landedCostRial, fresh.valuation.totals.landedCostRial);
  assert.deepEqual(stale.valuation.rows.map(row => row.quantity), fresh.valuation.rows.map(row => row.quantity));
  assert.ok(stale.horizons.every(horizon => horizon.missingInputs.includes("incomplete_valuation")));
  assert.notEqual(stale.source.evaluatedAt, fresh.source.evaluatedAt);
});

test("future publication and receipt block weights until their own boundary", () => {
  for (const kind of ["publication", "receipt"]) {
    const market = quotes();
    if (kind === "publication") market.observations[0].publishedAt = new Date(now + 1000).toISOString();
    else { market.receivedAt = new Date(now + 1000).toISOString(); market.observations.forEach(row => { row.receivedAt = market.receivedAt; }); }
    assert.equal(analyze(input(), market).assets[0].holdingsSharePercent, null);
    assert.deepEqual(analyze(input(), market, now + 1000).assets[0].holdingsSharePercent, exact(60));
  }
});

test("reload and price updates recompute from current version, purchases and saved preferences", () => {
  const snapshot = input(), prior = analyze(snapshot);
  const reloaded = structuredClone(snapshot); reloaded.version++;
  reloaded.purchaseBook.lots[0].quantity = "1"; reloaded.preferences.maxSingleAssetPercent = "40"; reloaded.preferences.shortTermMonths = "6";
  const result = analyze(reloaded, quotes(now + 5000, "2000000"), now + 5000);
  assert.equal(result.source.portfolioVersion, 8);
  assert.deepEqual(result.valuation.totals.currentValueRial, exact(40000000));
  assert.deepEqual(result.assets[0].holdingsSharePercent, exact(50));
  assert.equal(result.assets[0].savedLimitComparison, "above_saved_limit");
  assert.equal(result.horizons[0].savedDuration.value, "6");
  assert.deepEqual(prior.valuation.totals.currentValueRial, exact(50000000));
  assert.deepEqual(analyze(reloaded, null, now + 5000).assets.map(row => row.holdingsSharePercent), [null, null]);
});

test("per-purchase price, fee and historical currency gaps remain distinct from prospective trading costs", () => {
  const snapshot = input(); snapshot.purchaseBook.lots[0].fees = null; snapshot.purchaseBook.lots[0].fx = null;
  snapshot.purchaseBook.lots[1].unitPrice = null; snapshot.purchaseBook.lots[1].fx = null;
  const result = analyze(snapshot);
  assert.deepEqual(result.assets[0].purchaseInputs[0].missing, ["fees", "historical_fx_usd"]);
  assert.deepEqual(result.assets[1].purchaseInputs[0].missing, ["unit_price", "historical_fx_rial"]);
  assert.equal(result.valuation.totals.landedCostRial, null);
  assert.deepEqual(result.valuation.totals.currentValueRial, exact(50000000));
  assert.equal(result.budget.prospectiveTradingCostRial, null);
  assert.ok(result.horizons.every(horizon => horizon.missingInputs.includes("trading_inputs_missing")));
});

test("saved short months never relabel saved long years as medium months", () => {
  const snapshot = input(); snapshot.preferences.shortTermMonths = "+03";
  const result = analyze(snapshot);
  assert.deepEqual(result.horizons[0].savedDuration, { value: "3", unit: "months" });
  assert.equal(result.horizons[1].savedDuration, null);
  assert.ok(result.horizons[1].missingInputs.includes("medium_horizon_missing"));
  assert.ok(!result.horizons[0].missingInputs.includes("medium_horizon_missing"));
  snapshot.preferences.shortTermMonths = "";
  const missing = analyze(snapshot);
  assert.ok(missing.horizons[0].missingInputs.includes("short_horizon_missing"));
  assert.ok(!missing.horizons[1].missingInputs.includes("short_horizon_missing"));
});

test("empty and legacy-only snapshots remain explicit, never complete-zero portfolios", () => {
  const empty = input(); empty.purchaseBook = emptyPurchaseBook();
  const result = analyze(empty);
  assert.deepEqual(result.assets, []); assert.equal(result.valuation.totals.currentValueRial, null);
  assert.ok(result.horizons[0].missingInputs.includes("empty_holdings"));
  delete empty.purchaseBook;
  empty.holdings.push({ id: "synthetic-old", name: "طلای ۱۸ عیار", unit: "گرم", amount: 1, costToman: null, purchaseDate: null, note: "synthetic old snapshot" });
  const legacy = analyze(empty);
  assert.deepEqual(legacy.assets[0].holdingsSharePercent, exact(100));
  assert.equal(legacy.valuation.totals.landedCostRial, null);
  assert.deepEqual(legacy.assets[0].purchaseInputs, []);
});
