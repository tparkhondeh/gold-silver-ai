import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPrivatePortfolioHandlers, PrivatePortfolioAuthorizationError } from "../auth/private-portfolio.ts";
import { createPortfolioGet, createPortfolioPut } from "../app/api/portfolio/route.ts";
import { parsePortfolioSaveInput, MAX_PORTFOLIO_SAVE_BYTES } from "../app/portfolio-save-input.ts";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { decodePersonalBackup, personalBackup } from "../app/unified-portfolio-client.ts";
import { emptyPortfolioPreferences, PortfolioVersionConflictError, PurchaseBookConflictError } from "../data/postgres-portfolio-repository.ts";

const origin = "https://portfolio.invalid", now = Date.parse("2000-01-03T12:00:00.000Z");
const legacy = { id: "synthetic-legacy", name: "طلای ۱۸ عیار", amount: 1.25, unit: "گرم", costToman: null, purchaseDate: null, note: "legacy unchanged" };
const lot = { id: "synthetic-lot", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750, quantity: "9007199254740993.000000000001", purchaseDate: "2000-01-01", purchaseTime: "12:34", paymentCurrency: "TOMAN", unitPrice: "123456789012345678.123456789012", fees: "0", note: "exact synthetic", source: { kind: "xlsx", reference: "synthetic invoice" }, fx: { tomanPerUsd: "123.123456789012", rateDate: "2000-01-01", rateType: "synthetic manual", source: "synthetic source", receivedAt: "2000-01-02T00:00:00.000Z", validity: "user_entered_unverified" } };
const book = { ...emptyPurchaseBook(), lots: [lot], imports: [{ fileSha256: "a".repeat(64), importedAt: "2000-01-02T00:00:00.000Z", lotIds: [lot.id] }] };
const snapshot = () => ({ version: 3, holdings: [structuredClone(legacy)], preferences: { ...emptyPortfolioPreferences }, purchaseBook: structuredClone(book) });
const payload = (changes = {}) => ({ expectedVersion: 3, holdings: [structuredClone(legacy)], preferences: { ...emptyPortfolioPreferences }, purchaseBook: structuredClone(book), ...changes });
function request(path = "/api/portfolio", { method = "GET", body, headers = {}, signal, ...other } = {}) {
  const all = new Headers({ "sec-fetch-site": "same-origin", ...(method === "PUT" ? { origin, "content-type": "application/json", "x-asha-portfolio-request": "save", "x-asha-intent": "owner-action" } : {}) });
  for (const [key, value] of Object.entries(headers)) { if (value === null) all.delete(key); else all.set(key, value); }
  return new Request(new URL(path, origin), { method, headers: all, ...(body === undefined ? {} : { body }), signal, ...other });
}
const putRequest = (value = payload(), options = {}) => request("/api/portfolio", { method: "PUT", body: JSON.stringify(value), ...options });
function fixture({ initial = snapshot(), error, saveResult } = {}) {
  let stored = structuredClone(initial); const loads = [], saves = [];
  const repository = {
    async load(...args) { loads.push(args); if (error) throw error; return structuredClone(stored); },
    async save(...args) {
      saves.push(structuredClone(args)); if (error) throw error;
      const [version, holdings, preferences, purchaseBook] = args;
      if (version !== stored.version) throw new PortfolioVersionConflictError();
      stored = { version: version + 1, holdings, preferences, ...(purchaseBook === undefined ? stored.purchaseBook ? { purchaseBook: stored.purchaseBook } : {} : { purchaseBook }) };
      return structuredClone(saveResult ?? stored);
    },
  };
  return { handlers: createPrivatePortfolioHandlers({ origin, repository, clock: () => now }), repository, loads, saves, inspect: () => structuredClone(stored) };
}
async function failure(response, status, code) {
  assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("content-disposition"), null);
  const value = await response.json(); assert.equal(value.ok, false); if (code) assert.equal(value.code, code);
  assert.doesNotMatch(JSON.stringify(value), /RAW_SECRET|postgresql:\/\/|stack|SELECT .* FROM/); return value;
}

