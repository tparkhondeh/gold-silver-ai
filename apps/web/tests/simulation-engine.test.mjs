import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSandboxQuotes,
  buildSandboxPremiumMetrics,
  calculateSandboxDecision,
  sandboxMethodology,
  sandboxPremiumMethodology,
  sandboxReadinessGates,
} from "../app/simulation-engine.ts";

test("builds a fixed synthetic quote set with explicit sandbox provenance", () => {
  const timestamp = "2026-08-28T10:00:00.000Z";
  const quotes = buildSandboxQuotes(timestamp);
  assert.equal(quotes.length, 14);
  assert.ok(quotes.every((quote) => quote.sourceId === "asha-sandbox"));
  assert.ok(quotes.every((quote) => quote.sourceName.includes("ساختگی")));
  assert.ok(quotes.every((quote) => quote.collectedAt === timestamp));
  assert.throws(() => buildSandboxQuotes("not-a-time"), /ISO-8601/);
});

test("produces a hand-verifiable short-horizon sandbox liquidity action", () => {
  const result = calculateSandboxDecision([
    { id: "asset", name: "طلای ۱۸ عیار", valueToman: 900, costToman: 800 },
    { id: "cash", name: "وجه نقد و سپرده بانکی", valueToman: 100, costToman: 100 },
  ], {
    liquidityReservePercent: "20",
    maxSingleAssetPercent: "50",
    maxAcceptableDrawdownPercent: "20",
    shortTermMonths: "6",
    longTermYears: "5",
  }, "short");

  assert.equal(result.totalValueToman, 1_000);
  assert.equal(result.cashGapToman, 100);
  assert.equal(result.overallAction.code, "increase_demo_liquidity");
  assert.equal(result.overallAction.amountToman, 100);
  assert.equal(result.rows[0].allocationPercent, 90);
  assert.equal(result.rows[0].returnPercent, 12.5);
  assert.equal(result.rows[0].homogeneousAction, "protect_demo_gain");
  assert.equal(result.rows[0].heterogeneousAction, "rebalance_demo_to_cash");
  assert.equal(result.overallAction.sourceName, "طلای ۱۸ عیار");
  assert.equal(result.overallAction.destinationName, "وجه نقد و سپرده بانکی");
  assert.equal(result.executionAllowed, false);
});

test("keeps sandbox readiness and methodology visibly non-operational", () => {
  assert.equal(sandboxReadinessGates.length, 6);
  assert.equal(sandboxMethodology.status, "synthetic_demo_only");
  assert.equal(sandboxMethodology.executionAllowed, false);
});

test("provides bounded synthetic premium history only for applicable demo assets", () => {
  const gold = buildSandboxPremiumMetrics("طلای ۱۸ عیار", 33);
  assert.equal(gold.applicable, true);
  assert.equal(gold.current, 33);
  assert.ok(gold.minimum <= gold.average);
  assert.ok(gold.average <= gold.maximum);
  const cash = buildSandboxPremiumMetrics("وجه نقد و سپرده بانکی", null);
  assert.equal(cash.applicable, false);
  assert.equal(cash.current, null);
  assert.equal(sandboxPremiumMethodology.status, "synthetic_demo_only");
});
