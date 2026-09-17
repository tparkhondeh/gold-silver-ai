import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { evaluatePersonalMarketValuation } from "../app/personal-market-valuation.ts";
import { validateManagedMarketResponse } from "../app/managed-market-contract.ts";

// Executes the actual hook, with an in-memory clock/transport. No provider,
// browser storage, private account, filesystem write or timer delay is used.
const base = Date.parse("2000-01-03T12:00:00.000Z");
const source = readFileSync(new URL("../app/unified-portfolio-workspace.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(`${source}\nexport { useManagedPrices };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const snapshot = (published = base, received = base) => makeNavasanSnapshot({ "18ayar": { value: "12000000", timestamp: published / 1000 } }, "TOMAN", new Date(received).toISOString());
const receipt = (quotes = snapshot(), at = base, next = at + 24_000_000) => ({ version: "asha.managed_market.v1", state: quotes ? "received" : "unavailable", snapshot: quotes,
  checkedAt: new Date(at).toISOString(), nextCheckAt: new Date(next).toISOString(), reason: quotes ? "updated" : "cache_unavailable", quota: null });
const old = [{ id: "synthetic-old", name: "طلای ۱۸ عیار", unit: "گرم", amount: 1, costToman: null, purchaseDate: null, note: "synthetic clock probe" }];
const stateOf = state => evaluatePersonalMarketValuation(emptyPurchaseBook(), old, state.data?.snapshot ?? null, state.now).rows[0].quoteState;

function harness({ at = base, request = async () => receipt() } = {}) {
  let now = at, cursor = 0, nextId = 0, calls = 0, output;
  const slots = [], effects = [], timers = new Map(), intervals = new Map(), events = new Map();
  const eventTarget = name => ({ addEventListener(type, fn) { events.set(`${name}:${type}`, fn); }, removeEventListener(type) { events.delete(`${name}:${type}`); } });
  const window = { ...eventTarget("window"), setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, due: now + delay, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval(fn) { const id = ++nextId; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); } };
  const document = { ...eventTarget("document"), visibilityState: "visible" };
  class Clock extends Date { static now() { return now; } }
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }]; },
    useEffect(fn, dependencies) { const i = cursor++; const prior = slots[i]; if (!prior || dependencies.some((value, index) => !Object.is(value, prior.dependencies[index]))) effects.push(() => { prior?.cleanup?.(); slots[i] = { dependencies, cleanup: fn() }; }); },
  };
  const hookModule = {};
  const modules = { react, "./purchase-book": {}, "./purchase-book-panel": {}, "./number-value": {}, "./portfolio-persistence": {}, "./unified-portfolio-client": {}, "./personal-market-valuation": {},
    "./managed-market-client": { requestManagedMarket: signal => { calls++; return request(signal); } }, "./market-test-contract": { MARKET_TTL_MS }, "./unified-portfolio.css": {} };
  new Function("require", "exports", "React", "window", "document", "Date", compiled)(name => { assert.ok(Object.hasOwn(modules, name), `Unexpected hook module dependency: ${name}`); return modules[name]; }, hookModule, {}, window, document, Clock);
  const render = () => { cursor = 0; output = hookModule.useManagedPrices(); while (effects.length) effects.shift()(); return output; };
  const runTimers = () => { for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); void timer.fn(); } return render(); };
  const settle = async () => { await new Promise(setImmediate); return render(); };
  return {
    render, runTimers, settle, document,
    async start() { render(); runTimers(); return settle(); },
    setTime(value) { now = value; }, tick() { for (const fn of intervals.values()) void fn(); return render(); },
    fire(name) { events.get(name)?.(); return render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    get calls() { return calls; }, get timerCount() { return timers.size; }, get intervalCount() { return intervals.size; }, get listenerCount() { return events.size; },
  };
}

test("unified valuation expires at inclusive TTL+1ms without a provider request or cadence tick", async () => {
  const hook = harness({ at: base + MARKET_TTL_MS - 1 });
  assert.equal(stateOf(await hook.start()), "fresh");
  hook.setTime(base + MARKET_TTL_MS); assert.equal(stateOf(hook.runTimers()), "fresh");
  hook.setTime(base + MARKET_TTL_MS + 1); const expired = hook.runTimers();
  assert.equal(expired.now, base + MARKET_TTL_MS + 1); assert.equal(stateOf(expired), "stale");
  assert.equal(hook.calls, 1); assert.deepEqual(expired.data.snapshot, snapshot()); hook.unmount();
});

