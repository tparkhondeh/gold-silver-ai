import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { emptyPurchaseBook } from "../app/purchase-book.ts";
import { personalBackup, decodePersonalBackup, PortfolioSaveError, saveUnifiedPortfolio, samePortfolioContent } from "../app/unified-portfolio-client.ts";
const snapshot = () => ({ version: 3, holdings: [{ id: "saved", name: "دارایی بدون قیمت", amount: 0.00001, unit: "گرم", costToman: null, purchaseDate: null, note: "اطلاعات بدون تغییر" }], purchaseBook: emptyPurchaseBook(), preferences: { liquidityReservePercent: "", maxSingleAssetPercent: "", maxAcceptableDrawdownPercent: "", shortTermMonths: "", longTermYears: "", analysisHorizon: "short", decisionHorizon: "long" } });
const reply = (value, status = 200) => Response.json(value, { status });
test("unified saving confirms every field and version, not browser/session storage", async () => {
  const input = snapshot(), before = JSON.stringify(input);
  const result = await saveUnifiedPortfolio(input, async (url, options) => {
    assert.equal(url, "/api/portfolio"); assert.equal(options.method, "PUT"); assert.equal(options.credentials, "same-origin");
    assert.equal(options.headers["X-Asha-Portfolio-Request"], "save");
    assert.deepEqual(JSON.parse(options.body), { expectedVersion: 3, holdings: input.holdings, preferences: input.preferences, purchaseBook: input.purchaseBook });
    return reply({ ok: true, snapshot: { ...input, version: 4 } });
  });
  assert.equal(result.version, 4); assert.equal(JSON.stringify(input), before);
});
test("canonical comparison accepts JSONB property order but rejects lost exact fields", () => {
  const input = snapshot(), reversed = JSON.parse(JSON.stringify(input));
  reversed.preferences = Object.fromEntries(Object.entries(reversed.preferences).reverse());
  assert.equal(samePortfolioContent(input, reversed), true);
  reversed.holdings[0].amount = 0.00002; assert.equal(samePortfolioContent(input, reversed), false);
});
for (const [label, status, reload] of [["conflict", 409, true], ["validation", 422, false], ["storage", 503, true]]) test(`unified ${label} does not claim successful save`, async () => {
  await assert.rejects(saveUnifiedPortfolio(snapshot(), async () => reply({ ok: false }, status)), (error) => error instanceof PortfolioSaveError && error.requiresReload === reload);
});
test("uncertain network save cannot be silently retried", async () => {
  let calls = 0;
  await assert.rejects(saveUnifiedPortfolio(snapshot(), async () => { calls++; throw Error("offline"); }), (error) => error.requiresReload === true);
  assert.equal(calls, 1);
});
test("invalid local preferences retain the draft without requesting storage or forcing reload", async () => {
  const input = snapshot(); input.preferences.shortTermMonths = "1.5";
  let calls = 0;
  await assert.rejects(saveUnifiedPortfolio(input, async () => { calls++; throw Error(); }), (error) => error instanceof PortfolioSaveError && error.requiresReload === false && error.message.includes("هیچ درخواستی"));
  assert.equal(calls, 0);
});
test("malformed, changed or non-advanced save responses fail closed", async () => {
  const input = snapshot();
  for (const payload of [{ ok: false }, { ok: true, snapshot: input }, { ok: true, snapshot: { ...input, version: 4, holdings: [] } }]) {
    await assert.rejects(saveUnifiedPortfolio(input, async () => reply(payload)), (error) => error.requiresReload);
  }
  await assert.rejects(saveUnifiedPortfolio(input, async () => new Response("bad json")), (error) => error.requiresReload);
});
test("personal backup roundtrip preserves exact input and excludes market/API secrets", () => {
  const input = snapshot(), text = personalBackup(input, "2026-09-17T00:00:00.000Z");
  assert.deepEqual(decodePersonalBackup(text), input);
  assert.doesNotMatch(text, /snapshot\.observations|api.key|NAVASAN/);
  assert.throws(() => personalBackup(input, "bad time"));
  for (const bad of ["x", "{}", JSON.stringify({ format: "wrong" }), " ".repeat(2 * 1024 * 1024 + 1)]) assert.throws(() => decodePersonalBackup(bad));
});
test("public entry imports only unified workspace, not synthetic workbenches", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/unified-portfolio-workspace.tsx", import.meta.url), "utf8");
  assert.match(page, /UnifiedPortfolioWorkspace/);
  assert.doesNotMatch(page + ui, /internal-legacy-workbench|loadDemoPortfolio|DecisionLab|DecisionActionWorkbench|CalibrationReadinessPanel/);
  assert.doesNotMatch(ui, /sessionStorage\.setItem|localStorage\.setItem|دریافت یک‌باره|ذخیرهٔ آخرین قیمت|بازیابی قیمت/);
  assert.match(ui, /fetchPortfolioSnapshot/); assert.match(ui, /saveUnifiedPortfolio/);
  assert.match(ui, /onCommitHoldings=\{commitHoldings\}/);
  // Actual hook retention, clock and cadence behavior lives in unified-market-clock.test.mjs.
  assert.match(ui, /const snapshot = result.snapshot \?\? previous\?\.snapshot \?\? null/);
});
