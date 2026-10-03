import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { initializeLocalQuotaLifecycle, localQuotaPrivilegePredicate } from "../scripts/local-quota-lifecycle.ts";

const migration = "0010_provider_quota_ledger.sql";
function fixture({ table = true, journal = true, recorded = table, locked = true } = {}) {
  const calls = []; let hook;
  const client = { async query(sql, parameters) {
    calls.push({ sql, parameters }); await hook?.(sql);
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked }] };
    if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
    if (sql.includes("to_regclass")) return { rows: [{ quota_table: table ? "provider_request_reservations" : null, journal: journal ? "asha_schema_migrations" : null }] };
    if (sql.startsWith("SELECT id FROM")) return { rows: recorded ? [{ id: migration }] : [] };
    return { rows: [] };
  } };
  return { client, calls, set hook(value) { hook = value; } };
}

test("fresh quota migration alone may bootstrap INSERT; session lock spans migration transactions and final grants", async () => {
  const f = fixture({ table: false, journal: false });
  assert.deepEqual(await initializeLocalQuotaLifecycle(f.client, async () => {
    await f.client.query("BEGIN"); await f.client.query("MIGRATION"); await f.client.query("COMMIT"); return [migration];
  }, async () => { await f.client.query("OTHER REVIEWED GRANTS"); }), [migration]);
  const sql = f.calls.map(call => call.sql);
  assert.equal(sql[0], "SELECT pg_try_advisory_lock(174228531, 10) AS locked");
  assert.equal(sql.at(-1), "SELECT pg_advisory_unlock(174228531, 10) AS unlocked");
  assert.equal(sql.filter(value => value.startsWith("GRANT INSERT ON")).length, 1);
  assert.ok(sql.indexOf("OTHER REVIEWED GRANTS") > sql.indexOf('GRANT INSERT ON "public".provider_request_reservations TO "asha_runtime"'));
  assert.equal(sql.filter(value => value === "COMMIT").length, 2);
});

test("existing tables keep their INSERT state, including a revoked source authority", async () => {
  for (const applied of [[], ["0014_owner_passkeys.sql"]]) {
    const f = fixture(); await initializeLocalQuotaLifecycle(f.client, async () => applied, async () => {});
    assert.equal(f.calls.some(call => call.sql.startsWith("GRANT INSERT ON")), false);
  }
});

test("unmanaged, dropped or inconsistent migration state cannot be treated as fresh", async () => {
  for (const options of [{ table: true, journal: false }, { table: true, recorded: false }, { table: false, recorded: true }]) {
    const f = fixture(options); let migrated = false;
    await assert.rejects(initializeLocalQuotaLifecycle(f.client, async () => { migrated = true; return []; }, async () => {}), /existing authority preserved/);
    assert.equal(migrated, false); assert.equal(f.calls.some(call => call.sql.startsWith("GRANT")), false);
    assert.equal(f.calls.at(-1).sql, "SELECT pg_advisory_unlock(174228531, 10) AS unlocked");
  }
  for (const [options, applied] of [[{ table: false, journal: false }, []], [{}, [migration]]]) {
    const f = fixture(options);
    await assert.rejects(initializeLocalQuotaLifecycle(f.client, async () => applied, async () => {}), /existing authority preserved/);
    assert.equal(f.calls.some(call => call.sql.startsWith("GRANT")), false);
  }
});

test("contention performs no migration or grants; failed callbacks roll back before session unlock", async () => {
  const busy = fixture({ locked: false });
  await assert.rejects(initializeLocalQuotaLifecycle(busy.client, async () => assert.fail("busy migration"), async () => assert.fail("busy grants")), /existing authority preserved/);
  assert.equal(busy.calls.length, 1);
  for (const stage of ["migration", "grants"]) {
    const f = fixture();
    await assert.rejects(initializeLocalQuotaLifecycle(f.client,
      async () => { if (stage === "migration") throw Error("SYNTHETIC_PRIVATE_DETAIL"); return []; },
      async () => { throw Error("SYNTHETIC_PRIVATE_DETAIL"); }), error => error.message === "Local quota initialization unavailable; existing authority preserved");
    assert.deepEqual(f.calls.slice(-2).map(call => call.sql), ["ROLLBACK", "SELECT pg_advisory_unlock(174228531, 10) AS unlocked"]);
  }
});

test("failed rollback still attempts unlock and failed unlock cannot report success", async () => {
  for (const failure of ["ROLLBACK", "pg_advisory_unlock"]) {
    const f = fixture(); f.hook = sql => { if (sql.includes(failure)) throw Error("SYNTHETIC_PRIVATE_DETAIL"); };
    await assert.rejects(initializeLocalQuotaLifecycle(f.client, async () => [], async () => { if (failure === "ROLLBACK") throw Error(); }), /existing authority preserved/);
    assert.ok(f.calls.at(-1).sql.includes("pg_advisory_unlock"));
  }
});

test("backup exception is quota-only and still forbids mutation; ordinary activation stays strict", async () => {
  const strict = localQuotaPrivilegePredicate(false), backup = localQuotaPrivilegePredicate(true);
  assert.match(strict, /false OR has_table_privilege\(current_user,c.oid,'INSERT'\)/);
  assert.match(backup, /true OR has_table_privilege\(current_user,c.oid,'INSERT'\)/);
  for (const sql of [strict, backup]) {
    assert.match(sql, /has_table_privilege\(current_user,c.oid,'SELECT'\)/);
    assert.match(sql, /NOT has_any_column_privilege\(current_user,c.oid,'UPDATE'\)/);
    assert.match(sql, /NOT has_table_privilege\(current_user,c.oid,'DELETE,TRUNCATE,TRIGGER'\)/);
  }
  const source = await readFile(new URL("../scripts/local-postgres.mjs", import.meta.url), "utf8");
  assert.match(source, /WHEN c\.relname='provider_request_reservations'\s+THEN \$\{localQuotaPrivilegePredicate\(allowPendingMigrations\)\}/);
  assert.doesNotMatch(source, /GRANT INSERT ON provider_request_reservations TO asha_runtime/);
  assert.match(source, /initializeLocalQuotaLifecycle\(owner, \(\) => applyMigrations\(owner, migrations\)/);
  assert.match(source, /"scripts\/local-quota-lifecycle\.ts"/);
  const f = fixture(); await assert.rejects(initializeLocalQuotaLifecycle(f.client, async () => [], async () => {}, { schema: "public", role: "other" }));
  assert.equal(f.calls.length, 0);
});
