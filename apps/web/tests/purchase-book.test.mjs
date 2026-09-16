import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPurchaseDecimal, emptyPurchaseBook, evaluatePurchaseBook, purchaseAssetCatalog, upsertPurchaseLot, validatePurchaseBook, validatePurchaseLot, validPurchaseDate } from "../app/purchase-book.ts";

const exact = (numerator, denominator = "1") => ({ numerator: String(numerator), denominator: String(denominator) });
const fx = (tomanPerUsd, rateDate = "2000-01-01") => ({ tomanPerUsd, rateDate, rateType: "user stated sell", source: "[synthetic manual test]", receivedAt: "2000-01-03T00:00:00.000Z", validity: "user_entered_unverified" });
const lot = (overrides = {}) => ({ id: "synthetic-1", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750, quantity: "1", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "100", fees: "0", note: "[ساختگی]", source: { kind: "manual", reference: null }, fx: null, ...overrides });
const book = (...lots) => ({ ...emptyPurchaseBook(), lots });
const legacy = (overrides = {}) => ({ id: "legacy-1", name: "طلای ۱۸ عیار", amount: 2, unit: "گرم", costToman: 80, purchaseDate: null, note: "original", ...overrides });

test("weighted purchase and landed prices use exact quantity weights and explicit costs", () => {
  const input = book(lot({ quantity: "2", fees: "10" }), lot({ id: "synthetic-2", unitPrice: "200", fees: "20" }));
  const before = structuredClone(input); const result = evaluatePurchaseBook(input); const row = result.assets[0];
  assert.deepEqual(row.quantity, exact(3));
  assert.deepEqual(row.purchaseRial.total, exact(4000));
  assert.deepEqual(row.purchaseRial.average, exact(4000, 3));
  assert.deepEqual(row.landedRial.total, exact(4300));
  assert.deepEqual(row.landedRial.average, exact(4300, 3));
  assert.equal(row.holding.costToman, 430);
  assert.deepEqual(row.byPaymentCurrency.TOMAN.purchase.average, exact(400, 3));
  assert.deepEqual(input, before);
});

test("fractional quantities/prices preserve fractions of a rial without per-row truncation", () => {
  const result = evaluatePurchaseBook(book(lot({ quantity: "0.1", unitPrice: "0.2", fees: "0.01" }), lot({ id: "synthetic-2", quantity: "0.2", unitPrice: "0.1", fees: "0" })));
  const row = result.assets[0];
  assert.deepEqual(row.quantity, exact(3, 10));
  assert.deepEqual(row.purchaseRial.total, exact(2, 5));
  assert.deepEqual(row.landedRial.total, exact(1, 2));
  assert.deepEqual(row.purchaseRial.average, exact(4, 3));
  assert.deepEqual(row.landedRial.average, exact(5, 3));
  assert.equal(row.holding.amount, 0.3); assert.equal(row.holding.costToman, 0.05);
});

test("IRR and TOMAN normalize by exactly ten without merging distinct instruments", () => {
  const silver = purchaseAssetCatalog.find((asset) => asset.id === "SILVER_999_IRR");
  const silverLot = lot({ id: "silver", assetId: silver.id, assetClass: silver.assetClass, unit: silver.unit, purityPermille: silver.purityPermille });
  const result = evaluatePurchaseBook(book(lot({ paymentCurrency: "IRR", unitPrice: "1000" }), lot({ id: "toman" }), silverLot));
  assert.equal(result.assets.length, 2);
  assert.deepEqual(result.assets[0].purchaseRial.average, exact(1000));
  assert.deepEqual(result.assets[0].byPaymentCurrency.IRR.purchase.total, exact(1000));
  assert.deepEqual(result.assets[0].byPaymentCurrency.TOMAN.purchase.total, exact(100));
  assert.equal(result.holdings[0].amount, 2);
});

