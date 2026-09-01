import assert from "node:assert/strict";
import test from "node:test";

import { buildGoldApiBackfillPlan } from "../app/goldapi-backfill-plan.ts";

test("splits each metal into documented inclusive 90-day history requests", () => {
  const plan = buildGoldApiBackfillPlan({
    start: "2025-01-01",
    end: "2025-04-01",
    metals: ["XAU", "XAG", "XAU"],
  }, "2026-09-01");

  assert.equal(plan.mode, "preview_only");
  assert.equal(plan.endpoint, "/api/history/{metal}/USD");
  assert.deepEqual(plan.metals, ["XAU", "XAG"]);
  assert.equal(plan.requestCount, 4);
  assert.equal(plan.canExecute, false);
  assert.deepEqual(plan.chunks.map(({ metal, from, to, inclusiveDays }) => ({ metal, from, to, inclusiveDays })), [
    { metal: "XAU", from: "2025-01-01", to: "2025-03-31", inclusiveDays: 90 },
    { metal: "XAU", from: "2025-04-01", to: "2025-04-01", inclusiveDays: 1 },
    { metal: "XAG", from: "2025-01-01", to: "2025-03-31", inclusiveDays: 90 },
    { metal: "XAG", from: "2025-04-01", to: "2025-04-01", inclusiveDays: 1 },
  ]);
  assert.equal(plan.chunks[0].requestPath, "/api/history/XAU/USD?from=2025-01-01&to=2025-03-31");
  assert.deepEqual(plan.gates.map((gate) => gate.id), [
    "licensed_storage_scope",
    "subscription_and_quota",
    "gap_policy",
    "continuity_audit",
  ]);
});

test("keeps an exact 90-day range in one request per metal", () => {
  const plan = buildGoldApiBackfillPlan({
    start: "2024-01-01",
    end: "2024-03-30",
    metals: ["XAU"],
  }, "2026-09-01");
  assert.equal(plan.requestCount, 1);
  assert.equal(plan.chunks[0].inclusiveDays, 90);
});

test("fails closed for invalid, reversed, future, empty, unapproved, or excessive plans", () => {
  const valid = { start: "2025-01-01", end: "2025-02-01", metals: ["XAU"] };
  assert.throws(() => buildGoldApiBackfillPlan({ ...valid, start: "2025-02-30" }, "2026-09-01"), /invalid/);
  assert.throws(() => buildGoldApiBackfillPlan({ ...valid, start: "2025-03-01" }, "2026-09-01"), /after end/);
  assert.throws(() => buildGoldApiBackfillPlan({ ...valid, end: "2026-09-02" }, "2026-09-01"), /future/);
  assert.throws(() => buildGoldApiBackfillPlan({ ...valid, metals: [] }, "2026-09-01"), /At least one/);
  assert.throws(() => buildGoldApiBackfillPlan({ ...valid, metals: ["XPT"] }, "2026-09-01"), /not approved/);
  assert.throws(() => buildGoldApiBackfillPlan({ ...valid, start: "0001-01-01" }, "2026-09-01"), /safety limit/);
});

