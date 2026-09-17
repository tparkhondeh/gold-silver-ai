import assert from "node:assert/strict";
import test from "node:test";
import { emptyPurchaseBook, purchaseAssetCatalog } from "../app/purchase-book.ts";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";
import { comparePersonalRatios, evaluatePersonalMarketValuation, sumPersonalRatios } from "../app/personal-market-valuation.ts";

// Synthetic contracts only. No provider, account, current price or real holding.
const now = Date.parse("2000-01-03T12:00:00.000Z");
const time = new Date(now).toISOString();
const exact = (numerator, denominator = "1") => ({ numerator: String(numerator), denominator: String(denominator) });
const fx = (tomanPerUsd) => ({ tomanPerUsd, rateDate: "2000-01-01", rateType: "synthetic manual", source: "synthetic input", receivedAt: time, validity: "user_entered_unverified" });
function lot(overrides = {}) {
  const asset = purchaseAssetCatalog.find((item) => item.id === (overrides.assetId ?? "GOLD_18K_IRR"));
  return { id: "synthetic-1", assetId: asset.id, assetClass: asset.assetClass, unit: asset.unit, purityPermille: asset.purityPermille,
    quantity: "1", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "9000000", fees: "0", note: "[ساختگی]", source: { kind: "manual", reference: null }, fx: null, ...overrides };
}
const book = (...lots) => ({ ...emptyPurchaseBook(), lots });
function snapshot(values = { "18ayar": "10000000", usd_sell: "100000" }) {
  return makeNavasanSnapshot(Object.fromEntries(Object.entries(values).map(([symbol, value]) => [symbol, { value, timestamp: now / 1000 }])), "TOMAN", time);
}
const legacy = (overrides = {}) => ({ id: "legacy-1", name: "طلای ۱۸ عیار", amount: 2, unit: "گرم", costToman: 100, purchaseDate: null, note: "synthetic legacy", ...overrides });

test("compatible multiple lots receive exact latest value, landed P&L and separate current USD", () => {
  const input = book(lot({ quantity: "2.5", unitPrice: "8000000", fees: "100000", fx: fx("90000") }), lot({ id: "second", quantity: "1.5", unitPrice: "10000000", fees: "0", fx: fx("95000") }));
  const before = JSON.stringify(input); const result = evaluatePersonalMarketValuation(input, [], snapshot(), now); const row = result.rows[0];
  assert.deepEqual(row.quantity, exact(4)); assert.deepEqual(row.currentValueRial, exact(400000000));
  assert.deepEqual(row.purchaseBasisRial.total, exact(350000000)); assert.deepEqual(row.landedBasisRial.total, exact(351000000));
  assert.deepEqual(row.profitLossRial, exact(49000000)); assert.deepEqual(row.profitLossPercent, exact(4900, 351));
  assert.deepEqual(row.currentValueUsd, exact(400)); assert.deepEqual(result.totals.currentValueUsd, exact(400));
  assert.deepEqual(result.totals.profitLossRial, row.profitLossRial); assert.equal(result.totals.costCoveredLotCount, 2);
  assert.deepEqual(result.totals.landedCostRial, exact(351000000)); assert.deepEqual(result.totals.knownLandedCostRial, exact(351000000));
  assert.equal(result.financialUseAllowed, false); assert.equal(JSON.stringify(input), before);
});

test("negative and zero profit are signed exact ratios; zero cost has no percent", () => {
  const negative = evaluatePersonalMarketValuation(book(lot({ unitPrice: "12000000" })), [], snapshot(), now).rows[0];
  assert.deepEqual(negative.profitLossRial, exact(-20000000)); assert.deepEqual(negative.profitLossPercent, exact(-50, 3));
  const equal = evaluatePersonalMarketValuation(book(lot({ unitPrice: "10000000" })), [], snapshot(), now).rows[0];
  assert.deepEqual(equal.profitLossRial, exact(0)); assert.deepEqual(equal.profitLossPercent, exact(0));
  const zero = evaluatePersonalMarketValuation(book(lot({ unitPrice: "0" })), [], snapshot(), now);
  assert.deepEqual(zero.rows[0].profitLossRial, exact(100000000)); assert.equal(zero.rows[0].profitLossPercent, null); assert.equal(zero.totals.profitLossPercent, null);
});

