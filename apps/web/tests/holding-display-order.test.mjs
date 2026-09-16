import assert from "node:assert/strict";
import test from "node:test";
import { orderHoldingRows } from "../app/holding-display-order.ts";
import { createSharedPortfolio, encodeSharedPortfolio, evaluateSharedPortfolio } from "../app/shared-portfolio.ts";

test("holding display sorts exact large amounts, preserves ties and puts unknowns last", () => {
  const rows = [
    { id: "missing", name: "نامشخص", value: null, weight: null },
    { id: "b", name: "طلا", value: "9007199254740993", weight: 2 },
    { id: "a", name: "نقره", value: "9007199254740992", weight: 2 },
    { id: "zero", name: "سکه", value: "0", weight: 0 },
  ];
  const before = structuredClone(rows);
  const ids = (sort) => orderHoldingRows(rows, sort).map(row => row.id);
  assert.deepEqual(ids({ key: "value", direction: "asc" }), ["zero", "a", "b", "missing"]);
  assert.deepEqual(ids({ key: "value", direction: "desc" }), ["b", "a", "zero", "missing"]);
  assert.deepEqual(ids({ key: "weight", direction: "desc" }), ["a", "b", "zero", "missing"]);
  assert.deepEqual(ids({ key: "name", direction: "asc" }), ["zero", "b", "missing", "a"]);
  assert.deepEqual(rows, before);
  assert.deepEqual(orderHoldingRows(rows, null), rows);
  assert.notEqual(orderHoldingRows(rows, null), rows);
});

test("display ordering does not change portfolio input, selection, replay or budget", () => {
  const portfolio = createSharedPortfolio();
  const before = encodeSharedPortfolio(portfolio);
  const result = evaluateSharedPortfolio(portfolio);
  const rows = portfolio.input.assets.map(asset => ({ id: asset.id, name: asset.name, value: result.values[asset.id], weight: result.weightsBps[asset.id] }));
  for (const key of ["name", "value", "weight"]) for (const direction of ["asc", "desc"]) {
    orderHoldingRows(rows, { key, direction });
    assert.equal(encodeSharedPortfolio(portfolio), before);
    assert.deepEqual(evaluateSharedPortfolio(portfolio), result);
  }
});