test("private factory requires explicit HTTPS origin and bound repository; it has no runtime or identity fallback", () => {
  const f = fixture();
  for (const options of [{}, { origin }, { origin, repository: {} }, { origin: "http://127.0.0.1:4174", repository: f.repository }, { origin: origin + "/", repository: f.repository }, { origin: "https://user:pass@portfolio.invalid", repository: f.repository }]) assert.throws(() => createPrivatePortfolioHandlers(options));
  const source = readFileSync(new URL("../auth/private-portfolio.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|resolveLocalPortfolioRepository|new Pool|DATABASE_URL|fetch\(|oai-authenticated/);
  assert.deepEqual(f.loads, []); assert.deepEqual(f.saves, []);
});

test("private get/put/export preserve exact purchase, dated FX, receipts and nullable legacy fields", async () => {
  const f = fixture(); const original = snapshot();
  const get = await f.handlers.get(request()); assert.equal(get.status, 200); assert.deepEqual((await get.json()).snapshot, original);
  const changed = payload(); changed.purchaseBook.lots[0].quantity = "9007199254740994.000000000001";
  const put = await f.handlers.put(putRequest(changed)); assert.equal(put.status, 200);
  const expected = { ...original, version: 4, purchaseBook: changed.purchaseBook };
  assert.deepEqual((await put.json()).snapshot, expected); assert.deepEqual(f.inspect(), expected);
  assert.deepEqual(f.saves[0], [3, changed.holdings, changed.preferences, changed.purchaseBook]);
  assert.ok(f.loads.every(args => args.length === 0));
  const attachment = await f.handlers.export(request("/api/portfolio/export")); assert.equal(attachment.status, 200);
  assert.equal(attachment.headers.get("content-disposition"), 'attachment; filename="asha-portfolio-backup.json"');
  const text = await attachment.text(); assert.equal(text, personalBackup(expected, new Date(now).toISOString())); assert.deepEqual(decodePersonalBackup(text), expected);
  for (const response of [get, put, attachment]) { assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("pragma"), "no-cache"); assert.equal(response.headers.get("x-content-type-options"), "nosniff"); }
});

test("caller body/header subject hints never reach the subject-bound repository", async () => {
  const f = fixture();
  const response = await f.handlers.put(putRequest(payload({ subjectId: "other-owner", owner: "local-owner-v1" }), { headers: { "x-owner-sub": "other-owner", "oai-authenticated-user-id": "other-owner" } }));
  assert.equal(response.status, 200); assert.equal(f.saves[0].length, 4); assert.equal(JSON.stringify(f.saves).includes("other-owner"), false); assert.equal(JSON.stringify(f.saves).includes("local-owner-v1"), false);
});

test("old-client book omission preserves it and truly absent books remain absent", async () => {
  const f = fixture(), omitted = payload(); delete omitted.purchaseBook;
  assert.equal((await f.handlers.put(putRequest(omitted))).status, 200); assert.equal(f.saves[0][3], undefined); assert.deepEqual(f.inspect().purchaseBook, book);
  const initial = snapshot(); delete initial.purchaseBook; const old = fixture({ initial });
  const response = await old.handlers.put(putRequest(omitted)); assert.equal(response.status, 200); assert.equal(Object.hasOwn((await response.json()).snapshot, "purchaseBook"), false);
});

test("wrong origins, paths, queries, methods and Host fail before a repository call", async () => {
  const f = fixture();
  for (const path of ["https://attacker.invalid/api/portfolio", "http://portfolio.invalid/api/portfolio", "/api/portfolio?owner=other", "/api/portfolio#fragment", "/api/portfolio/export", "/api/portfolio/", "/api/health"]) await failure(await f.handlers.get(request(path)), 403);
  await failure(await f.handlers.get(request(undefined, { headers: { host: "127.0.0.1:4174" } })), 403);
  await failure(await f.handlers.get(request(undefined, { method: "POST" })), 403);
  await failure(await f.handlers.export(request("/api/portfolio/export?filename=secret")), 403);
  await failure(await f.handlers.export(request("/api/portfolio")), 403);
  for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": null }, { origin: "https://attacker.invalid" }]) await failure(await f.handlers.export(request("/api/portfolio/export", { headers })), 403);
  assert.equal(f.loads.length, 0); assert.equal(f.saves.length, 0);
});

test("both private save intents and exact same-origin/browser context are required before body reading", async () => {
  const f = fixture();
  for (const changed of [{ origin: null }, { origin: "https://attacker.invalid" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": null }, { "x-asha-portfolio-request": null }, { "x-asha-intent": null }, { "x-asha-intent": "owner-login" }]) {
    const incoming = putRequest(payload(), { headers: changed }); await failure(await f.handlers.put(incoming), 403); assert.equal(incoming.bodyUsed, false);
  }
  for (const type of [null, "text/plain", "application/json-evil"]) await failure(await f.handlers.put(putRequest(payload(), { headers: { "content-type": type } })), 415);
  assert.equal(f.saves.length, 0);
});

test("shared private/local validation rejects the same malformed numeric, preference and purchase inputs", async () => {
  const f = fixture(); let localCalls = 0;
  const local = createPortfolioPut(async () => { localCalls++; throw Error("unexpected local storage"); }, { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" });
  const cases = [null, [], payload({ expectedVersion: -1 }), payload({ holdings: [legacy, legacy] }), payload({ holdings: [{ ...legacy, amount: 1e-13 }] }), payload({ holdings: [{ ...legacy, costToman: 1.005 }] }), payload({ preferences: { ...emptyPortfolioPreferences, shortTermMonths: "1.5" } }), payload({ purchaseBook: { ...book, lots: [{ ...lot, quantity: "1e2" }] } }), payload({ purchaseBook: null })];
  for (const value of cases) {
    const privateResponse = await f.handlers.put(putRequest(value));
    const localResponse = await local(new Request("http://127.0.0.1:4174/api/portfolio", { method: "PUT", headers: { "content-type": "application/json", origin: "http://127.0.0.1:4174", "sec-fetch-site": "same-origin", "x-asha-portfolio-request": "save" }, body: JSON.stringify(value) }));
    assert.equal(privateResponse.status, 422); assert.equal(localResponse.status, privateResponse.status); assert.deepEqual(await privateResponse.json(), await localResponse.json());
  }
  assert.equal(localCalls, 0); assert.equal(f.saves.length, 0);
});

test("explicit authorization failures stay401 for reads, writes and exports; raw errors stay sanitized503", async () => {
  for (const [error, status] of [[new PrivatePortfolioAuthorizationError(), 401], [Error("RAW_SECRET postgresql://sensitive"), 503], [Object.assign(Error("RAW_SECRET"), { name: "PrivatePortfolioAuthorizationError" }), 503]]) {
    const f = fixture({ error });
    await failure(await f.handlers.get(request()), status); await failure(await f.handlers.put(putRequest()), status); await failure(await f.handlers.export(request("/api/portfolio/export")), status);
  }
});

test("version or preservation conflicts remain409 and malformed repository results never report success", async () => {
  for (const [error, code] of [[new PortfolioVersionConflictError(), "version_conflict"], [new PurchaseBookConflictError(), "purchase_book_conflict"]]) await failure(await fixture({ error }).handlers.put(putRequest()), 409, code);
  for (const saveResult of [{}, { ...snapshot(), version: -1 }, { ...snapshot(), debug: "RAW_SECRET" }]) await failure(await fixture({ saveResult }).handlers.put(putRequest()), 503);
  for (const initial of [{}, { ...snapshot(), debug: "RAW_SECRET" }, { ...snapshot(), preferences: { ...emptyPortfolioPreferences, debug: "RAW_SECRET" } }, { ...snapshot(), holdings: [{ ...legacy, debug: "RAW_SECRET" }] }]) await failure(await fixture({ initial }).handlers.get(request()), 503);
});

test("byte limit is checked before reading advertised oversize and while streaming unadvertised bytes", async () => {
  const f = fixture(), declared = putRequest(payload(), { headers: { "content-length": String(MAX_PORTFOLIO_SAVE_BYTES + 1) } });
  await failure(await f.handlers.put(declared), 413); assert.equal(declared.bodyUsed, false);
  for (const body of [" ".repeat(MAX_PORTFOLIO_SAVE_BYTES + 1), new TextEncoder().encode("😀".repeat(MAX_PORTFOLIO_SAVE_BYTES / 4 + 1))]) await failure(await f.handlers.put(request(undefined, { method: "PUT", body })), 413);
  const text = JSON.stringify(payload()), exact = text + " ".repeat(MAX_PORTFOLIO_SAVE_BYTES - new TextEncoder().encode(text).length);
  assert.equal((await f.handlers.put(request(undefined, { method: "PUT", body: exact }))).status, 200); assert.equal(f.saves.length, 1);
});

test("malformed UTF8/JSON and aborted input have no repository side effects", async () => {
  const f = fixture();
  for (const body of ["{", new Uint8Array([0xc3, 0x28])]) await failure(await f.handlers.put(request(undefined, { method: "PUT", body })), 400);
  const controller = new AbortController(); controller.abort();
  await failure(await f.handlers.put(putRequest(payload(), { signal: controller.signal })), 400);
  assert.equal(f.saves.length, 0); assert.equal(f.loads.length, 0);
});

test("bounded deadline and empty-chunk limit do not await a stalled cancellation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); let cancelled = 0, settled = false;
  const stalled = new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } });
  const pending = f.handlers.put(request(undefined, { method: "PUT", body: stalled, duplex: "half" })); pending.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(4999); await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  t.mock.timers.tick(1); await failure(await pending, 400); assert.equal(cancelled, 1);
  let pulls = 0; const empty = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array()); }, cancel() { return new Promise(() => {}); } });
  await failure(await f.handlers.put(request(undefined, { method: "PUT", body: empty, duplex: "half" })), 400); assert.ok(pulls <= 4097); assert.equal(f.saves.length, 0);
});

