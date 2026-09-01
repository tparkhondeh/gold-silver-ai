import assert from "node:assert/strict";
import test from "node:test";

import { createLocalBackupPlan, localBackupTables, quoteVerificationDatabase } from "../scripts/local-backup.ts";

test("local backup paths stay inside the protected backup directory", () => {
  const plan = createLocalBackupPlan("C:/project/.cache/postgres-local", new Date("2026-08-31T12:34:56.789Z"), "a1b2c3d4");
  assert.equal(plan.backupFile, "asha-local-20260831T123456Z-a1b2c3d4.dump");
  assert.equal(plan.manifestFile, "asha-local-20260831T123456Z-a1b2c3d4.json");
  assert.match(plan.backupPath.replaceAll("\\", "/"), /\/postgres-local\/backups\/asha-local-/);
  assert.equal(plan.verificationDatabase, "asha_backup_verify_a1b2c3d4");
  assert.equal(localBackupTables.length, 24);
});

test("local backup plan rejects invalid timestamps and path-like nonces", () => {
  assert.throws(() => createLocalBackupPlan("C:/safe", new Date("invalid"), "a1b2c3d4"), /timestamp/);
  assert.throws(() => createLocalBackupPlan("C:/safe", new Date(), "../unsafe"), /nonce/);
  assert.throws(() => quoteVerificationDatabase("asha_backup_verify_a1b2c3d4;DROP DATABASE asha_local"), /invalid/);
  assert.equal(quoteVerificationDatabase("asha_backup_verify_a1b2c3d4"), '"asha_backup_verify_a1b2c3d4"');
});
