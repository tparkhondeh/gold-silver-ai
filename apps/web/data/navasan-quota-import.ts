import type { SqlExecutor, TransactionRunner } from "./postgres-observation-repository.ts";
import {
  createNavasanQuotaHandoffManifest, decodeNavasanQuotaHandoff, inspectNavasanQuotaHandoff, validateNavasanQuotaHandoffReferences,
  NAVASAN_QUOTA_HANDOFF_MAX_ROWS, NAVASAN_QUOTA_HANDOFF_VERSION,
  type NavasanQuotaHandoffData, type NavasanQuotaHandoffManifest, type NavasanQuotaHandoffReservation, type NavasanQuotaHandoffReferences,
} from "./navasan-quota-handoff.ts";

type CaptureReferences = Omit<NavasanQuotaHandoffData, "version" | "provider" | "plan" | "capturedAt" | "latestReservationId" | "reservations">;
type Scope = { schema: string; runtimeRole: string };
const sourceScope: Scope = { schema: "public", runtimeRole: "asha_runtime" };
const targetScope: Scope = { schema: "public", runtimeRole: "asha_private_runtime" };
const failure = () => Error("Navasan quota accounting transfer failed; details withheld");
const utcFormat = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
const reservationTable = "provider_request_reservations";

function table(scope: Scope, name = reservationTable) {
  // Identifiers are operator-selected database scope, never provider/request input.
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(scope.schema) || !/^[a-z][a-z0-9_]{0,62}$/.test(scope.runtimeRole)) throw failure();
  return `"${scope.schema}"."${name}"`;
}

