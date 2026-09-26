import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readMigrations } from "../db/migrations.ts";
import { probePrivateMarketDatabase } from "../auth/private-market-readiness.ts";
import { privateMarketRuntimeGrants } from "../scripts/private-market-grants.ts";

const migrations = (await readMigrations()).map(({ id, checksum }) => ({ id, checksum }));
const reservation = "provider_request_reservations", outcome = "provider_runtime_status";
const schema = "asha_market_readiness_0123456789abcdef";
const col = (name, type = "text", required = true, value = null) => ({ name, type, required, default: value });
function fixture() {
  const constraint = (table_name, type, columns, expression = null) => ({ table_name, type, columns, expression, validated: true, deferred: false, deferrable: false, target_schema: null, target_table: null, target_columns: null, update_action: " ", delete_action: " ", match: " " });
  const data = {
    journal: structuredClone(migrations), role: [{ safe: true }],
    relations: [
      { name: reservation, safe: true, columns: [col("id"), col("provider_id"), col("endpoint"), col("request_hash"), col("reserved_at", "timestamp with time zone", true, "clock_timestamp()"), col("window_days", "smallint"), col("limit_snapshot", "smallint"), col("created_at", "timestamp with time zone", true, "clock_timestamp()") ] },
      { name: outcome, safe: true, columns: [col("provider_id"), col("last_reservation_id"), col("last_outcome"), col("quote_count", "smallint", false), col("duration_ms", "integer"), col("completed_at", "timestamp with time zone", true, "clock_timestamp()") ] },
    ],
    constraints: [
      ...["(id ~ '^navasan_request_[0-9a-f-]{36}$'::text)", "(provider_id = 'navasan'::text)", "(endpoint = ANY (ARRAY['latest'::text, 'dailyCurrency'::text, 'ohlcSearch'::text]))", "((length(request_hash) = 64) AND (request_hash ~ '^[a-f0-9]+$'::text))", "(window_days = 31)", "(limit_snapshot = 115)"].map(value => constraint(reservation, "c", [], value)),
      constraint(reservation, "p", ["id"]),
      ...["(provider_id = 'navasan'::text)", "(last_outcome = ANY (ARRAY['success'::text, 'failure'::text]))", "((duration_ms >= 0) AND (duration_ms <= 120000))", "(((last_outcome = 'success'::text) AND ((quote_count >= 1) AND (quote_count <= 64))) OR ((last_outcome = 'failure'::text) AND (quote_count IS NULL)))"].map(value => constraint(outcome, "c", [], value)),
      constraint(outcome, "p", ["provider_id"]), constraint(outcome, "u", ["last_reservation_id"]),
      { ...constraint(outcome, "f", ["last_reservation_id"]), target_schema: schema, target_table: reservation, target_columns: ["id"], update_action: "a", delete_action: "a", match: "s" },
    ],
    triggers: [
      { name: "provider_request_reservations_are_immutable", type: 27 },
      { name: "provider_request_reservations_cannot_be_truncated", type: 34 },
    ].map(value => ({ ...value, table_name: reservation, enabled: "O", arguments: 0, condition: true, safe_function: true, source: "BEGIN\n RAISE EXCEPTION 'immutable data records cannot be updated or deleted';\nEND;" })),
  };
  const calls = [];
  const database = { async query(sql, parameters) {
    calls.push({ sql, parameters });
    if (sql.includes(".asha_schema_migrations")) return { rows: structuredClone(data.journal) };
    if (sql.includes("FROM pg_roles runtime_role")) return { rows: structuredClone(data.role) };
    if (sql.includes("FROM pg_constraint k")) return { rows: structuredClone(data.constraints) };
    if (sql.includes("FROM pg_trigger t")) return { rows: structuredClone(data.triggers) };
    if (sql.includes("FROM pg_class c")) return { rows: structuredClone(data.relations) };
    assert.fail("Unexpected metadata query");
  } };
  return { data, calls, database, probe: () => probePrivateMarketDatabase(database, migrations, schema) };
}

