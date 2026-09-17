import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as purchases from "../app/purchase-book.ts";
import * as numeric from "../data/portfolio-numeric-contract.ts";

const source = readFileSync(new URL("../app/purchase-book-panel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(`${source}\nexport { HoldingForm as TestHoldingForm, LotForm as TestLotForm };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const amountView = ({ value, unit = "" }) => React.createElement("span", {}, String(value), " ", unit);
function load(react = React, importer = {}) {
  const exports = {};
  const dependencies = { react, "./purchase-book.css": {}, "./number-value": { NumberValue: amountView }, "./purchase-book": purchases, "../data/portfolio-numeric-contract": numeric, "./purchase-import": importer };
  class FormData { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } }
  new Function("require", "exports", "React", "FormData", compiled)(name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, exports, React, FormData);
  return exports;
}

// Actual component/submit handlers run with deterministic hook slots and form
// values. This is not a hydrated browser test; no network/storage/files are used.
function harness(name, initialProps, importer) {
  const slots = [], effects = []; let cursor = 0, props = initialProps;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(callback, dependencies) { const index = cursor++; if (!(index in slots)) effects.push(() => { slots[index] = { dependencies, cleanup: callback() }; }); },
  };
  const component = load(react, importer)[name];
  return {
    render(overrides = {}) { props = { ...props, ...overrides }; cursor = 0; const tree = component(props); while (effects.length) effects.shift()(); return tree; },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !tree.props) return [];
  return [tree, ...nodes(tree.props.children)];
}
function byId(tree, id) { return nodes(tree).find(node => node.props["data-testid"] === id); }
function childForm(tree, name) { return nodes(tree).find(node => node.type?.name === name); }
const text = tree => typeof tree === "string" || typeof tree === "number" ? String(tree) : Array.isArray(tree) ? tree.map(text).join("") : tree?.props ? text(tree.props.children) : "";
const flush = () => new Promise(resolve => setImmediate(resolve));
const submit = (form, values) => form.props.onSubmit({ preventDefault() {}, currentTarget: values });
const holding = (id = "opening", fields = {}) => ({ id, name: "طلای ۱۸ عیار", unit: "گرم", amount: 2.5, costToman: null, purchaseDate: "1405-06-26", note: "synthetic retained balance", ...fields });
const lot = (id = "purchase", fields = {}) => ({ id, assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750, quantity: "1.000000000001", purchaseDate: "2000-01-03", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "123.456789012345", fees: null, note: "synthetic purchase", source: { kind: "manual", reference: null }, fx: null, ...fields });
const book = (...lots) => ({ ...purchases.emptyPurchaseBook(), lots });
const defaultProps = (fields = {}) => ({ book: book(lot()), legacyHoldings: [holding()], onCommit: async () => { throw Error("unexpected purchase write"); }, onCommitHoldings: async () => { throw Error("unexpected balance write"); }, busy: false, ...fields });

test("one visible record list retains both identities, one entry and Excel path, without deletion or conversion", () => {
  const { PurchaseBookPanel } = load();
  const props = defaultProps(); const before = structuredClone(props.book);
  const html = renderToStaticMarkup(React.createElement(PurchaseBookPanel, props));
  assert.equal((html.match(/data-testid="purchase-records"/g) ?? []).length, 1);
  assert.equal((html.match(/data-testid="add-purchase"/g) ?? []).length, 1);
  assert.equal((html.match(/data-testid="purchase-file"/g) ?? []).length, 1);
  assert.match(html, /edit-purchase-purchase/); assert.match(html, /edit-holding-opening/);
  assert.match(html, /نیازمند تکمیل مشخصات خرید/); assert.match(html, /1405-06-26/);
  assert.match(html, /templates\/purchase-lots-v1.xlsx/); assert.match(html, /جمع موجودی و میانگین‌های خرید/);
  assert.doesNotMatch(html, /حذف|خریدهای مستقل|موجودی‌های قدیمی|خرید جدید|نشست/);
  assert.deepEqual(props.book, before);
});

test("balance edit submits only its permitted fields and preserves every other record and the book", async () => {
  const initial = [holding(), holding("other", { name: "دارایی با هویت مستقل", unit: "واحد", amount: 7 })];
  let committed, obsoleteCalls = 0;
  const panel = harness("PurchaseBookPanel", defaultProps({ legacyHoldings: initial, onEditLegacy: () => { obsoleteCalls++; }, onCommitHoldings: async next => { committed = next; return true; } }));
  byId(panel.render(), "edit-holding-opening").props.onClick();
  const child = childForm(panel.render(), "HoldingForm"); assert.ok(child);
  const editor = harness("TestHoldingForm", child.props);
  await submit(editor.render(), { amount: "3.125", cost: "1000.01", date: "1405-06-26", note: " corrected ", name: "tampered", unit: "tampered", id: "tampered", fees: "999" });
  assert.deepEqual(committed, [{ ...initial[0], amount: 3.125, costToman: 1000.01, note: "corrected" }, initial[1]]);
  assert.equal(initial[0].amount, 2.5); assert.equal(obsoleteCalls, 0);
  assert.equal(childForm(panel.render(), "HoldingForm"), undefined);
});

