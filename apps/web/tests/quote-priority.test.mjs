import assert from "node:assert/strict";
import test from "node:test";

import { selectPreferredQuotes } from "../app/quote-priority.ts";

const base = {
  instrumentCode: "USD_IRR",
  status: "valid",
  publishedAt: "2026-08-29T10:00:00.000Z",
  collectedAt: "2026-08-29T10:01:00.000Z",
};

test("prefers the keyed Navasan dollar over a manual Rahavard duplicate", () => {
  const manual = { ...base, sourceId: "rahavard-manual", quality: "manual_snapshot", value: 150_000 };
  const navasan = { ...base, sourceId: "navasan", quality: "primary", value: 204_100 };
  assert.deepEqual(selectPreferredQuotes([navasan, manual]), [navasan]);
  assert.deepEqual(selectPreferredQuotes([manual, navasan]), [navasan]);
});

test("prefers any valid observation over a stale duplicate", () => {
  const stalePrimary = { ...base, sourceId: "navasan", quality: "primary", status: "stale", value: 204_100 };
  const validManual = { ...base, sourceId: "rahavard-manual", quality: "manual_snapshot", value: 203_900 };
  assert.deepEqual(selectPreferredQuotes([stalePrimary, validManual]), [validManual]);
});