test("USD equivalent converts each dated landed amount before summing, never average FX", () => {
  const result = evaluatePurchaseBook(book(lot({ quantity: "2", unitPrice: "100", fees: "20", fx: fx("10") }), lot({ id: "synthetic-2", purchaseDate: "2000-01-02", unitPrice: "200", fees: "40", fx: fx("20", "2000-01-02") })));
  const row = result.assets[0];
  assert.deepEqual(row.usd.total, exact(34)); // 220/10 + 240/20, not 460/15.
  assert.deepEqual(row.usd.average, exact(34, 3));
  assert.deepEqual(row.equivalentUsd.total, exact(34));
  assert.equal(row.paidUsd.total, null);
  assert.deepEqual(result.lots.map((item) => item.usdKind), ["historical_equivalent", "historical_equivalent"]);
});

test("actual USD payment is separately identified and needs no FX for its USD amount", () => {
  const result = evaluatePurchaseBook(book(lot({ paymentCurrency: "USD", quantity: "2", unitPrice: "5", fees: "1" })));
  const row = result.assets[0];
  assert.deepEqual(row.usd.total, exact(11)); assert.deepEqual(row.paidUsd.total, exact(11));
  assert.equal(row.equivalentUsd.total, null); assert.equal(row.landedRial.total, null);
  assert.equal(result.lots[0].usdKind, "actual_payment"); assert.equal(row.holding.costToman, null);
  const withFx = evaluatePurchaseBook(book(lot({ paymentCurrency: "USD", quantity: "2", unitPrice: "5", fees: "1", fx: fx("10") })));
  assert.deepEqual(withFx.assets[0].landedRial.total, exact(1100));
  assert.deepEqual(withFx.assets[0].usd.total, exact(11));
});

test("missing rates and missing fees expose their exact covered quantity without a full average", () => {
  const result = evaluatePurchaseBook(book(lot({ quantity: "2", fx: fx("10") }), lot({ id: "missing-fx" }), lot({ id: "missing-fees", quantity: "3", fees: null, fx: fx("10") })));
  const row = result.assets[0];
  assert.deepEqual(row.quantity, exact(6)); assert.equal(row.purchaseRial.complete, true);
  assert.deepEqual(row.landedRial.coveredQuantity, exact(3));
  assert.deepEqual(row.landedRial.total, exact(3000)); assert.equal(row.landedRial.average, null);
  assert.deepEqual(row.landedRial.averageCovered, exact(1000));
  assert.deepEqual(row.usd.coveredQuantity, exact(2)); assert.deepEqual(row.usd.total, exact(20));
  assert.equal(row.usd.average, null); assert.equal(row.holding.costToman, null);
});

test("unknown purchase price and unknown fees remain distinct from intentional zero", () => {
  const result = evaluatePurchaseBook(book(lot({ unitPrice: null, fees: "0" }), lot({ id: "zero", unitPrice: "0", fees: "0", fx: fx("10") })));
  assert.equal(result.lots[0].purchasePaid, null); assert.equal(result.lots[0].landedPaid, null);
  assert.deepEqual(result.lots[1].purchasePaid, exact(0)); assert.deepEqual(result.lots[1].landedUsd, exact(0));
  assert.deepEqual(result.assets[0].purchaseRial.total, exact(0));
  assert.deepEqual(result.assets[0].purchaseRial.coveredQuantity, exact(1));
  assert.equal(result.assets[0].purchaseRial.average, null);
});

test("legacy holdings contribute exactly once without invented date, price, fees or FX", () => {
  const old = [legacy(), legacy({ id: "legacy-2", amount: 1, costToman: 50, purchaseDate: "1999-01-01" })];
  const before = structuredClone(old); const result = evaluatePurchaseBook(book(lot({ fx: fx("10") })), old); const row = result.assets[0];
  assert.deepEqual(row.quantity, exact(4)); assert.deepEqual(row.legacyQuantity, exact(3));
  assert.equal(result.holdings.length, 1); assert.equal(row.holding.costToman, 230);
  assert.deepEqual(row.sourceLegacyIds, ["legacy-1", "legacy-2"]);
  assert.deepEqual(row.purchaseRial.coveredQuantity, exact(1)); assert.equal(row.purchaseRial.average, null);
  assert.equal(row.landedRial.average, null); assert.equal(row.usd.average, null);
  assert.deepEqual(old, before); assert.equal(result.lots.length, 1);
});

