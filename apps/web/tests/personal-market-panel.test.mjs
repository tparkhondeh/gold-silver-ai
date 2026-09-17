import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";
import * as storage from "../app/personal-market-storage.ts";
import { PersonalMarketRequestError } from "../app/personal-market-client.ts";
import { snapshotFailure } from "../app/browser-snapshot-storage.ts";
import { presentNumber } from "../app/number-display.ts";
import { emptyPurchaseBook, evaluatePurchaseBook, purchaseAssetCatalog } from "../app/purchase-book.ts";
import { evaluatePersonalMarketValuation } from "../app/personal-market-valuation.ts";
import { createTestLocks } from "./helpers/snapshot-locks.mjs";

const time = Date.parse("2000-01-03T12:00:00.000Z");
const snapshot = (at = time) => makeNavasanSnapshot({ "18ayar": { value: "10000000", timestamp: at / 1000 }, usd_sell: { value: "100000", timestamp: at / 1000 } }, "TOMAN", new Date(at).toISOString());
const source = readFileSync(new URL("../app/personal-market-panel.tsx", import.meta.url), "utf8");
const transpile = value => ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const numberExports = {};
new Function("require", "exports", "React", transpile(readFileSync(new URL("../app/number-value.tsx", import.meta.url), "utf8")))(name => name === "react" ? React : { presentNumber }, numberExports, React);

function moduleWith(react = React, dependencies = {}, environment = {}) {
  const exports = {};
  const modules = { react, "./market-test-contract": { MARKET_TTL_MS }, "./number-value": numberExports, "./personal-market-client": { PersonalMarketRequestError, requestPersonalMarketSnapshot: () => { throw Error("Unexpected network request"); } }, "./personal-market-storage": storage, "./browser-snapshot-storage": { snapshotFailure }, "./personal-market.css": {}, ...dependencies };
  const names = Object.keys(environment);
  new Function("require", "exports", "React", ...names, transpile(source))(name => { assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; }, exports, React, ...Object.values(environment));
  return exports;
}

// Execute the actual hook with deterministic hook slots and browser events.
// No DOM, network, real browser storage, timer delay or personal data is used.
function harness({ initial = null, request = async () => ({ snapshot: snapshot(), used: 1, remaining: 114 }) } = {}) {
  const data = new Map(initial === null ? [] : [[storage.PERSONAL_MARKET_STORAGE, initial]]);
  let writes = 0, reads = 0, calls = 0, now = time, cursor = 0, enabled = false, output;
  const localStorage = { getItem(key) { reads++; return data.get(key) ?? null; }, setItem(key, value) { writes++; data.set(key, value); } };
  const slots = [], effects = [], timers = new Map(), intervals = new Map(), events = new Map(); let nextTimer = 0;
  const eventTarget = name => ({ addEventListener(type, listener) { events.set(`${name}:${type}`, listener); }, removeEventListener(type) { events.delete(`${name}:${type}`); } });
  const window = { ...eventTarget("window"), setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, due: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval(fn) { const id = ++nextTimer; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); } };
  const document = { ...eventTarget("document"), visibilityState: "visible" };
  class Clock extends Date { static now() { return now; } }
  const react = {
    useState(initialValue) { const index = cursor++; if (!(index in slots)) slots[index] = { value: typeof initialValue === "function" ? initialValue() : initialValue }; return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }]; },
    useRef(initialValue) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initialValue }; return slots[index]; },
    useEffect(callback, dependencies) { const index = cursor++; const previous = slots[index]; if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; }); },
  };
  const panelModule = moduleWith(react, {
    "./personal-market-client": { PersonalMarketRequestError, requestPersonalMarketSnapshot: signal => { calls++; return request(signal); } },
    "./personal-market-storage": { ...storage, savePersonalMarketSnapshot: (store, value, at, expected) => storage.savePersonalMarketSnapshot(store, value, at, expected, createTestLocks()) },
  }, { window, document, localStorage, Date: Clock });
  const render = (nextEnabled = enabled) => { enabled = nextEnabled; cursor = 0; output = panelModule.usePersonalMarketPrices(enabled); while (effects.length) effects.shift()(); return output; };
  return {
    render, data, localStorage, get reads() { return reads; }, get writes() { return writes; }, get calls() { return calls; },
    start() { render(true); for (const [id, timer] of [...timers]) { if (timer.due <= now) { timers.delete(id); timer.fn(); } } return render(); },
    setTime(value) { now = value; }, tick() { for (const callback of intervals.values()) callback(); return render(); },
    runTimers() { for (const [id, timer] of [...timers]) { if (timer.due <= now) { timers.delete(id); timer.fn(); } } return render(); },
    fire(name, event = {}) { events.get(name)?.(event); return render(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); }, get listenerCount() { return events.size; },
  };
}

