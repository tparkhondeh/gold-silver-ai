import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as contract from "../app/file-market-contract.ts";
import * as market from "../app/market-test-contract.ts";
import { presentNumber } from "../app/number-display.ts";
import { snapshotFailure } from "../app/browser-snapshot-storage.ts";
import { isAssetWeightAboveLimit } from "../app/market-test-risk.ts";

const published = Date.parse("2000-01-01T12:00:00.000Z");
const source = readFileSync(new URL("../app/file-market-workspace.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const numberExports = {};
const compiledNumber = ts.transpileModule(readFileSync(new URL("../app/number-value.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
new Function("require", "exports", "React", compiledNumber)(name => name === "react" ? React : { presentNumber }, numberExports, React);
const textAt = at => contract.SYNTHETIC_FILE.replaceAll("2000-01-01T12:00:00.000Z", new Date(at).toISOString());
async function fixture(at = published, received = at) {
  return { ...contract.createFileTestPortfolio(), file: await contract.readFileSnapshot(new TextEncoder().encode(textAt(at)), new Date(received).toISOString()) };
}

// Actual component and calculation code, deterministic React lifecycle/browser
// event doubles. This is not hydrated-browser or provider acceptance.
function harness(initialPortfolio, initialTime = published) {
  let now = initialTime, cursor = 0, tree, evaluation = null, evaluatedPortfolio = null, evaluatedAt = null;
  let restoreCount = 0, saveCount = 0, importCount = 0, fetchCount = 0, storageReads = 0, storageWrites = 0, evaluations = 0;
  let props = { active: true, view: "portfolio", onNavigate: view => { props = { ...props, view }; } };
  const slots = [], effects = [], timers = new Map(), intervals = new Map(), listeners = new Map(); let nextTimer = 0;
  const eventTarget = name => ({ addEventListener(type, fn) { listeners.set(`${name}:${type}`, fn); }, removeEventListener(type) { listeners.delete(`${name}:${type}`); } });
  const window = { ...eventTarget("window"), setTimeout(fn, delay) { const id = ++nextTimer; assert.ok(Number.isFinite(delay) && delay >= 0 && delay <= 2_147_483_647); timers.set(id, { fn, due: now + delay, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval(fn, delay) { const id = ++nextTimer; intervals.set(id, { fn, delay }); return id; }, clearInterval(id) { intervals.delete(id); } };
  const document = { ...eventTarget("document"), visibilityState: "visible" };
  const localStorage = { getItem() { storageReads++; throw Error("No real storage permitted"); }, setItem() { storageWrites++; throw Error("No real storage permitted"); } };
  class Clock extends Date { static now() { return now; } }
  const same = (a, b) => a && b.length === a.length && b.every((value, index) => Object.is(value, a[index]));
  const react = {
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = { value: typeof value === "function" ? value() : value }; return [slots[index].value, next => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }]; },
    useMemo(fn, dependencies) { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { value: fn(), dependencies }; return slots[index].value; },
    useEffect(fn, dependencies) { const index = cursor++; const previous = slots[index]; if (!same(previous?.dependencies, dependencies)) effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: fn() }; }); },
  };
  const modules = {
    react, "./market-test-contract": market,
    "./file-market-contract": { ...contract,
      restoreFileTest: async () => { restoreCount++; return { raw: "synthetic-test-saved-record", portfolio: structuredClone(initialPortfolio) }; },
      saveFileTest: async () => { saveCount++; throw Error("Unexpected automatic save"); },
      readFileSnapshot: async (...args) => { importCount++; return contract.readFileSnapshot(...args); },
      evaluateFileTest: (portfolio, time) => { evaluations++; evaluatedPortfolio = structuredClone(portfolio); evaluatedAt = time; evaluation = null; evaluation = contract.evaluateFileTest(portfolio, time); return evaluation; },
    },
    "./browser-snapshot-storage": { snapshotFailure }, "./market-test-risk": { isAssetWeightAboveLimit },
    "./number-value": numberExports,
  };
  const exports = {};
  new Function("require", "exports", "React", "window", "document", "localStorage", "Date", "fetch", compiled)(name => { assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`); return modules[name]; }, exports, React, window, document, localStorage, Clock, () => { fetchCount++; throw Error("Unexpected request"); });
  const render = (nextProps = {}, beforeEffects) => {
    props = { ...props, ...nextProps }; cursor = 0; tree = exports.FileMarketWorkspace(props);
    beforeEffects?.(); while (effects.length) effects.shift()(); return tree;
  };
  const runTimers = () => { for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } return render(); };
  const find = predicate => {
    const visit = node => { if (!React.isValidElement(node)) return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props.children)) { const found = visit(child); if (found) return found; } return null; };
    const found = visit(tree); assert.ok(found, "Expected rendered element"); return found;
  };
  return {
    render, runTimers, find,
    async start() { render(); runTimers(); for (let i = 0; i < 6; i++) await Promise.resolve(); render(); },
    setTime(value) { now = value; }, fire(event, beforeEffects) { listeners.get(event)?.(); render({}, beforeEffects); }, setVisibility(value) { document.visibilityState = value; },
    interval() { for (const timer of intervals.values()) timer.fn(); render(); },
    input(id, value, numeric = false) { find(node => node.props["data-testid"] === id).props.onChange({ target: numeric ? { valueAsNumber: value, value: String(value) } : { value } }); render(); },
    async click(text) { await find(node => node.type === "button" && node.props.children === text).props.onClick(); render(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
    inspect: () => ({ evaluation, portfolio: evaluatedPortfolio, evaluatedAt, restoreCount, saveCount, importCount, fetchCount, storageReads, storageWrites, evaluations, timerCount: timers.size, intervalCount: intervals.size, listenerCount: listeners.size, timerDelays: [...timers.values()].map(timer => timer.delay) }),
    html: () => renderToStaticMarkup(tree),
  };
}

function assertNoClockSideEffects(hook, expectedRestores = 1, expectedImports = 0) {
  const state = hook.inspect();
  assert.equal(state.restoreCount, expectedRestores); assert.equal(state.importCount, expectedImports);
  for (const key of ["saveCount", "fetchCount", "storageReads", "storageWrites"]) assert.equal(state[key], 0, key);
}

test("actual file component expires at TTL+1 ms instead of waiting for the minute interval", async () => {
  const original = await fixture(); const hook = harness(original, published + market.MARKET_TTL_MS - 1); await hook.start();
  assert.ok(hook.inspect().evaluation.rows.every(row => row.state === "fresh")); assert.notEqual(hook.inspect().evaluation.currentTotalRial, null);
  assert.ok(hook.inspect().timerDelays.includes(2));
  hook.setTime(published + market.MARKET_TTL_MS); hook.runTimers(); assert.notEqual(hook.inspect().evaluation.currentTotalRial, null);
  hook.setTime(published + market.MARKET_TTL_MS + 1); hook.runTimers();
  assert.ok(hook.inspect().evaluation.rows.every(row => row.state === "stale")); assert.equal(hook.inspect().evaluation.currentTotalRial, null);
  assert.equal(hook.find(node => node.props["data-testid"] === "file-current-total").props.children, market.displayRialAsToman(null));
  assert.deepEqual(hook.inspect().portfolio, original); assertNoClockSideEffects(hook); hook.unmount();
});

test("future publication becomes current at its exact instant without reimporting the file", async () => {
  const original = await fixture(published + 1000, published); const hook = harness(original); await hook.start();
  assert.ok(hook.inspect().evaluation.rows.every(row => row.state === "future")); assert.equal(hook.inspect().evaluation.currentTotalRial, null);
  hook.setTime(published + 999); hook.runTimers(); assert.equal(hook.inspect().evaluation.currentTotalRial, null);
  hook.setTime(published + 1000); hook.runTimers(); assert.ok(hook.inspect().evaluation.rows.every(row => row.state === "fresh")); assert.notEqual(hook.inspect().evaluation.currentTotalRial, null);
  assert.deepEqual(hook.inspect().portfolio.file, original.file); assertNoClockSideEffects(hook); hook.unmount();
});

test("focus and visible-tab events immediately reassess sleeping-tab freshness without storage or acquisition", async () => {
  for (const event of ["window:focus", "document:visibilitychange"]) {
    const original = await fixture(); const hook = harness(original); await hook.start(); hook.setTime(published + market.MARKET_TTL_MS + 1);
    if (event === "document:visibilitychange") {
      hook.setVisibility("hidden"); hook.fire(event); assert.notEqual(hook.inspect().evaluation.currentTotalRial, null);
      hook.setVisibility("visible");
    }
    hook.fire(event); assert.equal(hook.inspect().evaluation.currentTotalRial, null); assert.equal(hook.inspect().evaluatedAt, published + market.MARKET_TTL_MS + 1);
    assert.deepEqual(hook.inspect().portfolio, original); assertNoClockSideEffects(hook); hook.unmount();
  }
});

test("view and workspace switching preserves unsaved text, quantities, selection and constraints", async () => {
  const original = await fixture(); const hook = harness(original); await hook.start();
  hook.input("file-text", "unsaved synthetic draft"); hook.input("file-quantity-GOLD_18K_IRR", 2.345, true); hook.input("file-selection", "SILVER_999_IRR");
  hook.input("file-cash", "1234.5"); hook.input("file-shortDays", 14, true); hook.input("file-mediumDays", 90, true); hook.input("file-maximumAssetBps", 35, true);
  const draft = hook.inspect().portfolio; const revision = draft.inputs.revision;
  for (const view of ["overview", "analysis", "decisions", "risk", "data", "portfolio"]) {
    hook.setTime(published + 1000); hook.render({ view }); hook.runTimers();
    assert.deepEqual(hook.inspect().portfolio, draft); assert.equal(hook.find(node => node.props["data-testid"] === "file-text").props.value, "unsaved synthetic draft");
  }
  hook.render({ active: false }); const dormant = hook.inspect();
  assert.equal(dormant.timerCount, 0); assert.equal(dormant.intervalCount, 0); assert.equal(dormant.listenerCount, 0);
  hook.setTime(published + market.MARKET_TTL_MS + 1); hook.fire("window:focus"); hook.interval(); hook.runTimers(); assert.equal(hook.inspect().evaluations, dormant.evaluations);
  hook.render({ active: true }); hook.runTimers(); assert.equal(hook.inspect().evaluation.currentTotalRial, null);
  assert.deepEqual(hook.inspect().portfolio, draft); assert.equal(hook.inspect().portfolio.inputs.revision, revision);
  assert.equal(hook.find(node => node.props["data-testid"] === "file-text").props.value, "unsaved synthetic draft"); assertNoClockSideEffects(hook);
  hook.unmount(); assert.equal(hook.inspect().timerCount, 0); assert.equal(hook.inspect().intervalCount, 0); assert.equal(hook.inspect().listenerCount, 0);
});

test("explicit replacement file cancels the old boundary and schedules the new publication", async () => {
  const hook = harness(await fixture(), published + market.MARKET_TTL_MS - 1); await hook.start();
  const importedTime = published + market.MARKET_TTL_MS - 1; hook.input("file-text", textAt(importedTime));
  await hook.click("اعتبارسنجی و ورود نمونه"); const replacement = hook.inspect().portfolio.file;
  hook.setTime(published + market.MARKET_TTL_MS + 1); hook.runTimers(); assert.notEqual(hook.inspect().evaluation.currentTotalRial, null);
  hook.setTime(importedTime + market.MARKET_TTL_MS + 1); hook.runTimers(); assert.equal(hook.inspect().evaluation.currentTotalRial, null);
  assert.deepEqual(hook.inspect().portfolio.file, replacement); assertNoClockSideEffects(hook, 1, 1); hook.unmount();
});

test("unknown publication times stay unknown and do not create zero-delay timer loops", async () => {
  const original = await fixture(); original.file = await contract.readFileSnapshot(new TextEncoder().encode(contract.SYNTHETIC_FILE.replaceAll("2000-01-01T12:00:00.000Z", "")), new Date(published).toISOString());
  const hook = harness(original); await hook.start();
  assert.ok(hook.inspect().evaluation.rows.every(row => row.state === "unknown_time")); assert.equal(hook.inspect().timerCount, 0);
  hook.setTime(published + 60_000); hook.interval(); assert.equal(hook.inspect().evaluation.currentTotalRial, null); assert.equal(hook.inspect().timerCount, 0);
  assertNoClockSideEffects(hook); hook.unmount();
});

test("clock rollback to far before receipt caps timers and keeps the saved file intact", async () => {
  const original = await fixture(); const hook = harness(original); await hook.start();
  hook.setTime(published - 100 * 24 * 60 * 60_000); hook.fire("window:focus");
  assert.equal(hook.inspect().evaluation, null); assert.match(hook.find(node => node.props.role === "alert").props.children, /زمان دریافت.*در آینده است/);
  assert.deepEqual(hook.inspect().timerDelays, [2_147_483_647]); assert.deepEqual(hook.inspect().portfolio.file, original.file);
  hook.setTime(published); hook.fire("window:focus"); assert.notEqual(hook.inspect().evaluation.currentTotalRial, null);
  assertNoClockSideEffects(hook); hook.unmount();
});

test("boundary crossed after evaluation but before effect scheduling is refreshed immediately", async () => {
  const hook = harness(await fixture(), published + market.MARKET_TTL_MS - 1);
  await hook.start(); hook.setTime(published + market.MARKET_TTL_MS);
  // Advance only after evaluation, before its effect runs, reproducing a slow
  // render/commit boundary. The overdue transition must schedule immediately.
  hook.fire("window:focus", () => hook.setTime(published + market.MARKET_TTL_MS + 1));
  assert.notEqual(hook.inspect().evaluation.currentTotalRial, null); assert.deepEqual(hook.inspect().timerDelays, [0]);
  hook.runTimers();
  assert.equal(hook.inspect().evaluation.currentTotalRial, null); assertNoClockSideEffects(hook); hook.unmount();
});
