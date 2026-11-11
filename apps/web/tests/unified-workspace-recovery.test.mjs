import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { PortfolioSaveError } from "../app/unified-portfolio-client.ts";
import { evaluatePersonalMarketValuation } from "../app/personal-market-valuation.ts";
import { buildPersonalPortfolioAnalysis } from "../app/personal-portfolio-analysis.ts";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";
import * as assetOrder from "../app/personal-asset-order.ts";

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
const analysisPanel = tree => nodes(tree).find(node => node.type?.name === "PersonalPortfolioAnalysisPanel");
const planningPanel = tree => nodes(tree).find(node => node.type?.name === "PersonalPlanningPanel");
function currentAnalysis(ui) {
  let tree = ui.render();
  if (!analysisPanel(tree)) { button(tree, "تحلیل و تصمیم").props.onClick(); tree = ui.render(); }
  return analysisPanel(tree).props.analysis;
}

test("planning confirmation advances the same portfolio and both horizons without changing purchases or spending cash", async () => {
  const initial = snapshot(), proposed = { version: "asha.personal_planning.v1", spendableCashToman: "100.01", mediumTermMonths: 9 };
  const ui = harness({ fetchSnapshot: async () => initial, saveSnapshot: async next => ({ ...next, version: next.version + 1 }) });
  let tree = await ui.start(); await planningPanel(tree).props.onCommit(proposed); tree = ui.render();
  assert.deepEqual(planningPanel(tree).props.planning, proposed);
  const analysis = currentAnalysis(ui);
  assert.equal(analysis.source.portfolioVersion, initial.version + 1);
  assert.deepEqual(analysis.budget.cashRial, { numerator: "10001", denominator: "10" });
  assert.deepEqual(analysis.budget.orders, []); assert.equal(analysis.budget.spendableRial, null);
  assert.equal(analysis.horizons[1].savedDuration.value, "9");
  await panel(tree).props.onCommit(initial.purchaseBook); tree = ui.render();
  assert.deepEqual(planningPanel(tree).props.planning, proposed);
  assert.deepEqual(panel(tree).props.book, initial.purchaseBook); ui.unmount();
});

// Execute the actual component and effects with controlled React hooks and
// synthetic transport. Browser hydration/network/storage are not claimed here.
function harness({ fetchSnapshot, saveSnapshot, stored = {}, requestMarket }) {
  let cursor = 0, timerId = 0, reads = 0, writes = 0, now = at, marketReads = 0;
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
  class Clock extends Date { static now() { return now; } }
  const components = { PurchaseBookPanel: function PurchaseBookPanel() {}, PurchaseRatio: function PurchaseRatio() {} };
  const dependencies = { react, "./purchase-book": { emptyPurchaseBook }, "./purchase-book-panel": components, "./number-value": { NumberValue: function NumberValue() {} }, "./portfolio-persistence": { fetchPortfolioSnapshot: signal => { reads++; requests.push(signal); return fetchSnapshot(reads, signal); } }, "./unified-portfolio-client": { PortfolioSaveError, saveUnifiedPortfolio: next => { writes++; return saveSnapshot(next, writes); }, personalBackup() { throw Error("unexpected export"); } }, "./personal-market-valuation": { evaluatePersonalMarketValuation }, "./market-test-contract": { MARKET_TTL_MS }, "./managed-market-client": { requestManagedMarket: async () => ({ state: "unavailable", snapshot: null, checkedAt: new Date(at).toISOString(), nextCheckAt: new Date(at + 60_000).toISOString(), quota: null }) }, "./unified-portfolio.css": {} };
  const exports = {};
  dependencies["./personal-asset-order"] = assetOrder;
  dependencies["./personal-portfolio-analysis"] = { buildPersonalPortfolioAnalysis };
  dependencies["./personal-planning-panel"] = { PersonalPlanningPanel: function PersonalPlanningPanel() {} };
  dependencies["./personal-portfolio-analysis-panel"] = { PersonalPortfolioAnalysisPanel: function PersonalPortfolioAnalysisPanel() {} };
  if (requestMarket) dependencies["./managed-market-client"] = { requestManagedMarket: signal => { marketReads++; return requestMarket(marketReads, signal); } };
  new Function("require", "exports", "React", "window", "document", "sessionStorage", "Date", compiled)(name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, exports, React, window, document, { getItem: key => stored[key] ?? null }, Clock);
  const render = () => { cursor = 0; const tree = exports.UnifiedPortfolioWorkspace(); while (effects.length) effects.shift()(); return tree; };
  return { render, requests, get reads() { return reads; }, get writes() { return writes; }, get marketReads() { return marketReads; }, setTime(value) { now = value; }, fire(name) { events.get(name)?.(); return render(); }, async start() { render(); for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); } await flush(); return render(); }, unmount() { for (const slot of slots) slot.cleanup?.(); }, get listenerCount() { return events.size; } };
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

