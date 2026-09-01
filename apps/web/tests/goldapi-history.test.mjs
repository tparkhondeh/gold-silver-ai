import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGoldApiHistoryPayload } from "../app/goldapi-history.ts";

const collectedAt = "2026-09-01T12:00:00.000Z";
const request = { metal: "XAU", from: "2025-01-01", to: "2025-01-03" };

function payload(prices = [
  { date: "2025-01-01", price: 2_624.18 },
  { date: "2025-01-03", price: 2_640.45 },
]) {
  return { metal: "XAU", currency: "USD", from: "2025-01-01", to: "2025-01-03", prices };
}

test("normalizes ordered daily history and preserves a missing date as a gap", () => {
  const points = normalizeGoldApiHistoryPayload(payload(), request, collectedAt);
  assert.equal(points.length, 2);
  assert.deepEqual(points[0], {
    instrumentCode: "XAU_USD",
    providerCode: "XAU",
    providerDateGregorian: "2025-01-01",
    value: 2_624.18,
    currency: "USD",
    unit: "troy_ounce",
    publishedAt: null,
    collectedAt,
    sourceId: "goldapi-io",
  });
  assert.deepEqual(points.map((point) => point.providerDateGregorian), ["2025-01-01", "2025-01-03"]);
});
test("rejects contract drift, request mismatches, and invalid ranges", () => {
  assert.throws(() => normalizeGoldApiHistoryPayload({ ...payload(), currency: "EUR" }, request, collectedAt), /not USD/);
  assert.throws(() => normalizeGoldApiHistoryPayload({ ...payload(), metal: "XAG" }, request, collectedAt), /does not match/);
  assert.throws(() => normalizeGoldApiHistoryPayload({ ...payload(), from: "2024-12-31" }, request, collectedAt), /range does not match/);
  assert.throws(() => normalizeGoldApiHistoryPayload({ ...payload(), page: 1 }, request, collectedAt), /undocumented/);
  assert.throws(() => normalizeGoldApiHistoryPayload(payload(), { ...request, from: "2025-04-01", to: "2025-01-01" }, collectedAt), /after end/);
  assert.throws(() => normalizeGoldApiHistoryPayload(payload(), { ...request, from: "2025-01-01", to: "2025-04-01" }, collectedAt), /exceeds 90/);
});

test("rejects duplicate, unordered, out-of-range, malformed, or excessive points", () => {
  assert.throws(() => normalizeGoldApiHistoryPayload(payload([
    { date: "2025-01-01", price: 2_624.18 },
    { date: "2025-01-01", price: 2_625.18 },
  ]), request, collectedAt), /duplicate or out of order/);
  assert.throws(() => normalizeGoldApiHistoryPayload(payload([
    { date: "2025-01-03", price: 2_640.45 },
    { date: "2025-01-02", price: 2_630.45 },
  ]), request, collectedAt), /duplicate or out of order/);
  assert.throws(() => normalizeGoldApiHistoryPayload(payload([
    { date: "2025-01-04", price: 2_640.45 },
  ]), request, collectedAt), /outside/);
  assert.throws(() => normalizeGoldApiHistoryPayload(payload([
    { date: "2025-01-01", price: "2624.18" },
  ]), request, collectedAt), /positive number/);
  assert.throws(() => normalizeGoldApiHistoryPayload(payload([
    { date: "2025-01-01", price: 2_624.18, extra: true },
  ]), request, collectedAt), /undocumented/);
  const many = Array.from({ length: 91 }, (_, index) => ({ date: "2025-01-01", price: 2_624 + index }));
  assert.throws(() => normalizeGoldApiHistoryPayload({ ...payload(), prices: many }, request, collectedAt), /exceeds 90 points/);
});