test("future publication and receipt each activate exactly at their own boundary without refetch", async () => {
  for (const quotes of [snapshot(base + 1000), snapshot(base, base + 1000)]) {
    const hook = harness({ request: async () => receipt(quotes) });
    assert.equal(stateOf(await hook.start()), "future");
    hook.setTime(base + 999); assert.equal(stateOf(hook.runTimers()), "future");
    hook.setTime(base + 1000); const active = hook.runTimers(); assert.equal(stateOf(active), "fresh");
    assert.equal(hook.calls, 1); assert.deepEqual(active.data.snapshot, quotes); hook.unmount();
  }
});

test("asynchronous receipt uses completion time, not request-start time", async () => {
  let finish;
  const hook = harness({ request: () => new Promise(resolve => { finish = resolve; }) });
  await hook.start(); assert.equal(hook.calls, 1);
  hook.setTime(base + 8000); finish(receipt(snapshot(base, base + 8000), base + 8000));
  const received = await hook.settle();
  assert.equal(received.now, base + 8000); assert.equal(stateOf(received), "fresh"); hook.unmount();
});

test("a render delayed across a boundary schedules an immediate clock-only correction", async () => {
  let finish;
  const hook = harness({ at: base + MARKET_TTL_MS - 1, request: () => new Promise(resolve => { finish = resolve; }) });
  await hook.start(); finish(receipt());
  // Settle the request state without rendering the new snapshot yet.
  await new Promise(setImmediate);
  hook.setTime(base + MARKET_TTL_MS + 1); hook.render();
  assert.equal(stateOf(hook.runTimers()), "stale"); assert.equal(hook.calls, 1); hook.unmount();
});

test("focus/visibility refresh a sleeping clock while cadence and hidden-tab request gates remain intact", async () => {
  const hook = harness(); await hook.start();
  hook.setTime(base + MARKET_TTL_MS + 1);
  assert.equal(stateOf(hook.fire("window:focus")), "stale"); assert.equal(hook.calls, 1);
  hook.document.visibilityState = "hidden"; hook.setTime(base + 24_000_001); hook.tick(); assert.equal(hook.calls, 1);
  hook.document.visibilityState = "visible"; hook.fire("document:visibilitychange"); await hook.settle(); assert.equal(hook.calls, 2);
  hook.unmount();
});

test("valid unavailable response preserves the prior snapshot while its clock continues to expire", async () => {
  let count = 0;
  const hook = harness({ at: base + MARKET_TTL_MS - 30_001, request: async () => ++count === 1 ? receipt(snapshot(), base, base + MARKET_TTL_MS - 1) : receipt(null, base + MARKET_TTL_MS - 1) });
  await hook.start(); hook.setTime(base + MARKET_TTL_MS - 1); hook.tick();
  const retained = await hook.settle(); assert.deepEqual(retained.data.snapshot, snapshot()); assert.equal(retained.error, true);
  assert.equal(retained.data.state, "cached"); validateManagedMarketResponse(retained.data, retained.now);
  hook.setTime(base + MARKET_TTL_MS + 1); assert.equal(stateOf(hook.runTimers()), "stale"); assert.equal(hook.calls, 2); hook.unmount();
});

test("unmount removes every clock and listener, aborts transport, and ignores late completion", async () => {
  let finish, signal;
  const hook = harness({ request: received => { signal = received; return new Promise(resolve => { finish = resolve; }); } });
  await hook.start(); hook.unmount(); assert.equal(signal.aborted, true);
  assert.equal(hook.timerCount, 0); assert.equal(hook.intervalCount, 0); assert.equal(hook.listenerCount, 0);
  finish(receipt()); assert.equal((await hook.settle()).data, null); assert.equal(hook.calls, 1);
  const loaded = harness(); await loaded.start(); assert.equal(loaded.timerCount, 1);
  loaded.unmount(); assert.equal(loaded.timerCount, 0); assert.equal(loaded.listenerCount, 0);
});

test("unified USD display separates fresh current rate from exact manual historical rate provenance", () => {
  assert.match(source, /data-testid="current-usd-rate"/);
  assert.match(source, /quoteLabels\[valuation\.usdConversion\.quoteState\]/);
  assert.match(source, /PurchaseRatio value=\{valuation\?\.usdConversion\.currentRialPerUsd \?\? null\} unit="تومان برای هر دلار" rialToToman/);
  for (const field of ["source", "publishedAt", "receivedAt"]) assert.ok(source.includes(`valuation.usdConversion.observation.${field}`));
  assert.match(source, /NumberValue value=\{source\.fx\.tomanPerUsd\} unit="تومان برای هر دلار"/);
  assert.ok(source.includes("source.fx.rateDate")); assert.ok(source.includes("source.fx.source"));
  assert.match(source, /بهای دلاری خرید با نرخ تاریخی تغییر نمی‌کند/);
  assert.match(source, /تأییدنشده/);
});
