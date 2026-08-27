import assert from "node:assert/strict";
import test from "node:test";

import { assetCategories, assetOptions, getAssetOptionsForCategory } from "../app/asset-catalog.ts";

test("asset picker exposes a short category list and keeps every existing asset", () => {
  assert.equal(assetCategories.length, 6);
  assert.equal(assetOptions.length, 20);
  assert.equal(new Set(assetOptions).size, assetOptions.length);
});

test("asset types are filtered by their selected category", () => {
  assert.deepEqual(getAssetOptionsForCategory("cash-currency"), ["ارز خارجی", "وجه نقد و سپرده بانکی"]);
  assert.deepEqual(getAssetOptionsForCategory("capital-market"), ["سهام", "صندوق سرمایه‌گذاری و ETF", "گواهی سپرده کالایی"]);
  assert.deepEqual(getAssetOptionsForCategory("unknown"), []);
});