test("12-decimal and non-Number-projectable quantities retain exact current value", () => {
  const input = book(lot({ quantity: "0.000000000001", unitPrice: null, fees: null }));
  const tiny = evaluatePersonalMarketValuation(input, [], snapshot(), now);
  assert.deepEqual(tiny.rows[0].currentValueRial, exact(1, 10000));
  const large = evaluatePersonalMarketValuation(book(lot({ quantity: "9007199254740993", unitPrice: null, fees: null })), [], snapshot(), now);
  assert.deepEqual(large.rows[0].quantity, exact("9007199254740993"));
  assert.deepEqual(large.rows[0].currentValueRial, exact("900719925474099300000000"));
  assert.equal(large.totals.valuedAssetCount, 1);
});

test("lossless input Numbers do not permit floating-point multiplication of exact values", () => {
  const result = evaluatePersonalMarketValuation(book(lot({ quantity: "9007.199254740997", unitPrice: null })), [], snapshot({ "18ayar": "10000000.1" }), now);
  assert.deepEqual(result.rows[0].currentValueRial, exact("900719934481298954740997", "1000000000000"));
});

test("IRR provider denomination and thousand-toman coin scale are preserved exactly", () => {
  const iran = makeNavasanSnapshot({ "18ayar": { value: "100000000", timestamp: now / 1000 }, sekkeh: { value: "1000000", timestamp: now / 1000 } }, "IRR", time);
  const result = evaluatePersonalMarketValuation(book(lot(), lot({ id: "coin", assetId: "EMAMI_COIN_IRR", quantity: "2", unitPrice: "50000000" })), [], iran, now);
  assert.deepEqual(result.rows.find((row) => row.assetId === "GOLD_18K_IRR").currentValueRial, exact(100000000));
  assert.deepEqual(result.rows.find((row) => row.assetId === "EMAMI_COIN_IRR").currentValueRial, exact(2000000000));
  assert.deepEqual(result.totals.currentValueRial, exact(2100000000));
});

test("all five named coins and USD match only their own canonical instruments", () => {
  const input = book(...["EMAMI_COIN_IRR", "AZADI_COIN_IRR", "HALF_COIN_IRR", "QUARTER_COIN_IRR", "GRAM_COIN_IRR", "USD_IRR"].map((assetId, i) => lot({ id: `lot-${i}`, assetId, quantity: "2", unitPrice: null })));
  const quotes = snapshot({ sekkeh: "100000", bahar: "90000", nim: "50000", rob: "30000", gerami: "10000", usd_sell: "100000" });
  const result = evaluatePersonalMarketValuation(input, [], quotes, now);
  assert.deepEqual(result.rows.map((row) => row.currentValueRial), [exact(2000000000), exact(1800000000), exact(1000000000), exact(600000000), exact(200000000), exact(2000000)]);
  assert.deepEqual(result.rows.at(-1).currentValueUsd, exact(2));
});

test("mesghal unit bridge is blocked; 24k and physical silver remain missing", () => {
  const input = book(...["GOLD_24K_IRR", "MESGHAL_IRR", "SILVER_999_IRR", "SILVER_925_IRR"].map((assetId, i) => lot({ id: `lot-${i}`, assetId })));
  const result = evaluatePersonalMarketValuation(input, [], snapshot({ "18ayar": "10000000", abshodeh: "100000" }), now);
  assert.deepEqual(result.rows.map((row) => row.quoteState), ["missing", "unsupported_unit", "missing", "missing"]);
  assert.equal(result.totals.currentValueRial, null); assert.equal(result.totals.knownCurrentValueRial, null);
  assert.equal(result.rows[1].observation.providerSymbol, "abshodeh"); assert.equal(result.rows[1].recordedPriceRial, null);
});

