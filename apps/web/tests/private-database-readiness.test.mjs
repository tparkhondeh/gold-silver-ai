import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readMigrations } from "../db/migrations.ts";
import * as schema from "../db/schema.ts";
import { probePrivatePortfolioDatabase } from "../auth/private-database-readiness.ts";

const migrations = (await readMigrations()).map(({ id, checksum }) => ({ id, checksum }));
const models = [schema.privateOwnerLoginTransactions, schema.privateOwnerSessions, schema.userPortfolios, schema.portfolioHoldings, schema.portfolioPreferences];
const expectedPolicies = {
  private_owner_login_transactions: ["private_owner_login_binding", "(binding_hash = current_setting('asha.identity_binding'::text, true))"],
  private_owner_sessions: ["private_owner_session_binding", "(binding_hash = current_setting('asha.identity_binding'::text, true))"],
  user_portfolios: ["user_portfolios_subject_isolation", "(subject_id = current_setting('asha.subject_id'::text, true))"],
  portfolio_holdings: ["portfolio_holdings_subject_isolation", "(EXISTS ( SELECT 1 FROM user_portfolios p WHERE ((p.id = portfolio_holdings.portfolio_id) AND (p.subject_id = current_setting('asha.subject_id'::text, true)))))"],
  portfolio_preferences: ["portfolio_preferences_subject_isolation", "(EXISTS ( SELECT 1 FROM user_portfolios p WHERE ((p.id = portfolio_preferences.portfolio_id) AND (p.subject_id = current_setting('asha.subject_id'::text, true)))))"],
};
function fixture() {
  const data = {
    journal: structuredClone(migrations), role: [{ safe: true }],
    tables: models.map(table => { const config = getTableConfig(table); return { name: config.name, enabled: true, forced: true, safe: true, columns: config.columns.map(column => ({ name: column.name, type: column.getSQLType().replaceAll(", ", ","), required: column.notNull })) }; }).sort((a, b) => a.name.localeCompare(b.name)),
    policies: Object.entries(expectedPolicies).map(([table_name, [name, expression]]) => ({ table_name, name, command: "*", permissive: true, roles: [0], using: expression, check: expression })).sort((a, b) => a.table_name.localeCompare(b.table_name)),
  };
  const calls = [];
  const database = { async query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes(".asha_schema_migrations")) return { rows: structuredClone(data.journal) };
    if (sql.includes("FROM pg_roles")) return { rows: structuredClone(data.role) };
    if (sql.includes("FROM pg_policy")) return { rows: structuredClone(data.policies) };
    if (sql.includes("FROM pg_class")) return { rows: structuredClone(data.tables) };
    assert.fail("Unexpected probe query");
  } };
  return { data, calls, database };
}

