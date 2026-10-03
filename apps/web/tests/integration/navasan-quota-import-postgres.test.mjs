import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { Client, Pool } from "pg";
import { readMigrations, applyMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { exportCapturedRows, importNavasanQuotaHandoff } from "../../data/navasan-quota-import.ts";
import { createNavasanQuotaHandoffManifest, encodeNavasanQuotaHandoff, NAVASAN_QUOTA_HANDOFF_VERSION } from "../../data/navasan-quota-handoff.ts";

// Only a separately supplied disposable database; never inspect .env or private configuration.
const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") throw Error("Quota transfer tests require explicit loopback asha_integration. No skipped database acceptance.");
const capturedAt = "2000-02-01T12:00:00.123456Z", cutoff = "2000-01-01T12:00:00.123456Z";
const id = number => `navasan_request_00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const row = (number, changes = {}) => ({ id: id(number), endpoint: "latest", requestHash: "a".repeat(64),
  reservedAt: "2000-02-01T12:00:00.123455Z", createdAt: "2000-02-01T12:00:00.123456Z", windowDays: 31, limitSnapshot: 115, ...changes });
// Opaque references are explicitly synthetic, never actual approvals/account identity.
const references = changes => ({ quotaScopeRef: `qscope_${"1".repeat(32)}`, sourceLedgerId: `qledger_${"2".repeat(32)}`,
  targetLedgerId: `qledger_${"3".repeat(32)}`, targetOrigin: "https://goldsilver.wealthos.ir", identityBindingHash: "4".repeat(64),
  ownerTransferApprovalRef: `approval_${"5".repeat(32)}`, sourceRefreshSeconds: 24_000, ...changes });
const data = (reservations, changes = {}) => ({ ...references(), version: NAVASAN_QUOTA_HANDOFF_VERSION,
  provider: "navasan", plan: "free", capturedAt, latestReservationId: reservations.filter(row => row.endpoint === "latest").sort((a, b) => a.reservedAt.localeCompare(b.reservedAt) || a.id.localeCompare(b.id)).at(-1)?.id ?? null,
  reservations, ...changes });
const encoded = (reservations, changes) => encodeNavasanQuotaHandoff(data(reservations, changes), capturedAt);
// Trusted expectations come from the independently constructed fixture/capture,
// never from decoding the incoming raw document being tested.
const expectedFor = input => ({ quotaScopeRef: input.quotaScopeRef, targetLedgerId: input.targetLedgerId,
  targetOrigin: input.targetOrigin, identityBindingHash: input.identityBindingHash, ownerTransferApprovalRef: input.ownerTransferApprovalRef,
  handoffSha256: createNavasanQuotaHandoffManifest(input, input.capturedAt).sha256 });
const withheld = /accounting transfer failed; details withheld/;

test("native PostgreSQL quota capture and append-only import without activating callers", { timeout: 60_000 }, async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No provider calls in quota transfer tests"));
  const suffix = randomBytes(8).toString("hex"), runtimeRole = `asha_quota_runtime_${suffix}`, inherited = `asha_quota_parent_${suffix}`;
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 }), pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 3000 });
  const schemas = [], roles = [];
  await admin.connect();
  t.after(async () => {
    await pool.end();
    for (const schema of schemas.reverse()) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    for (const role of roles.reverse()) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  for (const role of [runtimeRole, inherited]) {
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roles.push(role);
  }
  const migrations = await readMigrations();
  async function fixture() {
    const schema = `asha_quota_import_${suffix}_${schemas.length}`, scope = { schema, runtimeRole };
    await admin.query(`CREATE SCHEMA "${schema}"`); schemas.push(schema);
    await admin.query(`SET search_path TO "${schema}"`); await applyMigrations(admin, migrations);
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${runtimeRole}"`);
    await admin.query(`GRANT SELECT ON provider_request_reservations TO "${runtimeRole}"`);
    const runner = createPgTransactionRunner({ async connect() {
      const client = await pool.connect(); await client.query("RESET ROLE"); await client.query(`SET search_path TO "${schema}"`); return client;
    } });
    const query = (sql, values) => runner.transaction(db => db.query(sql, values));
    const count = async () => (await query(`SELECT count(*)::integer AS count FROM provider_request_reservations`)).rows[0].count;
    const insert = async value => query(`INSERT INTO provider_request_reservations
      (id,provider_id,endpoint,request_hash,reserved_at,created_at,window_days,limit_snapshot)
      VALUES ($1,'navasan',$2,$3,$4,$5,$6,$7)`, [value.id, value.endpoint, value.requestHash, value.reservedAt, value.createdAt, value.windowDays, value.limitSnapshot]);
    const capture = (referenceChanges, lock = true) => runner.transaction(async db => {
      if (lock) await db.query("SELECT pg_advisory_xact_lock(174228531,10)");
      // Fixed synthetic timestamp is returned by PostgreSQL; real table queries,
      // privilege checks, locks and six-digit time arithmetic remain untouched.
      const source = { query(sql, values) {
        if (sql.startsWith("SELECT to_char(clock_timestamp()")) return db.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`, [capturedAt]);
        return db.query(sql, values);
      } };
      return exportCapturedRows(source, references(referenceChanges), scope);
    });
    return { schema, scope, runner, query, count, insert, capture };
  }

  await t.test("capture requires caller-held provider lock and disabled effective table/column/inherited INSERT", async () => {
    const f = await fixture();
    await assert.rejects(f.capture(undefined, false), withheld);
    for (const [grant, revoke] of [
      [`GRANT INSERT ON provider_request_reservations TO "${runtimeRole}"`, `REVOKE INSERT ON provider_request_reservations FROM "${runtimeRole}"`],
      [`GRANT INSERT(id) ON provider_request_reservations TO "${runtimeRole}"`, `REVOKE INSERT(id) ON provider_request_reservations FROM "${runtimeRole}"`],
      [`GRANT INSERT ON provider_request_reservations TO PUBLIC`, `REVOKE INSERT ON provider_request_reservations FROM PUBLIC`],
      [`GRANT "${inherited}" TO "${runtimeRole}"`, `REVOKE "${inherited}" FROM "${runtimeRole}"`],
      [`GRANT CREATE ON SCHEMA "${f.schema}" TO "${runtimeRole}"`, `REVOKE CREATE ON SCHEMA "${f.schema}" FROM "${runtimeRole}"`],
      ...["UPDATE", "UPDATE(reserved_at)", "DELETE", "TRUNCATE", "TRIGGER"].map(privilege => [
        `GRANT ${privilege} ON provider_request_reservations TO "${runtimeRole}"`, `REVOKE ${privilege} ON provider_request_reservations FROM "${runtimeRole}"`,
      ]),
    ]) {
      await f.query(grant);
      try { await assert.rejects(f.capture(), withheld); }
      finally { await f.query(revoke); }
    }
    assert.equal((await f.capture()).manifest.data.reservations.length, 0);
    assert.equal(await f.count(), 0);
  });

  await t.test("self-revoked table/schema ownership cannot masquerade as a disabled runtime", async () => {
    const raw = encoded([row(1)]), expected = expectedFor(data([row(1)]));
    for (const kind of ["table", "schema"]) {
      const f = await fixture();
      if (kind === "table") {
        await f.query(`ALTER TABLE provider_request_reservations OWNER TO "${runtimeRole}"`);
        await f.query(`REVOKE ALL ON provider_request_reservations FROM "${runtimeRole}"`);
        await f.query(`GRANT SELECT ON provider_request_reservations TO "${runtimeRole}"`);
        assert.equal((await f.query("SELECT has_table_privilege($1,'provider_request_reservations','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS enabled", [runtimeRole])).rows[0].enabled, false);
      } else {
        await f.query(`ALTER SCHEMA "${f.schema}" OWNER TO "${runtimeRole}"`);
        await f.query(`REVOKE CREATE ON SCHEMA "${f.schema}" FROM "${runtimeRole}"`);
        assert.equal((await f.query("SELECT has_schema_privilege($1,$2,'CREATE') AS enabled", [runtimeRole, f.schema])).rows[0].enabled, false);
      }
      await assert.rejects(f.capture(), withheld);
      await assert.rejects(importNavasanQuotaHandoff(f.runner, raw, expected, f.scope), withheld);
      assert.equal(await f.count(), 0);
    }
  });

  await t.test("independent expected references and digest bind every import and replay before mutation", async () => {
    const f = await fixture(), baseline = data([row(1)]), raw = encoded([row(1)]), expected = expectedFor(baseline);
    const mismatches = [
      { quotaScopeRef: `qscope_${"8".repeat(32)}` }, { targetLedgerId: `qledger_${"8".repeat(32)}` },
      { targetOrigin: "https://elsewhere.invalid" }, { identityBindingHash: "8".repeat(64) },
      { ownerTransferApprovalRef: `approval_${"8".repeat(32)}` }, { handoffSha256: "8".repeat(64) },
    ];
    for (const existing of [false, true]) {
      if (existing) assert.equal((await importNavasanQuotaHandoff(f.runner, raw, expected, f.scope)).insertedRows, 1);
      const before = (await f.query("SELECT * FROM provider_request_reservations ORDER BY id")).rows;
      for (const change of mismatches) await assert.rejects(importNavasanQuotaHandoff(f.runner, raw, { ...expected, ...change }, f.scope), withheld);
      for (const change of [{ sourceLedgerId: `qledger_${"9".repeat(32)}` }, { targetLedgerId: `qledger_${"9".repeat(32)}` }, { quotaScopeRef: `qscope_${"9".repeat(32)}` }]) {
        const otherValidDocument = encodeNavasanQuotaHandoff({ ...baseline, ...change }, capturedAt);
        await assert.rejects(importNavasanQuotaHandoff(f.runner, otherValidDocument, expected, f.scope), withheld);
      }
      await assert.rejects(importNavasanQuotaHandoff(f.runner, raw, undefined, f.scope), withheld);
      assert.deepEqual((await f.query("SELECT * FROM provider_request_reservations ORDER BY id")).rows, before);
    }
    assert.equal((await importNavasanQuotaHandoff(f.runner, raw, expected, f.scope)).replayed, true);
  });

  await t.test("capture preserves exact microseconds, inclusive cutoff, every endpoint and uncompleted spend", async () => {
    const f = await fixture();
    const selected = [row(1), row(2, { endpoint: "dailyCurrency", reservedAt: cutoff }), row(4, { endpoint: "ohlcSearch" })];
    for (const item of [selected[2], row(3, { endpoint: "dailyCurrency", reservedAt: "2000-01-01T12:00:00.123455Z" }), selected[0], selected[1]]) await f.insert(item);
    const captured = await f.capture();
    assert.equal(captured.manifest.data.capturedAt, capturedAt);
    assert.deepEqual(captured.manifest.data.reservations.map(item => item.id), [id(2), id(1), id(4)]);
    assert.equal(captured.manifest.data.latestReservationId, id(1));
    assert.equal(captured.accounting.used, 3); assert.equal(captured.accounting.remaining, 112);
    assert.equal(captured.accounting.latestNextEligibleAt, "2000-02-01T18:40:00.123455Z");
    assert.equal(captured.accounting.cooldownSeconds, 24_000);
    assert.equal(await f.count(), 4);
    const target = await fixture(), raw = JSON.stringify(captured.manifest), expected = expectedFor(captured.manifest.data);
    const imported = await importNavasanQuotaHandoff(target.runner, raw, expected, target.scope);
    assert.equal(imported.insertedRows, 3); assert.equal(imported.replayed, false);
    assert.deepEqual(imported.accounting, captured.accounting);
    const again = await importNavasanQuotaHandoff(target.runner, raw, expected, target.scope);
    assert.equal(again.insertedRows, 0); assert.equal(again.replayed, true); assert.equal(await target.count(), 3);
    assert.deepEqual(again.accounting, captured.accounting);
    assert.equal((await target.query(`SELECT has_table_privilege($1,'provider_request_reservations','INSERT') AS enabled`, [runtimeRole])).rows[0].enabled, false);
    // CASCADE reaches the immutable trigger past the outcome table's FK guard;
    // this transaction is confined to the freshly created disposable schema.
    for (const sql of ["UPDATE provider_request_reservations SET request_hash=request_hash", "DELETE FROM provider_request_reservations", "TRUNCATE provider_request_reservations CASCADE"]) await assert.rejects(target.query(sql), /immutable/);
  });

  await t.test("global latest outside the window preserves a slower source cooldown and excludes unrelated old rows", async () => {
    const source = await fixture(), target = await fixture();
    await source.insert(row(1, { reservedAt: "1999-12-31T00:00:00.000001Z" }));
    await source.insert(row(2, { endpoint: "dailyCurrency", reservedAt: "1999-12-31T00:00:00.000002Z" }));
    const result = await source.capture({ sourceRefreshSeconds: 31_536_000 });
    assert.equal(result.manifest.data.reservations.length, 1); assert.equal(result.accounting.used, 0);
    assert.ok(result.accounting.cooldownSeconds > 0);
    assert.equal(result.accounting.latestNextEligibleAt, "2000-12-30T00:00:00.000001Z");
    assert.deepEqual((await importNavasanQuotaHandoff(target.runner, JSON.stringify(result.manifest), expectedFor(result.manifest.data), target.scope)).accounting, result.accounting);
  });

  await t.test("empty and over-limit accounting remain empty/exhausted without fictional credits", async () => {
    const empty = await fixture(), exhausted = await fixture();
    const zero = await importNavasanQuotaHandoff(empty.runner, encoded([]), expectedFor(data([])), empty.scope);
    assert.deepEqual(zero.accounting, { asOf: capturedAt, used: 0, remaining: 115, latestNextEligibleAt: null, cooldownSeconds: 0 });
    assert.equal((await importNavasanQuotaHandoff(empty.runner, encoded([]), expectedFor(data([])), empty.scope)).insertedRows, 0);
    const many = Array.from({ length: 116 }, (_, index) => row(index + 1, { endpoint: index % 2 ? "dailyCurrency" : "latest" }));
    const result = await importNavasanQuotaHandoff(exhausted.runner, encoded(many), expectedFor(data(many)), exhausted.scope);
    assert.equal(result.accounting.used, 116); assert.equal(result.accounting.remaining, 0); assert.equal(await exhausted.count(), 116);
  });

  await t.test("partial, changed-ID and extra target rows reject atomically without repair", async () => {
    const originals = [row(1), row(2, { endpoint: "dailyCurrency" })], raw = encoded(originals);
    for (const existing of [[originals[0]], [row(1, { requestHash: "b".repeat(64) })], [...originals, row(3)]]) {
      const target = await fixture(); for (const value of existing) await target.insert(value);
      const before = (await target.query("SELECT * FROM provider_request_reservations ORDER BY id")).rows;
      await assert.rejects(importNavasanQuotaHandoff(target.runner, raw, expectedFor(data(originals)), target.scope), withheld);
      assert.deepEqual((await target.query("SELECT * FROM provider_request_reservations ORDER BY id")).rows, before);
    }
  });

  await t.test("enabled target, preexisting outcome, future/tampered handoff and unsafe scope cannot import", async () => {
    const f = await fixture(), raw = encoded([row(1)]), expected = expectedFor(data([row(1)]));
    await f.query(`GRANT INSERT ON provider_request_reservations TO "${runtimeRole}"`);
    await assert.rejects(importNavasanQuotaHandoff(f.runner, raw, expected, f.scope), withheld);
    await f.query(`REVOKE INSERT ON provider_request_reservations FROM "${runtimeRole}"`);
    await assert.rejects(importNavasanQuotaHandoff(f.runner, raw + "\n", expected, f.scope), withheld);
    const future = data([], { capturedAt: "9998-01-01T00:00:00.000000Z" });
    await assert.rejects(importNavasanQuotaHandoff(f.runner, encodeNavasanQuotaHandoff(future, future.capturedAt), expectedFor(future), f.scope), withheld);
    await assert.rejects(importNavasanQuotaHandoff(f.runner, raw, expected, { ...f.scope, schema: 'public"; SELECT 1' }), withheld);
    assert.equal(await f.count(), 0);
    await f.insert(row(1));
    await f.query("INSERT INTO provider_runtime_status(provider_id,last_reservation_id,last_outcome,quote_count,duration_ms) VALUES ('navasan',$1,'success',1,1)", [id(1)]);
    await assert.rejects(importNavasanQuotaHandoff(f.runner, raw, expected, f.scope), withheld);
    assert.equal(await f.count(), 1);
  });

  await t.test("database error after an insert rolls the entire import back and never exposes its message", async () => {
    const f = await fixture(), raw = encoded([row(1), row(2)]), expected = expectedFor(data([row(1), row(2)]));
    await f.query(`CREATE FUNCTION reject_second_synthetic_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.id='${id(2)}' THEN RAISE EXCEPTION 'SYNTHETIC_PRIVATE_DETAILS'; END IF; RETURN NEW; END; $$`);
    await f.query("CREATE TRIGGER reject_second_synthetic_row BEFORE INSERT ON provider_request_reservations FOR EACH ROW EXECUTE FUNCTION reject_second_synthetic_row()");
    await assert.rejects(importNavasanQuotaHandoff(f.runner, raw, expected, f.scope), error => withheld.test(error.message) && !error.message.includes("SYNTHETIC_PRIVATE_DETAILS"));
    assert.equal(await f.count(), 0);
    await f.query("DROP TRIGGER reject_second_synthetic_row ON provider_request_reservations");
    assert.equal((await importNavasanQuotaHandoff(f.runner, raw, expected, f.scope)).insertedRows, 2);
  });

  await t.test("concurrent identical imports serialize and persist one exact copy", async () => {
    const f = await fixture(), raw = encoded([row(1), row(2)]), expected = expectedFor(data([row(1), row(2)]));
    const results = await Promise.all([importNavasanQuotaHandoff(f.runner, raw, expected, f.scope), importNavasanQuotaHandoff(f.runner, raw, expected, f.scope)]);
    assert.deepEqual(results.map(result => result.insertedRows).sort(), [0, 2]);
    assert.deepEqual(results.map(result => result.replayed).sort(), [false, true]);
    assert.equal(await f.count(), 2);
  });
});
