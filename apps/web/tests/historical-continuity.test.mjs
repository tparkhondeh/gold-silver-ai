import assert from "node:assert/strict";
import test from "node:test";

import { auditHistoricalContinuity } from "../app/historical-continuity.ts";
import { normalizeNavasanOhlcPayload } from "../app/navasan-history.ts";

const collectedAt = "2026-09-10T12:00:00.000Z";
const nowMs = Date.parse(collectedAt);

function point(date, timestamp, overrides = {}) {
  return normalizeNavasanOhlcPayload([{
    date,
    timestamp: Math.floor(Date.parse(timestamp) / 1000),
    open: "200000",
    high: "220000",
    low: "190000",
    close: "210000",
    ...overrides,
  }], "usd_sell", "TOMAN", collectedAt, nowMs)[0];
}

test("records unobserved calendar dates without interpolation or storage permission", () => {
  const report = auditHistoricalContinuity([
    point("1405-06-08", "2026-08-30T12:00:00.000Z"),
    point("1405-06-10", "2026-09-01T12:00:00.000Z"),
  ], { providerCode: "usd_sell", start: "1405-06-08", end: "1405-06-10" });

  assert.equal(report.status, "gaps_recorded");
  assert.deepEqual(report.unobservedProviderDates, ["1405-06-09"]);
  assert.equal(report.observedProviderDates, 2);
  assert.equal(report.interpolatedPoints, 0);
  assert.equal(report.marketCalendarKnown, false);
  assert.equal(report.canAuthorizeStorage, false);
  assert.deepEqual(report.issues, []);
});

test("quarantines duplicate, out-of-range, mixed-code, and timestamp-date mismatches", () => {
  const normal = point("1405-06-08", "2026-08-30T12:00:00.000Z");
  const report = auditHistoricalContinuity([
    normal,
    normal,
    { ...point("1405-06-11", "2026-09-02T12:00:00.000Z"), providerCode: "18ayar" },
    point("1405-06-10", "2026-08-30T12:00:00.000Z"),
  ], { providerCode: "usd_sell", start: "1405-06-08", end: "1405-06-10" });

  assert.equal(report.status, "quarantine_required");
  assert.deepEqual(new Set(report.issues.map((issue) => issue.kind)), new Set([
    "duplicate_provider_date",
    "outside_requested_range",
    "mixed_provider_code",
    "timestamp_date_mismatch",
  ]));
  assert.deepEqual(report.unobservedProviderDates, ["1405-06-09", "1405-06-10"]);
  assert.equal(report.interpolatedPoints, 0);
  assert.equal(report.canAuthorizeStorage, false);
});

test("fails closed for a reversed or invalid range", () => {
  assert.throws(() => auditHistoricalContinuity([], {
    providerCode: "usd_sell",
    start: "1405-06-10",
    end: "1405-06-08",
  }), /after end/);
  assert.throws(() => auditHistoricalContinuity([], {
    providerCode: "usd_sell",
    start: "1300-01-01",
    end: "1500-01-01",
  }), /Jalali/);
});
