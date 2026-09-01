import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintNavasanRequest,
  NAVASAN_DURABLE_CALL_LIMIT,
  PostgresNavasanQuotaLedger,
  summarizeNavasanQuotaUsage,
} from "../data/navasan-quota-ledger.ts";

test("fingerprints requests without credentials and independent of parameter order", () => {
  const first = fingerprintNavasanRequest("ohlcSearch", { item: "usd_sell", start: "1405-01-01", end: "1405-02-01" });
  const second = fingerprintNavasanRequest("ohlcSearch", { end: "1405-02-01", start: "1405-01-01", item: "usd_sell" });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("summarizes safe rolling usage without provider credentials", () => {
  assert.deepEqual(summarizeNavasanQuotaUsage(7), {
    used: 7,
    remaining: 108,
    limit: 115,
    windowDays: 31,
    exhausted: false,
  });
  assert.equal(summarizeNavasanQuotaUsage(116).exhausted, true);
  assert.equal(summarizeNavasanQuotaUsage(116).remaining, 0);
  assert.throws(() => summarizeNavasanQuotaUsage(-1), /invalid usage/);
  assert.throws(() => summarizeNavasanQuotaUsage("unknown"), /invalid usage/);
  assert.throws(() => summarizeNavasanQuotaUsage(""), /invalid usage/);
});
function fakeRunner(used) {
  const queries = [];
  return {
    queries,
    async transaction(work) {
      return work({
        async query(sql, parameters = []) {
          queries.push({ sql, parameters });
          if (sql.includes("count(*)::integer AS used")) return { rowCount: 1, rows: [{ used }] };
          return { rowCount: 1, rows: [] };
        },
      });
    },
  };
}

test("reserves before the provider call and leaves five calls of safety headroom", async () => {
  const runner = fakeRunner(0);
  const ledger = new PostgresNavasanQuotaLedger(runner);
  const result = await ledger.reserve("latest", fingerprintNavasanRequest("latest", { item: "approved-phase-1-set" }));
  assert.equal(result.allowed, true);
  assert.equal(result.used, 1);
  assert.equal(result.remaining, NAVASAN_DURABLE_CALL_LIMIT - 1);
  assert.equal(runner.queries.some((query) => query.sql.includes("pg_advisory_xact_lock")), true);
  assert.equal(runner.queries.some((query) => query.sql.includes("INSERT INTO provider_request_reservations")), true);
});

test("fails closed without inserting when the rolling limit is full", async () => {
  const runner = fakeRunner(NAVASAN_DURABLE_CALL_LIMIT);
  const ledger = new PostgresNavasanQuotaLedger(runner);
  const result = await ledger.reserve("dailyCurrency", fingerprintNavasanRequest("dailyCurrency", { item: "usd_sell", date: "1405-06-09" }));
  assert.deepEqual(result, { allowed: false, used: NAVASAN_DURABLE_CALL_LIMIT, remaining: 0, reservationId: null });
  assert.equal(runner.queries.some((query) => query.sql.includes("INSERT INTO provider_request_reservations")), false);
});
