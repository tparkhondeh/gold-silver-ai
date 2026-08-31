import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { Client, Pool } from "pg";
import { applyMigrations, readMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { ingestManualCsv, manualCsvHeaders } from "../../data/csv-ingestion.ts";
import { validateObservation } from "../../data/validation.ts";
import { PostgresObservationRepository } from "../../data/postgres-observation-repository.ts";
import { PortfolioVersionConflictError, PostgresPortfolioRepository } from "../../data/postgres-portfolio-repository.ts";

// Never use DATABASE_URL or load .env.local: only an explicitly disposable database.
const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") {
  throw new Error("Real DB tests require a loopback ASHA_TEST_DATABASE_URL with database asha_integration. No tests skipped.");
}

const registry = {
  instruments: new Map([["TEST_ONLY", { schemaVersion: 1, code: "TEST_ONLY", displayName: "Synthetic integration fixture", assetClass: "test", canonicalCurrency: "TOMAN", canonicalUnit: "gram", activeFrom: "2026-01-01T00:00:00Z", retiredAt: null }]]),
  sources: new Map([["test-only", { schemaVersion: 1, id: "test-only", displayName: "Synthetic test source", quality: "test_only", accessMode: "test", active: true }]]),
};
const raw = { instrumentCode: "TEST_ONLY", sourceId: "test-only", value: "1.00", currency: "TOMAN", unit: "gram", observedAt: "2026-08-20T10:00:00Z", publishedAt: null, collectedAt: "2026-08-20T10:01:00Z", effectiveFrom: "2026-08-20T10:00:00Z", effectiveTo: null, correctionOf: null, rawPayload: { synthetic: true } };

