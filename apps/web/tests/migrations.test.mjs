import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrations, readMigrations } from "../db/migrations.ts";

test("migration manifests are deterministic and never include transaction wrappers twice", async () => {
  const migrations = await readMigrations();
  assert.deepEqual(migrations, await readMigrations());
  assert.deepEqual(migrations.map((migration) => migration.id), ["0001_data_foundation.sql", "0002_audit_integrity.sql", "0003_owner_portfolio.sql", "0004_portfolio_preferences.sql", "0005_provenance_registry.sql", "0006_reconciliation_and_corrections.sql", "0007_transaction_valuation_ledger.sql", "0008_ledger_lineage_integrity.sql", "0009_ledger_replay_integrity.sql", "0010_provider_quota_ledger.sql"]);
  for (const migration of migrations) {
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(migration.sql, /^\s*BEGIN;/);
    assert.doesNotMatch(migration.sql, /COMMIT;\s*$/);
  }
});

test("migration runner rolls back SQL failures and rejects checksum drift", async () => {
  for (const mismatch of [false, true]) {
    const calls = [];
    const client = { async query(sql) {
      calls.push(sql);
      if (sql === "FAIL_TEST_SQL") throw new Error("controlled SQL failure");
      return { rows: sql.startsWith("SELECT id,") && mismatch ? [{ id: "0001_test.sql", checksum: "wrong" }] : [] };
    } };
    await assert.rejects(applyMigrations(client, [{ id: "0001_test.sql", checksum: "a".repeat(64), sql: "FAIL_TEST_SQL" }]));
    assert.equal(calls.at(-1), "ROLLBACK");
    assert.equal(calls.includes("COMMIT"), false);
  }
});
