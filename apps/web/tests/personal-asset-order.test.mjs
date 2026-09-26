import assert from "node:assert/strict";
import test from "node:test";
import { orderPersonalAssetRows } from "../app/personal-asset-order.ts";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { evaluatePersonalMarketValuation } from "../app/personal-market-valuation.ts";

const ratio = (numerator, denominator = "1") => ({ numerator, denominator });
const row = (id, amount, extra = {}) => ({ id, name: id, landedBasisRial: { complete: true, total: amount }, currentValueRial: amount, profitLossRial: amount, ...extra });
const ids = rows => rows.map(value => value.id);

test("default order is a new presentation array and never mutates frozen rows or nested purchase IDs", () => {
  const rows = Object.freeze([Object.freeze(row("b", ratio("2"), { lotIds: Object.freeze(["lot-b", "lot-a"]) })), Object.freeze(row("a", ratio("1")))]);
  for (const direction of ["asc", "desc"]) {
    const copy = orderPersonalAssetRows(rows, "original", direction);
    assert.notEqual(copy, rows); assert.deepEqual(copy, rows); assert.equal(copy[0], rows[0]);
  }
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "cost", "asc")), ["a", "b"]);
  assert.deepEqual(ids(rows), ["b", "a"]); assert.deepEqual(rows[0].lotIds, ["lot-b", "lot-a"]);
  assert.deepEqual(orderPersonalAssetRows([], "value", "desc"), []);
});

test("whole-asset cost compares exact fractions beyond Number precision, unknown stays last both ways", () => {
  const high = ratio("90071992547409930000000000001", "1000000000000"), low = ratio("90071992547409930000000000000", "1000000000000");
  assert.equal(Number(high.numerator) / Number(high.denominator), Number(low.numerator) / Number(low.denominator));
  const rows = [row("missing-1", null), row("high", high), row("low", low), row("missing-2", null)];
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "cost", "asc")), ["low", "high", "missing-1", "missing-2"]);
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "cost", "desc")), ["high", "low", "missing-1", "missing-2"]);
});

test("incomplete cost never sorts its covered subtotal as a complete whole-asset cost", () => {
  const rows = [row("partial", ratio("1"), { landedBasisRial: { complete: false, total: ratio("99999") } }), row("known", ratio("2")), row("unknown", null)];
  for (const direction of ["asc", "desc"]) assert.deepEqual(ids(orderPersonalAssetRows(rows, "cost", direction)), ["known", "partial", "unknown"]);
});

test("current value ordering uses whole Rial values, never quantity or USD fields; equivalent ratios keep stable ties", () => {
  const rows = [row("equal-first", ratio("6", "2"), { quantity: ratio("100"), currentValueUsd: ratio("99") }), row("low", ratio("2")), row("equal-second", ratio("3"), { quantity: ratio("1"), currentValueUsd: ratio("1") }), row("unpriced", null)];
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "value", "asc")), ["low", "equal-first", "equal-second", "unpriced"]);
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "value", "desc")), ["equal-first", "equal-second", "low", "unpriced"]);
});

test("signed P&L orders loss, zero and profit exactly while absent values and equal peers remain stable", () => {
  const rows = [row("unknown", null), row("positive", ratio("1", "1000000000000")), row("zero-first", ratio("0")), row("negative", ratio("-1", "1000000000000")), row("zero-second", ratio("0", "2"))];
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "profit", "asc")), ["negative", "zero-first", "zero-second", "positive", "unknown"]);
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "profit", "desc")), ["positive", "zero-first", "zero-second", "negative", "unknown"]);
  assert.deepEqual(ids(orderPersonalAssetRows(rows.filter(value => value.profitLossRial === null), "profit", "desc")), ["unknown"]);
});

test("Persian name ordering is locale-aware and equal names preserve source order in both directions", () => {
  const rows = [row("b-first", null, { name: "ب" }), row("a", null, { name: "ا" }), row("b-second", null, { name: "ب" })];
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "name", "asc")), ["a", "b-first", "b-second"]);
  assert.deepEqual(ids(orderPersonalAssetRows(rows, "name", "desc")), ["b-first", "b-second", "a"]);
});

test("actual valuation sorting preserves exact book, receipt lineage and all financial output", () => {
  const common = { assetClass: "gold", unit: "gram", purityPermille: 750, quantity: "1", purchaseDate: "2000-01-01", purchaseTime: null, fees: "0", note: "NONPRIVATE SORT FIXTURE", source: { kind: "xlsx", reference: null }, fx: null };
  const book = { ...emptyPurchaseBook(), lots: [
    { ...common, id: "gold", assetId: "GOLD_18K_IRR", paymentCurrency: "TOMAN", unitPrice: "2" },
    { ...common, id: "silver", assetId: "SILVER_999_IRR", assetClass: "silver", purityPermille: 999, paymentCurrency: "IRR", unitPrice: "3" },
  ], imports: [{ fileSha256: "a".repeat(64), importedAt: "2000-01-02T00:00:00.000Z", lotIds: ["gold", "silver"] }] };
  const before = JSON.stringify(book), valuation = evaluatePersonalMarketValuation(book, [], null, Date.parse("2000-01-03T00:00:00.000Z")), serialized = JSON.stringify(valuation);
  assert.deepEqual(orderPersonalAssetRows(valuation.rows, "cost", "asc").map(value => value.assetId), ["SILVER_999_IRR", "GOLD_18K_IRR"]);
  assert.deepEqual(orderPersonalAssetRows(valuation.rows, "cost", "desc").map(value => value.assetId), ["GOLD_18K_IRR", "SILVER_999_IRR"]);
  assert.equal(JSON.stringify(book), before); assert.equal(JSON.stringify(valuation), serialized);
  assert.deepEqual(evaluatePersonalMarketValuation(book, [], null, Date.parse("2000-01-03T00:00:00.000Z")), valuation);
});