test("real PostgreSQL migration, isolation, persistence and restore", async (t) => {
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  await admin.connect();
  const schema = `asha_test_${randomBytes(8).toString("hex")}`;
  const restoredSchema = `${schema}_restored`;
  const role = `${schema}_writer`;
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 3000 });
  let schemaCreated = false;
  let roleCreated = false;
  let restoredCreated = false;
  t.after(async () => {
    await pool.end();
    if (restoredCreated) await admin.query(`DROP SCHEMA "${restoredSchema}" CASCADE`);
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await admin.query(`SET search_path TO "${schema}"`);
  const migrations = await readMigrations();
  await t.test("applies migrations once, detects drift and rolls back failure", async () => {
    assert.equal((await applyMigrations(admin, migrations)).length, migrations.length);
    assert.deepEqual(await applyMigrations(admin, migrations), []);
    await assert.rejects(applyMigrations(admin, [{ ...migrations[0], checksum: "0".repeat(64) }, ...migrations.slice(1)]), /checksum/);
    await assert.rejects(applyMigrations(admin, [...migrations, { id: "9999_failure.sql", checksum: "f".repeat(64), sql: "CREATE TABLE rollback_probe(id integer); SELECT * FROM no_such_table_for_test" }]));
    assert.equal((await admin.query("SELECT to_regclass('rollback_probe') AS relation")).rows[0].relation, null);
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations")).rows[0].count), 0);
  });
  await admin.query("INSERT INTO instruments VALUES ('TEST_ONLY',1,'Synthetic integration fixture','test','TOMAN','gram','2026-01-01',NULL)");
  await admin.query("INSERT INTO sources VALUES ('test-only',1,'Synthetic test source','test_only','test',true)");
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  roleCreated = true;
  await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`);
  await admin.query(`GRANT INSERT ON ingestion_batches, observations, quarantine_records, validation_results, quarantine_resolutions TO "${role}"`);
  await admin.query(`GRANT INSERT, UPDATE, DELETE ON user_portfolios, portfolio_holdings TO "${role}"`);
  const runtimePool = { async connect() {
    const client = await pool.connect();
    await client.query(`SET ROLE "${role}"`);
    await client.query(`SET search_path TO "${schema}"`);
    return client;
  } };
  const repository = new PostgresObservationRepository(createPgTransactionRunner(runtimePool));
  const portfolioRepository = new PostgresPortfolioRepository(createPgTransactionRunner(runtimePool));
  const valid = "TEST_ONLY,test-only,1.00,TOMAN,gram,2026-08-20T10:00:00Z,,2026-08-20T10:01:00Z,2026-08-20T10:00:00Z,,";
  const batch = await ingestManualCsv({ text: `${manualCsvHeaders.join(",")}\n${valid}\n${valid}\n${valid.replace(",1.00,", ",0,")}\n`, fileName: "synthetic-integration.csv", sourceId: "test-only", registry, now: new Date("2026-08-20T12:00:00Z") });
  await t.test("least-privilege writer commits and concurrently replays without duplicates", async () => {
    const results = await Promise.all([repository.persistBatch(batch), repository.persistBatch(batch)]);
    assert.equal(results.filter((result) => result.alreadyProcessed).length, 1);
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations")).rows[0].count), 1);
    assert.equal(Number((await admin.query("SELECT count(*) FROM quarantine_records")).rows[0].count), 1);
    const stored = (await admin.query("SELECT value::text, collected_at, raw_payload FROM observations")).rows[0];
    assert.equal(stored.value, "1.000000000000");
    assert.equal(stored.collected_at.toISOString(), "2026-08-20T12:00:00.000Z");
    assert.equal(stored.raw_payload.collected_at, "2026-08-20T10:01:00Z");
  });
  await t.test("runtime cannot mutate/truncate audit data, registries or schema", async () => {
    const client = await runtimePool.connect();
    try {
      for (const sql of ["UPDATE observations SET value=2", "DELETE FROM observations", "TRUNCATE observations CASCADE", "ALTER TABLE observations DISABLE TRIGGER ALL", "UPDATE instruments SET display_name='changed'", "UPDATE ingestion_batches SET accepted_count=99", "CREATE TABLE forbidden(id integer)"]) {
        await assert.rejects(client.query(sql), /permission denied|must be owner/);
      }
    } finally { client.release(); }
  });
  await t.test("owner is also blocked by immutable audit triggers", async () => {
    for (const sql of ["UPDATE observations SET value=2", "DELETE FROM observations", "TRUNCATE observations CASCADE", "UPDATE ingestion_batches SET accepted_count=99", "TRUNCATE ingestion_batches CASCADE", "TRUNCATE quarantine_records CASCADE", "TRUNCATE validation_results CASCADE", "TRUNCATE quarantine_resolutions CASCADE"]) {
      await admin.query("BEGIN");
      try { await assert.rejects(admin.query(sql), /immutable data records/); }
      finally { await admin.query("ROLLBACK"); }
    }
  });
  await t.test("late failure rolls back the whole batch and pool remains usable", async () => {
    const observation = (await validateObservation({ ...raw, value: "2" }, registry, new Date("2026-08-20T12:00:00Z"))).observation;
    await assert.rejects(repository.persistBatch({ ...batch, id: "rollback-batch", accepted: [observation, { ...observation, id: "invalid", idempotencyKey: "b".repeat(64), instrumentCode: "UNKNOWN" }], quarantined: [], duplicates: [] }));
    assert.equal(Number((await admin.query("SELECT count(*) FROM ingestion_batches WHERE id='rollback-batch'")).rows[0].count), 0);
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations WHERE value=2")).rows[0].count), 0);
    assert.equal((await repository.persistBatch(batch)).alreadyProcessed, true);
  });
  await t.test("numeric limits round-trip exactly and invalid precision never reaches SQL", async () => {
    const value = "99999999999999999999999999.999999999999";
    const observation = (await validateObservation({ ...raw, value }, registry, new Date("2026-08-20T12:00:00Z"))).observation;
    await repository.persistBatch({ ...batch, id: "precision-batch", accepted: [observation], quarantined: [], duplicates: [] });
    assert.equal((await admin.query("SELECT value::text FROM observations WHERE id=$1", [observation.id])).rows[0].value, value);
    assert.equal((await validateObservation({ ...raw, value: "1.1234567890123" }, registry)).observation, null);
  });
  await t.test("corrections remain append-only and cannot rewrite earlier cutoffs", async () => {
    const original = batch.accepted[0];
    const revision = (await validateObservation({ ...raw, correctionOf: original.id, effectiveFrom: "2026-08-20T10:00:01Z", collectedAt: "2026-08-21T12:00:00Z" }, registry, new Date("2026-08-22T12:00:00Z"))).observation;
    await repository.persistBatch({ ...batch, id: "correction-batch", accepted: [revision], quarantined: [], duplicates: [] });
    assert.notEqual(revision.id, original.id);
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations WHERE id=$1", [original.id])).rows[0].count), 1);
    const known = async (cutoff) => (await admin.query("SELECT id FROM observations WHERE id=ANY($1::text[]) AND greatest(observed_at,published_at,collected_at) <= $2::timestamptz ORDER BY id", [[original.id, revision.id], cutoff])).rows.map((row) => row.id);
    assert.deepEqual(await known("2026-08-20T11:00:00Z"), []);
    assert.deepEqual(await known("2026-08-20T13:00:00Z"), [original.id]);
    assert.equal((await known("2026-08-22T13:00:00Z")).length, 2);
    await admin.query("INSERT INTO sources VALUES ('test-other',1,'Other test source','test_only','test',true)");
    await assert.rejects(repository.persistBatch({ ...batch, id: "cross-source-correction", accepted: [{ ...revision, id: 'obs_' + 'c'.repeat(64), idempotencyKey: 'c'.repeat(64), sourceId: 'test-other' }], quarantined: [], duplicates: [] }), /correction target/);
  });
  await t.test("portfolio rows are durable, versioned and isolated by owner subject", async () => {
    const ownerA = "integration-owner-a";
    const ownerB = "integration-owner-b";
    const first = await portfolioRepository.save(ownerA, 0, [{
      id: "owner-a-gold",
      name: "Synthetic holding A",
      amount: 2.5,
      unit: "gram",
      costToman: 1000,
      purchaseDate: "2026-08-20",
      note: "test only",
    }]);
    assert.equal(first.version, 1);
    assert.deepEqual(await portfolioRepository.load(ownerA), first);
    assert.deepEqual(await portfolioRepository.load(ownerB), { version: 0, holdings: [] });
    await assert.rejects(portfolioRepository.save(ownerA, 0, []), PortfolioVersionConflictError);
    const second = await portfolioRepository.save(ownerB, 0, [{
      id: "owner-b-silver",
      name: "Synthetic holding B",
      amount: 3,
      unit: "gram",
      costToman: null,
      purchaseDate: null,
      note: "",
    }]);
    assert.equal(second.version, 1);
    assert.equal((await portfolioRepository.load(ownerA)).holdings[0].id, "owner-a-gold");
    assert.equal((await portfolioRepository.load(ownerB)).holdings[0].id, "owner-b-silver");
  });
  await t.test("backup restores into an independently created test schema", async () => {
    const url = new URL(connectionString);
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const args = ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", "asha_integration", "--no-password"];
    const executable = (name) => process.env.ASHA_PG_BIN ? join(process.env.ASHA_PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name;
    const container = process.env.ASHA_PG_CONTAINER_ID;
    if (container && !/^[a-f0-9]{12,64}$/.test(container)) throw new Error("Unexpected CI PostgreSQL container identifier");
    const clientCommand = (name, commandArgs, input) => execFileSync(
      container ? "docker" : executable(name),
      container ? ["exec", "-i", "--env", "PGPASSWORD", container, name, ...commandArgs] : commandArgs,
      { input, env, windowsHide: true, stdio: "pipe", timeout: 30_000, maxBuffer: 10_485_760 },
    ).toString();
    for (const name of ["pg_dump", "psql"]) assert.match(clientCommand(name, ["--version"]), /\b17\./);
    const dump = clientCommand("pg_dump", [...args, "--schema", schema, "--no-owner", "--no-privileges"]).replaceAll(schema, restoredSchema);
    // pg_dump plain output includes psql meta commands; use psql's parser.
    clientCommand("psql", [...args, "--set", "ON_ERROR_STOP=1", "--single-transaction"], dump);
    restoredCreated = true;
    for (const table of ["asha_schema_migrations", "instruments", "sources", "ingestion_batches", "observations", "quarantine_records", "quarantine_resolutions", "validation_results", "user_portfolios", "portfolio_holdings"]) {
      const allRows = async (schemaName) => (await admin.query(`SELECT to_jsonb(t) AS row FROM "${schemaName}"."${table}" t ORDER BY to_jsonb(t)::text`)).rows;
      assert.deepEqual(await allRows(restoredSchema), await allRows(schema));
    }
    await admin.query(`SET search_path TO "${restoredSchema}"`);
    try {
      await admin.query(`GRANT USAGE ON SCHEMA "${restoredSchema}" TO "${role}"`);
      await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${restoredSchema}" TO "${role}"`);
      await admin.query(`GRANT INSERT ON ingestion_batches, observations, quarantine_records, validation_results, quarantine_resolutions TO "${role}"`);
      await admin.query(`GRANT INSERT, UPDATE, DELETE ON user_portfolios, portfolio_holdings TO "${role}"`);
      const restoredPool = { async connect() {
        const client = await pool.connect();
        await client.query(`SET ROLE "${role}"`);
        await client.query(`SET search_path TO "${restoredSchema}"`);
        return client;
      } };
      const restoredRepository = new PostgresObservationRepository(createPgTransactionRunner(restoredPool));
      assert.equal((await restoredRepository.persistBatch(batch)).alreadyProcessed, true);
      const observation = (await validateObservation({ ...raw, value: "3" }, registry, new Date("2026-08-20T12:00:00Z"))).observation;
      assert.equal((await restoredRepository.persistBatch({ ...batch, id: "restored-write", accepted: [observation], quarantined: [], duplicates: [] })).insertedObservations, 1);
      await assert.rejects(admin.query("UPDATE observations SET value=4"), /immutable data records/);
      const runtime = await restoredPool.connect();
      try { await assert.rejects(runtime.query("TRUNCATE observations CASCADE"), /permission denied/); }
      finally { runtime.release(); }
    } finally { await admin.query(`SET search_path TO "${schema}"`); }
  });
});