test("ambiguous legacy names or incompatible units stay separate and unchanged", () => {
  const old = [legacy({ name: "طلا", id: "unknown" }), legacy({ unit: "عدد", id: "wrong-unit" }), legacy({ name: "ارز خارجی", id: "unknown-currency" })];
  const result = evaluatePurchaseBook(book(lot()), old);
  assert.deepEqual(result.holdings.slice(0, 3), old); assert.deepEqual(result.assets[0].legacyQuantity, exact(0));
  assert.equal(result.holdings.length, 4);
});

test("legacy missing total cost prevents projected P&L but does not discard inventory", () => {
  const row = evaluatePurchaseBook(book(lot()), [legacy({ costToman: null })]).assets[0];
  assert.equal(row.holding.amount, 3); assert.equal(row.holding.costToman, null); assert.equal(row.legacyCostToman, null);
});

test("editing a lot replaces its quantity once while preserving other lots and receipt", () => {
  const input = book(lot(), lot({ id: "second", quantity: "2" }));
  input.imports = [{ fileSha256: "a".repeat(64), importedAt: "2000-01-01T00:00:00.000Z", lotIds: ["synthetic-1"] }];
  const next = upsertPurchaseLot(input, lot({ quantity: "3" }));
  assert.equal(next.lots.length, 2); assert.deepEqual(evaluatePurchaseBook(next).assets[0].quantity, exact(5));
  assert.deepEqual(next.imports, input.imports); assert.equal(input.lots[0].quantity, "1");
  assert.equal(upsertPurchaseLot(next, lot({ id: "third" })).lots.length, 3);
});

test("nonlossless quantities and total costs are explicit projection blockers, not rounded", () => {
  const large = evaluatePurchaseBook(book(lot({ quantity: "9007199254740993" })));
  assert.deepEqual(large.assets[0].quantity, exact("9007199254740993")); assert.equal(large.assets[0].holding, null);
  assert.equal(large.holdings.length, 0); assert.equal(large.projectionIssues.length, 1);
  const tinyCost = evaluatePurchaseBook(book(lot({ quantity: "0.001", unitPrice: "0.001" })));
  assert.deepEqual(tinyCost.assets[0].landedRial.total, exact(1, 100000));
  assert.equal(tinyCost.assets[0].holding.amount, 0.001); assert.equal(tinyCost.assets[0].holding.costToman, null);
  assert.equal(tinyCost.projectionIssues.length, 1);
});

test("representable decimal projection avoids double rounding numerator and denominator", () => {
  for (const quantity of ["9007.199254740997", "9007.199254741001", "9007.199254741003"]) {
    assert.equal(Number(quantity).toString(), quantity);
    const result = evaluatePurchaseBook(book(lot({ quantity, unitPrice: null, fees: null })));
    assert.equal(result.assets[0].holding.amount.toString(), quantity);
    assert.equal(result.holdings.length, 1); assert.deepEqual(result.projectionIssues, []);
  }
});

test("Gregorian date and manual same-date FX provenance fail closed", () => {
  assert.equal(validPurchaseDate("2000-02-29"), true); assert.equal(validPurchaseDate("1900-02-29"), false);
  for (const value of ["2026-02-30", "2026-13-01", "2026-1-01", "0000-01-01", "۱۴۰۵-۰۱-۰۱"]) assert.equal(validPurchaseDate(value), false);
  for (const change of [{ purchaseDate: "2000-02-30" }, { purchaseTime: "24:00" }, { fx: fx("0") }, { fx: fx("10", "1999-12-31") }, { fx: { ...fx("10"), validity: "verified" } }, { fx: { ...fx("10"), receivedAt: "2000-02-30T00:00:00.000Z" } }]) assert.throws(() => validatePurchaseLot(lot(change)));
  assert.equal(validatePurchaseLot(lot({ purchaseTime: "23:59", fx: fx("10") })).fx.validity, "user_entered_unverified");
});

