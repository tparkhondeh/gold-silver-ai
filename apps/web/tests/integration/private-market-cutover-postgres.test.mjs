import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { Client, Pool } from "pg";
import { applyMigrations, readMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { PostgresNavasanQuotaLedger } from "../../data/navasan-quota-ledger.ts";
import { probePrivateMarketDatabase } from "../../auth/private-market-readiness.ts";
import { fenceAndCapturePrivateMarketSource, importAndGrantPrivateMarketTarget, verifyPrivateMarketCutoverBaseline } from "../../scripts/private-market-cutover.ts";

const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") throw Error("Cutover tests require explicit loopback asha_integration; never a source/hosted database.");
const withheld = /Private market cutover unavailable; details withheld/;
const references = { quotaScopeRef: `qscope_${"1".repeat(32)}`, sourceLedgerId: `qledger_${"2".repeat(32)}`, targetLedgerId: `qledger_${"3".repeat(32)}`,
  targetOrigin: "https://goldsilver.wealthos.ir", identityBindingHash: "4".repeat(64), ownerTransferApprovalRef: `approval_${"5".repeat(32)}`, sourceRefreshSeconds: 24000 };
const config = { bindingHash: references.identityBindingHash, origin: references.targetOrigin, refreshSeconds: 24000 };
const id = n => `navasan_request_00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("committed source retirement and atomic target import/grants preserve restart accounting", { timeout: 90_000 }, async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No provider access during synthetic cutover tests"));
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 }), pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000 });
  const schemas = [], roles = []; await admin.connect();
  t.after(async () => {
    await pool.end();
    for (const schema of schemas.reverse()) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    for (const role of roles.reverse()) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  const allMigrations = await readMigrations();
  const physical = (await admin.query(`SELECT current_database() AS database,host(inet_server_addr()) AS address,
    inet_server_port() AS port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS "databaseOid",current_user AS role`)).rows[0];
  async function fixture(kind, fixedClock) {
    const suffix = randomBytes(8).toString("hex"), schema = `asha_market_readiness_${suffix}`, role = `asha_cutover_${kind}_${suffix}`;
    const scope = { schema, runtimeRole: role }, migrations = kind === "source" ? allMigrations.slice(0, 12) : allMigrations;
    await admin.query(`CREATE SCHEMA "${schema}"`); schemas.push(schema);
    await admin.query(`SET search_path TO "${schema}"`); await applyMigrations(admin, migrations);
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roles.push(role);
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    await admin.query(`GRANT SELECT ON asha_schema_migrations,provider_request_reservations TO "${role}"`);
    if (kind === "source") await admin.query(`GRANT INSERT ON provider_request_reservations TO "${role}"`);
    const rawRunner = createPgTransactionRunner({ async connect() {
      const client = await pool.connect(); await client.query("RESET ROLE"); await client.query(`SET search_path TO "${schema}"`); return client;
    } });
    // The lifetime test's calendar is synthetic; only clock SELECT output changes.
    // Actual locks, privileges, commit/rollback, rows and timestamp SQL remain native.
    const runner = fixedClock ? { transaction: work => rawRunner.transaction(db => work({ query(sql, values) {
      if (sql.startsWith("SELECT to_char(clock_timestamp()")) return db.query("SELECT $1::text AS at", [fixedClock]);
      return db.query(sql, values);
    } })) } : rawRunner;
    const runtimeRunner = { transaction: work => rawRunner.transaction(async db => { await db.query(`SET LOCAL ROLE "${role}"`); return work(db); }) };
    const query = (sql, values) => rawRunner.transaction(db => db.query(sql, values));
    const enabled = async () => (await query("SELECT has_table_privilege($1,'provider_request_reservations','INSERT') AS enabled", [role])).rows[0].enabled;
    const count = async () => (await query("SELECT count(*)::integer AS n FROM provider_request_reservations")).rows[0].n;
    const captureOptions = { runner, expectedDatabase: physical, expectedMigrations: migrations, references, scope,
      retireCallers: async () => { assert.equal(await enabled(), false, "separate connection observes committed fence before retirement"); return { evidenceRef: `retirement_${"6".repeat(64)}` }; } };
    return { schema, role, scope, migrations, runner, rawRunner, runtimeRunner, query, count, enabled, captureOptions };
  }
  const importOptions = (target, captured) => ({ runner: target.runner, expectedDatabase: physical, targetRuntimeDatabase: { ...physical, role: target.role },
    expectedMigrations: target.migrations, capture: captured.capture, expectedReferences: captured.expectedReferences, refreshSeconds: 24000, scope: target.scope });
  const verify = (target, receipt) => target.runtimeRunner.transaction(async db => {
    assert.equal((await probePrivateMarketDatabase(db, allMigrations, target.schema)).state, "ready");
    return verifyPrivateMarketCutoverBaseline(db, receipt, config, target.scope);
  });

  await t.test("wrong physical identity or exact migration checksum stops before source fence", async () => {
    const source = await fixture("source");
    await assert.rejects(fenceAndCapturePrivateMarketSource({ ...source.captureOptions, expectedDatabase: { ...physical, databaseOid: "1" } }), withheld);
    assert.equal(await source.enabled(), true);
    const changed = source.migrations.map((row, index) => index === 0 ? { ...row, checksum: "0".repeat(64) } : row);
    await assert.rejects(fenceAndCapturePrivateMarketSource({ ...source.captureOptions, expectedMigrations: changed }), withheld);
    assert.equal(await source.enabled(), true);
  });

  await t.test("retirement and subsequent capture failures preserve committed source fence, never regrant", async () => {
    for (const stage of ["retire", "capture"]) {
      const source = await fixture("source");
      const options = { ...source.captureOptions, retireCallers: async () => {
        assert.equal(await source.enabled(), false);
        if (stage === "retire") throw Error("SYNTHETIC_PRIVATE_DETAILS");
        // A changed journal in the synthetic source makes the second transaction fail.
        await source.query("UPDATE asha_schema_migrations SET checksum=$1 WHERE id=$2", ["0".repeat(64), source.migrations[0].id]);
        return { evidenceRef: `retirement_${"6".repeat(64)}` };
      } };
      await assert.rejects(fenceAndCapturePrivateMarketSource(options), error => withheld.test(error.message) && !error.stack.includes("SYNTHETIC_PRIVATE_DETAILS"));
      assert.equal(await source.enabled(), false); assert.equal(await source.count(), 0);
    }
  });

  const source = await fixture("source");
  await source.query(`INSERT INTO provider_request_reservations(id,provider_id,endpoint,request_hash,reserved_at,created_at,window_days,limit_snapshot)
    VALUES ($1,'navasan','latest',$3,date_trunc('second',clock_timestamp())-interval '2 days'+interval '123456 microseconds',clock_timestamp()-interval '1 day',31,115),
      ($2,'navasan','dailyCurrency',$3,date_trunc('second',clock_timestamp())-interval '3 days'+interval '234567 microseconds',clock_timestamp()-interval '1 day',31,115)`, [id(1), id(2), "a".repeat(64)]);
  const captured = await fenceAndCapturePrivateMarketSource(source.captureOptions);
  assert.equal(captured.accounting.used, 2); assert.equal(await source.enabled(), false);

  await t.test("target grant failure rolls back imported rows and all grants; source remains disabled", async () => {
    const target = await fixture("target"), options = importOptions(target, captured);
    options.runner = { transaction: work => target.runner.transaction(db => work({ query(sql, values) {
      if (sql.startsWith("GRANT SELECT, INSERT, UPDATE")) throw Error("SYNTHETIC_GRANT_FAILURE"); return db.query(sql, values);
    } })) };
    await assert.rejects(importAndGrantPrivateMarketTarget(options), withheld);
    assert.equal(await target.count(), 0); assert.equal(await target.enabled(), false); assert.equal(await source.enabled(), false);
    for (const changes of [{ expectedDatabase: { ...physical, databaseOid: "1" } }, { expectedReferences: { ...captured.expectedReferences, handoffSha256: "b".repeat(64) } }]) {
      await assert.rejects(importAndGrantPrivateMarketTarget({ ...importOptions(target, captured), ...changes }), withheld);
      assert.equal(await target.count(), 0); assert.equal(await target.enabled(), false);
    }
  });

  const target = await fixture("target"), imported = await importAndGrantPrivateMarketTarget(importOptions(target, captured));
  const receipt = imported.receipt;
  await t.test("exact immutable baseline and successful narrow grants are restart-safe", async () => {
    assert.equal(imported.imported.insertedRows, 2); assert.equal(await target.count(), 2); assert.equal(await target.enabled(), true);
    assert.equal((await verify(target, receipt)).baselineRows, 2);
    const original = JSON.parse(captured.capture.handoffRaw).data.reservations.find(row => row.id === id(1));
    assert.ok(original.reservedAt.endsWith("123456Z"));
    // Only disposable admin fixtures can disable immutability; readiness sees it
    // re-enabled while exact baseline verification still detects one microsecond.
    for (const sql of ["UPDATE provider_request_reservations SET reserved_at=reserved_at+interval '1 microsecond' WHERE id=$1", "DELETE FROM provider_request_reservations WHERE id=$1"]) {
      const rollback = Error("synthetic rollback");
      await assert.rejects(target.rawRunner.transaction(async db => {
        await db.query("ALTER TABLE provider_request_reservations DISABLE TRIGGER provider_request_reservations_are_immutable");
        await db.query(sql, [id(1)]);
        await db.query("ALTER TABLE provider_request_reservations ENABLE TRIGGER provider_request_reservations_are_immutable");
        await db.query(`SET LOCAL ROLE "${target.role}"`);
        await assert.rejects(verifyPrivateMarketCutoverBaseline(db, receipt, config, target.scope), withheld);
        throw rollback;
      }), error => error === rollback);
      assert.equal((await verify(target, receipt)).baselineRows, 2);
    }
  });

  await t.test("legitimate appended request, delayed outcome and denied cooldown survive restart", async () => {
    const ledger = new PostgresNavasanQuotaLedger(target.runtimeRunner);
    const reservation = await ledger.reserve("latest", "b".repeat(64), 24000); assert.equal(reservation.allowed, true);
    assert.equal((await verify(target, receipt)).baselineRows, 2);
    await target.runtimeRunner.transaction(async db => {
      let completed = false;
      const concurrent = { async query(sql, values) {
        const result = await db.query(sql, values);
        if (!completed && sql.startsWith("SELECT to_char(clock_timestamp()")) {
          completed = true;
          // Completion is a separate committed transaction AFTER sampled clock,
          // while baseline holds the provider lock; outcome recording has no lock.
          await ledger.recordLatestOutcome({ reservationId: reservation.reservationId, outcome: "success", quoteCount: 1, durationMs: 1 });
        }
        return result;
      } };
      assert.equal((await verifyPrivateMarketCutoverBaseline(concurrent, receipt, config, target.scope)).baselineRows, 2);
    });
    assert.equal((await ledger.reserve("latest", "c".repeat(64), 24000)).allowed, false);
    assert.equal(await target.count(), 3); assert.equal((await verify(target, receipt)).baselineRows, 2);
  });

  await t.test("unexpected backdated, wrong-endpoint and too-fast additions fail without deleting rows", async () => {
    for (const [endpoint, timestamp] of [["latest", "2000-01-01T00:00:00Z"], ["dailyCurrency", null], ["latest", null]]) {
      const rollback = Error("synthetic rollback");
      await assert.rejects(target.rawRunner.transaction(async db => {
        await db.query(`INSERT INTO provider_request_reservations(id,provider_id,endpoint,request_hash,reserved_at,window_days,limit_snapshot)
          VALUES ($1,'navasan',$2,$3,COALESCE($4::timestamptz,clock_timestamp()),31,115)`, [id(3), endpoint, "d".repeat(64), timestamp]);
        await db.query(`SET LOCAL ROLE "${target.role}"`);
        await assert.rejects(verifyPrivateMarketCutoverBaseline(db, receipt, config, target.scope), withheld); throw rollback;
      }), error => error === rollback);
      assert.equal(await target.count(), 3);
    }
  });

  await t.test("legitimate lifetime ledger may exceed manifest's 4096 transfer-row bound", async () => {
    const syntheticAt = "2000-02-01T00:00:00.123456Z", oldSource = await fixture("source", syntheticAt), oldTarget = await fixture("target", syntheticAt);
    const transfer = await fenceAndCapturePrivateMarketSource(oldSource.captureOptions);
    const completed = await importAndGrantPrivateMarketTarget(importOptions(oldTarget, transfer));
    await oldTarget.query(`INSERT INTO provider_request_reservations(id,provider_id,endpoint,request_hash,reserved_at,created_at,window_days,limit_snapshot)
      SELECT 'navasan_request_00000000-0000-4000-8000-'||lpad(n::text,12,'0'),'navasan','latest',$1,
        $2::timestamptz+make_interval(secs=>n*24000),$2::timestamptz+make_interval(secs=>n*24000),31,115 FROM generate_series(1,4100) n`, ["e".repeat(64), syntheticAt]);
    assert.equal(await oldTarget.count(), 4100); assert.equal((await verify(oldTarget, completed.receipt)).baselineRows, 0);
  });
});
