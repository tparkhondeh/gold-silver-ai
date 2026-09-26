/* eslint-disable react/prop-types -- JSX test doubles receive the production component's typed props. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as client from "../app/evaluation-client.ts";
import * as purchases from "../app/purchase-book.ts";
import * as market from "../app/personal-market-valuation.ts";
import * as assetOrder from "../app/personal-asset-order.ts";

const source = readFileSync(new URL("../app/evaluation-workspace.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const lot = (id, quantity, price, fees = "0") => ({ id, assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750, quantity, purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: price, fees, note: "NONPRIVATE TEST", source: { kind: "manual", reference: null }, fx: null });
const book = (...lots) => ({ ...purchases.emptyPurchaseBook(), lots });
function PurchaseBookPanel() { return null; }
function PurchaseRatio({ value }) { return React.createElement("span", {}, value === null ? "نامشخص" : `${value.numerator}/${value.denominator}`); }
function load(react, window, browser = { URL, Blob }) {
  const exports = {}, evaluations = [];
  const dependencies = { react, "./purchase-book-panel": { PurchaseBookPanel, PurchaseRatio }, "./number-value": { NumberValue: ({ value }) => React.createElement("span", {}, value) }, "./purchase-book": purchases, "./personal-market-valuation": { evaluatePersonalMarketValuation: (...args) => { assert.deepEqual(args[1], []); assert.equal(args[2], null); const result = market.evaluatePersonalMarketValuation(...args); evaluations.push(result); return result; } }, "./evaluation-client": client, "./unified-portfolio.css": {}, "./evaluation.css": {} };
  dependencies["./personal-asset-order"] = assetOrder;
  new Function("require", "exports", "React", "window", "fetch", "URL", "Blob", compiled)(name => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; }, exports, React, window, () => assert.fail("evaluation must not fetch"), browser.URL, browser.Blob);
  return { component: exports.EvaluationWorkspace, evaluations };
}
function harness(initial = null, unavailable = false) {
  const values = new Map([["asha-purchase-book-v1", "PRIVATE-SENTINEL"]]);
  if (initial !== null) values.set(client.EVALUATION_STORAGE_KEY, initial);
  const calls = [], slots = [], timers = new Map(), listeners = new Map(), effects = [], downloads = [], created = [], revoked = [], activeUrls = new Set(); let cursor = 0, nextTimer = 0, writeFailure = false, unmounted = false, downloadFailure = null;
  const failAt = stage => { if (downloadFailure === stage) throw Error("RAW-EXPORT-ERROR PRIVATE-CANARY"); };
  const browser = {
    Blob: class extends Blob { constructor(parts, options) { failAt("blob"); super(parts, options); } },
    URL: {
      createObjectURL(blob) { failAt("url"); const url = `blob:synthetic-evaluation-${created.length}`; created.push({ url, blob }); activeUrls.add(url); return url; },
      revokeObjectURL(url) { failAt("revoke"); revoked.push(url); activeUrls.delete(url); },
    },
  };
  const storage = {
    getItem(key) { assert.equal(key, client.EVALUATION_STORAGE_KEY); calls.push("read"); return values.get(key) ?? null; },
    setItem(key, value) { assert.equal(key, client.EVALUATION_STORAGE_KEY); calls.push("write"); if (writeFailure) throw Error("RAW-ERROR"); values.set(key, value); },
    removeItem(key) { assert.equal(key, client.EVALUATION_STORAGE_KEY); calls.push("remove"); values.delete(key); },
  };
  const window = {
    get sessionStorage() { if (unavailable) throw Error("RAW-ERROR"); return storage; },
    get localStorage() { return assert.fail("private browser storage read"); },
    setTimeout(callback, delay) { if (delay === 1000) failAt("timer"); const id = ++nextTimer; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { assert.equal(name, "storage"); listeners.set(name, callback); }, removeEventListener(name) { listeners.delete(name); },
    fetch() { assert.fail("evaluation must not fetch"); },
    document: { createElement(tag) { assert.equal(tag, "a"); failAt("anchor"); return { href: "", download: "", click() { failAt("click"); downloads.push({ href: this.href, filename: this.download }); } }; } },
  };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial }; return [slots[index].value, next => { assert.equal(unmounted, false); slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo(callback) { cursor++; return callback(); },
    useEffect(callback) { const index = cursor++; if (!(index in slots)) { slots[index] = {}; effects.push(() => { slots[index].cleanup = callback(); }); } },
  };
  const loaded = load(react, window, browser);
  const api = {
    values, calls, storage, evaluations: loaded.evaluations, downloads, created, revoked, activeUrls,
    render() { cursor = 0; const tree = loaded.component(); while (effects.length) effects.shift()(); return tree; },
    runTimers() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
    initialize() { api.render(); api.runTimers(); return api.render(); },
    timerDelays() { return [...timers.values()].map(timer => timer.delay); },
    failDownload(stage) { downloadFailure = stage; },
    failWrite(value = true) { writeFailure = value; },
    event(key, area = storage) { listeners.get("storage")?.({ key, storageArea: area }); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); unmounted = true; assert.equal(timers.size, 0); assert.equal(listeners.size, 0); },
  };
  return api;
}
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" && tree.props ? [tree, ...nodes(tree.props.children)] : []; }
const byId = (tree, id) => nodes(tree).find(node => node.props["data-testid"] === id);
const panel = tree => nodes(tree).find(node => node.type === PurchaseBookPanel);
const text = tree => typeof tree === "string" || typeof tree === "number" ? String(tree) : Array.isArray(tree) ? tree.map(text).join("") : tree?.props ? text(tree.props.children) : "";

test("SSR public route has honest banner/marker and no private/auth or market client dependency", () => {
  const { component } = load(React, new Proxy({}, { get() { assert.fail("SSR browser access"); } }));
  const html = renderToStaticMarkup(React.createElement(component));
  assert.match(html, /public-evaluation-workspace/); assert.match(html, /ارزیابی آزمایشی سبد/); assert.match(html, /فقط دادهٔ غیرخصوصی/);
  assert.match(html, /قیمت روز متصل نیست/); assert.match(html, /همین برگه/);
  assert.doesNotMatch(html, /\/auth\/|\/api\/portfolio|\/api\/managed-market|کلید عبور|ورود با گوگل/);
  assert.doesNotMatch(source, /fetch\(|OwnerWorkspace|UnifiedPortfolioWorkspace|access-client|managed-market-client|portfolio-persistence|localStorage/);
  assert.match(readFileSync(new URL("../app/evaluation/page.tsx", import.meta.url), "utf8"), /return <EvaluationWorkspace \/>/);
});
test("actual workspace mount and exact two-lot commit use only isolated tab storage and existing math", async () => {
  const ui = harness(); let tree = ui.initialize();
  assert.equal(panel(tree).props.busy, false); assert.deepEqual(panel(tree).props.legacyHoldings, []);
  const candidate = book(lot("a", "1", "100"), lot("b", "2", "250"));
  await panel(tree).props.onCommit(candidate); tree = ui.render();
  assert.deepEqual(panel(tree).props.book, candidate);
  const valuation = ui.evaluations.at(-1), row = valuation.rows[0];
  assert.deepEqual(row.quantity, { numerator: "3", denominator: "1" });
  assert.deepEqual(row.landedBasisRial.average, { numerator: "2000", denominator: "1" });
  assert.equal(valuation.totals.currentValueRial, null); assert.equal(valuation.totals.profitLossRial, null); assert.equal(valuation.financialUseAllowed, false);
  assert.equal(row.landedBasisUsd.complete, false); assert.equal(ui.values.get("asha-purchase-book-v1"), "PRIVATE-SENTINEL");
  assert.doesNotMatch(text(tree), /پوشش کامل/);
  assert.match(text(tree), /بهای دلاری همهٔ خریدها معلوم نیست/);
  const reloaded = harness(ui.values.get(client.EVALUATION_STORAGE_KEY)); assert.deepEqual(panel(reloaded.initialize()).props.book, candidate);
  ui.unmount(); reloaded.unmount();
});
test("invalid stored book never enters shared renderer and persists until explicit own-key reset", () => {
  const ui = harness('{"private":"unrecognized"}'); let tree = ui.initialize();
  assert.equal(panel(tree).props.busy, true); assert.deepEqual(panel(tree).props.book, purchases.emptyPurchaseBook());
  assert.equal(ui.values.get(client.EVALUATION_STORAGE_KEY), '{"private":"unrecognized"}');
  byId(tree, "evaluation-reset").props.onClick(); tree = ui.render();
  assert.equal(ui.calls.includes("remove"), false);
  byId(tree, "evaluation-reset-cancel").props.onClick(); tree = ui.render();
  assert.equal(ui.calls.includes("remove"), false);
  byId(tree, "evaluation-reset").props.onClick(); tree = ui.render(); byId(tree, "evaluation-reset-confirm").props.onClick(); tree = ui.render();
  assert.equal(ui.values.has(client.EVALUATION_STORAGE_KEY), false); assert.equal(panel(tree).props.busy, false); assert.equal(ui.values.get("asha-purchase-book-v1"), "PRIVATE-SENTINEL"); ui.unmount();
});
test("storage-unavailable fallback is deliberate memory-only, no private-key fallback or hidden write", async () => {
  const ui = harness(null, true); let tree = ui.initialize();
  assert.equal(panel(tree).props.busy, true); assert.doesNotMatch(text(tree), /RAW-ERROR/);
  byId(tree, "evaluation-memory").props.onClick(); tree = ui.render();
  assert.match(text(tree), /حالت فقط‌حافظه/); assert.equal(panel(tree).props.busy, false);
  await panel(tree).props.onCommit(book(lot("memory", "1", "4"))); tree = ui.render();
  assert.equal(panel(tree).props.book.lots.length, 1); assert.deepEqual(ui.calls, []); assert.equal(ui.values.size, 1); ui.unmount();
});
test("failed write preserves confirmed book and failed form path; memory fallback preserves old stored bytes", async () => {
  const original = { ...client.emptyEvaluationDocument(), book: book(lot("a", "1", "5")) }, raw = JSON.stringify(original);
  const ui = harness(raw); let tree = ui.initialize(); ui.failWrite();
  await assert.rejects(panel(tree).props.onCommit(book(lot("b", "2", "9"))), client.EvaluationStorageError); tree = ui.render();
  assert.deepEqual(panel(tree).props.book, original.book); assert.equal(panel(tree).props.busy, true); assert.equal(ui.values.get(client.EVALUATION_STORAGE_KEY), raw);
  byId(tree, "evaluation-memory").props.onClick(); tree = ui.render(); const count = ui.calls.length;
  await panel(tree).props.onCommit(book(lot("b", "2", "9"))); tree = ui.render();
  assert.equal(panel(tree).props.book.lots[0].id, "b"); assert.equal(ui.calls.length, count); assert.equal(ui.values.get(client.EVALUATION_STORAGE_KEY), raw); ui.unmount();
});
test("changed storage blocks publication/overwrite until deliberate read, unrelated events ignored", async () => {
  const ui = harness(); let tree = ui.initialize();
  ui.event("private-key"); assert.equal(panel(ui.render()).props.busy, false);
  ui.event(client.EVALUATION_STORAGE_KEY, {}); assert.equal(panel(ui.render()).props.busy, false);
  const external = JSON.stringify({ ...client.emptyEvaluationDocument(), revision: 4, book: book(lot("external", "2", "3")) });
  ui.values.set(client.EVALUATION_STORAGE_KEY, external);
  await assert.rejects(panel(tree).props.onCommit(book(lot("stale", "1", "1")))); tree = ui.render();
  assert.equal(ui.values.get(client.EVALUATION_STORAGE_KEY), external); assert.equal(panel(tree).props.book.lots.length, 0);
  byId(tree, "evaluation-reload").props.onClick(); tree = ui.render(); assert.equal(panel(tree).props.book.lots[0].id, "external");
  ui.event(null); assert.equal(panel(ui.render()).props.busy, true); ui.unmount();
});
test("tabs preserve shared editor identity and both decision horizons stay locked", async () => {
  const ui = harness(); let tree = ui.initialize(); const editorKey = panel(tree).key;
  for (const tab of ["purchases", "overview", "analysis", "storage"]) { byId(tree, `evaluation-tab-${tab}`).props.onClick(); tree = ui.render(); assert.equal(panel(tree).key, editorKey); }
  byId(tree, "evaluation-tab-analysis").props.onClick(); tree = ui.render();
  assert.equal((text(tree).match(/تصمیم‌ناپذیر/g) ?? []).length, 2);
  byId(tree, "evaluation-reset").props.onClick(); tree = ui.render(); assert.equal(panel(tree).props.busy, true);
  byId(tree, "evaluation-reset-confirm").props.onClick(); tree = ui.render(); assert.notEqual(panel(tree).key, editorKey); ui.unmount();
});

test("actual evaluation sort controls change only asset display and preserve tab storage, book lineage and editor identity", async () => {
  const candidate = book(lot("gold", "1", "500"), { ...lot("silver", "1", "100"), assetId: "SILVER_999_IRR", assetClass: "silver", purityPermille: 999 }, { ...lot("unknown", "1", null), assetId: "SILVER_925_IRR", assetClass: "silver", purityPermille: 925 });
  const ui = harness(); let tree = ui.initialize(); await panel(tree).props.onCommit(candidate); tree = ui.render();
  const rows = ui.evaluations.at(-1).rows, expected = ids => ids.map(id => `evaluation-asset-${rows.find(row => row.assetId === id).id}`);
  const displayed = () => nodes(ui.render()).filter(node => node.type === "article" && node.props["data-testid"]?.startsWith("evaluation-asset-")).map(node => node.props["data-testid"]);
  const initialOrder = displayed(), confirmed = panel(tree), bytes = ui.values.get(client.EVALUATION_STORAGE_KEY), calls = [...ui.calls];
  assert.equal(byId(tree, "evaluation-sort-direction").props.disabled, true);
  byId(tree, "evaluation-sort-field").props.onChange({ target: { value: "cost" } }); tree = ui.render();
  assert.deepEqual(displayed(), expected(["SILVER_999_IRR", "GOLD_18K_IRR", "SILVER_925_IRR"]));
  byId(tree, "evaluation-sort-direction").props.onChange({ target: { value: "desc" } }); tree = ui.render();
  assert.deepEqual(displayed(), expected(["GOLD_18K_IRR", "SILVER_999_IRR", "SILVER_925_IRR"]));
  byId(tree, "evaluation-tab-purchases").props.onClick(); tree = ui.render(); byId(tree, "evaluation-tab-overview").props.onClick(); tree = ui.render();
  assert.equal(byId(tree, "evaluation-sort-field").props.value, "cost"); assert.equal(byId(tree, "evaluation-sort-direction").props.value, "desc");
  for (const field of ["value", "profit", "original"]) { byId(tree, "evaluation-sort-field").props.onChange({ target: { value: field } }); tree = ui.render(); assert.deepEqual(displayed(), initialOrder); }
  assert.equal(panel(tree).key, confirmed.key); assert.equal(panel(tree).type, confirmed.type); assert.equal(panel(tree).props.book, confirmed.props.book);
  assert.equal(ui.values.get(client.EVALUATION_STORAGE_KEY), bytes); assert.deepEqual(ui.calls, calls); assert.deepEqual(panel(tree).props.book, candidate); ui.unmount();
});

test("actual download exports only the confirmed document with exact lots/FX/receipts, never a failed draft or private storage", async () => {
  const imported = { ...lot("registered-import", "0.123456789012", "9007199254740993.123456789012"), source: { kind: "xlsx", reference: "NONPRIVATE-INVOICE" },
    fx: { tomanPerUsd: "60000.125", rateDate: "2000-01-01", rateType: "manual", source: "NONPRIVATE TEST", receivedAt: "2000-01-02T00:00:00.000Z", validity: "user_entered_unverified" } };
  const candidate = { ...book(imported), imports: [{ fileSha256: "a".repeat(64), importedAt: "2000-01-02T00:00:00.000Z", lotIds: [imported.id] }] };
  const ui = harness(); let tree = ui.initialize(); await panel(tree).props.onCommit(candidate); tree = ui.render();
  const raw = ui.values.get(client.EVALUATION_STORAGE_KEY);
  ui.failWrite(); await assert.rejects(panel(tree).props.onCommit(book(lot("UNSAVED-DRAFT-CANARY", "9", "10")))); tree = ui.render();
  const calls = [...ui.calls], retained = panel(tree);
  assert.doesNotThrow(() => byId(tree, "evaluation-export").props.onClick());
  assert.deepEqual(ui.downloads, [{ href: "blob:synthetic-evaluation-0", filename: "asha-public-evaluation.json" }]);
  assert.equal(ui.created[0].blob.type, "application/json;charset=utf-8");
  const body = await ui.created[0].blob.text(); assert.equal(body, raw); assert.deepEqual(JSON.parse(body).book, candidate);
  assert.doesNotMatch(body, /UNSAVED-DRAFT-CANARY|PRIVATE-SENTINEL|PRIVATE-CANARY/);
  assert.deepEqual(ui.calls, calls); assert.equal(ui.values.get(client.EVALUATION_STORAGE_KEY), raw); assert.equal(ui.values.get("asha-purchase-book-v1"), "PRIVATE-SENTINEL");
  assert.equal(panel(ui.render()).props.book, retained.props.book); assert.equal(panel(ui.render()).key, retained.key);
  assert.equal(ui.revoked.length, 0); assert.deepEqual(ui.timerDelays(), [1000]); ui.runTimers();
  assert.deepEqual(ui.revoked, [ui.downloads[0].href]); assert.equal(ui.activeUrls.size, 0); ui.unmount();
});

test("download of explicitly memory-only registered records uses no storage or network", async () => {
  const ui = harness(null, true); let tree = ui.initialize(); byId(tree, "evaluation-memory").props.onClick(); tree = ui.render();
  const candidate = book(lot("memory-export", "2", "3")); await panel(tree).props.onCommit(candidate); tree = ui.render();
  byId(tree, "evaluation-export").props.onClick(); assert.deepEqual(JSON.parse(await ui.created[0].blob.text()).book, candidate);
  assert.deepEqual(ui.calls, []); assert.equal(ui.values.size, 1); ui.runTimers(); assert.equal(ui.activeUrls.size, 0); ui.unmount();
});

test("export preparation failures are sanitized, preserve records/editor, and revoke an allocated URL before retry", () => {
  const raw = client.encodeEvaluationDocument({ ...client.emptyEvaluationDocument(), book: book(lot("retained", "2", "3")) });
  for (const stage of ["blob", "url", "anchor", "click", "timer"]) {
    const ui = harness(raw); let tree = ui.initialize(); const calls = [...ui.calls], retained = panel(tree); ui.failDownload(stage);
    assert.doesNotThrow(() => byId(tree, "evaluation-export").props.onClick(), stage); tree = ui.render();
    assert.match(text(byId(tree, "evaluation-export-error")), /دریافت فایل آماده نشد/); assert.doesNotMatch(text(tree), /RAW-EXPORT-ERROR|PRIVATE-CANARY/);
    assert.equal(panel(tree).props.book, retained.props.book); assert.equal(panel(tree).key, retained.key); assert.equal(panel(tree).props.busy, false);
    assert.deepEqual(ui.calls, calls); assert.equal(ui.values.get(client.EVALUATION_STORAGE_KEY), raw); assert.equal(ui.activeUrls.size, 0);
    assert.equal(ui.revoked.length, ["anchor", "click", "timer"].includes(stage) ? 1 : 0);
    ui.failDownload(null); byId(tree, "evaluation-export").props.onClick(); tree = ui.render();
    assert.equal(byId(tree, "evaluation-export-error"), undefined); assert.deepEqual(ui.calls, calls); ui.runTimers(); assert.equal(ui.activeUrls.size, 0); ui.unmount();
  }
});

test("a delayed URL cleanup failure never escapes the event loop or mutates portfolio state", () => {
  const ui = harness(); let tree = ui.initialize(); const calls = [...ui.calls], retained = panel(tree);
  byId(tree, "evaluation-export").props.onClick(); ui.failDownload("revoke"); assert.doesNotThrow(() => ui.runTimers()); tree = ui.render();
  assert.equal(panel(tree).props.book, retained.props.book); assert.deepEqual(ui.calls, calls); assert.doesNotMatch(text(tree), /RAW-EXPORT-ERROR|PRIVATE-CANARY/); ui.unmount();
});
