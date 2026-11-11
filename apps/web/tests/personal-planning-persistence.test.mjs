import assert from "node:assert/strict";
import test from "node:test";
import { emptyPersonalPlanning } from "../app/personal-planning.ts";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { emptyPortfolioPreferences, PostgresPortfolioRepository, PortfolioVersionConflictError } from "../data/postgres-portfolio-repository.ts";
import { createPortfolioPut, createPortfolioGet } from "../app/api/portfolio/route.ts";
import { createPortfolioExport } from "../app/api/portfolio/export/route.ts";
import { createPrivatePortfolioHandlers } from "../auth/private-portfolio.ts";
import { decodePersonalBackup } from "../app/unified-portfolio-client.ts";

const planning = { ...emptyPersonalPlanning(), spendableCashToman: "9007199254740993.01", mediumTermMonths: 9 };
const preferences = { ...emptyPortfolioPreferences };
function fixture(initial = planning, rejectVersion = false) {
  let stored = initial === undefined ? undefined : structuredClone(initial);
  const calls = [];
  const runner = { async transaction(work) {
    return work({ async query(sql, parameters = []) {
      const text = sql.replace(/\s+/g, " ").trim(); calls.push({ sql: text, parameters });
      if (text.includes("RETURNING id, version")) return { rows: rejectVersion ? [] : [{ id: "synthetic-owner", version: 3, planning: stored }] };
      if (text.startsWith("SELECT id, version")) return { rows: [{ id: "synthetic-owner", version: 3, planning: stored }] };
      if (text.startsWith("UPDATE user_portfolios SET planning=")) stored = JSON.parse(parameters[1]);
      return { rows: [] };
    } });
  } };
  return { repository: new PostgresPortfolioRepository(runner), calls, inspect: () => structuredClone(stored) };
}

test("repository saves cash and duration under the existing version lock, reloads exact values and clones inputs", async () => {
  const f = fixture(); const next = structuredClone(planning);
  const pending = f.repository.save("synthetic-owner", 2, [], preferences, emptyPurchaseBook(), next);
  next.spendableCashToman = "0";
  const saved = await pending;
  assert.deepEqual(saved.planning, planning); assert.deepEqual(f.inspect(), planning);
  assert.deepEqual((await f.repository.load("synthetic-owner")).planning, planning);
  const parent = f.calls.findIndex(row => row.sql.includes("version=version+1"));
  assert.match(f.calls[parent].sql, /WHERE subject_id=\$1 AND version=\$2 RETURNING/);
  assert.deepEqual(f.calls[parent].parameters, ["synthetic-owner", 2]);
  assert.ok(f.calls.findIndex(row => row.sql.startsWith("UPDATE user_portfolios SET planning=")) > parent);
  assert.ok(f.calls.some(row => row.sql.includes("planning FROM user_portfolios") && row.sql.endsWith("FOR SHARE")));
});

test("old client or historical purchase save never clears or debits the independent cash declaration", async () => {
  const f = fixture();
  const book = { ...emptyPurchaseBook(), lots: [{ id: "synthetic-past", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750,
    quantity: "1", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "100", fees: "1", note: "Synthetic past purchase", source: { kind: "manual", reference: null }, fx: null }] };
  const saved = await f.repository.save("synthetic-owner", 2, [], preferences, book);
  assert.deepEqual(saved.planning, planning); assert.deepEqual(saved.purchaseBook, book);
  assert.equal(f.calls.some(row => row.sql.startsWith("UPDATE user_portfolios SET planning=")), false);
  const clear = emptyPersonalPlanning();
  assert.deepEqual((await f.repository.save("synthetic-owner", 2, [], preferences, undefined, clear)).planning, clear);
});

test("invalid and stale planning saves cannot touch data after failure", async () => {
  const invalid = fixture();
  await assert.rejects(invalid.repository.save("synthetic-owner", 2, [], preferences, undefined, { ...planning, spendableCashToman: "1e2" }));
  assert.equal(invalid.calls.length, 0);
  const stale = fixture(planning, true);
  await assert.rejects(stale.repository.save("synthetic-owner", 2, [], preferences, undefined, planning), PortfolioVersionConflictError);
  assert.equal(stale.calls.some(row => row.sql.startsWith("DELETE") || row.sql.startsWith("UPDATE user_portfolios SET planning=")), false);
});

function request(origin, path = "/api/portfolio", body) {
  return new Request(origin + path, { method: body === undefined ? "GET" : "PUT", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-asha-portfolio-request": "save", "x-asha-intent": "owner-action" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test("local and private save/get/export pass planning through the same validated snapshot", async () => {
  const initial = { version: 2, holdings: [], preferences, planning };
  const payload = { expectedVersion: 2, holdings: [], preferences, planning };
  const calls = [];
  const repository = { async load() { return structuredClone(initial); }, async save(...args) {
    calls.push(args); const offset = typeof args[0] === "string" ? 1 : 0;
    return { ...initial, version: args[offset] + 1, planning: args[offset + 4] ?? planning };
  } };
  const localOrigin = "http://127.0.0.1:4174", privateOrigin = "https://portfolio.invalid";
  const env = { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" };
  const resolver = async () => ({ available: true, repository });
  const get = createPortfolioGet(resolver, env), put = createPortfolioPut(resolver, env);
  const privateHandlers = createPrivatePortfolioHandlers({ origin: privateOrigin, repository, clock: () => 946857600000 });
  for (const [origin, write, read, backup] of [
    [localOrigin, put, get, createPortfolioExport(get, () => 946857600000)],
    [privateOrigin, privateHandlers.put, privateHandlers.get, privateHandlers.export],
  ]) {
    const saved = await write(request(origin, "/api/portfolio", payload)); assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).snapshot.planning, planning);
    const loaded = await read(request(origin)); assert.equal(loaded.status, 200);
    assert.deepEqual((await loaded.json()).snapshot.planning, planning);
    const exported = await backup(request(origin, "/api/portfolio/export")); assert.equal(exported.status, 200);
    assert.deepEqual(decodePersonalBackup(await exported.text()).planning, planning);
    const invalid = await write(request(origin, "/api/portfolio", { ...payload, planning: { ...planning, extra: "not allowed" } }));
    assert.equal(invalid.status, 422);
  }
  assert.deepEqual(calls.map(row => row.at(-1)), [planning, planning]);
});
