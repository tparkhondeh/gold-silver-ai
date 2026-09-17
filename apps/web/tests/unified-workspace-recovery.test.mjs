import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { PortfolioSaveError } from "../app/unified-portfolio-client.ts";
import { evaluatePersonalMarketValuation } from "../app/personal-market-valuation.ts";
import { MARKET_TTL_MS } from "../app/market-test-contract.ts";

const source = readFileSync(new URL("../app/unified-portfolio-workspace.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const at = Date.parse("2000-01-03T12:00:00.000Z");
const snapshot = (version = 3, preferences = {}) => ({ version, holdings: [{ id: "balance", name: "طلای ۱۸ عیار", unit: "گرم", amount: 2, costToman: null, purchaseDate: null, note: "synthetic retained" }], purchaseBook: emptyPurchaseBook(), preferences: { liquidityReservePercent: "5", maxSingleAssetPercent: "50", maxAcceptableDrawdownPercent: "10", shortTermMonths: "3", longTermYears: "2", analysisHorizon: "short", decisionHorizon: "long", ...preferences } });
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : []; }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join("") : tree?.props ? text(tree.props.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : ""; }
const button = (tree, label) => nodes(tree).find(node => node.type === "button" && text(node) === label);
const panel = tree => nodes(tree).find(node => node.type?.name === "PurchaseBookPanel");
const form = tree => nodes(tree).find(node => node.type === "form");
const inputs = tree => nodes(tree).filter(node => node.type === "input");

// Execute the actual component and effects with controlled React hooks and
// synthetic transport. Browser hydration/network/storage are not claimed here.
function harness({ fetchSnapshot, saveSnapshot, stored = {} }) {
  let cursor = 0, timerId = 0, reads = 0, writes = 0;
  const slots = [], effects = [], timers = new Map(), events = new Map(), requests = [];
  const same = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(callback, dependencies) { const index = cursor++, previous = slots[index]; if (!same(previous?.dependencies, dependencies)) effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; }); },
    useMemo(callback, dependencies) { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: callback() }; return slots[index].value; },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
  };
  const eventTarget = prefix => ({ addEventListener(name, fn) { events.set(`${prefix}:${name}`, fn); }, removeEventListener(name) { events.delete(`${prefix}:${name}`); } });
  const window = { ...eventTarget("window"), setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval() { return ++timerId; }, clearInterval() {} };
  const document = { ...eventTarget("document"), visibilityState: "visible" };
  class Clock extends Date { static now() { return at; } }
  const components = { PurchaseBookPanel: function PurchaseBookPanel() {}, PurchaseRatio: function PurchaseRatio() {} };
  const dependencies = { react, "./purchase-book": { emptyPurchaseBook }, "./purchase-book-panel": components, "./number-value": { NumberValue: function NumberValue() {} }, "./portfolio-persistence": { fetchPortfolioSnapshot: signal => { reads++; requests.push(signal); return fetchSnapshot(reads, signal); } }, "./unified-portfolio-client": { PortfolioSaveError, saveUnifiedPortfolio: next => { writes++; return saveSnapshot(next, writes); }, personalBackup() { throw Error("unexpected export"); } }, "./personal-market-valuation": { evaluatePersonalMarketValuation }, "./market-test-contract": { MARKET_TTL_MS }, "./managed-market-client": { requestManagedMarket: async () => ({ state: "unavailable", snapshot: null, checkedAt: new Date(at).toISOString(), nextCheckAt: new Date(at + 60_000).toISOString(), quota: null }) }, "./unified-portfolio.css": {} };
  const exports = {};
  new Function("require", "exports", "React", "window", "document", "sessionStorage", "Date", compiled)(name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, exports, React, window, document, { getItem: key => stored[key] ?? null }, Clock);
  const render = () => { cursor = 0; const tree = exports.UnifiedPortfolioWorkspace(); while (effects.length) effects.shift()(); return tree; };
  return { render, requests, get reads() { return reads; }, get writes() { return writes; }, async start() { render(); for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); } await flush(); return render(); }, unmount() { for (const slot of slots) slot.cleanup?.(); }, get listenerCount() { return events.size; } };
}

test("repeated reload clicks have one GET owner; writes stay blocked until its confirmed snapshot", async () => {
  const reload = pending();
  const ui = harness({ fetchSnapshot: async call => { if (call === 1) throw Error("synthetic outage"); return reload.promise; }, saveSnapshot: async next => ({ ...next, version: next.version + 1 }) });
  const failed = await ui.start(); const retry = button(failed, "بررسی وضعیت ذخیره");
  retry.props.onClick(); retry.props.onClick(); await flush();
  assert.equal(ui.reads, 2); assert.equal(button(ui.render(), "بررسی وضعیت ذخیره").props.disabled, true);
  reload.resolve(snapshot()); await flush();
  assert.equal(panel(ui.render()).props.busy, false);
  await panel(ui.render()).props.onCommitHoldings(snapshot().holdings);
  assert.equal(ui.writes, 1); assert.equal(button(ui.render(), "بررسی وضعیت ذخیره"), undefined);
  ui.unmount(); assert.equal(ui.listenerCount, 0);
});