test("current market coverage and whole cost coverage remain independent", () => {
  const input = book(lot({ quantity: "2" }), lot({ id: "unknown-fees", fees: null }), lot({ id: "unknown-price", unitPrice: null }), lot({ id: "usd-no-fx", paymentCurrency: "USD", unitPrice: "90" }));
  const result = evaluatePersonalMarketValuation(input, [], snapshot(), now); const row = result.rows[0];
  assert.deepEqual(row.currentValueRial, exact(500000000)); assert.equal(row.costComplete, false); assert.equal(row.profitLossRial, null);
  assert.deepEqual(row.covered.quantity, exact(2)); assert.deepEqual(row.covered.costRial, exact(180000000));
  assert.deepEqual(row.covered.valueRial, exact(200000000)); assert.deepEqual(row.covered.profitLossRial, exact(20000000));
  assert.equal(row.covered.lotCount, 1); assert.equal(result.totals.profitLossRial, null); assert.deepEqual(result.totals.coveredProfitLossRial, exact(20000000));
  assert.deepEqual(result.totals.knownLandedCostRial, exact(180000000)); assert.equal(result.totals.landedCostRial, null);
});

test("USD paid cost uses recorded purchase FX, never the fresh current USD quote", () => {
  const input = book(lot({ paymentCurrency: "USD", unitPrice: "100", fees: "1", fx: fx("90000") }));
  const result = evaluatePersonalMarketValuation(input, [], snapshot(), now).rows[0];
  assert.deepEqual(result.landedBasisRial.total, exact(90900000)); assert.deepEqual(result.profitLossRial, exact(9100000));
  assert.deepEqual(result.currentValueUsd, exact(100));
  const changedCurrentFx = evaluatePersonalMarketValuation(input, [], snapshot({ "18ayar": "10000000", usd_sell: "200000" }), now).rows[0];
  assert.deepEqual(changedCurrentFx.landedBasisRial, result.landedBasisRial); assert.deepEqual(changedCurrentFx.profitLossRial, result.profitLossRial);
  assert.deepEqual(changedCurrentFx.currentValueUsd, exact(50));
});

test("legacy quantities are included once, but legacy costs are not invented as fee-complete", () => {
  const original = [legacy()]; const before = structuredClone(original);
  const row = evaluatePersonalMarketValuation(book(lot()), original, snapshot(), now).rows[0];
  assert.deepEqual(row.quantity, exact(3)); assert.deepEqual(row.currentValueRial, exact(300000000));
  assert.deepEqual(row.legacyIds, ["legacy-1"]); assert.deepEqual(row.lotIds, ["synthetic-1"]);
  assert.deepEqual(row.legacyRecordedCostRial, exact(1000)); assert.equal(row.profitLossRial, null);
  assert.deepEqual(row.covered.quantity, exact(1)); assert.deepEqual(row.covered.profitLossRial, exact(10000000));
  assert.deepEqual(original, before);
});

test("registered legacy-only gold, coin and USD positions are valued without invented purchases", () => {
  const input = emptyPurchaseBook();
  const old = [legacy(), legacy({ id: "coin", name: "سکه امامی", amount: 3, unit: "عدد" }), legacy({ id: "dollars", name: "دلار آزاد", amount: 5, unit: "دلار" })];
  const before = structuredClone(old);
  const result = evaluatePersonalMarketValuation(input, old, snapshot({ "18ayar": "10000000", sekkeh: "100000", usd_sell: "100000" }), now);
  assert.deepEqual(result.rows.map((row) => row.assetId), ["GOLD_18K_IRR", "EMAMI_COIN_IRR", "USD_IRR"]);
  assert.deepEqual(result.rows.map((row) => row.currentValueRial), [exact(200000000), exact(3000000000), exact(5000000)]);
  assert.deepEqual(result.totals.currentValueRial, exact(3205000000));
  assert.equal(result.totals.totalLotCount, 0); assert.equal(result.totals.legacyHoldingCount, 3);
  for (const row of result.rows) { assert.deepEqual(row.lotIds, []); assert.equal(row.costComplete, false); assert.equal(row.profitLossRial, null); }
  assert.deepEqual(old, before); assert.deepEqual(input, emptyPurchaseBook());
});

