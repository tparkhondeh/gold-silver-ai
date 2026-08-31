import assert from "node:assert/strict";
import test from "node:test";

import { buildNavasanBackfillPlan } from "../app/navasan-backfill-plan.ts";

test("builds a no-network OHLC plan with one request per approved instrument", () => {
  const plan = buildNavasanBackfillPlan({
    start: "1404-01-01",
    end: "1404-12-29",
    items: ["18ayar", "usd_sell", "18ayar"],
  }, "1405-06-09");

  assert.equal(plan.mode, "preview_only");
  assert.equal(plan.endpoint, "ohlcSearch");
  assert.deepEqual(plan.items, ["18ayar", "usd_sell"]);
  assert.equal(plan.requestCount, 2);
  assert.equal(plan.canExecute, false);
  assert.deepEqual(plan.gates.map((gate) => gate.id), [
    "licensed_date_scope",
    "gap_policy",
    "independent_cross_check",
  ]);
});

test("fails closed for invalid, reversed, future, empty, or unapproved plans", () => {
  const valid = { start: "1404-01-01", end: "1404-02-01", items: ["18ayar"] };
  assert.throws(() => buildNavasanBackfillPlan({ ...valid, start: "1404-07-31" }, "1405-06-09"), /invalid/);
  assert.throws(() => buildNavasanBackfillPlan({ ...valid, start: "1404-03-01" }, "1405-06-09"), /after end/);
  assert.throws(() => buildNavasanBackfillPlan({ ...valid, end: "1405-06-10" }, "1405-06-09"), /future/);
  assert.throws(() => buildNavasanBackfillPlan({ ...valid, items: [] }, "1405-06-09"), /At least one/);
  assert.throws(() => buildNavasanBackfillPlan({ ...valid, items: ["unapproved"] }, "1405-06-09"), /not approved/);
});
