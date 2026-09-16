import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("personal purchase basis targets all four actual view IDs and retains exact display boundaries", async () => {
  // Source wiring guard, complementary to the separately recorded hydrated browser acceptance.
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/purchase-book-panel.tsx", import.meta.url), "utf8");
  const number = await readFile(new URL("../app/number-value.tsx", import.meta.url), "utf8");
  assert.match(page, /\["overview", "asset-center", "analysis", "decisions"\]\.includes\(view\)/);
  assert.match(page, /const holdings = portfolioMode === "personal" \? purchaseEvaluation.holdings : legacyHoldings/);
  assert.match(panel, /disabled=\{!preview.canImport \|\| busy \|\| reading \|\| stalePreview \|\| !legacyValid\}/);
  assert.match(panel, /disabled=\{busy \|\| reading\} onClick=\{\(\) => setPreview\(null\)\}/);
  assert.match(number, /function NumberValue\(\{ value, denominator, unit/);
});