test("actual price hook restores only its price namespace and never automatically requests or saves", async () => {
  const saved = storage.encodePersonalMarketSnapshot(snapshot(), time);
  const hook = harness({ initial: saved });
  assert.equal(hook.render(false).ready, false); assert.equal(hook.reads, 0); assert.equal(hook.calls, 0);
  const state = hook.start(); assert.equal(state.ready, true); assert.deepEqual(state.snapshot, snapshot());
  assert.equal(hook.reads, 1); assert.equal(hook.calls, 0); assert.equal(hook.writes, 0);
  assert.equal(state.canSave, true); await state.save(); assert.equal(hook.writes, 0); // Idempotent save.
  hook.unmount(); assert.equal(hook.listenerCount, 0);
});

test("explicit receive owns one request and blocks overlapping receive/save/restore", async () => {
  let resolve;
  const hook = harness({ request: () => new Promise(done => { resolve = done; }) });
  const initial = hook.start(); const pending = initial.receive();
  await initial.receive(); await initial.save(); initial.restore();
  assert.equal(hook.calls, 1); assert.equal(hook.writes, 0); assert.equal(hook.reads, 1);
  assert.equal(hook.render().busy, true);
  resolve({ snapshot: snapshot(), used: 2, remaining: 113 }); await pending;
  const received = hook.render(); assert.deepEqual(received.snapshot, snapshot()); assert.deepEqual(received.quota, { used: 2, remaining: 113 });
  assert.equal(received.busy, false); assert.equal(received.canSave, true); assert.equal(hook.writes, 0);
  await received.save(); assert.equal(hook.writes, 1);
  const saved = JSON.parse(hook.data.get(storage.PERSONAL_MARKET_STORAGE)); assert.deepEqual(Object.keys(saved).sort(), ["snapshot", "version"]);
  assert.equal(hook.data.size, 1); hook.unmount();
});

test("mode change and unmount abort pending receipt and late completion never publishes", async () => {
  for (const leave of [hook => hook.render(false), hook => hook.unmount()]) {
    let resolve, signal;
    const hook = harness({ initial: storage.encodePersonalMarketSnapshot(snapshot(), time), request: input => { signal = input; return new Promise(done => { resolve = done; }); } });
    const pending = hook.start().receive(); leave(hook); assert.equal(signal.aborted, true);
    resolve({ snapshot: snapshot(time + 1000), used: 1, remaining: 114 }); await pending;
    assert.deepEqual(hook.render(false).snapshot, snapshot()); assert.equal(hook.writes, 0); assert.equal(hook.calls, 1);
  }
});

test("safe failure preserves prior snapshot and does not expose arbitrary exception content", async () => {
  for (const error of [new PersonalMarketRequestError("refresh_cooldown", 120), Error("SECRET_PRIVATE_RESPONSE")]) {
    const hook = harness({ initial: storage.encodePersonalMarketSnapshot(snapshot(), time), request: async () => { throw error; } });
    await hook.start().receive(); const state = hook.render();
    assert.deepEqual(state.snapshot, snapshot()); assert.equal(state.busy, false); assert.equal(hook.calls, 1); assert.equal(hook.writes, 0);
    assert.ok(!state.notice.includes("SECRET_PRIVATE_RESPONSE")); assert.ok(state.notice.includes("قبلی")); hook.unmount();
  }
});