test("decimal, unit, purity, identity and resource bounds reject malformed inputs", () => {
  assert.equal(canonicalPurchaseDecimal(" 1.2300 "), "1.23");
  for (const value of ["", "-1", "+1", "01", "1e3", "1,000", "1.0000000000001", "1000000000000000000", "NaN"]) assert.throws(() => canonicalPurchaseDecimal(value));
  for (const change of [{ quantity: "0" }, { quantity: "1.0" }, { unitPrice: 100 }, { fees: "-1" }, { unit: "unit" }, { purityPermille: 999 }, { assetClass: "silver" }, { assetId: "unknown" }, { source: { kind: "provider", reference: null } }, { extra: true }]) assert.throws(() => validatePurchaseLot(lot(change)));
  const coin = purchaseAssetCatalog.find((asset) => asset.id === "EMAMI_COIN_IRR");
  assert.throws(() => validatePurchaseLot(lot({ assetId: coin.id, assetClass: coin.assetClass, unit: coin.unit, purityPermille: coin.purityPermille, quantity: "0.5" })));
  assert.throws(() => validatePurchaseBook(book(...Array.from({ length: 501 }, (_, i) => lot({ id: `lot-${i}` })))));
  assert.throws(() => validatePurchaseBook({ ...emptyPurchaseBook(), version: "future" }));
});

test("book validation rejects duplicate purchases, forged receipts and unsafe ID collision", () => {
  assert.throws(() => validatePurchaseBook(book(lot(), lot())));
  const receipt = { fileSha256: "a".repeat(64), importedAt: "2000-01-01T00:00:00.000Z", lotIds: ["synthetic-1"] };
  const input = { ...book(lot()), imports: [receipt] };
  assert.deepEqual(validatePurchaseBook(input), input);
  for (const imports of [[receipt, receipt], [receipt, { ...receipt, fileSha256: "b".repeat(64) }], [{ ...receipt, fileSha256: "bad" }], [{ ...receipt, lotIds: ["missing"] }], [{ ...receipt, lotIds: ["synthetic-1", "synthetic-1"] }], [{ ...receipt, lotIds: [] }]]) assert.throws(() => validatePurchaseBook({ ...input, imports }));
  assert.throws(() => evaluatePurchaseBook(book(lot()), [legacy({ id: "purchase:GOLD_18K_IRR", name: "unknown" })]));
  assert.throws(() => evaluatePurchaseBook(emptyPurchaseBook(), [legacy(), legacy()]));
  assert.throws(() => evaluatePurchaseBook(emptyPurchaseBook(), [legacy({ amount: -1 })]));
});

test("JSONB-style object reordering validates to stable JSON without changing values or array order", () => {
  const input = book(
    lot({ id: "z-last-alphabetically", quantity: "9007.199254740997", unitPrice: "999999999999999999.123456789012", fees: "0.000000000001",
      source: { kind: "xlsx", reference: "فاکتور ساختگی؛ منشأ باید حفظ شود" }, fx: fx("123456789012345678.123456789012") }),
    lot({ id: "a-first-alphabetically", quantity: "0.000000000001", unitPrice: null, fees: null }),
    lot({ id: "m-middle-alphabetically", quantity: "1", unitPrice: "0", fees: "0" }),
  );
  input.imports = [
    { fileSha256: "b".repeat(64), importedAt: "2000-01-02T00:00:00.000Z", lotIds: [input.lots[0].id, input.lots[1].id] },
    { fileSha256: "a".repeat(64), importedAt: "2000-01-01T00:00:00.000Z", lotIds: [input.lots[2].id] },
  ];
  const reorderObjects = value => Array.isArray(value) ? value.map(reorderObjects) : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.length - right.length || left.localeCompare(right)).map(([key, child]) => [key, reorderObjects(child)])) : value;
  const shuffled = reorderObjects(input); const before = JSON.stringify(shuffled);
  assert.notEqual(before, JSON.stringify(input));
  const canonical = validatePurchaseBook(shuffled);
  assert.equal(JSON.stringify(canonical), JSON.stringify(input));
  assert.equal(JSON.stringify(validatePurchaseLot(shuffled.lots[0])), JSON.stringify(input.lots[0]));
  assert.equal(JSON.stringify(validatePurchaseBook(canonical)), JSON.stringify(canonical));
  assert.deepEqual(evaluatePurchaseBook(shuffled), evaluatePurchaseBook(input));
  assert.equal(JSON.stringify(shuffled), before);
  canonical.lots[0].fx.source = "changed clone";
  canonical.lots[0].source.reference = "changed clone";
  canonical.imports[0].lotIds.reverse();
  assert.equal(JSON.stringify(shuffled), before, "nested objects and receipt arrays are detached from the caller");
  assert.throws(() => validatePurchaseBook({ ...shuffled, unexpected: null }));
  assert.throws(() => validatePurchaseLot({ ...shuffled.lots[0], source: { ...shuffled.lots[0].source, unexpected: null } }));
});

