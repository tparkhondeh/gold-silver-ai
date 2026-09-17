import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPortfolioGet } from "../app/api/portfolio/route.ts";
import { createPortfolioExport } from "../app/api/portfolio/export/route.ts";
import { emptyPortfolioPreferences } from "../data/postgres-portfolio-repository.ts";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { decodePersonalBackup, personalBackup } from "../app/unified-portfolio-client.ts";

// Synthetic repository doubles only: no DB, actual portfolio or provider access.
const now = Date.parse("2000-01-03T12:00:00.000Z");
const snapshot = () => ({ version: 4, holdings: [{ id: "synthetic-legacy", name: "Synthetic legacy", amount: 1.25, unit: "test", costToman: null, purchaseDate: null, note: "preserved" }], preferences: { ...emptyPortfolioPreferences },
  purchaseBook: { ...emptyPurchaseBook(), lots: [{ id: "synthetic-large", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750,
    quantity: "9007199254740993.000000000001", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "123456789012345678.123456789012", fees: "0", note: "synthetic exact export",
    source: { kind: "manual", reference: null }, fx: null }] } });
const request = (url = "http://127.0.0.1:4174/api/portfolio/export", headers = {}, init = {}) => new Request(url, { headers: { "sec-fetch-site": "same-origin", ...headers }, ...init });
function harness({ value = snapshot(), environment = { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" }, resolution, loadError } = {}) {
  let resolutions = 0, reads = 0; const subjects = [];
  const repository = { async load(subject) { reads++; subjects.push(subject); if (loadError) throw loadError; return structuredClone(value); }, async save() { throw Error("Export must not write"); } };
  const get = createPortfolioGet(async () => { resolutions++; return resolution ?? { available: true, repository }; }, environment);
  return { export: createPortfolioExport(get, () => now), get reads() { return reads; }, get resolutions() { return resolutions; }, subjects };
}
async function failure(response, status) {
  assert.equal(response.status, status); assert.equal(response.headers.get("content-disposition"), null);
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { ok: false, code: "portfolio_export_unavailable", message: "پشتیبان قابل دریافت نیست؛ اطلاعات ذخیره‌شده تغییر نکرده است." });
}

test("attachment uses latest repository record and the unchanged exact personal-backup format", async () => {
  const h = harness(), response = await h.export(request()); const text = await response.text();
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-disposition"), 'attachment; filename="asha-portfolio-backup.json"');
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8"); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(text, personalBackup(snapshot(), new Date(now).toISOString())); assert.deepEqual(decodePersonalBackup(text), snapshot());
  assert.equal(h.reads, 1); assert.deepEqual(h.subjects, ["local-owner-v1"]);
  assert.doesNotMatch(text, /DATABASE_URL|NAVASAN|api_key/);
});

test("disabled/absent local capability and external host fail before repository resolution", async () => {
  for (const environment of [{}, { ASHA_LOCAL_PORTFOLIO_ENABLED: "false" }]) {
    const h = harness({ environment }); await failure(await h.export(request()), 403); assert.equal(h.resolutions, 0);
  }
  const h = harness(); await failure(await h.export(request("https://outside.invalid/api/portfolio/export")), 403);
  assert.equal(h.resolutions, 0); assert.equal(h.reads, 0);
});

test("only a same-origin bodyless GET with no reflected query or filename reaches storage", async () => {
  const h = harness();
  const inputs = [request(undefined, { "sec-fetch-site": "cross-site" }), request(undefined, { "sec-fetch-site": "none" }), new Request("http://127.0.0.1:4174/api/portfolio/export"),
    request(undefined, { origin: "https://outside.invalid" }), request("http://127.0.0.1:4174/api/portfolio/export?filename=secret.json"), request(undefined, {}, { method: "POST", body: "private draft" })];
  for (const input of inputs) await failure(await h.export(input), 403);
  assert.equal(h.resolutions, 0); assert.equal(h.reads, 0);
  assert.equal((await h.export(request(undefined, { origin: "http://127.0.0.1:4174", "x-filename": "ignored.json" }))).status, 200);
});

test("unavailable storage, thrown loads and private resolution reasons produce only sanitized failures", async () => {
  for (const options of [{ resolution: { available: false, reason: "postgresql://secret-or-provider-key" } }, { loadError: Error("private credential contents") }]) {
    const h = harness(options); await failure(await h.export(request()), 503);
  }
  await failure(await createPortfolioExport(async () => { throw Error("RAW_SECRET"); })(request()), 503);
});

test("missing or invalid records never become empty successful attachments", async () => {
  for (const value of [null, {}, { ...snapshot(), version: -1 }, { ...snapshot(), purchaseBook: { ...emptyPurchaseBook(), version: "wrong" } }]) {
    await failure(await harness({ value }).export(request()), 503);
  }
  for (const reply of [Response.json({ ok: false }), new Response("invalid JSON"), Response.json({ ok: true, snapshot: snapshot(), debug: "RAW_SECRET" })]) {
    await failure(await createPortfolioExport(async () => reply)(request()), 503);
  }
});

test("unexpected nested runtime fields are rejected rather than included in a backup", async () => {
  const mutations = [value => { value.runtimeKey = "RAW_SECRET"; }, value => { value.holdings[0].debug = "RAW_SECRET"; }, value => { value.preferences.database = "RAW_SECRET"; }];
  for (const mutate of mutations) { const value = snapshot(); mutate(value); await failure(await harness({ value }).export(request()), 503); }
});

test("empty and legacy-only confirmed snapshots preserve exact optional book semantics", async () => {
  const value = { version: 0, holdings: [], preferences: { ...emptyPortfolioPreferences } };
  const response = await harness({ value }).export(request());
  assert.equal(response.status, 200); const decoded = decodePersonalBackup(await response.text());
  assert.deepEqual(decoded, value); assert.equal(Object.hasOwn(decoded, "purchaseBook"), false);
});

test("invalid export clock and backups beyond the existing decoder size limit fail closed", async () => {
  await failure(await createPortfolioExport(async () => Response.json({ ok: true, snapshot: snapshot() }), () => NaN)(request()), 503);
  const value = snapshot();
  value.purchaseBook.lots = Array.from({ length: 500 }, (_, index) => ({ ...value.purchaseBook.lots[0], id: `synthetic-lot-${index}`, note: "😀".repeat(500) }));
  value.holdings = Array.from({ length: 500 }, (_, index) => ({ ...value.holdings[0], id: `synthetic-${index}`, name: "😀".repeat(60), note: "😀".repeat(500) }));
  // Each holding remains within the persisted field bounds. Pretty-printed
  // backup data over the existing 2 MiB import bound is never downloaded.
  value.holdings.forEach(holding => { holding.unit = "😀".repeat(30); });
  // Both independently bounded collections remain intact; export must not
  // truncate either to manufacture a backup that cannot be restored.
  assert.ok(new TextEncoder().encode(personalBackup(value, new Date(now).toISOString())).byteLength > 2 * 1024 * 1024);
  const result = await harness({ value }).export(request());
  await failure(result, 503);
});

test("saved-backup control is a fixed endpoint anchor while browser-only recovery retains its separate Blob", () => {
  const ui = readFileSync(new URL("../app/unified-portfolio-workspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /<a className="ghost-button" href=\{status === "saving" \? undefined : "\/api\/portfolio\/export"\} download="asha-portfolio-backup.json"/);
  assert.doesNotMatch(ui, /personalBackup\(|import \{ personalBackup/);
  assert.match(ui, /download\("asha-browser-recovery.json", browserDraft\)/);
});