test("corrupt initial storage permits separate receive but cannot be overwritten by save", async () => {
  const hook = harness({ initial: "corrupt-retained-data" });
  let state = hook.start(); assert.equal(state.canSave, false); assert.equal(state.snapshot, null);
  await state.receive(); state = hook.render(); assert.deepEqual(state.snapshot, snapshot()); assert.equal(state.canSave, false);
  await state.save(); assert.equal(hook.writes, 0); assert.equal(hook.data.get(storage.PERSONAL_MARKET_STORAGE), "corrupt-retained-data");
  state.restore(); state = hook.render(); assert.deepEqual(state.snapshot, snapshot()); assert.equal(state.canSave, false);
  hook.unmount();
});

test("other-tab price changes preserve memory and block save until explicit valid restore", async () => {
  const hook = harness({ initial: storage.encodePersonalMarketSnapshot(snapshot(), time) }); hook.start();
  const other = snapshot(time - 1000); hook.data.set(storage.PERSONAL_MARKET_STORAGE, storage.encodePersonalMarketSnapshot(other, time));
  let state = hook.fire("window:storage", { storageArea: hook.localStorage, key: storage.PERSONAL_MARKET_STORAGE });
  assert.deepEqual(state.snapshot, snapshot()); assert.equal(state.canSave, false); await state.save(); assert.equal(hook.writes, 0);
  state.restore(); state = hook.render(); assert.deepEqual(state.snapshot, other); assert.equal(state.canSave, true);
  hook.data.delete(storage.PERSONAL_MARKET_STORAGE); state.restore(); state = hook.render();
  assert.deepEqual(state.snapshot, other); assert.equal(state.canSave, true); // Empty restore never clears an unsaved in-memory price.
  hook.unmount();
});

test("clock, focus and visibility re-evaluate expiry without touching price timestamps or source", () => {
  const hook = harness({ initial: storage.encodePersonalMarketSnapshot(snapshot(), time) }); hook.start();
  for (const [index, event] of ["window:focus", "document:visibilitychange", null].entries()) {
    const later = time + MARKET_TTL_MS + index + 1; hook.setTime(later);
    const state = event ? hook.fire(event) : hook.tick(); assert.equal(state.nowMs, later); assert.deepEqual(state.snapshot, snapshot());
  }
  assert.equal(hook.calls, 0); assert.equal(hook.writes, 0); hook.unmount();
});

test("freshness boundary timer expires the snapshot exactly after the inclusive TTL", () => {
  const hook = harness({ initial: storage.encodePersonalMarketSnapshot(snapshot(), time) }); hook.start();
  hook.setTime(time + MARKET_TTL_MS); assert.equal(hook.runTimers().nowMs, time);
  hook.setTime(time + MARKET_TTL_MS + 1); assert.equal(hook.runTimers().nowMs, time + MARKET_TTL_MS + 1);
  assert.equal(hook.calls, 0); assert.equal(hook.writes, 0); hook.unmount();
});

const { PersonalMarketPanel, PersonalMarketRatio } = moduleWith();
const prices = { snapshot: snapshot(), nowMs: time, busy: false, ready: true, notice: "", quota: null, canSave: true, receive: async () => {}, save: async () => {}, restore: () => {} };
function lot(id, assetId = "GOLD_18K_IRR", fields = {}) {
  const asset = purchaseAssetCatalog.find(item => item.id === assetId);
  return { id, assetId, assetClass: asset.assetClass, unit: asset.unit, purityPermille: asset.purityPermille, quantity: "1", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "9000000", fees: "0", note: "synthetic UI fixture", source: { kind: "manual", reference: null }, fx: null, ...fields };
}
function renderPanel(lots, at = time, override = {}) {
  const evaluation = evaluatePersonalMarketValuation({ ...emptyPurchaseBook(), lots }, [], snapshot(), at);
  return renderToStaticMarkup(React.createElement(PersonalMarketPanel, { evaluation, prices: { ...prices, ...override }, expanded: true }));
}

