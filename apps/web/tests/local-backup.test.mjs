import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createLocalBackupPlan, localBackupTables, migrationJournalMatches, quoteVerificationDatabase } from "../scripts/local-backup.ts";

test("local backup paths stay inside the protected backup directory", () => {
  const plan = createLocalBackupPlan("C:/project/.cache/postgres-local", new Date("2026-08-31T12:34:56.789Z"), "a1b2c3d4");
  assert.equal(plan.backupFile, "asha-local-20260831T123456Z-a1b2c3d4.dump");
  assert.equal(plan.manifestFile, "asha-local-20260831T123456Z-a1b2c3d4.json");
  assert.match(plan.backupPath.replaceAll("\\", "/"), /\/postgres-local\/backups\/asha-local-/);
  assert.equal(plan.verificationDatabase, "asha_backup_verify_a1b2c3d4");
  assert.equal(localBackupTables.length, 25);
});

test("local backup plan rejects invalid timestamps and path-like nonces", () => {
  assert.throws(() => createLocalBackupPlan("C:/safe", new Date("invalid"), "a1b2c3d4"), /timestamp/);
  assert.throws(() => createLocalBackupPlan("C:/safe", new Date(), "../unsafe"), /nonce/);
  assert.throws(() => quoteVerificationDatabase("asha_backup_verify_a1b2c3d4;DROP DATABASE asha_local"), /invalid/);
  assert.equal(quoteVerificationDatabase("asha_backup_verify_a1b2c3d4"), '"asha_backup_verify_a1b2c3d4"');
});

test("pre-migration backups accept only a nonempty exact reviewed journal prefix; activation stays strict", () => {
  const expected = [{ id: "0001.sql", checksum: "a".repeat(64) }, { id: "0002.sql", checksum: "b".repeat(64) }, { id: "0003.sql", checksum: "c".repeat(64) }];
  assert.equal(migrationJournalMatches(expected, expected), true);
  assert.equal(migrationJournalMatches(expected.slice(0, 2), expected), false);
  assert.equal(migrationJournalMatches(expected.slice(0, 2), expected, true), true);
  assert.equal(migrationJournalMatches(expected, expected, true), true);
  for (const stored of [[], expected.slice(1), [expected[1], expected[0]], [expected[0], { ...expected[1], checksum: "d".repeat(64) }], [...expected, { id: "9999.sql", checksum: "e".repeat(64) }]]) {
    assert.equal(migrationJournalMatches(stored, expected, true), false);
    assert.equal(migrationJournalMatches(stored, expected), false);
  }
  assert.equal(migrationJournalMatches([], [], true), false);
});

test("actual backup verification skips only code activation evidence; configure, ACL, RLS and triggers stay fail-closed", async () => {
  // Execute the actual guarded function without importing the command entrypoint,
  // which would load credentials/connect to the local owner database.
  const source = readFileSync(new URL("../scripts/local-postgres.mjs", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("async function verifyActivation("), source.indexOf("async function credentials("));
  const triggerNames = JSON.parse(code.match(/const triggerNames = (\[[^;]+\]);/)[1]);
  const expected = [{ id: "0001.sql", checksum: "a".repeat(64) }, { id: "0002.sql", checksum: "b".repeat(64) }];
  function harness({ stored = expected, grants = true, rls = true, triggers = true, fingerprint = "current" } = {}) {
    let evidenceReads = 0;
    const client = { async query(sql) {
      if (sql.includes("FROM asha_schema_migrations")) return { rows: stored };
      if (sql.includes("AS safe")) return { rows: [{ safe: grants, tables: 25 }] };
      if (sql.includes("AS forced")) return { rows: [{ forced: rls, tables: 7 }] };
      if (sql.includes("FROM pg_trigger")) return { rows: (triggers ? triggerNames : triggerNames.slice(1)).map(tgname => ({ tgname })) };
      throw Error("Unexpected synthetic verification query");
    } };
    const verify = new Function("readMigrations", "migrationJournalMatches", "readFile", "evidenceFile", "sourceFingerprint", `${code}; return verifyActivation;`)(
      async () => expected, migrationJournalMatches,
      async () => { evidenceReads++; return JSON.stringify({ fingerprint, completedAt: new Date().toISOString() }); },
      "synthetic-evidence-only", async () => "current",
    );
    return { run: options => verify(client, options), evidenceReads: () => evidenceReads };
  }
  const pending = harness({ stored: expected.slice(0, 1), fingerprint: "stale" });
  await assert.rejects(pending.run(), /Migration journal/);
  await pending.run({ allowPendingMigrations: true }); assert.equal(pending.evidenceReads(), 0);
  const activation = harness({ fingerprint: "stale" });
  await assert.rejects(activation.run(), /current-source integration evidence/); assert.equal(activation.evidenceReads(), 1);
  const ready = harness(); await ready.run(); assert.equal(ready.evidenceReads(), 1);
  for (const unsafe of [{ grants: false }, { rls: false }, { triggers: false }, { stored: [{ ...expected[0], checksum: "bad" }] }]) {
    const gate = harness(unsafe);
    await assert.rejects(gate.run({ allowPendingMigrations: true })); assert.equal(gate.evidenceReads(), 0);
  }
});
