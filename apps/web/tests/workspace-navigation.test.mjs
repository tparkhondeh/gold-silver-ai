import assert from "node:assert/strict";
import test from "node:test";

import { assetJourney, navItems } from "../app/workspace-navigation.ts";

test("keeps the asset workflow explicit and ordered", () => {
  assert.deepEqual(assetJourney, ["portfolio", "asset-center", "analysis", "decisions"]);
  assert.deepEqual(
    navItems.filter((item) => assetJourney.includes(item.id)).map((item) => item.label),
    ["فهرست دارایی‌ها", "مرکز دارایی", "تحلیل دارایی‌ها", "تصمیم‌های دارایی"],
  );
  assert.equal(new Set(navItems.map((item) => item.id)).size, navItems.length);
});