test("actual panel distinguishes partial current value, unknown silver and historical FX boundary", () => {
  const html = renderPanel([lot("gold"), lot("silver", "SILVER_999_IRR", { fees: null })]);
  assert.match(html, /data-testid="personal-market-total"><span class="muted-value">نامشخص/);
  assert.match(html, /ارزش فقط بخش دارای قیمت تازه/); assert.match(html, /جمع بخش دارای قیمت، ارزش کل سبد نیست/);
  assert.match(html, /نوسان در قرارداد فعلی قیمت نقره ندارد/); assert.match(html, /نرخ دلار امروز نه جای آن می‌نشیند/);
  assert.match(html, /مخرج درصد سود\/زیان، بهای تمام‌شدهٔ همان موجودی/); assert.match(html, /مسیر تصمیم مالی همچنان بسته است/);
  assert.match(html, /cost|بهای/); assert.ok(!html.includes("NaN"));
});

test("actual panel renders stale and zero-denominator reasons without showing zero profit or fresh value", () => {
  const stale = renderPanel([lot("gold")], time + MARKET_TTL_MS + 1);
  assert.match(stale, /منقضی؛ برای ارزش جاری استفاده نمی‌شود/); assert.match(stale, /قیمت ثبت‌شدهٔ منبع؛ نه قیمت جاری/);
  assert.match(stale, /data-testid="personal-market-profit"><span class="muted-value">نامشخص/);
  const zero = renderPanel([lot("gold", "GOLD_18K_IRR", { unitPrice: "0" })]);
  assert.match(zero, /مخرج بهای تمام‌شده باید مثبت باشد/);
  const busy = renderPanel([], time, { busy: true, canSave: false });
  for (const id of ["receive", "save", "restore"]) assert.match(busy, new RegExp(`data-testid="personal-market-${id}" disabled=""`));
});

test("exact display keeps rational numerator/denominator including fractional-rial and signed percent", () => {
  const money = renderToStaticMarkup(React.createElement(PersonalMarketRatio, { value: { numerator: "1", denominator: "10000" }, rialToToman: true, unit: "تومان" }));
  assert.match(money, /۰٫۰۰۰۰۱/); assert.match(money, /کمتر از ۰٫۱/);
  const percent = renderToStaticMarkup(React.createElement(PersonalMarketRatio, { value: { numerator: "-100", denominator: "3" }, unit: "٪" }));
  assert.match(percent, /۱۰۰ \/ ۳/); assert.match(percent, /٪/);
  assert.ok(!source.includes("Number(value.numerator)"));
});