test("empty book has no invented balances, averages, purchase history or market inputs", () => {
  const empty = evaluatePurchaseBook(emptyPurchaseBook());
  assert.deepEqual(empty.lots, []); assert.deepEqual(empty.assets, []); assert.deepEqual(empty.holdings, []); assert.deepEqual(empty.projectionIssues, []);
  for (const total of Object.values(empty.totals)) assert.deepEqual(total, { total: null, coveredLotCount: 0, totalLotCount: 0, legacyHoldingCount: 0, complete: false });
  const result = evaluatePurchaseBook(book(lot({ fx: fx("3") }), lot({ id: "second", fx: fx("7") })));
  assert.deepEqual(result.assets[0].usd.total, exact(1000, 21));
  assert.deepEqual(result.assets[0].usd.average, exact(500, 21));
  assert.equal(Object.hasOwn(result, "marketPrice"), false); assert.equal(Object.hasOwn(result, "decision"), false);
});

test("portfolio totals sum money only across heterogeneous instruments, with explicit row coverage", () => {
  const coin = purchaseAssetCatalog.find((asset) => asset.id === "EMAMI_COIN_IRR");
  const coinLot = lot({ id: "coin", assetId: coin.id, assetClass: coin.assetClass, unit: coin.unit, purityPermille: coin.purityPermille, paymentCurrency: "USD", unitPrice: "2" });
  const result = evaluatePurchaseBook(book(lot({ quantity: "3", fx: fx("10") }), coinLot));
  assert.deepEqual(result.totals.usd, { total: exact(32), coveredLotCount: 2, totalLotCount: 2, legacyHoldingCount: 0, complete: true });
  assert.deepEqual(result.totals.paidUsd.total, exact(2)); assert.deepEqual(result.totals.equivalentUsd.total, exact(30));
  assert.equal(result.totals.paidUsd.complete, false); assert.equal(result.totals.landedRial.complete, false);
  assert.equal(Object.hasOwn(result.totals.usd, "average"), false); assert.equal(Object.hasOwn(result.totals.usd, "quantity"), false);
  const old = evaluatePurchaseBook(book(lot({ fx: fx("10") })), [legacy({ name: "ارز خارجی" })]);
  assert.deepEqual(old.totals.usd, { total: exact(10), coveredLotCount: 1, totalLotCount: 1, legacyHoldingCount: 1, complete: false });
});

test("exact reduced arithmetic agrees with an independent direct-fraction oracle across 256 purchases", () => {
  const gcd = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };
  let expectedN = 0n, expectedD = 1n;
  const rows = Array.from({ length: 256 }, (_, index) => {
    const quantity = index + 1, price = index % 17 + 1, fees = index % 11, rate = index % 29 + 1;
    const n = BigInt(quantity * price + fees), d = BigInt(rate);
    expectedN = expectedN * d + n * expectedD; expectedD *= d;
    const common = gcd(expectedN, expectedD); expectedN /= common; expectedD /= common;
    return lot({ id: `oracle-${index}`, quantity: String(quantity), unitPrice: String(price), fees: String(fees), fx: fx(String(rate)) });
  });
  const result = evaluatePurchaseBook(book(...rows));
  assert.deepEqual(result.totals.usd.total, exact(expectedN, expectedD));
  assert.deepEqual(result.assets[0].usd.total, exact(expectedN, expectedD));
  assert.equal(result.totals.usd.complete, true);
});
