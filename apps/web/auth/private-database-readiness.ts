import type { SqlExecutor } from "../data/postgres-observation-repository.ts";
import type { Migration } from "../db/migrations.ts";

type Column = readonly [type: string, required: boolean];
const text = ["text", true] as const, time = ["timestamp with time zone", true] as const;
const columns: Readonly<Record<string, Readonly<Record<string, Column>>>> = {
  private_owner_login_transactions: { hash: text, binding_hash: text, origin: text, issuer: text, subject: text, state: text, nonce: text, pkce_verifier: text, created_at: time, expires_at: time, claimed: ["boolean", true] },
  private_owner_sessions: { hash: text, binding_hash: text, login_transaction_hash: text, origin: text, issuer: text, subject: text, portfolio_subject: text, created_at: time, expires_at: time },
  user_portfolios: { id: text, schema_version: ["smallint", true], subject_id: text, version: ["integer", true], created_at: time, updated_at: time, purchase_book: ["jsonb", false] },
  portfolio_holdings: { id: text, portfolio_id: text, asset_name: text, amount: ["numeric(38,12)", true], unit: text, cost_toman: ["numeric(38,2)", false], purchase_date: ["text", false], note: text, created_at: time, updated_at: time },
  portfolio_preferences: { portfolio_id: text, liquidity_reserve_percent: ["numeric(5,2)", false], max_single_asset_percent: ["numeric(5,2)", false], max_acceptable_drawdown_percent: ["numeric(5,2)", false], short_term_months: ["smallint", false], long_term_years: ["smallint", false], analysis_horizon: text, decision_horizon: text, updated_at: time },
};
const tables = Object.keys(columns).sort();
const policies: Readonly<Record<string, readonly [name: string, expression: string]>> = {
  private_owner_login_transactions: ["private_owner_login_binding", "(binding_hash = current_setting('asha.identity_binding'::text, true))"],
  private_owner_sessions: ["private_owner_session_binding", "(binding_hash = current_setting('asha.identity_binding'::text, true))"],
  user_portfolios: ["user_portfolios_subject_isolation", "(subject_id = current_setting('asha.subject_id'::text, true))"],
  portfolio_holdings: ["portfolio_holdings_subject_isolation", "(EXISTS ( SELECT 1 FROM user_portfolios p WHERE ((p.id = portfolio_holdings.portfolio_id) AND (p.subject_id = current_setting('asha.subject_id'::text, true)))))"],
  portfolio_preferences: ["portfolio_preferences_subject_isolation", "(EXISTS ( SELECT 1 FROM user_portfolios p WHERE ((p.id = portfolio_preferences.portfolio_id) AND (p.subject_id = current_setting('asha.subject_id'::text, true)))))"],
};
// Ignore formatting only, not literal text, parentheses, casts or SQL operators.
function compactSql(value: unknown) {
  return typeof value === "string" ? value.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[^\s]/g)?.join("") ?? "" : "";
}
const blocked = (reason: string) => ({ state: "blocked" as const, reason });

/** Read-only metadata probe on an explicitly supplied connection. No environment,
 * connection fallback, user rows, credentials, network providers or migrations.
 * The limited schema override exists for disposable identity integration tests. */
export async function probePrivatePortfolioDatabase(database: SqlExecutor, expectedMigrations: readonly Pick<Migration, "id" | "checksum">[], schema = "public") {
  if (schema !== "public" && !/^asha_identity_test_[a-f0-9]{16}(?:_restored)?$/.test(schema)) return blocked("private_schema_not_allowed");
  if (!Array.isArray(expectedMigrations) || expectedMigrations.length < 13 || expectedMigrations.length > 1000
    || expectedMigrations.some(row => !row || !/^\d{4}_[a-z0-9_]+\.sql$/.test(row.id) || !/^[a-f0-9]{64}$/.test(row.checksum))
    || !expectedMigrations.some(row => row.id === "0013_private_owner_identity.sql")
    || new Set(expectedMigrations.map(row => row.id)).size !== expectedMigrations.length) return blocked("private_migration_expectation_invalid");
  try {
    // schema is validated above, including the entire fixed test-only pattern.
    const journal = await database.query<{ id: string; checksum: string }>(`SELECT id, checksum FROM "${schema}".asha_schema_migrations ORDER BY id`);
    const expected = [...expectedMigrations].map(({ id, checksum }) => ({ id, checksum })).sort((a, b) => a.id.localeCompare(b.id));
    if (JSON.stringify(journal.rows) !== JSON.stringify(expected)) return blocked("private_migration_mismatch");
    const roles = await database.query<{ safe: boolean }>(`SELECT
      NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
      AND NOT EXISTS (SELECT 1 FROM pg_roles other_role
        WHERE other_role.oid <> runtime_role.oid AND pg_has_role(current_user, other_role.oid, 'MEMBER'))
      AND NOT has_schema_privilege(current_user, $1, 'CREATE')
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE') AS safe
      FROM pg_roles runtime_role WHERE rolname=current_user`, [schema]);
    if (roles.rows?.length !== 1 || roles.rows[0].safe !== true) return blocked("private_database_role_unsafe");
    const relations = await database.query<{ name: string; enabled: boolean; forced: boolean; safe: boolean; columns: Array<{ name: string; type: string; required: boolean }> }>(`SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
      has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT')
      AND has_table_privilege(current_user,c.oid,'UPDATE') AND has_table_privilege(current_user,c.oid,'DELETE')
      AND NOT has_table_privilege(current_user,c.oid,'TRUNCATE,REFERENCES,TRIGGER')
      AND NOT pg_has_role(current_user,c.relowner,'MEMBER') AS safe,
      (SELECT jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid,a.atttypmod), 'required', a.attnotnull) ORDER BY a.attnum)
       FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relkind='r' AND c.relname=ANY($2::text[]) ORDER BY c.relname`, [schema, tables]);
    if (!relations.rows || relations.rows.length !== tables.length || relations.rows.some((row, index) => row.name !== tables[index] || row.enabled !== true || row.forced !== true || row.safe !== true)) return blocked("private_tables_or_privileges_unsafe");
    for (const row of relations.rows) {
      const shape = columns[row.name];
      if (!Array.isArray(row.columns) || row.columns.length !== Object.keys(shape).length || new Set(row.columns.map(column => column.name)).size !== row.columns.length
        || row.columns.some(column => !Object.hasOwn(shape, column.name) || shape[column.name][0] !== column.type || shape[column.name][1] !== column.required)) return blocked("private_schema_shape_mismatch");
    }
    const security = await database.query<{ table_name: string; name: string; command: string; permissive: boolean; roles: number[]; using: string; check: string }>(`SELECT c.relname AS table_name, p.polname AS name, p.polcmd AS command, p.polpermissive AS permissive,
      p.polroles::oid[] AS roles, pg_get_expr(p.polqual,p.polrelid) AS "using", pg_get_expr(p.polwithcheck,p.polrelid) AS "check"
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname,p.polname`, [schema, tables]);
    if (!security.rows || security.rows.length !== tables.length || security.rows.some((row, index) => {
      const expected = policies[row.table_name];
      return row.table_name !== tables[index] || !expected || row.name !== expected[0] || row.command !== "*" || row.permissive !== true
        || !Array.isArray(row.roles) || row.roles.length !== 1 || row.roles[0] !== 0
        || compactSql(row.using) !== compactSql(expected[1]) || compactSql(row.check) !== compactSql(expected[1]);
    })) return blocked("private_policies_missing_or_changed");
    return { state: "ready" as const, reason: "private_identity_and_portfolio_ready" };
  } catch { return blocked("private_database_probe_failed"); }
}
