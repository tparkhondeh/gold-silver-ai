import assert from "node:assert/strict";
import test from "node:test";

import {
  createPgTransactionRunner,
  inspectOperatorDatabaseEnvironment,
} from "../db/postgres-runtime.ts";

test("operator database requires an explicit enable flag and a loopback PostgreSQL URL", () => {
  assert.deepEqual(inspectOperatorDatabaseEnvironment({}), {
    available: false,
    reason: "operator database commit is not explicitly enabled",
  });
  assert.deepEqual(inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true" }), {
    available: false,
    reason: "DATABASE_URL is not configured",
  });
  assert.deepEqual(inspectOperatorDatabaseEnvironment({
    ASHA_OPERATOR_COMMIT_ENABLED: "true",
    DATABASE_URL: "postgresql://operator:secret@db.example.com/asha",
  }), {
    available: false,
    reason: "Phase 1 operator database must be loopback-only",
  });

  const local = inspectOperatorDatabaseEnvironment({
    ASHA_OPERATOR_COMMIT_ENABLED: "true",
    DATABASE_URL: "postgresql://operator:secret@127.0.0.1:5432/asha",
  });
  assert.equal(local.available, true);
});

test("PostgreSQL runner commits successful work and releases the connection", async () => {
  const calls = [];
  let released = false;
  const runner = createPgTransactionRunner({
    async connect() {
      return {
        async query(sql, parameters = []) {
          calls.push({ sql, parameters });
          return { rowCount: 1 };
        },
        release() { released = true; },
      };
    },
  });

  const result = await runner.transaction(async (executor) => {
    await executor.query("INSERT INTO test_table(value) VALUES ($1)", ["safe-value"]);
    return "committed";
  });

  assert.equal(result, "committed");
  assert.deepEqual(calls.map((call) => call.sql), ["BEGIN", "INSERT INTO test_table(value) VALUES ($1)", "COMMIT"]);
  assert.deepEqual(calls[1].parameters, ["safe-value"]);
  assert.equal(released, true);
});

test("PostgreSQL runner rolls back failed work and preserves the original error", async () => {
  const calls = [];
  let released = false;
  const expected = new Error("synthetic transaction failure");
  const runner = createPgTransactionRunner({
    async connect() {
      return {
        async query(sql) {
          calls.push(sql);
          return { rowCount: 1 };
        },
        release() { released = true; },
      };
    },
  });

  await assert.rejects(runner.transaction(async (executor) => {
    await executor.query("INSERT INTO test_table(value) VALUES ($1)", ["not-committed"]);
    throw expected;
  }), (error) => error === expected);

  assert.deepEqual(calls, ["BEGIN", "INSERT INTO test_table(value) VALUES ($1)", "ROLLBACK"]);
  assert.equal(released, true);
});