test("actual private workspace sorting preserves saved version, exact purchase IDs, preferences draft and editor identity without writes", async () => {
  const saved = snapshot(), common = { assetClass: "gold", unit: "gram", purityPermille: 750, quantity: "1", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", fees: "0", note: "NONPRIVATE SORT FIXTURE", source: { kind: "manual", reference: null }, fx: null };
  saved.holdings = []; saved.purchaseBook.lots = [{ ...common, id: "gold", assetId: "GOLD_18K_IRR", unitPrice: "500" }, { ...common, id: "silver", assetId: "SILVER_999_IRR", assetClass: "silver", purityPermille: 999, unitPrice: "100" }, { ...common, id: "unknown", assetId: "SILVER_925_IRR", assetClass: "silver", purityPermille: 925, unitPrice: null }];
  const before = JSON.stringify(saved), ui = harness({ fetchSnapshot: async () => saved, saveSnapshot: async () => assert.fail("sort must not save") });
  let tree = await ui.start(); const retained = panel(tree), select = (view, id) => nodes(view).find(node => node.props["data-testid"] === id);
  const rows = evaluatePersonalMarketValuation(saved.purchaseBook, [], null, at).rows, expected = ids => ids.map(id => `asset-${rows.find(row => row.assetId === id).id}`);
  const displayed = () => nodes(ui.render()).filter(node => node.type === "article" && node.props["data-testid"]?.startsWith("asset-")).map(node => node.props["data-testid"]);
  const originalOrder = displayed(); inputs(tree)[0].props.onChange({ target: { value: "7" } });
  select(tree, "unified-sort-field").props.onChange({ target: { value: "cost" } }); tree = ui.render();
  assert.deepEqual(displayed(), expected(["SILVER_999_IRR", "GOLD_18K_IRR", "SILVER_925_IRR"]));
  select(tree, "unified-sort-direction").props.onChange({ target: { value: "desc" } }); tree = ui.render();
  assert.deepEqual(displayed(), expected(["GOLD_18K_IRR", "SILVER_999_IRR", "SILVER_925_IRR"]));
  button(tree, "ثبت و ویرایش").props.onClick(); tree = ui.render(); button(tree, "نمای سبد").props.onClick(); tree = ui.render();
  assert.equal(select(tree, "unified-sort-field").props.value, "cost"); assert.equal(select(tree, "unified-sort-direction").props.value, "desc");
  select(tree, "unified-sort-field").props.onChange({ target: { value: "original" } }); tree = ui.render(); assert.deepEqual(displayed(), originalOrder);
  assert.equal(panel(tree).type, retained.type); assert.equal(panel(tree).key, retained.key); assert.equal(panel(tree).props.book, retained.props.book);
  assert.equal(inputs(tree)[0].props.value, "7"); assert.equal(JSON.stringify(saved), before); assert.equal(ui.writes, 0); assert.equal(ui.reads, 1); ui.unmount();
});

const analysisQuotes = () => makeNavasanSnapshot({ "18ayar": { value: "1000000", timestamp: at / 1000 } }, "TOMAN", new Date(at).toISOString());
const analysisMarketReply = (market = analysisQuotes()) => ({ state: market ? "received" : "unavailable", snapshot: market, checkedAt: new Date(at).toISOString(), nextCheckAt: new Date(at + 10 * MARKET_TTL_MS).toISOString(), reason: market ? "updated" : "cache_unavailable", quota: null });
const analysisPurchase = () => ({ id: "synthetic-analysis-purchase", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750, quantity: "3", purchaseDate: "2000-01-02", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "700000", fees: "0.25", note: "synthetic integration fixture", source: { kind: "manual", reference: null }, fx: null });

test("analysis and overview share the exact confirmed valuation after a purchase commit", async () => {
  const saved = snapshot(), market = analysisQuotes(), before = structuredClone(saved);
  let submitted;
  const ui = harness({ fetchSnapshot: async () => saved, saveSnapshot: async next => { submitted = next; return { ...next, version: next.version + 1 }; }, requestMarket: async () => analysisMarketReply(market) });
  await ui.start();
  const initial = currentAnalysis(ui); assert.equal(initial.source.portfolioVersion, 3);
  assert.deepEqual(initial.valuation.rows[0].quantity, { numerator: "2", denominator: "1" });
  await panel(ui.render()).props.onCommit({ ...emptyPurchaseBook(), lots: [analysisPurchase()] });
  const updated = currentAnalysis(ui);
  assert.equal(updated.source.portfolioVersion, 4);
  assert.deepEqual(updated.valuation, evaluatePersonalMarketValuation(submitted.purchaseBook, submitted.holdings, market, at));
  assert.deepEqual(updated.valuation.rows[0].quantity, { numerator: "5", denominator: "1" });
  assert.deepEqual(updated.valuation.rows[0].lotIds, ["synthetic-analysis-purchase"]);
  assert.deepEqual(updated.valuation.rows[0].legacyIds, ["balance"]);
  button(ui.render(), "نمای سبد").props.onClick();
  assert.ok(nodes(ui.render()).some(node => node.type?.name === "PurchaseRatio" && node.props.value === updated.valuation.totals.currentValueRial));
  assert.equal(currentAnalysis(ui), updated); assert.deepEqual(saved, before);
  assert.equal(ui.writes, 1); assert.equal(ui.marketReads, 1); ui.unmount();
});

test("unsaved preferences do not affect analysis; confirmed save advances its version and comparison", async () => {
  const ui = harness({ fetchSnapshot: async () => snapshot(), saveSnapshot: async next => ({ ...next, version: next.version + 1 }), requestMarket: async () => analysisMarketReply() });
  await ui.start(); const before = currentAnalysis(ui);
  assert.equal(before.assets[0].savedLimitComparison, "above_saved_limit");
  inputs(ui.render())[1].props.onChange({ target: { value: "100" } });
  inputs(ui.render())[3].props.onChange({ target: { value: "6" } });
  assert.equal(currentAnalysis(ui), before);
  assert.equal(currentAnalysis(ui).horizons[0].savedDuration.value, "3");
  await form(ui.render()).props.onSubmit({ preventDefault() {} });
  const saved = currentAnalysis(ui);
  assert.equal(saved.source.portfolioVersion, 4);
  assert.equal(saved.assets[0].savedLimitComparison, "within_saved_limit");
  assert.deepEqual(saved.savedMaximumAssetPercent, { numerator: "100", denominator: "1" });
  assert.equal(saved.horizons[0].savedDuration.value, "6");
  assert.equal(saved.horizons[1].savedDuration, null);
  assert.deepEqual(saved.valuation, before.valuation);
  assert.equal(ui.writes, 1); ui.unmount();
});

test("a failed purchase save leaves analysis unchanged until a confirmed reload replaces every source field", async () => {
  const remote = snapshot(12, { maxSingleAssetPercent: "100", shortTermMonths: "8" });
  remote.holdings[0].amount = 9;
  const reload = pending();
  const ui = harness({ fetchSnapshot: async call => call === 1 ? snapshot() : reload.promise, saveSnapshot: async () => { throw new PortfolioSaveError("synthetic conflict", true); }, requestMarket: async () => analysisMarketReply() });
  await ui.start(); const before = currentAnalysis(ui);
  await assert.rejects(panel(ui.render()).props.onCommit({ ...emptyPurchaseBook(), lots: [analysisPurchase()] }));
  assert.equal(currentAnalysis(ui), before);
  button(ui.render(), "بررسی وضعیت ذخیره").props.onClick(); await flush();
  assert.equal(currentAnalysis(ui), before);
  reload.resolve(remote); await flush();
  const changed = currentAnalysis(ui);
  assert.equal(changed.source.portfolioVersion, 12);
  assert.deepEqual(changed.valuation.rows[0].quantity, { numerator: "9", denominator: "1" });
  assert.deepEqual(changed.valuation.rows[0].lotIds, []);
  assert.equal(changed.assets[0].savedLimitComparison, "within_saved_limit");
  assert.equal(changed.horizons[0].savedDuration.value, "8");
  assert.equal(ui.reads, 2); assert.equal(ui.writes, 1); ui.unmount();
});

test("simulated missing and expired quotes remove current diagnostics without creating decisions or budgets", async () => {
  for (const market of [null, analysisQuotes()]) {
    const ui = harness({ fetchSnapshot: async () => snapshot(), saveSnapshot: async () => assert.fail("market state must not save"), requestMarket: async () => analysisMarketReply(market) });
    await ui.start();
    if (market) {
      assert.notEqual(currentAnalysis(ui).valuation.totals.currentValueRial, null);
      ui.setTime(at + MARKET_TTL_MS + 1); ui.fire("window:focus");
    }
    const result = currentAnalysis(ui);
    assert.equal(result.valuation.totals.currentValueRial, null);
    assert.ok(result.assets.every(row => row.holdingsSharePercent === null));
    assert.ok(result.horizons.every(horizon => horizon.state === "no_decision" && horizon.missingInputs.includes("incomplete_valuation")));
    assert.equal(result.budget.cashRial, null); assert.equal(result.budget.spendableRial, null);
    assert.deepEqual(result.budget.orders, []); assert.equal(result.financialUseAllowed, false); assert.equal(result.executionAllowed, false);
    assert.equal(ui.marketReads, 1); assert.equal(ui.writes, 0); ui.unmount();
  }
});
