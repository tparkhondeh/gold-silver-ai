import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { Client, Pool } from "pg";
import { readMigrations, applyMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { probePrivateMarketDatabase } from "../../auth/private-market-readiness.ts";
import { privateMarketRuntimeGrants } from "../../scripts/private-market-grants.ts";

// Never .env or a fallback: only the explicitly disposable local integration DB.
const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") throw Error("Quota readiness tests require explicit loopback asha_integration. No DB tests skipped.");

test("actual PostgreSQL optional market catalog readiness and narrow grants", { timeout: 60_000 }, async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No provider calls in metadata readiness tests"));
  const suffix = randomBytes(8).toString("hex"), schema = `asha_market_readiness_${suffix}`, role = `asha_market_ready_${suffix}`;
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 }), pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 3000 });
  let schemaCreated = false, roleCreated = false;
  await admin.connect();
  t.after(async () => {
    await pool.end();
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  await admin.query(`SET search_path TO "${schema}"`);
  const migrations = await readMigrations(); await applyMigrations(admin, migrations);
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roleCreated = true;
  await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  await admin.query(`GRANT SELECT ON asha_schema_migrations TO "${role}"`);
  const runner = createPgTransactionRunner({ async connect() {
    const client = await pool.connect(); await client.query(`SET ROLE "${role}"`); await client.query(`SET search_path TO "${schema}"`); return client;
  } });
  const probe = () => runner.transaction(db => probePrivateMarketDatabase(db, migrations, schema));
  const ready = async () => assert.deepEqual(await probe(), { state: "ready", reason: "private_market_metadata_ready" });
  async function denies(change, undo, reason) {
    await admin.query(change);
    try { assert.equal((await probe()).reason, reason); }
    finally { await admin.query(undo); }
    await ready();
  }

  await t.test("auth-only/no-quota grants remain blocked; exact optional plan validates actual migration expressions", async () => {
    assert.equal((await probe()).reason, "private_market_tables_or_privileges_unsafe");
    // Substitute only our freshly generated identifiers into this fixed pure plan.
    for (const sql of privateMarketRuntimeGrants()) await admin.query(sql.replaceAll("public.", `"${schema}".`).replaceAll("asha_private_runtime", `"${role}"`));
    await ready();
    for (const table of ["provider_request_reservations", "provider_runtime_status", "user_portfolios", "private_owner_sessions"]) {
      assert.equal(Number((await admin.query(`SELECT count(*) AS count FROM "${table}"`)).rows[0].count), 0);
    }
  });
  await t.test("table/column grants, grant options and PUBLIC permissions cannot widen optional capability", async () => {
    for (const [table, privilege] of [["provider_request_reservations", "UPDATE"], ["provider_request_reservations", "DELETE"], ["provider_request_reservations", "TRUNCATE"], ["provider_runtime_status", "DELETE"], ["provider_runtime_status", "REFERENCES"], ["provider_runtime_status", "TRIGGER"]]) {
      await denies(`GRANT ${privilege} ON ${table} TO "${role}"`, `REVOKE ${privilege} ON ${table} FROM "${role}"`, "private_market_tables_or_privileges_unsafe");
    }
    await denies(`GRANT UPDATE(reserved_at) ON provider_request_reservations TO "${role}"`, `REVOKE UPDATE(reserved_at) ON provider_request_reservations FROM "${role}"`, "private_market_tables_or_privileges_unsafe");
    await denies(`GRANT REFERENCES(provider_id) ON provider_runtime_status TO "${role}"`, `REVOKE REFERENCES(provider_id) ON provider_runtime_status FROM "${role}"`, "private_market_tables_or_privileges_unsafe");
    await denies(`GRANT SELECT ON provider_request_reservations TO "${role}" WITH GRANT OPTION`, `REVOKE GRANT OPTION FOR SELECT ON provider_request_reservations FROM "${role}"`, "private_market_tables_or_privileges_unsafe");
    await denies("GRANT SELECT ON provider_request_reservations TO PUBLIC", "REVOKE SELECT ON provider_request_reservations FROM PUBLIC", "private_market_tables_or_privileges_unsafe");
    await denies("GRANT SELECT(provider_id) ON provider_runtime_status TO PUBLIC", "REVOKE SELECT(provider_id) ON provider_runtime_status FROM PUBLIC", "private_market_tables_or_privileges_unsafe");
  });
  await t.test("schema mutation privilege and RLS/policies that could hide quota rows are rejected", async () => {
    await denies(`GRANT CREATE ON SCHEMA "${schema}" TO "${role}"`, `REVOKE CREATE ON SCHEMA "${schema}" FROM "${role}"`, "private_market_role_unsafe");
    await denies("ALTER TABLE provider_request_reservations ENABLE ROW LEVEL SECURITY", "ALTER TABLE provider_request_reservations DISABLE ROW LEVEL SECURITY", "private_market_tables_or_privileges_unsafe");
    await denies("CREATE POLICY hidden_quota ON provider_request_reservations USING (false)", "DROP POLICY hidden_quota ON provider_request_reservations", "private_market_tables_or_privileges_unsafe");
  });
  await t.test("clock default/check/FK mutations are rejected without inspecting or modifying account rows", async () => {
    await denies("ALTER TABLE provider_request_reservations ALTER COLUMN reserved_at SET DEFAULT now()", "ALTER TABLE provider_request_reservations ALTER COLUMN reserved_at SET DEFAULT clock_timestamp()", "private_market_shape_mismatch");
    await denies("ALTER TABLE provider_request_reservations DROP CONSTRAINT provider_request_reservations_limit_snapshot_check", "ALTER TABLE provider_request_reservations ADD CONSTRAINT provider_request_reservations_limit_snapshot_check CHECK (limit_snapshot = 115)", "private_market_constraints_changed");
    await denies("ALTER TABLE provider_runtime_status DROP CONSTRAINT provider_runtime_status_last_reservation_id_fkey", "ALTER TABLE provider_runtime_status ADD CONSTRAINT provider_runtime_status_last_reservation_id_fkey FOREIGN KEY(last_reservation_id) REFERENCES provider_request_reservations(id)", "private_market_constraints_changed");
  });
  await t.test("disabled/extra/changed integrity triggers and function body cannot pass metadata readiness", async () => {
    await denies("ALTER TABLE provider_request_reservations DISABLE TRIGGER provider_request_reservations_are_immutable", "ALTER TABLE provider_request_reservations ENABLE TRIGGER provider_request_reservations_are_immutable", "private_market_integrity_trigger_changed");
    await denies("CREATE TRIGGER extra_market_trigger BEFORE INSERT ON provider_runtime_status FOR EACH ROW EXECUTE FUNCTION reject_immutable_data_mutation()", "DROP TRIGGER extra_market_trigger ON provider_runtime_status", "private_market_integrity_trigger_changed");
    await denies("CREATE OR REPLACE FUNCTION reject_immutable_data_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$", "CREATE OR REPLACE FUNCTION reject_immutable_data_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable data records cannot be updated or deleted'; END; $$", "private_market_integrity_trigger_changed");
  });
});
