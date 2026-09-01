import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateNavasanNextEligibleAt,
  NAVASAN_FREE_REFRESH_SECONDS,
  resolveNavasanRefreshPolicy,
} from "../data/navasan-refresh-policy.ts";

test("calculates the next durable live-call boundary without contacting the provider", () => {
  assert.equal(calculateNavasanNextEligibleAt("2026-09-01T03:00:00.000Z", 24_000), "2026-09-01T09:40:00.000Z");
  assert.equal(calculateNavasanNextEligibleAt(null, 24_000), null);
  assert.throws(() => calculateNavasanNextEligibleAt("invalid", 24_000), /invalid/);
  assert.throws(() => calculateNavasanNextEligibleAt("2026-09-01T03:00:00.000Z", 0), /invalid/);
});

test("defaults the free plan to a rolling-window-safe refresh cadence", () => {
  const policy = resolveNavasanRefreshPolicy({});
  assert.equal(policy.plan, "free");
  assert.equal(policy.configurationValid, true);
  assert.equal(policy.effectiveRefreshSeconds, NAVASAN_FREE_REFRESH_SECONDS);
  assert.equal(policy.maximumScheduledCallsInWindow, 112);
  assert.equal(policy.durableCallLimit, 115);
  assert.equal(policy.providerPlanLimit, 120);
  assert.equal(policy.maximumScheduledCallsInWindow <= policy.durableCallLimit, true);
});

test("raises the old six-hour free cadence instead of exhausting the monthly allowance", () => {
  const policy = resolveNavasanRefreshPolicy({
    NAVASAN_PLAN: "free",
    NAVASAN_REFRESH_SECONDS: "21600",
  });
  assert.equal(policy.requestedRefreshSeconds, 21_600);
  assert.equal(policy.effectiveRefreshSeconds, 24_000);
  assert.equal(policy.adjustedForSafety, true);
  assert.equal(policy.maximumScheduledCallsInWindow, 112);
});

test("keeps slower free settings and known paid-plan settings deterministic", () => {
  const slower = resolveNavasanRefreshPolicy({ NAVASAN_PLAN: "free", NAVASAN_REFRESH_SECONDS: "28800" });
  assert.equal(slower.effectiveRefreshSeconds, 28_800);
  assert.equal(slower.adjustedForSafety, false);
  assert.equal(slower.maximumScheduledCallsInWindow, 94);

  const everyTwoDays = resolveNavasanRefreshPolicy({ NAVASAN_PLAN: "free", NAVASAN_REFRESH_SECONDS: "172800" });
  assert.equal(everyTwoDays.effectiveRefreshSeconds, 172_800);
  assert.equal(everyTwoDays.maximumScheduledCallsInWindow, 16);

  const excessive = resolveNavasanRefreshPolicy({ NAVASAN_PLAN: "free", NAVASAN_REFRESH_SECONDS: "999999999999" });
  assert.equal(excessive.configurationValid, false);
  assert.equal(excessive.effectiveRefreshSeconds, 31_536_000);
  assert.equal(excessive.adjustedForSafety, true);

  const standard = resolveNavasanRefreshPolicy({ NAVASAN_PLAN: "standard", NAVASAN_REFRESH_SECONDS: "120" });
  assert.equal(standard.effectiveRefreshSeconds, 120);
  assert.equal(standard.providerPlanLimit, 30_000);
});

test("falls back to the safe free policy for invalid plan or cadence configuration", () => {
  const invalidPlan = resolveNavasanRefreshPolicy({ NAVASAN_PLAN: "unpaid", NAVASAN_REFRESH_SECONDS: "30" });
  assert.equal(invalidPlan.plan, "free");
  assert.equal(invalidPlan.configurationValid, false);
  assert.equal(invalidPlan.effectiveRefreshSeconds, 24_000);

  const invalidCadence = resolveNavasanRefreshPolicy({ NAVASAN_PLAN: "free", NAVASAN_REFRESH_SECONDS: "not-a-number" });
  assert.equal(invalidCadence.configurationValid, false);
  assert.equal(invalidCadence.requestedRefreshSeconds, null);
  assert.equal(invalidCadence.effectiveRefreshSeconds, 24_000);
});