test("page wiring shares one exact personal result and keeps generic feeds and numerical scenarios separate", () => {
  // Source-wiring contract only. Hydrated browser acceptance is a separate gate.
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /evaluatePersonalMarketValuation\(purchaseBook, legacyHoldings, personalPrices.snapshot, personalPrices.nowMs\)/);
  assert.match(page, /portfolioMode === "personal" && <PersonalMarketPanel evaluation=\{personalMarket\} prices=\{personalPrices\}/);
  assert.equal((page.match(/<PersonalMarketPanel /g) ?? []).length, 1);
  assert.match(page, /const refreshMarket = useCallback\(async \(\) => \{\s*if \(portfolioMode === "personal"\) return;/);
  assert.match(page, /if \(!feed \|\| portfolioMode === "personal"\) return;/);
  assert.match(page, /const holdingValues = useMemo\([^\n]+portfolioMode === "demo" \? \(demoCurrentValuesToman\[holding.id\] \?\? null\) : null/);
  assert.ok(!page.includes("function calculateHoldingValue("));
  assert.match(page, /methodologyApproved: false/); assert.match(page, /historicalValidationPassed: false/);
  for (const field of ["currentValueRial", "profitLossRial", "profitLossPercent"]) assert.ok(page.includes(`selectedPersonalRow?.${field}`), field);
});

test("non-Number-projectable books retain exact panel and recovery while incompatible old views are hidden", () => {
  // Execute the actual guard against a valid exact book; view checks below are
  // source-wiring assertions, not a substitute for hydrated browser acceptance.
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const declaration = page.match(/const personalProjectionBlocked = [^;]+;/)?.[0]; assert.ok(declaration);
  const blocked = new Function("portfolioMode", "purchaseEvaluation", `${declaration} return personalProjectionBlocked;`);
  const book = { ...emptyPurchaseBook(), lots: [lot("exact-large", "GOLD_18K_IRR", { quantity: "9007199254740993", unitPrice: null, fees: null })] };
  const projected = evaluatePurchaseBook(book);
  assert.equal(projected.holdings.length, 0); assert.ok(projected.projectionIssues.length > 0);
  assert.equal(blocked("personal", projected), true); assert.equal(blocked("demo", projected), false);
  const exact = evaluatePersonalMarketValuation(book, [], snapshot(), time);
  assert.equal(exact.totals.totalAssetCount, 1); assert.equal(exact.rows[0].quantity.numerator, "9007199254740993"); assert.notEqual(exact.rows[0].currentValueRial, null);
  assert.match(page, /const displayHoldingCount = portfolioMode === "personal" \? personalMarket\?\.totals.totalAssetCount \?\? 0 : holdings.length/);
  assert.match(page, /hasPortfolio: displayHoldingCount > 0/);
  for (const view of ["overview", "asset-center", "analysis", "decisions"]) assert.ok(page.includes(`view === "${view}" && !personalProjectionBlocked &&`), view);
  assert.match(page, /\{!personalProjectionBlocked && <section className="panel"><div className="portfolio-summary">/);
  assert.ok(page.indexOf("<PersonalMarketPanel ") < page.indexOf('view === "overview" && !personalProjectionBlocked'));
  assert.match(page, /portfolioMode === "personal" && view === "portfolio" && <PurchaseBookPanel/);
  const persistence = page.indexOf('data-testid="portfolio-persistence"');
  const guardedSummary = page.indexOf('{!personalProjectionBlocked && <section className="panel"><div className="portfolio-summary">');
  assert.ok(persistence > 0 && persistence < guardedSummary);
});

test("personal colors use exact signed results and old provider cards and cost percentage do not leak", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const toneSource = page.slice(page.indexOf("function personalRatioTone("), page.indexOf("export default function Home()"));
  assert.ok(toneSource.startsWith("function personalRatioTone("));
  const tone = new Function(`${transpile(toneSource)} return personalRatioTone;`)();
  assert.equal(tone(null), "muted-value"); assert.equal(tone({ numerator: "0", denominator: "1" }), "");
  assert.equal(tone({ numerator: "-1", denominator: "1000000000000000000000000000000000000" }), "negative");
  assert.equal(tone({ numerator: "9007199254740993", denominator: "1" }), "positive");
  for (const target of ["personalMarket?.totals.profitLossRial", "personalRows.get(item.id)?.currentValueRial", "personalRows.get(item.id)?.profitLossRial", "selectedPersonalRow?.profitLossRial"]) assert.ok(page.includes(`personalRatioTone(${target} ?? null)`), target);
  assert.match(page, /className="source-grid">\{\(portfolioMode === "personal" \? \[\] : feed\?\.sources \?\? \[\]\)/);
  assert.match(page, /portfolioMode === "personal" \? "جمع کامل فقط با هزینه و تبدیل تاریخی مشخص؛ جزئیات پوشش در دفتر خرید\." : <>پوشش اطلاعات:/);
});