test("failed or conflicting balance persistence retains the form and null cost/date remain unknown", async () => {
  for (const fail of [async () => false, async () => { throw Error("نسخه تغییر کرده است"); }]) {
    let candidate;
    const panel = harness("PurchaseBookPanel", defaultProps({ onCommitHoldings: async next => { candidate = next; return fail(); } }));
    byId(panel.render(), "edit-holding-opening").props.onClick();
    const child = childForm(panel.render(), "HoldingForm"); const editor = harness("TestHoldingForm", child.props);
    await submit(editor.render(), { amount: "2.5", cost: "", date: "", note: "draft" });
    assert.equal(candidate[0].costToman, null); assert.equal(candidate[0].purchaseDate, null);
    assert.ok(childForm(panel.render(), "HoldingForm"));
    assert.ok(nodes(editor.render()).some(node => node.props.role === "alert"));
    assert.equal(byId(editor.render(), "holding-amount").props.defaultValue, "2.5");
  }
});

test("balance editor rejects rounding, excess database scale, negative, zero and malformed values before callback", async () => {
  let writes = 0;
  const editor = harness("TestHoldingForm", { holding: holding(), onSave: async () => { writes++; }, onCancel() {}, busy: false });
  const base = { amount: "1", cost: "1.01", date: "1405-06-26", note: "" };
  for (const invalid of [{ amount: "9007199254740993" }, { amount: "1.00000000000001" }, { amount: "0" }, { amount: "-1" }, { amount: "NaN" }, { amount: "1e1001" }, { amount: "0x10" }, { cost: "0.001" }, { cost: "999999999999999999.01" }, { date: "yesterday" }, { note: "x".repeat(1001) }]) {
    await submit(editor.render(), { ...base, ...invalid });
    assert.ok(nodes(editor.render()).some(node => node.props.role === "alert"), JSON.stringify(invalid));
  }
  assert.equal(writes, 0);
  for (const amount of ["1e-12", "2.5000", "9007199254740992"]) await submit(editor.render(), { ...base, amount });
  assert.equal(writes, 3);
});

test("stale drafts cannot overwrite changed balances and cancellation remains available", async () => {
  let writes = 0;
  const panel = harness("PurchaseBookPanel", defaultProps({ onCommitHoldings: async () => { writes++; return true; } }));
  byId(panel.render(), "edit-holding-opening").props.onClick();
  const tree = panel.render({ legacyHoldings: [holding("opening", { amount: 4 })] });
  const child = childForm(tree, "HoldingForm"); const editor = harness("TestHoldingForm", child.props);
  await submit(editor.render(), { amount: "3", cost: "", date: "", note: "" });
  assert.equal(writes, 0); assert.match(text(editor.render()), /سبد از زمان/);
  child.props.onCancel(); assert.equal(childForm(panel.render(), "HoldingForm"), undefined);
});

test("same-tick repeated submit owns one write and absent balance callback cannot open an external editor", async () => {
  let writes = 0, resolve;
  const panel = harness("PurchaseBookPanel", defaultProps({ onCommitHoldings: () => { writes++; return new Promise(done => { resolve = done; }); } }));
  byId(panel.render(), "edit-holding-opening").props.onClick();
  const child = childForm(panel.render(), "HoldingForm");
  const first = child.props.onSave(holding()); await child.props.onSave(holding());
  assert.equal(writes, 1); assert.equal(byId(panel.render(), "add-purchase").props.disabled, true);
  resolve(true); await first; assert.equal(byId(panel.render(), "add-purchase").props.disabled, false);
  const unavailable = harness("PurchaseBookPanel", defaultProps({ onCommitHoldings: undefined, onEditLegacy: () => assert.fail("deprecated editor invoked") }));
  assert.equal(byId(unavailable.render(), "edit-holding-opening").props.disabled, true);
});

test("purchase editing keeps exact decimals, dated FX, invoice and receipt lineage without a Number projection", async () => {
  const fx = { tomanPerUsd: "100.000000000001", rateDate: "2000-01-03", rateType: "invoice", source: "manual synthetic", receivedAt: "2000-01-04T00:00:00.000Z", validity: "user_entered_unverified" };
  const imported = lot("opening", { source: { kind: "xlsx", reference: "invoice1" }, fx });
  const original = { ...book(imported), imports: [{ fileSha256: "a".repeat(64), importedAt: "2000-01-04T00:00:00.000Z", lotIds: [imported.id] }] };
  let committed;
  const panel = harness("PurchaseBookPanel", defaultProps({ book: original, onCommit: async next => { committed = next; } }));
  byId(panel.render(), "edit-purchase-opening").props.onClick();
  const child = childForm(panel.render(), "LotForm"); const editor = harness("TestLotForm", child.props);
  await submit(editor.render(), { quantity: "1.000000000001", date: "2000-01-03", time: "09:15", price: "123.456789012345", fees: "", rate: fx.tomanPerUsd, rateDate: fx.rateDate, rateType: fx.rateType, rateSource: fx.source, reference: "invoice1", note: "changed" });
  assert.equal(committed.lots[0].id, "opening"); assert.equal(committed.lots[0].quantity, "1.000000000001");
  assert.equal(committed.lots[0].unitPrice, "123.456789012345"); assert.equal(committed.lots[0].fees, null);
  assert.deepEqual(committed.lots[0].fx, fx); assert.deepEqual(committed.imports, original.imports);
  assert.deepEqual(committed.lots[0].source, imported.source); assert.equal(committed.lots[0].purchaseTime, "09:15");
});

