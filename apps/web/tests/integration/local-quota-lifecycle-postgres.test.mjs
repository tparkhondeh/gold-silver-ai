import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { applyMigrations, readMigrations } from "../../db/migrations.ts";
import { inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { initializeLocalQuotaLifecycle, localQuotaPrivilegePredicate } from "../../scripts/local-quota-lifecycle.ts";

const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") throw Error("Quota lifecycle tests require explicit loopback asha_integration. No DB tests skipped.");

test("actual local initialization preserves a fenced quota table and backup accepts its read-only grants", { timeout: 60_000 }, async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No providers in quota lifecycle tests"));
  const suffix = randomBytes(8).toString("hex"), schema = `asha_quota_lifecycle_${suffix}`, role = `asha_quota_runtime_${suffix}`;
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000, statement_timeout: 15_000 });
  const contender = new Client({ connectionString, connectionTimeoutMillis: 3000, statement_timeout: 15_000 });
  let schemaCreated = false, roleCreated = false;
  await admin.connect(); await contender.connect();
  t.after(async () => {
    await contender.query("ROLLBACK").catch(() => {}); await contender.end();
    await admin.query("ROLLBACK").catch(() => {}); await admin.query("RESET ROLE");
    await admin.query("SELECT pg_advisory_unlock_all()");
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  await admin.query(`SET search_path TO "${schema}"`);
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roleCreated = true;
  const migrations = await readMigrations(), target = { schema, role };
  const grants = async () => {
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`);
  };
  const hasInsert = async () => (await admin.query("SELECT has_table_privilege($1,$2,'INSERT') AS allowed", [role, `${schema}.provider_request_reservations`])).rows[0].allowed;
  const check = async readonly => {
    await admin.query(`SET ROLE "${role}"`);
    try { return (await admin.query(`SELECT ${localQuotaPrivilegePredicate(readonly)} AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='provider_request_reservations'`, [schema])).rows[0].safe; }
    finally { await admin.query("RESET ROLE"); }
  };
  const initialize = () => initializeLocalQuotaLifecycle(admin, () => applyMigrations(admin, migrations), grants, target);

  await t.test("fresh bootstrap grants INSERT and session exclusion survives migration commits", async () => {
    // Serialize setup with other files' quota fixtures. Release this outer count
    // inside migrate so subsequent checks depend on the helper's own lock only.
    await admin.query("SELECT pg_advisory_lock(174228531, 10)");
    const applied = await initializeLocalQuotaLifecycle(admin, async () => {
      await admin.query("SELECT pg_advisory_unlock(174228531, 10)");
      const result = await applyMigrations(admin, migrations);
      assert.equal((await contender.query("SELECT pg_try_advisory_xact_lock(174228531, 10) AS locked")).rows[0].locked, false);
      return result;
    }, async () => {
      assert.equal((await contender.query("SELECT pg_try_advisory_xact_lock(174228531, 10) AS locked")).rows[0].locked, false);
      await grants();
    }, target);
    assert.ok(applied.includes("0010_provider_quota_ledger.sql"));
    assert.equal(await hasInsert(), true); assert.equal(await check(false), true); assert.equal(await check(true), true);
  });
  await t.test("fence holding the provider lock prevents all initialization work", async () => {
    await contender.query("BEGIN"); await contender.query("SELECT pg_advisory_xact_lock(174228531, 10)");
    await contender.query(`REVOKE INSERT ON "${schema}".provider_request_reservations FROM "${role}"`);
    await assert.rejects(initializeLocalQuotaLifecycle(admin, async () => assert.fail("migration raced fence"), async () => assert.fail("grants raced fence"), target), /existing authority preserved/);
    await contender.query("COMMIT"); assert.equal(await hasInsert(), false);
  });
  await t.test("explicit init preserves revoked INSERT and successful release does not retain the lock", async () => {
    await admin.query("SELECT pg_advisory_lock(174228531, 10)");
    try { assert.deepEqual(await initialize(), []); }
    finally { await admin.query("SELECT pg_advisory_unlock(174228531, 10)"); }
    assert.equal(await hasInsert(), false); assert.equal(await check(false), false); assert.equal(await check(true), true);
    // Acquisition by another connection proves the dedicated init session left
    // no own lock count behind (bounded by statement_timeout, no timing sleep).
    await contender.query("BEGIN"); await contender.query("SELECT pg_advisory_xact_lock(174228531, 10)"); await contender.query("COMMIT");
  });
  await t.test("backup still rejects absent SELECT and every mutation privilege", async () => {
    for (const permission of ["UPDATE", "UPDATE(reserved_at)", "DELETE", "TRUNCATE", "TRIGGER"]) {
      await admin.query(`GRANT ${permission} ON provider_request_reservations TO "${role}"`);
      try { assert.equal(await check(true), false); }
      finally { await admin.query(`REVOKE ${permission} ON provider_request_reservations FROM "${role}"`); }
    }
    await admin.query(`REVOKE SELECT ON provider_request_reservations FROM "${role}"`);
    try { assert.equal(await check(true), false); }
    finally { await admin.query(`GRANT SELECT ON provider_request_reservations TO "${role}"`); }
    assert.equal(await check(true), true); assert.equal(await hasInsert(), false);
  });
  await t.test("failure rolls back grants, unlocks and never reactivates the existing table", async () => {
    await admin.query("SELECT pg_advisory_lock(174228531, 10)");
    try { await assert.rejects(initializeLocalQuotaLifecycle(admin, () => applyMigrations(admin, migrations), async () => {
      await admin.query(`GRANT UPDATE ON provider_request_reservations TO "${role}"`); throw Error("synthetic failure");
    }, target), /existing authority preserved/); }
    finally { await admin.query("SELECT pg_advisory_unlock(174228531, 10)"); }
    assert.equal(await hasInsert(), false); assert.equal(await check(true), true);
    await contender.query("BEGIN"); await contender.query("SELECT pg_advisory_xact_lock(174228531, 10)"); await contender.query("COMMIT");
  });
});
