import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { formatNumber, presentNumber } from "../app/number-display.ts";
import { createSharedPortfolio, encodeSharedPortfolio, decodeSharedPortfolio, evaluateSharedPortfolio } from "../app/shared-portfolio.ts";
import { buildRawMetalDiagnostics, exampleMetalReferences } from "../app/shared-metal-reference.ts";
import { createFileTestPortfolio, saveFileTest, restoreFileTest } from "../app/file-market-contract.ts";
import { createTestLocks } from "./helpers/snapshot-locks.mjs";

test("one-decimal presentation is Persian, grouped, half-away and removes trailing zero", () => {
  for (const [input, compact, exact] of [
    [0, "۰", "۰"], [-0, "۰", "۰"], [1000, "۱٬۰۰۰", "۱٬۰۰۰"],
    [12.34, "≈ ۱۲٫۳", "۱۲٫۳۴"], [12.35, "≈ ۱۲٫۴", "۱۲٫۳۵"],
    [-12.35, "≈ −۱۲٫۴", "−۱۲٫۳۵"], [99.99, "≈ ۱۰۰", "۹۹٫۹۹"],
    [12.1, "۱۲٫۱", "۱۲٫۱"], ["1.2300e2", "۱۲۳", "۱۲۳"],
  ]) { assert.equal(formatNumber(input), compact); assert.equal(presentNumber(input).exact, exact); }
});

test("small positive and negative values never become zero, including scientific notation", () => {
  for (const value of [0.001, 0.099, 1e-12, 5e-324]) {
    assert.equal(formatNumber(value), "کمتر از ۰٫۱");
    assert.equal(formatNumber(-value), "کمتر از ۰٫۱ (منفی)");
    assert.notEqual(presentNumber(value).exact, "۰");
  }
});

test("large scaled integers never pass through Number; exact fractions are not truncated", () => {
  assert.equal(formatNumber("9007199254740993123", 1000), "≈ ۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٫۱");
  assert.equal(presentNumber("9007199254740993123", 1000).exact, "۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٫۱۲۳");
  assert.deepEqual(presentNumber(1, 3), { compact: "≈ ۰٫۳", exact: "۱ / ۳", approximate: true });
  assert.equal(presentNumber(-6, 18).exact, "−۱ / ۳");
  assert.equal(presentNumber(-1, 1000).exact, "−۰٫۰۰۱");
  assert.equal(presentNumber(1, 8).exact, "۰٫۱۲۵");
  assert.equal(formatNumber(1.45), "≈ ۱٫۵");
  assert.equal(formatNumber(144999, 100000), "≈ ۱٫۴"); // no double rounding
  assert.equal(formatNumber(100, 0.1), "۱٬۰۰۰");
});

test("invalid and unbounded display data is explicit, not coerced to zero or HTML", () => {
  for (const value of [NaN, Infinity, -Infinity, "", " ", "0x10", "<script>", "1e9999", "9".repeat(351)]) {
    assert.equal(formatNumber(value), "نامعتبر");
  }
  for (const divisor of [0, -1, "bad"]) assert.equal(formatNumber(1, divisor), "نامعتبر");
});

test("displaying every plan value cannot alter quantities, price limits, budget or canonical replay", () => {
  const portfolio = createSharedPortfolio();
  portfolio.input.minimumCashBps = 1234;
  portfolio.input.shortBudgetBps = 3333;
  const before = encodeSharedPortfolio(portfolio);
  const evaluation = evaluateSharedPortfolio(portfolio);
  function visit(value) {
    if (typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value))) presentNumber(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  }
  visit(evaluation);
  assert.equal(encodeSharedPortfolio(portfolio), before);
  assert.deepEqual(evaluateSharedPortfolio(decodeSharedPortfolio(before)), evaluation);
  const p = evaluation.plan.portfolio;
  assert.equal(BigInt(p.beforeToman), BigInt(p.afterToman) + BigInt(p.totalCostToman));
  const input = evaluation.plan.inputSnapshot;
  const metal = buildRawMetalDiagnostics(input, exampleMetalReferences());
  for (const row of metal.rows.filter(r => r.state === "calculated")) {
    const f = row.premiumPercent;
    assert.notEqual(presentNumber(f.numerator, f.denominator).compact, "نامعتبر");
  }
});

test("UI discloses exact values accessibly, never injects HTML or writes rounded values", async () => {
  const ui = await readFile(new URL("../app/number-value.tsx", import.meta.url), "utf8");
  assert.match(ui, /aria-expanded=\{open\}/); assert.match(ui, /aria-controls=\{id\}/);
  assert.match(ui, /hidden=\{!open\}/); assert.match(ui, /shown.exact/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|localStorage|fetch\(/);
  const shared = await readFile(new URL("../app/shared-portfolio-workspace.tsx", import.meta.url), "utf8");
  assert.match(shared, /value=\{asset.quantityMilli \/ 1000\}/);
  const metal = await readFile(new URL("../app/shared-metal-panel.tsx", import.meta.url), "utf8");
  assert.match(metal, /denominator=\{row.premiumPercent.denominator\}/);
  assert.doesNotMatch(metal, /scaled10000/);
});

test("file draft stays mounted across source/workspace switches, with fresh age on return", async () => {
  const market = await readFile(new URL("../app/market-test-workspace.tsx", import.meta.url), "utf8");
  const file = await readFile(new URL("../app/file-market-workspace.tsx", import.meta.url), "utf8");
  assert.match(market, /hidden=\{!active \|\| !fileMode\} data-testid="retained-file-workspace"/);
  assert.match(market, /fileVisited &&/);
  assert.match(market, /FileMarketWorkspace active=\{active && fileMode\}/);
  assert.doesNotMatch(market, /if \(!active\) return null|if \(fileMode\) return/);
  assert.match(file, /setNow\(Date.now\(\)\)/);
  assert.match(file, /\[active, view\]/);
  assert.doesNotMatch(file, /fetch\(/);
  assert.match(file, /data-revision=\{portfolio.inputs.revision\}/);
});

test("file quantity and limits keep full precision through the actual guarded save/replay", async () => {
  const data = new Map();
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
  const portfolio = createFileTestPortfolio();
  portfolio.inputs.quantitiesMilli.GOLD_18K_IRR = 1234;
  portfolio.inputs.minimumCashBps = 1234;
  portfolio.inputs.cashRial = "3456789";
  assert.equal(formatNumber(portfolio.inputs.quantitiesMilli.GOLD_18K_IRR, 1000), "≈ ۱٫۲");
  assert.equal(formatNumber(portfolio.inputs.minimumCashBps, 100), "≈ ۱۲٫۳");
  const now = Date.parse("2000-01-01T12:00:00.000Z");
  await saveFileTest(storage, portfolio, now, null, createTestLocks());
  const restored = await restoreFileTest(storage, now);
  assert.deepEqual(restored.portfolio, portfolio);
  assert.equal(presentNumber(restored.portfolio.inputs.quantitiesMilli.GOLD_18K_IRR, 1000).exact, "۱٫۲۳۴");
});
