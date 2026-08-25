import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePortfolioScenario,
  calculatePremiumPercent,
  calculateScenarioMove,
  emptyScenarioShocks,
} from "../app/scenario-engine.ts";

test("applies the disclosed what-if sensitivities deterministically", () => {
  const shocks = { ...emptyScenarioShocks, usd: 10, gold: 5, premium: 4 };
  assert.equal(calculateScenarioMove("طلای ۱۸ عیار", shocks), 15);
  assert.equal(calculateScenarioMove("سکه امامی", shocks), 18);
  assert.equal(calculateScenarioMove("وجه نقد و سپرده بانکی", shocks), 0);
});

test("aggregates only covered holdings and preserves hand-verifiable totals", () => {
  const shocks = { ...emptyScenarioShocks, usd: 10, gold: 5 };
  const result = calculatePortfolioScenario([
    { id: "gold", name: "طلای ۱۸ عیار", valueToman: 1_000 },
    { id: "cash", name: "وجه نقد و سپرده بانکی", valueToman: 1_000 },
    { id: "missing", name: "سهام", valueToman: null },
  ], shocks);

  assert.equal(result.baseValueToman, 2_000);
  assert.equal(result.projectedValueToman, 2_150);
  assert.equal(result.impactToman, 150);
  assert.equal(result.impactPercent, 7.5);
  assert.equal(result.coverageCount, 2);
  assert.equal(result.totalCount, 3);
});

test("computes a raw metal-content premium and rejects invalid inputs", () => {
  const reference = 3_110.34768;
  const usdToman = 100_000;
  const theoretical = (reference / 31.1034768) * usdToman * 0.75;
  assert.ok(Math.abs(calculatePremiumPercent(theoretical * 1.1, reference, usdToman, 0.75) - 10) < 1e-9);
  assert.equal(calculatePremiumPercent(0, reference, usdToman, 0.75), null);
});
