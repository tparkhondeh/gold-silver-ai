import assert from "node:assert/strict";
import test from "node:test";

import { inspectNavasanConfiguration, navasanInstrumentMappings, normalizeNavasanPayload } from "../app/navasan-adapter.ts";

test("requires a rotated key and an explicit unit without returning credential values", () => {
  const syntheticEnvironment = { NAVASAN_API_KEY: "synthetic-test-credential", NAVASAN_VALUE_UNIT: "TOMAN" };
  assert.deepEqual(inspectNavasanConfiguration({}), { ready: false, reason: "missing_key" });
  assert.deepEqual(inspectNavasanConfiguration(syntheticEnvironment), { ready: false, reason: "key_rotation_required" });
  assert.deepEqual(inspectNavasanConfiguration({ ...syntheticEnvironment, NAVASAN_KEY_ROTATION_CONFIRMED: "false" }), { ready: false, reason: "key_rotation_required" });
  assert.deepEqual(inspectNavasanConfiguration({ ...syntheticEnvironment, NAVASAN_KEY_ROTATION_CONFIRMED: "true", NAVASAN_VALUE_UNIT: "unknown" }), { ready: false, reason: "invalid_unit" });
  assert.deepEqual(inspectNavasanConfiguration({ ...syntheticEnvironment, NAVASAN_KEY_ROTATION_CONFIRMED: "true" }), { ready: true, unit: "TOMAN" });
  assert.equal(JSON.stringify(inspectNavasanConfiguration(syntheticEnvironment)).includes(syntheticEnvironment.NAVASAN_API_KEY), false);
});

const nowMs = Date.parse("2026-08-29T08:20:00.000Z");
const recentTimestamp = Math.floor(nowMs / 1000) - 60;

const tomanPayload = {
  "18ayar": { value: "21500000", timestamp: recentTimestamp },
  abshodeh: { value: "93000", timestamp: recentTimestamp },
  sekkeh: { value: "210000", timestamp: recentTimestamp },
  bahar: { value: "198000", timestamp: recentTimestamp },
  nim: { value: "112000", timestamp: recentTimestamp },
  rob: { value: "65000", timestamp: recentTimestamp },
  gerami: { value: "32000", timestamp: recentTimestamp },
  usd_sell: { value: "200000", timestamp: recentTimestamp },
};

test("covers the eight owner-approved Navasan latest-price symbols", () => {
  assert.equal(navasanInstrumentMappings.length, 8);
  const quotes = normalizeNavasanPayload(tomanPayload, "TOMAN", "2026-08-29T08:20:00.000Z", nowMs);
  assert.deepEqual(quotes.map((quote) => quote.instrumentCode), [
    "GOLD_18K_IRR",
    "MESGHAL_IRR",
    "EMAMI_COIN_IRR",
    "AZADI_COIN_IRR",
    "HALF_COIN_IRR",
    "QUARTER_COIN_IRR",
    "GRAM_COIN_IRR",
    "USD_IRR",
  ]);
  assert.equal(quotes.every((quote) => quote.currency === "TOMAN" && quote.status === "valid"), true);
  assert.equal(quotes.find((quote) => quote.instrumentCode === "EMAMI_COIN_IRR")?.value, 210_000_000);
  assert.equal(quotes.find((quote) => quote.instrumentCode === "MESGHAL_IRR")?.value, 93_000_000);
});

test("converts a declared IRR contract to toman exactly once", () => {
  const irrPayload = Object.fromEntries(Object.entries(tomanPayload).map(([code, item]) => [
    code,
    { ...item, value: String(Number(item.value) * 10) },
  ]));
  const quotes = normalizeNavasanPayload(irrPayload, "IRR", "2026-08-29T08:20:00.000Z", nowMs);
  assert.equal(quotes.find((quote) => quote.instrumentCode === "GOLD_18K_IRR")?.value, 21_500_000);
  assert.equal(quotes.find((quote) => quote.instrumentCode === "USD_IRR")?.value, 200_000);
});

test("fails closed on a wrong unit declaration or future timestamp", () => {
  assert.throws(
    () => normalizeNavasanPayload({ "18ayar": { value: "2150000", timestamp: recentTimestamp } }, "IRR", "2026-08-29T08:20:00.000Z", nowMs),
    /declared-unit range validation/,
  );
  assert.throws(
    () => normalizeNavasanPayload({ usd_sell: { value: "200000", timestamp: Math.floor((nowMs + 10 * 60_000) / 1000) } }, "TOMAN", "2026-08-29T08:20:00.000Z", nowMs),
    /future/,
  );
});
