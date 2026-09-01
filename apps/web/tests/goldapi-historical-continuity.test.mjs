import assert from "node:assert/strict";
import test from "node:test";

import { auditGoldApiHistoricalContinuity } from "../app/goldapi-historical-continuity.ts";
import { normalizeGoldApiHistoryPayload } from "../app/goldapi-history.ts";

const collectedAt = "2026-09-01T12:00:00.000Z";

function points(prices) {
  return normalizeGoldApiHistoryPayload({
    metal: "XAU",
    currency: "USD",
    from: "2025-01-01",
    to: "2025-01-03",
    prices,
  }, { metal: "XAU", from: "2025-01-01", to: "2025-01-03" }, collectedAt);
}

test("records omitted provider dates without interpolation or storage permission", () => {
  const report = auditGoldApiHistoricalContinuity(points([
    { date: "2025-01-01", price: 2_624.18 },
    { date: "2025-01-03", price: 2_640.45 },
  ]), { metal: "XAU", start: "2025-01-01", end: "2025-01-03" });

  assert.equal(report.status, "gaps_recorded");
  assert.deepEqual(report.unobservedProviderDates, ["2025-01-02"]);
  assert.equal(report.interpolatedPoints, 0);
  assert.equal(report.marketCalendarKnown, false);
  assert.equal(report.canAuthorizeStorage, false);
  assert.deepEqual(report.issues, []);
});

test("quarantines duplicate, out-of-range, and mixed-metal points", () => {
  const normal = points([{ date: "2025-01-01", price: 2_624.18 }])[0];
  const report = auditGoldApiHistoricalContinuity([
    normal,
    normal,
    { ...normal, providerCode: "XAG", providerDateGregorian: "2025-01-04" },
  ], { metal: "XAU", start: "2025-01-01", end: "2025-01-03" });

  assert.equal(report.status, "quarantine_required");
  assert.deepEqual(new Set(report.issues.map((issue) => issue.kind)), new Set([
    "duplicate_provider_date",
    "outside_requested_range",
    "mixed_provider_code",
  ]));
  assert.equal(report.interpolatedPoints, 0);
});

test("fails closed for reversed or over-90-day continuity ranges", () => {
  assert.throws(() => auditGoldApiHistoricalContinuity([], {
    metal: "XAU",
    start: "2025-01-03",
    end: "2025-01-01",
  }), /after end/);
  assert.throws(() => auditGoldApiHistoricalContinuity([], {
    metal: "XAU",
    start: "2025-01-01",
    end: "2025-04-01",
  }), /exceeds/);
});