test("new purchase date is required in both rendered form and executed validation", async () => {
  let writes = 0;
  const panel = harness("PurchaseBookPanel", defaultProps({ onCommit: async () => { writes++; } }));
  byId(panel.render(), "add-purchase").props.onClick();
  const child = childForm(panel.render(), "LotForm"); const editor = harness("TestLotForm", child.props);
  assert.equal(byId(editor.render(), "purchase-date").props.required, true);
  for (const date of ["", "2000-02-30"]) await submit(editor.render(), { quantity: "1", date, price: "100", fees: "0" });
  assert.equal(writes, 0); assert.ok(nodes(editor.render()).some(node => node.props.role === "alert"));
});

test("Excel remains preview-first, all-or-nothing, failure-retaining and single-write even on repeated confirmation", async () => {
  const incoming = lot("imported");
  const preview = { version: "asha.purchase_import.v1", fileSha256: "b".repeat(64), importedAt: "2000-01-04T00:00:00.000Z", lots: [incoming], rows: [{ rowNumber: 4, lot: incoming, errors: [], warnings: [] }], errors: [], warnings: ["قیمت فایل را بررسی کن"], canImport: true };
  const existing = book(lot()); let writes = 0, resolve, received;
  const importer = { previewPurchaseWorkbook: async () => preview, confirmPurchaseImport(input, current, confirmed) { assert.equal(input, preview); assert.equal(confirmed, true); return { ...current, lots: [...current.lots, ...input.lots], imports: [{ fileSha256: input.fileSha256, importedAt: input.importedAt, lotIds: input.lots.map(item => item.id) }] }; } };
  const panel = harness("PurchaseBookPanel", defaultProps({ book: existing, onCommit: next => { writes++; received = next; return new Promise(done => { resolve = done; }); } }), importer);
  await byId(panel.render(), "purchase-file").props.onChange({ target: { files: [{ name: "synthetic.xlsx", size: 1 }], value: "chosen" } });
  assert.equal(writes, 0); assert.ok(byId(panel.render(), "purchase-import-preview"));
  const confirm = byId(panel.render(), "confirm-purchase-import"); confirm.props.onClick(); confirm.props.onClick(); await flush();
  assert.equal(writes, 1); assert.deepEqual(received.lots, [...existing.lots, incoming]); assert.equal(received.imports.length, 1);
  resolve(); await flush(); assert.equal(byId(panel.render(), "purchase-import-preview"), undefined);
  const failed = harness("PurchaseBookPanel", defaultProps({ onCommit: async () => { throw Error("ثبت نشد"); } }), importer);
  await byId(failed.render(), "purchase-file").props.onChange({ target: { files: [{ name: "synthetic.xlsx", size: 1 }], value: "" } });
  byId(failed.render(), "confirm-purchase-import").props.onClick(); await flush();
  assert.ok(byId(failed.render(), "purchase-import-preview")); assert.match(text(failed.render()), /ثبت نشد/);
});

test("Excel confirmation closes on invalid balance or changed full portfolio and rejects oversized/non-XLSX files early", async () => {
  let parsed = 0, writes = 0;
  const incoming = lot("imported"); const preview = { lots: [incoming], rows: [], errors: [], warnings: [], canImport: true };
  const panel = harness("PurchaseBookPanel", defaultProps({ onCommit: async () => { writes++; } }), { previewPurchaseWorkbook: async () => { parsed++; return preview; }, confirmPurchaseImport: () => { throw Error("must not confirm"); } });
  const choose = file => byId(panel.render(), "purchase-file").props.onChange({ target: { files: [file], value: "" } });
  await choose({ name: "huge.xlsx", size: 2 * 1024 * 1024 + 1 }); await choose({ name: "wrong.xlsm", size: 1 }); assert.equal(parsed, 0);
  await choose({ name: "valid.xlsx", size: 1 });
  const stale = panel.render({ legacyHoldings: [holding("opening", { amount: 3 })] });
  assert.equal(byId(stale, "confirm-purchase-import").props.disabled, true); byId(stale, "confirm-purchase-import").props.onClick();
  const invalid = panel.render({ legacyHoldings: [holding("opening", { amount: -1 })] });
  assert.equal(byId(invalid, "confirm-purchase-import").props.disabled, true); assert.equal(writes, 0);
});
