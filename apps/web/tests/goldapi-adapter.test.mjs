import assert from "node:assert/strict";
import test from "node:test";

import {
  goldApiLiveRequestUrl,
  normalizeGoldApiDate,
  normalizeGoldApiLivePayload,
  normalizeGoldApiPrice,
  parseGoldApiMetal,
} from "../app/goldapi-adapter.ts";

const collectedAt = "2026-09-01T12:00:00.000Z";
const nowMs = Date.parse(collectedAt);

test("normalizes the documented GoldAPI live contract", () => {
  assert.equal(
    goldApiLiveRequestUrl("XAU"),
    "https://www.goldapi.io/api/price/XAU/USD?melt_price=false&currency_info=false",
  );
  const publishedAt = Math.floor(Date.parse("2026-09-01T11:59:00.000Z") / 1000);
  assert.deepEqual(normalizeGoldApiLivePayload({
    metal: "XAU",
    currency: "USD",
    price: 3_450.25,
    timestamp: publishedAt,
    exchange: "FOREXCOM",
  }, "XAU", collectedAt, nowMs), {
    instrumentCode: "XAU_USD",
    value: 3_450.25,
    currency: "USD",
    unit: "troy_ounce",
    publishedAt: "2026-09-01T11:59:00.000Z",
    collectedAt,
    sourceId: "goldapi-io",
  });
});

test("fails closed for a mismatched metal, currency, price, timestamp, or collection time", () => {
  const valid = {
    metal: "XAG",
    currency: "USD",
    price: 42.25,
    timestamp: Math.floor(nowMs / 1000),
  };
  assert.throws(() => normalizeGoldApiLivePayload({ ...valid, metal: "XAU" }, "XAG", collectedAt, nowMs), /does not match/);
  assert.throws(() => normalizeGoldApiLivePayload({ ...valid, currency: "EUR" }, "XAG", collectedAt, nowMs), /not USD/);
  assert.throws(() => normalizeGoldApiLivePayload({ ...valid, price: "42.25" }, "XAG", collectedAt, nowMs), /positive number/);
  assert.throws(() => normalizeGoldApiLivePayload({ ...valid, price: 50_000 }, "XAG", collectedAt, nowMs), /range/);
  assert.throws(() => normalizeGoldApiLivePayload({ ...valid, timestamp: nowMs / 1000 + 301 }, "XAG", collectedAt, nowMs), /future/);
  assert.throws(() => normalizeGoldApiLivePayload(valid, "XAG", "2026-09-01", nowMs), /normalized/);
});

test("accepts only approved metals, real Gregorian dates, and plausible historical prices", () => {
  assert.equal(parseGoldApiMetal("XAU"), "XAU");
  assert.throws(() => parseGoldApiMetal("XPT"), /not approved/);
  assert.equal(normalizeGoldApiDate("2024-02-29"), "2024-02-29");
  assert.throws(() => normalizeGoldApiDate("2025-02-29"), /invalid/);
  assert.throws(() => normalizeGoldApiDate("20250101"), /Gregorian/);
  assert.equal(normalizeGoldApiPrice(35.5, "XAU", "historical"), 35.5);
  assert.throws(() => normalizeGoldApiPrice(0.01, "XAU", "historical"), /range/);
});
