import type { SqlExecutor } from "../data/postgres-observation-repository.ts";
import type { Migration } from "../db/migrations.ts";

const reservation = "provider_request_reservations", outcome = "provider_runtime_status";
const tables = [reservation, outcome];
type Column = { name: string; type: string; required: boolean; default: string | null };
const column = (name: string, type = "text", required = true, value: string | null = null): Column => ({ name, type, required, default: value });
const shapes: Record<string, Column[]> = {
  [reservation]: [column("id"), column("provider_id"), column("endpoint"), column("request_hash"), column("reserved_at", "timestamp with time zone", true, "clock_timestamp()"), column("window_days", "smallint"), column("limit_snapshot", "smallint"), column("created_at", "timestamp with time zone", true, "clock_timestamp()")],
  [outcome]: [column("provider_id"), column("last_reservation_id"), column("last_outcome"), column("quote_count", "smallint", false), column("duration_ms", "integer"), column("completed_at", "timestamp with time zone", true, "clock_timestamp()")],
};
// Canonical PostgreSQL expressions from applied 0010/0011; whitespace only may vary.
const checks: Record<string, string[]> = {
  [reservation]: ["(id ~ '^navasan_request_[0-9a-f-]{36}$'::text)", "(provider_id = 'navasan'::text)", "(endpoint = ANY (ARRAY['latest'::text, 'dailyCurrency'::text, 'ohlcSearch'::text]))", "((length(request_hash) = 64) AND (request_hash ~ '^[a-f0-9]+$'::text))", "(window_days = 31)", "(limit_snapshot = 115)"],
  [outcome]: ["(provider_id = 'navasan'::text)", "(last_outcome = ANY (ARRAY['success'::text, 'failure'::text]))", "((duration_ms >= 0) AND (duration_ms <= 120000))", "(((last_outcome = 'success'::text) AND ((quote_count >= 1) AND (quote_count <= 64))) OR ((last_outcome = 'failure'::text) AND (quote_count IS NULL)))"],
};
const compact = (value: string) => value.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[^\s]/g)?.join("") ?? "";
const blocked = (reason: string) => ({ state: "blocked" as const, reason });
type Relation = { name: string; safe: boolean; columns: Column[] };
type Constraint = { table_name: string; type: string; validated: boolean; deferred: boolean; deferrable: boolean; expression: string | null; columns: string[]; target_schema: string | null; target_table: string | null; target_columns: string[] | null; update_action: string; delete_action: string; match: string };

/** Optional metadata capability only, never provider activation or quota cutover proof.
 * No environment, credentials, quota contents, provider or portfolio rows are read.
 * The normal auth-only startup does not call this probe or change grants.
 */
