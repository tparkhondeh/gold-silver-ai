import assert from "node:assert/strict";
import test from "node:test";

import { parseNavasanQuotaHealth } from "../app/navasan-quota-view.ts";

test("accepts only the complete free-plan quota health contract", () => {
  const result = parseNavasanQuotaHealth({ engines: [{
    id: "navasan-quota",
    state: "quota_ready",
    reason: "ready",
    details: {
      plan: "free",
      configurationValid: true,
      adjustedForSafety: true,
      refreshSeconds: 24_000,
      maximumScheduledCallsInWindow: 112,
      providerPlanLimit: 120,
      used: 7,
      remaining: 108,
      limit: 115,
      windowDays: 31,
      latestOutcome: {
        outcome: "success",
        quoteCount: 8,
        durationMs: 125,
        completedAt: "2026-09-01T09:00:00.000Z",
      },
      nextEligibleAt: "2026-09-01T09:40:00.000Z",
    },
  }] });
  assert.equal(result.state, "ready");
  assert.equal(result.details?.used, 7);
  assert.equal(result.details?.remaining, 108);
  assert.equal(result.details?.refreshSeconds, 24_000);
  assert.equal(result.details?.configurationValid, true);
  assert.equal(result.details?.latestOutcome?.outcome, "success");
  assert.equal(result.details?.latestOutcome?.quoteCount, 8);
  assert.equal(result.details?.nextEligibleAt, "2026-09-01T09:40:00.000Z");
});

test("fails closed for paid, malformed, or unavailable quota health", () => {
  const paid = parseNavasanQuotaHealth({ engines: [{
    id: "navasan-quota",
    state: "quota_ready",
    details: { plan: "standard", configurationValid: true, used: 0, remaining: 115, limit: 115, windowDays: 31, refreshSeconds: 120, maximumScheduledCallsInWindow: 22_321, providerPlanLimit: 30_000 },
  }] });
  assert.equal(paid.state, "blocked");
  assert.match(paid.message, /رایگان/);
  assert.equal(parseNavasanQuotaHealth({ engines: [] }).state, "blocked");
  assert.equal(parseNavasanQuotaHealth({ engines: [{ id: "navasan-quota", state: "blocked", reason: "دفتر آماده نیست" }] }).message, "دفتر آماده نیست");

  const fallback = parseNavasanQuotaHealth({ engines: [{
    id: "navasan-quota",
    state: "quota_ready",
    details: { plan: "free", configurationValid: false, used: 0, remaining: 115, limit: 115, windowDays: 31, refreshSeconds: 24_000, maximumScheduledCallsInWindow: 112, providerPlanLimit: 120, latestOutcome: null, nextEligibleAt: null },
  }] });
  assert.equal(fallback.state, "ready");
  assert.match(fallback.message, /جایگزین/);

  const malformedOutcome = parseNavasanQuotaHealth({ engines: [{
    id: "navasan-quota",
    state: "quota_ready",
    details: { plan: "free", configurationValid: true, used: 0, remaining: 115, limit: 115, windowDays: 31, refreshSeconds: 24_000, maximumScheduledCallsInWindow: 112, providerPlanLimit: 120, latestOutcome: { outcome: "success", quoteCount: null, durationMs: 1, completedAt: "invalid" }, nextEligibleAt: "invalid" },
  }] });
  assert.equal(malformedOutcome.state, "blocked");
});
