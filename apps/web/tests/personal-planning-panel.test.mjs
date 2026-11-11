import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as planning from "../app/personal-planning.ts";

const source = readFileSync(new URL("../app/personal-planning-panel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [];
const byId = (tree, id) => nodes(tree).find(node => node.props["data-testid"] === id);
const text = tree => Array.isArray(tree) ? tree.map(text).join("") : tree?.props ? text(tree.props.children) : typeof tree === "string" ? tree : "";
function harness() {
  let cursor = 0, saved = planning.emptyPersonalPlanning(), reject = false, busy = false;
  const slots = [], calls = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  };
  const exports = {}, dependencies = { react, "./personal-planning": planning, "./number-value": { NumberValue() {} } };
  new Function("require", "exports", "React", compiled)(name => { assert.ok(name in dependencies); return dependencies[name]; }, exports, React);
  const api = {
    calls,
    render() { cursor = 0; return exports.PersonalPlanningPanel({ planning: saved, busy, onCommit: async value => { calls.push(value); if (reject) throw Error("synthetic save failure"); saved = value; } }); },
    edit(id, value) { byId(api.render(), id).props.onChange({ target: { value } }); },
    submit() { return nodes(api.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); },
    fail(value) { reject = value; }, setSaved(value) { saved = value; }, setBusy(value) { busy = value; },
  }; return api;
}
test("empty planning accepts explicit zero and exact decimals, never replaces blank with default", async () => {
  const ui = harness(); await ui.submit(); assert.deepEqual(ui.calls[0], planning.emptyPersonalPlanning());
  ui.edit("planning-cash", "0"); ui.edit("planning-medium-months", "9"); await ui.submit();
  assert.deepEqual(ui.calls[1], { ...planning.emptyPersonalPlanning(), spendableCashToman: "0", mediumTermMonths: 9 });
  ui.edit("planning-cash", "9007199254740993.01"); await ui.submit();
  assert.equal(ui.calls[2].spendableCashToman, "9007199254740993.01");
});
test("invalid planning and failed confirmation retain both drafts and reject extra precision", async () => {
  const ui = harness(); ui.edit("planning-cash", "0.001"); ui.edit("planning-medium-months", "6"); await ui.submit();
  assert.equal(ui.calls.length, 0); assert.equal(byId(ui.render(), "planning-cash").props.value, "0.001");
  ui.edit("planning-cash", "12.30"); ui.fail(true); await ui.submit();
  assert.equal(ui.calls[0].spendableCashToman, "12.3"); assert.equal(byId(ui.render(), "planning-cash").props.value, "12.30");
  assert.equal(byId(ui.render(), "planning-medium-months").props.value, "6");
  assert.match(text(ui.render()), /ورودی حفظ شد/);
});
test("changed saved planning cannot be overwritten by a stale draft; busy also blocks submission", async () => {
  const ui = harness(); ui.edit("planning-cash", "100");
  ui.setSaved({ ...planning.emptyPersonalPlanning(), spendableCashToman: "200", mediumTermMonths: 8 });
  await ui.submit(); assert.equal(ui.calls.length, 0); assert.match(text(ui.render()), /نسخهٔ ذخیره‌شده تغییر کرده/);
  assert.equal(byId(ui.render(), "planning-cash").props.value, "100");
  const other = harness(); other.edit("planning-cash", "0"); other.setBusy(true); await other.submit(); assert.equal(other.calls.length, 0);
});