export async function probePrivateMarketDatabase(database: SqlExecutor, expectedMigrations: readonly Pick<Migration, "id" | "checksum">[], schema = "public") {
  if (schema !== "public" && !/^asha_market_readiness_[a-f0-9]{16}$/.test(schema)) return blocked("private_market_schema_not_allowed");
  if (!Array.isArray(expectedMigrations) || expectedMigrations.length < 14 || expectedMigrations.length > 1000
    || expectedMigrations.some(row => !row || !/^\d{4}_[a-z0-9_]+\.sql$/.test(row.id) || !/^[a-f0-9]{64}$/.test(row.checksum))
    || !["0010_provider_quota_ledger.sql", "0011_provider_runtime_status.sql", "0014_owner_passkeys.sql"].every(id => expectedMigrations.some(row => row.id === id))
    || new Set(expectedMigrations.map(row => row.id)).size !== expectedMigrations.length) return blocked("private_market_migration_expectation_invalid");
  const expected = expectedMigrations.map(({ id, checksum }) => ({ id, checksum })).sort((a, b) => a.id.localeCompare(b.id));
  try {
    const journal = await database.query(`SELECT id, checksum FROM "${schema}".asha_schema_migrations ORDER BY id`);
    if (JSON.stringify(journal.rows) !== JSON.stringify(expected)) return blocked("private_market_migration_mismatch");
    const role = await database.query<{ safe: boolean }>(`SELECT
      NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
      AND NOT EXISTS (SELECT 1 FROM pg_roles other_role WHERE other_role.oid <> runtime_role.oid AND pg_has_role(current_user,other_role.oid,'MEMBER'))
      AND has_schema_privilege(current_user,$1,'USAGE') AND NOT has_schema_privilege(current_user,$1,'CREATE')
      AND NOT has_database_privilege(current_user,current_database(),'CREATE') AS safe
      FROM pg_roles runtime_role WHERE rolname=current_user`, [schema]);
    if (role.rows?.length !== 1 || role.rows[0].safe !== true) return blocked("private_market_role_unsafe");
    const relations = await database.query<Relation>(`SELECT c.relname AS name,
      c.relkind='r' AND c.relpersistence='p' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
      AND NOT pg_has_role(current_user,c.relowner,'MEMBER')
      AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_rewrite r WHERE r.ev_class=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND (a.attidentity<>'' OR a.attgenerated<>''))
      AND has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT')
      AND (CASE WHEN c.relname='provider_runtime_status' THEN has_table_privilege(current_user,c.oid,'UPDATE')
        ELSE NOT has_any_column_privilege(current_user,c.oid,'UPDATE') END)
      AND NOT has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_any_column_privilege(current_user,c.oid,'REFERENCES')
      AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
        WHERE a.grantee<>c.relowner AND (a.grantee<>(SELECT oid FROM pg_roles WHERE rolname=current_user) OR a.is_grantable
          OR a.privilege_type NOT IN ('SELECT','INSERT','UPDATE') OR (c.relname='provider_request_reservations' AND a.privilege_type='UPDATE')))
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND x.grantee<>c.relowner
          AND (x.grantee<>(SELECT oid FROM pg_roles WHERE rolname=current_user) OR x.is_grantable
            OR x.privilege_type NOT IN ('SELECT','INSERT','UPDATE') OR (c.relname='provider_request_reservations' AND x.privilege_type='UPDATE')))
      AS safe,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,
        'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname`, [schema, tables]);
    if (relations.rows?.length !== 2 || relations.rows.some((row, index) => row.name !== tables[index] || row.safe !== true)) return blocked("private_market_tables_or_privileges_unsafe");
    for (const row of relations.rows) {
      if (!Array.isArray(row.columns) || row.columns.length !== shapes[row.name].length || row.columns.some((value, index) => {
        const expected = shapes[row.name][index];
        return value.name !== expected.name || value.type !== expected.type || value.required !== expected.required || value.default !== expected.default;
      })) return blocked("private_market_shape_mismatch");
    }
    const constraints = await database.query<Constraint>(`SELECT c.relname AS table_name,k.contype AS type,k.convalidated AS validated,
      k.condeferred AS deferred,k.condeferrable AS deferrable,pg_get_expr(k.conbin,k.conrelid) AS expression,
      ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(id,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.id ORDER BY x.ord) AS columns,
      fn.nspname AS target_schema,f.relname AS target_table,
      CASE WHEN k.contype='f' THEN ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(id,ord) JOIN pg_attribute a ON a.attrelid=f.oid AND a.attnum=x.id ORDER BY x.ord) ELSE NULL END AS target_columns,
      k.confupdtype AS update_action,k.confdeltype AS delete_action,k.confmatchtype AS match
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_class f ON f.oid=k.confrelid LEFT JOIN pg_namespace fn ON fn.oid=f.relnamespace
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[])`, [schema, tables]);
    if (constraints.rows?.length !== 14 || constraints.rows.some(row => !tables.includes(row.table_name) || row.validated !== true || row.deferred !== false || row.deferrable !== false)) return blocked("private_market_constraints_changed");
    for (const table of tables) {
      const rows = constraints.rows.filter(row => row.table_name === table), expectedChecks = checks[table].map(compact).sort();
      const actualChecks = rows.filter(row => row.type === "c").map(row => compact(row.expression ?? "")).sort();
      const structural = rows.filter(row => row.type !== "c");
      if (JSON.stringify(actualChecks) !== JSON.stringify(expectedChecks) || rows.length !== expectedChecks.length + (table === reservation ? 1 : 3)
        || structural.filter(row => row.type === "p" && JSON.stringify(row.columns) === JSON.stringify([table === reservation ? "id" : "provider_id"])).length !== 1
        || (table === outcome && (structural.filter(row => row.type === "u" && JSON.stringify(row.columns) === '["last_reservation_id"]').length !== 1
          || structural.filter(row => row.type === "f" && JSON.stringify(row.columns) === '["last_reservation_id"]' && row.target_schema === schema
            && row.target_table === reservation && JSON.stringify(row.target_columns) === '["id"]' && row.update_action === "a" && row.delete_action === "a" && row.match === "s").length !== 1))) return blocked("private_market_constraints_changed");
    }
    const triggers = await database.query<{ name: string; table_name: string; type: number; enabled: string; arguments: number; condition: boolean; safe_function: boolean; source: string }>(`SELECT t.tgname AS name,c.relname AS table_name,t.tgtype AS type,t.tgenabled AS enabled,t.tgnargs AS arguments,t.tgqual IS NULL AS condition,
      pn.nspname=$1 AND p.proname='reject_immutable_data_mutation' AND p.prorettype='trigger'::regtype AND p.pronargs=0
        AND p.prokind='f' AND NOT p.prosecdef AND p.proconfig IS NULL AND l.lanname='plpgsql' AND p.proowner=c.relowner AS safe_function,p.prosrc AS source
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND NOT t.tgisinternal ORDER BY t.tgname`, [schema, tables]);
    const triggerTypes: Record<string, number> = { provider_request_reservations_are_immutable: 27, provider_request_reservations_cannot_be_truncated: 34 };
    if (triggers.rows?.length !== 2 || new Set(triggers.rows.map(row => row.name)).size !== 2 || triggers.rows.some(row => row.table_name !== reservation
      || row.type !== triggerTypes[row.name] || !["O", "A"].includes(row.enabled) || row.arguments !== 0 || row.condition !== true || row.safe_function !== true
      || compact(row.source) !== compact("BEGIN RAISE EXCEPTION 'immutable data records cannot be updated or deleted'; END;"))) return blocked("private_market_integrity_trigger_changed");
    return { state: "ready" as const, reason: "private_market_metadata_ready" };
  } catch { return blocked("private_market_probe_failed"); }
}