async function databaseClock(database: SqlExecutor) {
  const result = await database.query<{ at: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', ${utcFormat}) AS at`);
  if (result.rows?.length !== 1 || typeof result.rows[0].at !== "string") throw failure();
  return result.rows[0].at;
}

async function assertDisabled(database: SqlExecutor, scope: Scope) {
  const relation = table(scope);
  const result = await database.query<{ safe: boolean }>(`SELECT
    NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND NOT EXISTS (SELECT 1 FROM pg_roles other_role WHERE other_role.oid<>r.oid AND pg_has_role(r.oid,other_role.oid,'MEMBER'))
    AND NOT pg_has_role(r.oid,c.relowner,'MEMBER') AND NOT pg_has_role(r.oid,n.nspowner,'MEMBER') AND NOT pg_has_role(r.oid,d.datdba,'MEMBER')
    AND NOT has_schema_privilege(r.oid,n.oid,'CREATE') AND NOT has_database_privilege(r.oid,d.oid,'CREATE')
    AND NOT has_table_privilege(r.oid,c.oid,'INSERT') AND NOT has_any_column_privilege(r.oid,c.oid,'INSERT')
    AND NOT has_table_privilege(r.oid,c.oid,'UPDATE,DELETE,TRUNCATE,TRIGGER') AND NOT has_any_column_privilege(r.oid,c.oid,'UPDATE')
    AND c.relkind='r' AND c.relpersistence='p' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) AS safe
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_database d
    WHERE r.rolname=$1 AND c.oid=to_regclass($2) AND d.datname=current_database()`, [scope.runtimeRole, relation]);
  if (result.rows?.length !== 1 || result.rows[0].safe !== true) throw failure();
}

async function assertProviderLock(database: SqlExecutor) {
  const result = await database.query<{ held: boolean }>(`SELECT EXISTS (
    SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()
      AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND classid=174228531 AND objid=10 AND objsubid=2 AND granted AND mode='ExclusiveLock'
  ) AS held`);
  if (result.rows?.length !== 1 || result.rows[0].held !== true) throw failure();
}

async function rows(database: SqlExecutor, scope: Scope, capturedAt?: string) {
  const relation = table(scope);
  const result = await database.query<NavasanQuotaHandoffReservation & { provider: string }>(`SELECT id, endpoint, request_hash AS "requestHash",
    to_char(reserved_at AT TIME ZONE 'UTC', ${utcFormat}) AS "reservedAt",
    to_char(created_at AT TIME ZONE 'UTC', ${utcFormat}) AS "createdAt",
    window_days AS "windowDays", limit_snapshot AS "limitSnapshot", provider_id AS provider
    FROM ${relation}
    ${capturedAt === undefined ? "" : `WHERE reserved_at >= $1::timestamptz - interval '31 days'
      OR id=(SELECT id FROM ${relation} WHERE endpoint='latest' ORDER BY reserved_at DESC,id DESC LIMIT 1)`}
    ORDER BY reserved_at,id LIMIT ${NAVASAN_QUOTA_HANDOFF_MAX_ROWS + 1}`, capturedAt === undefined ? [] : [capturedAt]);
  if (!result.rows || result.rows.length > NAVASAN_QUOTA_HANDOFF_MAX_ROWS) throw failure();
  return result.rows.map(({ provider, ...row }) => { if (provider !== "navasan") throw failure(); return row; });
}

function accounting(manifest: NavasanQuotaHandoffManifest, observedAt: string) {
  const result = inspectNavasanQuotaHandoff(manifest.data, observedAt);
  return Object.freeze({ asOf: manifest.data.capturedAt, used: result.declaredUsed, remaining: result.declaredRemaining,
    latestNextEligibleAt: result.declaredLatestNextEligibleAt, cooldownSeconds: result.declaredCooldownSeconds });
}

/** Execute inside the caller's source transaction AFTER taking the provider lock.
 * This checks database admission is disabled; it does not stop/drain processes or
 * establish account completeness, key-transfer approval or the physical DB identity.
 * The caller must keep the source fenced after commit and protect the returned data.
 * No outcome/price/key is copied; even unfinished reservations remain counted. */
export async function exportCapturedRows(database: SqlExecutor, references: CaptureReferences, scope: Scope = sourceScope) {
  try {
    scope = Object.freeze({ ...scope });
    await assertProviderLock(database);
    await database.query(`LOCK TABLE ${table(scope)} IN SHARE MODE`);
    await assertDisabled(database, scope);
    const capturedAt = await databaseClock(database), reservations = await rows(database, scope, capturedAt);
    const latest = reservations.filter(row => row.endpoint === "latest").at(-1);
    const manifest = createNavasanQuotaHandoffManifest({ ...references, version: NAVASAN_QUOTA_HANDOFF_VERSION,
      provider: "navasan", plan: "free", capturedAt, latestReservationId: latest?.id ?? null, reservations }, capturedAt);
    return Object.freeze({ manifest, accounting: accounting(manifest, capturedAt) });
  } catch { throw failure(); }
}

/** Append-only administrative import into an inactive target. Only an empty target
 * or an EXACT prior import is accepted; partial/extra/conflicting state is preserved
 * and rejected. No grant, refund, provider call, runtime attachment or activation
 * certificate is produced. Expected references/digest must come from the trusted
 * operator handoff, independently of the incoming document. Its digest also binds
 * the source ledger and every original row. This checks declared binding only;
 * the caller establishes physical target identity and actual authorization. */
export async function importNavasanQuotaHandoff(runner: TransactionRunner, raw: string, expectedReferences: NavasanQuotaHandoffReferences, scope: Scope = targetScope) {
  try {
    const trusted = validateNavasanQuotaHandoffReferences(expectedReferences);
    scope = Object.freeze({ ...scope });
    return await runner.transaction(async database => {
      await database.query("SELECT pg_advisory_xact_lock(174228531, 10)");
      await database.query(`LOCK TABLE ${table(scope)}, ${table(scope, "provider_runtime_status")} IN SHARE ROW EXCLUSIVE MODE`);
      await assertDisabled(database, scope);
      const observedAt = await databaseClock(database), manifest = decodeNavasanQuotaHandoff(raw, observedAt);
      if (trusted.handoffSha256 !== manifest.sha256 || trusted.quotaScopeRef !== manifest.data.quotaScopeRef
        || trusted.targetLedgerId !== manifest.data.targetLedgerId || trusted.targetOrigin !== manifest.data.targetOrigin
        || trusted.identityBindingHash !== manifest.data.identityBindingHash || trusted.ownerTransferApprovalRef !== manifest.data.ownerTransferApprovalRef) throw failure();
      const outcomes = await database.query(`SELECT 1 FROM ${table(scope, "provider_runtime_status")} LIMIT 1`);
      if (!outcomes.rows || outcomes.rows.length !== 0) throw failure();
      const before = await rows(database, scope), expected = JSON.stringify(manifest.data.reservations);
      const replayed = before.length !== 0;
      if (replayed && JSON.stringify(before) !== expected) throw failure();
      if (!replayed) for (const row of manifest.data.reservations) {
        await database.query(`INSERT INTO ${table(scope)}
          (id,provider_id,endpoint,request_hash,reserved_at,created_at,window_days,limit_snapshot)
          VALUES ($1,'navasan',$2,$3,$4::timestamptz,$5::timestamptz,$6,$7)`,
        [row.id, row.endpoint, row.requestHash, row.reservedAt, row.createdAt, row.windowDays, row.limitSnapshot]);
      }
      if (JSON.stringify(await rows(database, scope)) !== expected) throw failure();
      const expectedAccounting = accounting(manifest, observedAt);
      const actual = await database.query<{ used: number; next: string | null; cooldown: number }>(`SELECT
        (count(*) FILTER (WHERE reserved_at >= $1::timestamptz - interval '31 days'))::integer AS used,
        to_char((max(reserved_at) FILTER (WHERE endpoint='latest') + make_interval(secs=>$2)) AT TIME ZONE 'UTC', ${utcFormat}) AS next,
        GREATEST(0,CEIL(EXTRACT(EPOCH FROM (max(reserved_at) FILTER (WHERE endpoint='latest')
          + make_interval(secs=>$2) - $1::timestamptz)))::integer) AS cooldown
        FROM ${table(scope)}`, [manifest.data.capturedAt, manifest.data.sourceRefreshSeconds]);
      const checked = actual.rows?.[0];
      if (actual.rows?.length !== 1 || !checked || checked.used !== expectedAccounting.used
        || checked.next !== expectedAccounting.latestNextEligibleAt || checked.cooldown !== expectedAccounting.cooldownSeconds) throw failure();
      await assertDisabled(database, scope);
      return Object.freeze({ handoffSha256: manifest.sha256, verifiedAt: observedAt, replayed,
        insertedRows: replayed ? 0 : manifest.data.reservations.length, accounting: expectedAccounting });
    });
  } catch { throw failure(); }
}
