import assert from "node:assert/strict";
import test from "node:test";
import { createPortfolioGet, createPortfolioPut } from "../app/api/portfolio/route.ts";
import { decodePortfolioSnapshot } from "../app/portfolio-persistence.ts";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { emptyPortfolioPreferences, PostgresPortfolioRepository, PortfolioVersionConflictError, PurchaseBookConflictError } from "../data/postgres-portfolio-repository.ts";

const legacy = { id: "synthetic-legacy", name: "طلای ۱۸ عیار", amount: 2, unit: "گرم", costToman: null, purchaseDate: null, note: "Synthetic opening position" };
const lot = { id: "synthetic-lot-1", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750,
  quantity: "1.123456789012", purchaseDate: "2000-01-01", purchaseTime: "12:34", paymentCurrency: "TOMAN",
  unitPrice: "999999999999999999.123456789012", fees: "0.123456789012", note: "Synthetic purchase only",
  source: { kind: "xlsx", reference: "a".repeat(64) },
  fx: { tomanPerUsd: "123.123456789012", rateDate: "2000-01-01", rateType: "synthetic manual", source: "test fixture", receivedAt: "2000-01-02T00:00:00.000Z", validity: "user_entered_unverified" } };
const book = { ...emptyPurchaseBook(), lots: [lot], imports: [{ fileSha256: "a".repeat(64), importedAt: "2000-01-02T00:00:00.000Z", lotIds: [lot.id] }] };
const preferences = { ...emptyPortfolioPreferences };
const snapshot = { version: 2, holdings: [legacy], preferences, purchaseBook: book };
const enabled = { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" };
const request = (payload, headers = {}) => new Request("http://localhost:4174/api/portfolio", { method: "PUT", headers: {
  "content-type": "application/json", origin: "http://localhost:4174", "sec-fetch-site": "same-origin", "x-asha-portfolio-request": "save", ...headers,
}, body: JSON.stringify({ expectedVersion: 2, holdings: [legacy], preferences, ...payload }) });

// Synthetic transaction double: commits only after the complete callback succeeds.
// SQL/row security are additionally covered by the disposable PostgreSQL suite.
function storage(initial = snapshot) {
  let state = structuredClone(initial); let queries = []; let failPreferences = false;
  const runner = { async transaction(work) {
    const pending = structuredClone(state);
    const result = await work({ async query(sql, params = []) {
      queries.push(sql);
      if (sql.includes("set_config") || sql.startsWith("INSERT INTO user_portfolios")) return { rows: [] };
      if (sql.includes("SELECT id, version, purchase_book")) return { rows: [{ id: "portfolio-test", version: pending.version, purchase_book: pending.purchaseBook ?? null }] };
      if (sql.includes("SET version=version+1")) {
        if (params[1] !== pending.version) return { rows: [] };
        pending.version++;
        return { rows: [{ id: "portfolio-test", version: pending.version, purchase_book: pending.purchaseBook ?? null }] };
      }
      if (sql.startsWith("UPDATE user_portfolios SET purchase_book=")) { pending.purchaseBook = JSON.parse(params[1]); return { rows: [] }; }
      if (sql.startsWith("DELETE FROM portfolio_holdings")) { pending.holdings = []; return { rows: [] }; }
      if (sql.includes("INSERT INTO portfolio_holdings")) {
        pending.holdings.push({ id: params[0], name: params[2], amount: Number(params[3]), unit: params[4], costToman: params[5] === null ? null : Number(params[5]), purchaseDate: params[6], note: params[7] });
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO portfolio_preferences")) {
        if (failPreferences) throw Error("Synthetic late write failure");
        pending.preferences = { liquidityReservePercent: params[1] ?? "", maxSingleAssetPercent: params[2] ?? "", maxAcceptableDrawdownPercent: params[3] ?? "", shortTermMonths: params[4] ?? "", longTermYears: params[5] ?? "", analysisHorizon: params[6], decisionHorizon: params[7] };
        return { rows: [] };
      }
      if (sql.includes("FROM portfolio_holdings")) return { rows: pending.holdings.map(row => ({ id: row.id, asset_name: row.name, amount: row.amount.toString(), unit: row.unit, cost_toman: row.costToman?.toString() ?? null, purchase_date: row.purchaseDate, note: row.note })) };
      if (sql.includes("FROM portfolio_preferences")) return { rows: [{ liquidity_reserve_percent: pending.preferences.liquidityReservePercent || null, max_single_asset_percent: pending.preferences.maxSingleAssetPercent || null, max_acceptable_drawdown_percent: pending.preferences.maxAcceptableDrawdownPercent || null, short_term_months: pending.preferences.shortTermMonths ? Number(pending.preferences.shortTermMonths) : null, long_term_years: pending.preferences.longTermYears ? Number(pending.preferences.longTermYears) : null, analysis_horizon: pending.preferences.analysisHorizon, decision_horizon: pending.preferences.decisionHorizon }] };
      throw Error("Unexpected synthetic query");
    } });
    state = pending; return result;
  } };
  return { repository: new PostgresPortfolioRepository(runner), inspect: () => structuredClone(state), queries: () => queries,
    failLate: () => { failPreferences = true; }, clearQueries: () => { queries = []; } };
}

test("purchase snapshot keeps legacy opening positions separate and exact purchase/FX strings intact", () => {
  const decoded = decodePortfolioSnapshot(snapshot);
  assert.deepEqual(decoded, snapshot);
  decoded.purchaseBook.lots[0].quantity = "9";
  assert.equal(snapshot.purchaseBook.lots[0].quantity, "1.123456789012");
  const old = { version: 1, holdings: [legacy], preferences };
  assert.deepEqual(decodePortfolioSnapshot(old), old);
  for (const invalid of [null, {}, { ...book, version: "future" }, { ...book, lots: [{ ...lot, quantity: 1.5 }] }, { ...book, lots: [lot, lot] }]) {
    assert.throws(() => decodePortfolioSnapshot({ ...snapshot, purchaseBook: invalid }));
  }
  assert.equal(legacy.purchaseDate, null); assert.equal(legacy.costToman, null);
});

test("purchase API rejects malformed/duplicate books and boundary/size violations before storage resolution", async () => {
  let resolutions = 0;
  const put = createPortfolioPut(async () => { resolutions++; throw Error("Storage must not resolve"); }, enabled);
  for (const purchaseBook of [null, {}, { ...book, lots: [lot, lot] }, { ...book, lots: [{ ...lot, unit: "unit" }] }, { ...book, lots: [{ ...lot, quantity: "1e2" }] }, { ...book, imports: [...book.imports, ...book.imports] }]) {
    const response = await put(request({ purchaseBook }));
    assert.equal(response.status, 422); assert.equal((await response.json()).code, "invalid_purchase_book");
  }
  assert.equal((await put(request({ purchaseBook: book }, { origin: "https://example.com" }))).status, 403);
  assert.equal((await put(request({ purchaseBook: book }, { "x-asha-portfolio-request": "preview" }))).status, 403);
  assert.equal((await put(request({ padding: "x".repeat(2_097_152) }))).status, 413);
  assert.equal(resolutions, 0);
});

test("purchase save, old-client omission and GET round-trip one complete version without derived holdings", async () => {
  const db = storage({ version: 2, holdings: [legacy], preferences });
  const resolve = async () => ({ available: true, repository: db.repository });
  const put = createPortfolioPut(resolve, enabled);
  const accepted = await put(request({ purchaseBook: book }));
  assert.equal(accepted.status, 200);
  const saved = (await accepted.json()).snapshot;
  assert.deepEqual(saved, { ...snapshot, version: 3 });
  assert.deepEqual(db.inspect(), saved);
  db.clearQueries();
  const omitted = await put(request({ expectedVersion: 3, preferences: { ...preferences, liquidityReservePercent: "10" } }));
  assert.equal(omitted.status, 200);
  assert.deepEqual((await omitted.json()).snapshot.purchaseBook, book);
  assert.equal(db.queries().some(sql => sql.startsWith("UPDATE user_portfolios SET purchase_book=")), false);
  const get = createPortfolioGet(resolve, enabled);
  const response = await get(new Request("http://localhost:4174/api/portfolio"));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(decodePortfolioSnapshot((await response.json()).snapshot), db.inspect());
  assert.deepEqual(db.inspect().holdings, [legacy]);
});

test("purchase edits retain receipt identity; attempted clearing/receipt loss and stale saves roll back everything", async () => {
  const db = storage();
  const edited = { ...book, lots: [{ ...lot, quantity: "2.5", note: "Synthetic edit" }] };
  const next = await db.repository.save("synthetic", 2, [legacy], preferences, edited);
  assert.deepEqual(next.purchaseBook.imports, book.imports);
  const before = db.inspect();
  for (const candidate of [emptyPurchaseBook(), { ...edited, imports: [] }, { ...edited, imports: [{ ...book.imports[0], importedAt: "2000-01-03T00:00:00.000Z" }] }]) {
    await assert.rejects(db.repository.save("synthetic", 3, [], preferences, candidate), PurchaseBookConflictError);
    assert.deepEqual(db.inspect(), before);
  }
  await assert.rejects(db.repository.save("synthetic", 2, [], preferences, book), PortfolioVersionConflictError);
  assert.deepEqual(db.inspect(), before);
  const response = await createPortfolioPut(async () => ({ available: true, repository: db.repository }), enabled)(request({ expectedVersion: 3, purchaseBook: emptyPurchaseBook() }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, "purchase_book_conflict");
});

test("late preference failure rolls back book, import receipt, holdings and optimistic version", async () => {
  const db = storage(); db.failLate();
  const added = { ...lot, id: "synthetic-lot-2", quantity: "1", source: { kind: "manual", reference: null } };
  const next = { ...book, lots: [...book.lots, added] };
  await assert.rejects(db.repository.save("synthetic", 2, [], preferences, next), /Synthetic late/);
  assert.deepEqual(db.inspect(), snapshot);
  const response = await createPortfolioPut(async () => ({ available: true, repository: db.repository }), enabled)(request({ purchaseBook: next }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /Synthetic late|999999999/);
  assert.deepEqual(db.inspect(), snapshot);
});

test("an in-flight purchase save owns a validated clone, not subsequently edited caller objects", async () => {
  const db = storage();
  const candidate = structuredClone(book);
  candidate.lots[0].quantity = "3";
  const pending = db.repository.save("synthetic", 2, [legacy], preferences, candidate);
  candidate.lots[0].quantity = "99";
  candidate.imports[0].lotIds.length = 0;
  const saved = await pending;
  assert.equal(saved.purchaseBook.lots[0].quantity, "3");
  assert.deepEqual(saved.purchaseBook.imports, book.imports);
  saved.purchaseBook.lots[0].quantity = "111";
  assert.equal((await db.repository.load("synthetic")).purchaseBook.lots[0].quantity, "3");
});

test("invalid books fail before transaction access; corrupt stored books are never silently overwritten", async () => {
  let transactions = 0;
  const repository = new PostgresPortfolioRepository({ transaction: async () => { transactions++; throw Error("Unexpected transaction"); } });
  await assert.rejects(repository.save("synthetic", 0, [], preferences, { ...book, lots: [{ ...lot, quantity: "0" }] }));
  assert.equal(transactions, 0);
  const corrupt = { ...snapshot, purchaseBook: { ...book, version: "unrecognized" } };
  const db = storage(corrupt);
  await assert.rejects(db.repository.load("synthetic"));
  await assert.rejects(db.repository.save("synthetic", 2, [], preferences, book));
  assert.deepEqual(db.inspect(), corrupt);
});