test("fractional legacy whole coins stay visible but unvalued even if their sum is integral", () => {
  const quotes = snapshot({ sekkeh: "100000" });
  const first = legacy({ id: "coin-half-a", name: "سکه امامی", amount: 0.5, unit: "عدد" });
  for (const old of [[first], [first, { ...first, id: "coin-half-b" }]]) {
    const result = evaluatePersonalMarketValuation(emptyPurchaseBook(), old, quotes, now);
    assert.equal(result.rows[0].quoteState, "unsupported_quantity");
    assert.deepEqual(result.rows[0].quantity, old.length === 1 ? exact(1, 2) : exact(1));
    assert.equal(result.rows[0].currentValueRial, null); assert.equal(result.totals.currentValueRial, null);
  }
  assert.throws(() => evaluatePersonalMarketValuation(emptyPurchaseBook(), [first, first], quotes, now));
});

test("unknown legacy identities/units remain visible and prevent a false complete total", () => {
  const old = [legacy({ name: "طلا", id: "unknown-name" }), legacy({ name: "ارز خارجی", id: "generic-fx" }), legacy({ unit: "عدد", id: "wrong-unit", costToman: null })];
  const result = evaluatePersonalMarketValuation(book(lot()), old, snapshot(), now);
  assert.equal(result.rows.length, 4); assert.equal(result.totals.valuedAssetCount, 1); assert.equal(result.totals.totalAssetCount, 4);
  assert.deepEqual(result.rows.slice(1).map((row) => row.quoteState), ["unsupported_asset", "unsupported_asset", "unsupported_asset"]);
  assert.deepEqual(result.totals.knownCurrentValueRial, exact(100000000)); assert.equal(result.totals.currentValueRial, null);
  assert.equal(result.totals.currentValueUsd, null); assert.equal(result.totals.profitLossRial, null);
  assert.equal(result.totals.legacyHoldingCount, 3);
});

test("TTL is re-evaluated at every call and stale quotes cannot create current value or P&L", () => {
  const input = book(lot()); const quotes = snapshot();
  assert.equal(evaluatePersonalMarketValuation(input, [], quotes, now + MARKET_TTL_MS).rows[0].quoteState, "fresh");
  const stale = evaluatePersonalMarketValuation(input, [], quotes, now + MARKET_TTL_MS + 1).rows[0];
  assert.equal(stale.quoteState, "stale"); assert.deepEqual(stale.recordedPriceRial, exact(100000000));
  for (const key of ["currentValueRial", "currentValueUsd", "profitLossRial", "profitLossPercent"]) assert.equal(stale[key], null);
  assert.equal(stale.covered.profitLossRial, null);
});

test("future publication or receipt within transport tolerance still blocks current valuation", () => {
  for (const field of ["publishedAt", "receivedAt"]) {
    const quotes = snapshot();
    if (field === "receivedAt") { quotes.receivedAt = new Date(now + 1).toISOString(); for (const quote of quotes.observations) quote.receivedAt = quotes.receivedAt; }
    else quotes.observations[0].publishedAt = new Date(now + 1).toISOString();
    const row = evaluatePersonalMarketValuation(book(lot()), [], quotes, now).rows[0];
    assert.equal(row.quoteState, "future"); assert.equal(row.currentValueRial, null);
  }
});

test("missing/stale/future current USD never contaminates local value or historical basis", () => {
  const input = book(lot({ fx: fx("90000") }));
  for (const kind of ["missing", "stale", "future"]) {
    const quotes = snapshot();
    if (kind === "missing") quotes.observations = quotes.observations.filter((row) => row.instrumentCode !== "USD_IRR");
    else quotes.observations.find((row) => row.instrumentCode === "USD_IRR").publishedAt = new Date(now + (kind === "stale" ? -MARKET_TTL_MS - 1 : 1)).toISOString();
    const result = evaluatePersonalMarketValuation(input, [], quotes, now);
    assert.deepEqual(result.rows[0].currentValueRial, exact(100000000)); assert.equal(result.rows[0].currentValueUsd, null);
    assert.deepEqual(result.rows[0].landedBasisRial.total, exact(90000000)); assert.deepEqual(result.rows[0].profitLossRial, exact(10000000));
  }
});

