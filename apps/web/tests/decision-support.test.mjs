import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDecisionGates, getAssetClass, getSameClassCandidates } from "../app/decision-support.ts";

test("classifies same-class gold and capital-market alternatives deterministically", () => {
  assert.deepEqual(getAssetClass("سکه امامی"), { id: "gold", label: "طلا" });
  assert.deepEqual(getAssetClass("سهام"), { id: "capital_market", label: "بازار سرمایه" });
  assert.deepEqual(getSameClassCandidates("سکه امامی", ["طلای ۱۸ عیار", "سکه امامی", "شمش نقره ۹۹۹"]), ["طلای ۱۸ عیار"]);
});

test("keeps every financial decision locked until all explicit gates pass", () => {
  const locked = evaluateDecisionGates({
    hasPortfolio: true,
    portfolioFullyValued: true,
    hasFreshIranData: true,
    ownerConstraintsDefined: false,
    methodologyApproved: false,
    historicalValidationPassed: false,
  });
  assert.equal(locked.operational, false);
  assert.equal(locked.passedCount, 3);
  assert.match(locked.safeAction, /دروازهٔ ایمنی/);

  const complete = evaluateDecisionGates({
    hasPortfolio: true,
    portfolioFullyValued: true,
    hasFreshIranData: true,
    ownerConstraintsDefined: true,
    methodologyApproved: true,
    historicalValidationPassed: true,
  });
  assert.equal(complete.operational, true);
  assert.equal(complete.passedCount, 6);
});