test("pending manual reload is aborted on unmount and late success cannot replace the saved snapshot", async () => {
  const reload = pending();
  const ui = harness({ fetchSnapshot: call => call === 1 ? Promise.resolve(snapshot()) : reload.promise, saveSnapshot: async () => { throw new PortfolioSaveError("synthetic conflict", true); } });
  await ui.start();
  await assert.rejects(panel(ui.render()).props.onCommitHoldings(snapshot().holdings));
  button(ui.render(), "بررسی وضعیت ذخیره").props.onClick(); await flush();
  ui.unmount(); assert.equal(ui.requests[1].aborted, true);
  const changed = snapshot(4); changed.holdings[0].amount = 99;
  reload.resolve(changed); await flush();
  assert.equal(panel(ui.render()).props.legacyHoldings[0].amount, 2);
});

test("conflicting preference reload preserves draft but blocks stale resubmission until explicit discard", async () => {
  const remote = snapshot(4, { maxSingleAssetPercent: "25" });
  const ui = harness({ fetchSnapshot: async call => call === 1 ? snapshot() : remote, saveSnapshot: async () => { throw new PortfolioSaveError("synthetic conflict", true); } });
  await ui.start();
  inputs(ui.render())[0].props.onChange({ target: { value: "7" } });
  await form(ui.render()).props.onSubmit({ preventDefault() {} }); assert.equal(ui.writes, 1);
  button(ui.render(), "بررسی وضعیت ذخیره").props.onClick(); await flush();
  const stale = ui.render(); assert.equal(inputs(stale)[0].props.value, "7"); assert.equal(inputs(stale)[1].props.value, "50");
  assert.match(text(stale), /تنظیمات ذخیره‌شده از زمان شروع ویرایش تغییر کرده‌اند/);
  assert.equal(nodes(form(stale)).find(node => node.type === "fieldset").props.disabled, true);
  await form(stale).props.onSubmit({ preventDefault() {} }); assert.equal(ui.writes, 1);
  button(stale, "کنار گذاشتن ویرایش تنظیمات و دیدن نسخهٔ ذخیره‌شده").props.onClick();
  assert.equal(inputs(ui.render())[0].props.value, "5"); assert.equal(inputs(ui.render())[1].props.value, "25");
  ui.unmount();
});

test("same preference content with JSONB key order change does not invalidate a preserved draft", async () => {
  const reordered = snapshot(4); reordered.preferences = Object.fromEntries(Object.entries(reordered.preferences).reverse());
  let final;
  const ui = harness({ fetchSnapshot: async call => call === 1 ? snapshot() : reordered, saveSnapshot: async (next, call) => { if (call === 1) throw new PortfolioSaveError("conflict", true); final = next; return { ...next, version: next.version + 1 }; } });
  await ui.start(); inputs(ui.render())[0].props.onChange({ target: { value: "7" } });
  await form(ui.render()).props.onSubmit({ preventDefault() {} }); button(ui.render(), "بررسی وضعیت ذخیره").props.onClick(); await flush();
  assert.doesNotMatch(text(ui.render()), /تنظیمات ذخیره‌شده از زمان شروع ویرایش تغییر کرده‌اند/);
  await form(ui.render()).props.onSubmit({ preventDefault() {} });
  assert.equal(final.version, 4); assert.equal(final.preferences.liquidityReservePercent, "7"); assert.equal(final.preferences.maxSingleAssetPercent, "50");
  ui.unmount();
});

test("tab switches hide rather than remove the purchase editor and untouched browser recovery remains read-only", async () => {
  const preserved = { "gold-silver-holdings": "synthetic browser-only draft", "asha-purchase-book-v1": "synthetic saved book" };
  const ui = harness({ fetchSnapshot: async () => snapshot(), saveSnapshot: async () => assert.fail("unexpected save"), stored: preserved });
  await ui.start(); const initial = panel(ui.render());
  for (const tab of ["ثبت و ویرایش", "تنظیمات و پشتیبان", "تحلیل و تصمیم", "نمای سبد"]) {
    button(ui.render(), tab).props.onClick();
    const retained = panel(ui.render()); assert.equal(retained.type, initial.type); assert.equal(retained.key, initial.key);
    assert.deepEqual(retained.props.book, emptyPurchaseBook());
  }
  assert.match(text(ui.render()), /اطلاعاتی در حافظهٔ مرورگر باقی مانده است/);
  assert.equal(ui.writes, 0); assert.equal(preserved["gold-silver-holdings"], "synthetic browser-only draft"); ui.unmount();
});
