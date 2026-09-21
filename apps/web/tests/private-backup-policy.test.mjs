import assert from "node:assert/strict";
import test from "node:test";
import { transientIdentityTables, identityBackupExclusions } from "../scripts/private-backup-policy.ts";
import { localBackupTables } from "../scripts/local-backup.ts";

test("restore retains portfolio but excludes every old and passkey authorization-state table", () => {
  assert.deepEqual(transientIdentityTables, ["private_owner_login_transactions", "private_owner_sessions", "private_passkey_owners", "private_passkey_credentials", "private_passkey_bootstrap_grants", "private_passkey_challenges"]);
  assert.deepEqual(identityBackupExclusions, transientIdentityTables.map(table => `--exclude-table-data=*.${table}`));
  assert.ok(Object.isFrozen(transientIdentityTables)); assert.ok(Object.isFrozen(identityBackupExclusions));
  for (const table of transientIdentityTables) assert.equal(localBackupTables.includes(table), false);
  for (const table of ["user_portfolios", "portfolio_holdings", "portfolio_preferences"]) assert.ok(localBackupTables.includes(table));
});
