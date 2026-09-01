import assert from "node:assert/strict";
import test from "node:test";

import { parseNavasanHistoryLockHealth } from "../app/navasan-history-view.ts";

test("shows the monitored Navasan history lock only for the exact locked state", () => {
  const result = parseNavasanHistoryLockHealth({ engines: [{
    id: "navasan-history",
    state: "locked",
    reason: "اجرای تاریخچه پیش از سهمیه متوقف است",
  }] });

  assert.equal(result.state, "locked");
  assert.equal(result.message, "اجرای تاریخچه پیش از سهمیه متوقف است");
});

test("fails closed and warns for authorized, missing, or malformed health", () => {
  const authorized = parseNavasanHistoryLockHealth({ engines: [{
    id: "navasan-history",
    state: "authorized",
    reason: "unexpected",
  }] });
  assert.equal(authorized.state, "warning");
  assert.match(authorized.message, /تنظیم غیرمنتظره/);

  assert.equal(parseNavasanHistoryLockHealth({ engines: [] }).state, "warning");
  assert.equal(parseNavasanHistoryLockHealth(null).state, "warning");
  assert.match(
    parseNavasanHistoryLockHealth({ engines: [{ id: "navasan-history", state: "unknown" }] }).message,
    /اجرای واقعی متوقف/,
  );
});