test("optional grant plan contains exactly two fixed least-privilege grants and leaves auth-only defaults unchanged", () => {
  assert.deepEqual(privateMarketRuntimeGrants(), ["GRANT SELECT, INSERT ON public.provider_request_reservations TO asha_private_runtime", "GRANT SELECT, INSERT, UPDATE ON public.provider_runtime_status TO asha_private_runtime"]);
  assert.equal(Object.isFrozen(privateMarketRuntimeGrants()), true);
  for (const path of ["../scripts/private-linux-plan.ts", "../scripts/start-private-server.mjs", "../scripts/prepare-private-database.mjs"]) {
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /privateMarketRuntimeGrants|probePrivateMarketDatabase|private-market-grants/);
  }
});
test("reviewed metadata passes without reading accounting, provider or owner content", async () => {
  const f = fixture(); assert.deepEqual(await f.probe(), { state: "ready", reason: "private_market_metadata_ready" });
  assert.equal(f.calls.length, 5);
  assert.ok(f.calls.every(({ sql }) => sql.startsWith("SELECT")));
  assert.ok(f.calls.every(({ sql }) => !/FROM (?:public\.)?(?:provider_request_reservations|provider_runtime_status|private_owner_sessions|user_portfolios)\b/.test(sql)));
  assert.match(f.calls[2].sql, /has_any_column_privilege\(current_user,c.oid,'UPDATE'\)/);
  assert.match(f.calls[2].sql, /aclexplode\(a.attacl\)/); assert.match(f.calls[2].sql, /a.is_grantable/);
  assert.match(f.calls[2].sql, /NOT c.relrowsecurity AND NOT c.relforcerowsecurity/);
  assert.match(f.calls[2].sql, /FROM pg_policy/); assert.match(f.calls[2].sql, /FROM pg_rewrite/);
});
test("invalid schema and migration expectations cause no metadata I/O", async () => {
  for (const invalid of ["", "other", "public;drop", "asha_market_readiness_bad", "pg_catalog"]) { const f = fixture(); assert.equal((await probePrivateMarketDatabase(f.database, migrations, invalid)).state, "blocked"); assert.equal(f.calls.length, 0); }
  for (const expected of [null, [], migrations.slice(0, 13), [...migrations, migrations[0]], migrations.map((row, index) => index === 0 ? { ...row, checksum: "bad" } : row), migrations.filter(row => row.id !== "0010_provider_quota_ledger.sql")]) { const f = fixture(); assert.equal((await probePrivateMarketDatabase(f.database, expected, schema)).state, "blocked"); assert.equal(f.calls.length, 0); }
});
test("journal drift and unsafe role fail before table access", async () => {
  const f = fixture(); f.data.journal[0].checksum = "f".repeat(64); assert.equal((await f.probe()).reason, "private_market_migration_mismatch"); assert.equal(f.calls.length, 1);
  for (const role of [[], [{ safe: false }], [{ safe: null }], [{ safe: true }, { safe: true }]]) { const f = fixture(); f.data.role = role; assert.equal((await f.probe()).reason, "private_market_role_unsafe"); assert.equal(f.calls.length, 2); }
});
test("unsafe grants/RLS and altered column type/nullability/default/order fail closed", async () => {
  for (const mutate of [rows => rows.pop(), rows => { rows[0].safe = false; }, rows => { rows[1].safe = false; }]) { const f = fixture(); mutate(f.data.relations); assert.equal((await f.probe()).reason, "private_market_tables_or_privileges_unsafe"); }
  for (const mutate of [columns => columns.pop(), columns => columns.reverse(), columns => { columns[0].type = "integer"; }, columns => { columns[0].required = false; }, columns => { columns[4].default = "now()"; }]) { const f = fixture(); mutate(f.data.relations[0].columns); assert.equal((await f.probe()).reason, "private_market_shape_mismatch"); }
});
test("checks/keys/FK and nondeferrable validated semantics are exact", async () => {
  for (const mutate of [rows => rows.pop(), rows => rows.push(rows[0]), rows => { rows[0].expression = "true"; }, rows => { rows[0].validated = false; }, rows => { rows[0].deferrable = true; }, rows => { rows.at(-1).target_schema = "other"; }, rows => { rows.at(-1).delete_action = "c"; }, rows => { rows.at(-1).target_columns = ["provider_id"]; }, rows => { rows.find(row => row.type === "p").columns = ["request_hash"]; }]) { const f = fixture(); mutate(f.data.constraints); assert.equal((await f.probe()).reason, "private_market_constraints_changed"); }
});
test("missing/extra/disabled/conditional/instead trigger or changed mutation function is blocked", async () => {
  for (const mutate of [rows => rows.pop(), rows => rows.push({ ...rows[0], name: "extra" }), rows => { rows[0].enabled = "D"; }, rows => { rows[0].type = 25; }, rows => { rows[0].condition = false; }, rows => { rows[0].arguments = 1; }, rows => { rows[0].safe_function = false; }, rows => { rows[0].source = "BEGIN RETURN NEW; END;"; }, rows => { rows[0].source = rows[0].source.replace("immutable data", "immutable  data"); }]) { const f = fixture(); mutate(f.data.triggers); assert.equal((await f.probe()).reason, "private_market_integrity_trigger_changed"); }
  const f = fixture(); f.data.triggers[0].enabled = "A"; assert.equal((await f.probe()).state, "ready");
});
test("all metadata exceptions are sanitized, and no failure claims provider activation", async () => {
  const result = await probePrivateMarketDatabase({ async query() { throw Error("RAW_SECRET synthetic-db-password"); } }, migrations);
  assert.deepEqual(result, { state: "blocked", reason: "private_market_probe_failed" }); assert.doesNotMatch(JSON.stringify(result), /RAW_SECRET|password|enabled|authorityReady/);
});