test("five-table schema mirror and exact migration/policy metadata satisfy private readiness with no user-row reads", async () => {
  const f = fixture(); assert.deepEqual(await probePrivatePortfolioDatabase(f.database, migrations), { state: "ready", reason: "private_identity_and_portfolio_ready" });
  assert.equal(f.calls.length, 4); assert.match(f.calls[0].sql, /FROM "public"\.asha_schema_migrations/);
  assert.ok(f.calls.every(call => /^SELECT\b/.test(call.sql)));
  assert.ok(f.calls.every(call => !/FROM (?:private_owner_sessions|private_owner_login_transactions|user_portfolios|portfolio_holdings|portfolio_preferences)\b/.test(call.sql)));
  // PostgreSQL comma privilege lists mean ANY privilege, not all required CRUD.
  for (const right of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.ok(f.calls[2].sql.includes(`has_table_privilege(current_user,c.oid,'${right}')`));
  assert.match(f.calls[2].sql, /NOT has_table_privilege\(current_user,c.oid,'TRUNCATE,REFERENCES,TRIGGER'\)/);
});

test("private runtime rejects every other-role membership, including transitive SET ROLE escalation", async () => {
  const f = fixture();
  // Direct role flags alone do not exclude SET ROLE to another privileged role.
  // Private deployment needs no role memberships; MEMBER covers indirect grants.
  f.data.role = [{ safe: false }];
  assert.equal((await probePrivatePortfolioDatabase(f.database, migrations)).reason, "private_database_role_unsafe");
  assert.match(f.calls[1].sql, /NOT EXISTS \(SELECT 1 FROM pg_roles other_role/);
  assert.match(f.calls[1].sql, /other_role\.oid <> runtime_role\.oid AND pg_has_role\(current_user, other_role\.oid, 'MEMBER'\)/);
  assert.equal(f.calls.length, 2);
});

test("only public or a validated disposable identity schema is queried, with no public fallback", async () => {
  const isolated = "asha_identity_test_0123456789abcdef";
  for (const name of [isolated, `${isolated}_restored`]) { const f = fixture(); assert.equal((await probePrivatePortfolioDatabase(f.database, migrations, name)).state, "ready"); assert.ok(f.calls[0].sql.includes(`"${name}"`)); assert.equal(f.calls[1].parameters[0], name); }
  for (const name of ["", "other_schema", "public;DROP", "asha_identity_test_1234", 'public"', "pg_catalog"]) { const f = fixture(); assert.equal((await probePrivatePortfolioDatabase(f.database, migrations, name)).reason, "private_schema_not_allowed"); assert.equal(f.calls.length, 0); }
});

test("invalid or incomplete expected migrations cannot trigger even metadata I/O", async () => {
  for (const expected of [null, [], migrations.slice(0, 12), [...migrations, migrations[0]], migrations.map((row, index) => index === 0 ? null : row), migrations.map((row, index) => index === 0 ? { ...row, checksum: "bad" } : row)]) {
    const f = fixture(); assert.equal((await probePrivatePortfolioDatabase(f.database, expected)).reason, "private_migration_expectation_invalid"); assert.equal(f.calls.length, 0);
  }
});

test("missing, drifted or extra applied migrations block before privilege/schema checks", async () => {
  for (const mutate of [rows => rows.pop(), rows => { rows[0].checksum = "f".repeat(64); }, rows => rows.push({ id: "9999_unknown.sql", checksum: "f".repeat(64) })]) {
    const f = fixture(); mutate(f.data.journal); assert.equal((await probePrivatePortfolioDatabase(f.database, migrations)).reason, "private_migration_mismatch"); assert.equal(f.calls.length, 1);
  }
});

test("unsafe role, missing table, nonforced RLS or insufficient/dangerous grants fail closed", async () => {
  for (const role of [[], [{ safe: false }], [{ safe: null }], [{ safe: true }, { safe: true }]]) { const f = fixture(); f.data.role = role; assert.equal((await probePrivatePortfolioDatabase(f.database, migrations)).reason, "private_database_role_unsafe"); }
  for (let index = 0; index < models.length; index++) for (const key of ["enabled", "forced", "safe"]) {
    const f = fixture(); f.data.tables[index][key] = false; assert.equal((await probePrivatePortfolioDatabase(f.database, migrations)).reason, "private_tables_or_privileges_unsafe");
  }
  const missing = fixture(); missing.data.tables.pop(); assert.equal((await probePrivatePortfolioDatabase(missing.database, migrations)).reason, "private_tables_or_privileges_unsafe");
});

test("exact column names/types/nullability reject absent, duplicate, added or changed schema", async () => {
  for (const mutate of [columns => columns.pop(), columns => columns.push({ name: "debug", type: "text", required: false }), columns => { columns[0].type = "integer"; }, columns => { columns[0].required = false; }, columns => { columns[1].name = columns[0].name; }]) {
    const f = fixture(); mutate(f.data.tables[0].columns); assert.equal((await probePrivatePortfolioDatabase(f.database, migrations)).reason, "private_schema_shape_mismatch");
  }
});

test("policy name/command/roles/permissiveness and both expressions must match exactly", async () => {
  for (const mutate of [row => { row.name += "_changed"; }, row => { row.command = "r"; }, row => { row.permissive = false; }, row => { row.roles = [1]; }, row => { row.using = "true"; }, row => { row.check = "true"; }, row => { row.using = row.using.replace("asha.subject_id", "asha. subject_id"); }]) {
    const f = fixture(); mutate(f.data.policies.find(row => row.table_name === "user_portfolios")); assert.equal((await probePrivatePortfolioDatabase(f.database, migrations)).reason, "private_policies_missing_or_changed");
  }
  for (const mutate of [rows => rows.pop(), rows => rows.push({ ...rows[0], name: "permit_all" })]) { const f = fixture(); mutate(f.data.policies); assert.equal((await probePrivatePortfolioDatabase(f.database, migrations)).reason, "private_policies_missing_or_changed"); }
  const formatted = fixture(); formatted.data.policies.forEach(row => { row.using = `\n ${row.using}\n`; row.check = `\t${row.check}\t`; }); assert.equal((await probePrivatePortfolioDatabase(formatted.database, migrations)).state, "ready");
});

test("metadata exceptions never disclose raw connection, account or schema details", async () => {
  const result = await probePrivatePortfolioDatabase({ async query() { throw Error("RAW_SECRET postgresql://private-owner@private-host/private-db"); } }, migrations);
  assert.deepEqual(result, { state: "blocked", reason: "private_database_probe_failed" }); assert.doesNotMatch(JSON.stringify(result), /RAW_SECRET|postgres|private-owner/);
});