test("one invalid snapshot observation fails closed for the whole portfolio", () => {
  for (const edit of [s => { s.observations[1].unit = "gram"; }, s => { s.observations[0].purityPermille = 999; }, s => { s.observations[0].priceRial = "1"; }, s => { s.datasetKind = "synthetic_test_positions"; }, s => { s.observations[0].source = "xaus"; }, s => { s.observations.push(s.observations[0]); }, s => { s.receivedAt = "bad"; }]) {
    const quotes = snapshot(); edit(quotes);
    const result = evaluatePersonalMarketValuation(book(lot()), [], quotes, now);
    assert.equal(result.snapshotState, "invalid"); assert.equal(result.rows[0].quoteState, "invalid_snapshot");
    assert.equal(result.rows[0].observation, null); assert.equal(result.totals.currentValueRial, null); assert.equal(result.totals.coveredProfitLossRial, null);
    assert.deepEqual(result.rows[0].landedBasisRial.total, exact(90000000)); assert.equal(result.issues.length, 1);
  }
});

test("empty/missing inputs are explicit, results deterministic and observation provenance detached", () => {
  const empty = evaluatePersonalMarketValuation(emptyPurchaseBook(), [], null, now);
  assert.deepEqual(empty.rows, []); assert.equal(empty.totals.currentValueRial, null); assert.equal(empty.totals.knownCurrentValueRial, null);
  assert.equal(empty.totals.totalAssetCount, 0); assert.equal(empty.totals.profitLossRial, null);
  const input = book(lot()); const missing = evaluatePersonalMarketValuation(input, [], null, now);
  assert.equal(missing.snapshotState, "missing"); assert.equal(missing.rows[0].quoteState, "missing");
  const quotes = snapshot(); const result = evaluatePersonalMarketValuation(input, [], quotes, now);
  assert.deepEqual(result, evaluatePersonalMarketValuation(input, [], quotes, now));
  result.rows[0].observation.rawValue = "changed returned copy";
  assert.equal(quotes.observations[0].rawValue, "10000000");
  for (const invalid of [NaN, Infinity, Number.MAX_VALUE]) assert.throws(() => evaluatePersonalMarketValuation(input, [], quotes, invalid));
  assert.throws(() => evaluatePersonalMarketValuation({ ...input, lots: [lot({ quantity: "0" })] }, [], quotes, now));
});

test("exact sorting distinguishes signed/tiny/large values and keeps unavailable values distinct", () => {
  assert.equal(comparePersonalRatios(null, null), 0); assert.equal(comparePersonalRatios(null, exact(0)), 1); assert.equal(comparePersonalRatios(exact(0), null), -1);
  assert.equal(comparePersonalRatios(exact(-1, 3), exact(-1, 2)), 1); assert.equal(comparePersonalRatios(exact(1, 3), exact(2, 6)), 0);
  assert.equal(comparePersonalRatios(exact(1, "1000000000000000000"), exact(0)), 1);
  assert.equal(comparePersonalRatios(exact("9007199254740993"), exact("9007199254740992")), 1);
  assert.equal(comparePersonalRatios(exact("9007199254740992"), exact("9007199254740993")), -1);
});

test("exact dashboard group sums require every value and preserve signed fractional arithmetic", () => {
  assert.equal(sumPersonalRatios([]), null); assert.equal(sumPersonalRatios([null]), null); assert.equal(sumPersonalRatios([exact(0), null]), null);
  assert.deepEqual(sumPersonalRatios([exact(1, 3), exact(2, 3)]), exact(1));
  assert.deepEqual(sumPersonalRatios([exact(-1, 3), exact(1, 3)]), exact(0));
  assert.deepEqual(sumPersonalRatios([exact("9007199254740993"), exact(1, 10)]), exact("90071992547409931", 10));
  const values = [exact(-1, 2), exact(1, 3)]; const before = structuredClone(values);
  assert.deepEqual(sumPersonalRatios(values), exact(-1, 6)); assert.deepEqual(values, before);
});
