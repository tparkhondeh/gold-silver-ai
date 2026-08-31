import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeNavasanDailyPayload,
  normalizeNavasanJalaliDate,
  normalizeNavasanOhlcPayload,
  parseNavasanProviderCode,
} from "../app/navasan-history.ts";

const nowMs = Date.parse("2026-08-31T12:00:00.000Z");
const timestamp = Math.floor(Date.parse("2026-08-30T12:00:00.000Z") / 1000);

test("accepts only approved symbols and valid Jalali provider dates", () => {
  assert.equal(parseNavasanProviderCode("usd_sell"), "usd_sell");
  assert.throws(() => parseNavasanProviderCode("unapproved"), /not approved/);
  assert.equal(normalizeNavasanJalaliDate("1405-06-09"), "1405-06-09");
  assert.throws(() => normalizeNavasanJalaliDate("1405-07-31"), /invalid/);
  assert.throws(() => normalizeNavasanJalaliDate("2026-08-31"), /Jalali/);
});
test("normalizes intraday history through the same exact unit and scale contract", () => {
  const points = normalizeNavasanDailyPayload([
    { timestamp, date: "1405-06-08", value: "210000", change: "1000" },
  ], "sekkeh", "TOMAN", "2026-08-31T12:00:00.000Z", nowMs);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0], {
    instrumentCode: "EMAMI_COIN_IRR",
    providerCode: "sekkeh",
    value: 210_000_000,
    currency: "TOMAN",
    unit: "unit",
    publishedAt: "2026-08-30T12:00:00.000Z",
    collectedAt: "2026-08-31T12:00:00.000Z",
    sourceId: "navasan",
  });
});

test("normalizes OHLC history and rejects impossible bar ordering", () => {
  const valid = [{ timestamp, date: "1405-06-08", open: "200000", high: "220000", low: "190000", close: "210000" }];
  const points = normalizeNavasanOhlcPayload(valid, "usd_sell", "TOMAN", "2026-08-31T12:00:00.000Z", nowMs);
  assert.equal(points[0].providerDateJalali, "1405-06-08");
  assert.deepEqual(points[0] && { open: points[0].open, high: points[0].high, low: points[0].low, close: points[0].close }, {
    open: 200_000,
    high: 220_000,
    low: 190_000,
    close: 210_000,
  });
  assert.throws(() => normalizeNavasanOhlcPayload([
    { ...valid[0], high: "195000" },
  ], "usd_sell", "TOMAN", "2026-08-31T12:00:00.000Z", nowMs), /ordering/);
  assert.throws(() => normalizeNavasanOhlcPayload([
    { ...valid[0], date: "1405-07-31" },
  ], "usd_sell", "TOMAN", "2026-08-31T12:00:00.000Z", nowMs), /invalid/);
});
