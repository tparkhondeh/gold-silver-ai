import assert from "node:assert/strict";
import test from "node:test";

import {
  createPgTransactionRunner,
  inspectOperatorDatabaseEnvironment,
  probeObservationDatabase,
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

test("connection options cannot override the validated local host", () => {
  for (const suffix of ["?host=db.example.com", "?hostaddr=192.0.2.1", "?sslmode=disable", "?options=-csearch_path=evil", "#fragment"]) {
    assert.equal(inspectOperatorDatabaseEnvironment({
      ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: `postgresql://operator:fixture@127.0.0.1/asha${suffix}`,
    }).available, false);
  }
});

test("health requires an actual successful probe, schema and least-privilege role", async () => {
  assert.equal((await probeObservationDatabase({ async query() { return { rows: [{ migrated: true, least_privilege: true }] }; } })).state, "connected");
  assert.equal((await probeObservationDatabase({ async query() { return { rows: [{ migrated: false, least_privilege: true }] }; } })).reason, "database_schema_missing");
  assert.equal((await probeObservationDatabase({ async query() { return { rows: [{ migrated: true, least_privilege: false }] }; } })).reason, "database_role_too_privileged");
  const failed = await probeObservationDatabase({ async query() { throw new Error("private-connection-details"); } });
  assert.equal(failed.reason, "database_unreachable_or_probe_failed");
  assert.doesNotMatch(JSON.stringify(failed), /private-connection-details/);
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
