import assert from "node:assert/strict";
import test from "node:test";

import { assetCategories, assetOptions, getAssetCategoryForAsset, getAssetOptionsForCategory } from "../app/asset-catalog.ts";

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

test("portfolio holdings resolve to an expandable home category", () => {
  assert.equal(getAssetCategoryForAsset("سکه امامی").id, "precious-metals");
  assert.equal(getAssetCategoryForAsset("ملک و زمین").id, "physical-assets");
  assert.equal(getAssetCategoryForAsset("دارایی ناشناخته").id, "other");
});