test("authorization revoked during body upload is rejected by the bound repository before writing", async () => {
  let authorized = true, writes = 0, controller;
  const repository = { async load() { throw Error("unused"); }, async save() { if (!authorized) throw new PrivatePortfolioAuthorizationError(); writes++; return snapshot(); } };
  const handlers = createPrivatePortfolioHandlers({ origin, repository });
  const body = new ReadableStream({ start(value) { controller = value; } });
  const pending = handlers.put(request(undefined, { method: "PUT", body, duplex: "half" }));
  authorized = false; controller.enqueue(new TextEncoder().encode(JSON.stringify(payload()))); controller.close();
  await failure(await pending, 401); assert.equal(writes, 0);
});

test("local GET still resolves only fixed local-owner-v1 and private factory never changes local boundaries", async () => {
  const subjects = []; const local = createPortfolioGet(async () => ({ available: true, repository: { async load(subject) { subjects.push(subject); return snapshot(); } } }), { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" });
  assert.equal((await local(new Request("http://127.0.0.1:4174/api/portfolio"))).status, 200);
  assert.equal((await local(request())).status, 403); assert.deepEqual(subjects, ["local-owner-v1"]);
  const parsed = parsePortfolioSaveInput(JSON.stringify(payload())); assert.deepEqual(parsed.purchaseBook, book); assert.equal(Object.hasOwn(parsed, "subject"), false);
});
