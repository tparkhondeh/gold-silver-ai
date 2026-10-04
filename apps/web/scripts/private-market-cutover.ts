import type { SqlExecutor, TransactionRunner } from "../data/postgres-observation-repository.ts";
import type { Migration } from "../db/migrations.ts";
import { exportCapturedRows, importNavasanQuotaHandoff } from "../data/navasan-quota-import.ts";
import {
  decodeNavasanQuotaHandoff, validateNavasanQuotaHandoffReferences,
  type NavasanQuotaHandoffData, type NavasanQuotaHandoffManifest, type NavasanQuotaHandoffReferences,
} from "../data/navasan-quota-handoff.ts";
import { NAVASAN_DURABLE_CALL_LIMIT, NAVASAN_ROLLING_WINDOW_DAYS } from "../data/navasan-quota-ledger.ts";
import { NAVASAN_MAX_REFRESH_SECONDS } from "../data/navasan-refresh-policy.ts";
import { privateMarketRuntimeGrants } from "./private-market-grants.ts";

export const PRIVATE_MARKET_CUTOVER_VERSION = "asha.private_market_cutover.v1";
export const PRIVATE_MARKET_CUTOVER_MAX_BYTES = 4 * 1024 * 1024 + 16 * 1024;
export type PrivateMarketDatabaseIdentity = Readonly<{
  database: string; address: "127.0.0.1"; port: number; databaseOid: string; role: string;
}>;
type Scope = Readonly<{ schema: string; runtimeRole: string }>;
type MigrationIdentity = Pick<Migration, "id" | "checksum">;
type CaptureReferences = Omit<NavasanQuotaHandoffData, "version" | "provider" | "plan" | "capturedAt" | "latestReservationId" | "reservations">;
export type PrivateMarketSourceCapture = Readonly<{
  sourceDatabase: PrivateMarketDatabaseIdentity;
  sourceFenceRecordedAt: string;
  sourceRetirement: Readonly<{ evidenceRef: string; recordedAt: string }>;
  handoffRaw: string;
}>;
export type PrivateMarketCutoverReceipt = Readonly<PrivateMarketSourceCapture & {
  version: typeof PRIVATE_MARKET_CUTOVER_VERSION;
  expectedReferences: NavasanQuotaHandoffReferences;
  targetDatabase: PrivateMarketDatabaseIdentity;
  targetRuntimeDatabase: PrivateMarketDatabaseIdentity;
  targetAdmissionNotBefore: string;
  targetRefreshSeconds: number;
}>;
const sourceScope: Scope = { schema: "public", runtimeRole: "asha_runtime" };
const targetScope: Scope = { schema: "public", runtimeRole: "asha_private_runtime" };
const format = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
const failure = () => Error("Private market cutover unavailable; details withheld; preserve any committed fence or import");
const identifier = /^[a-z][a-z0-9_]{0,62}$/;

function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => typeof key !== "string" || !names.includes(key))) throw failure();
  for (const key of names) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property?.enumerable || !("value" in property)) throw failure();
  }
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== `${value.slice(0, 23)}Z`) throw failure();
  return value;
}
function identity(value: unknown): PrivateMarketDatabaseIdentity {
  const input = fields(value, ["database", "address", "port", "databaseOid", "role"]);
  if (typeof input.database !== "string" || !identifier.test(input.database) || input.address !== "127.0.0.1"
    || !Number.isSafeInteger(input.port) || Number(input.port) < 1 || Number(input.port) > 65535
    || typeof input.databaseOid !== "string" || !/^[1-9][0-9]{0,9}$/.test(input.databaseOid) || BigInt(input.databaseOid) > 4_294_967_295n
    || typeof input.role !== "string" || !identifier.test(input.role)) throw failure();
  return Object.freeze({ database: input.database, address: input.address, port: input.port as number, databaseOid: input.databaseOid, role: input.role });
}
function scopeValue(value: Scope, kind: "source" | "target"): Scope {
  const input = fields(value, ["schema", "runtimeRole"]);
  const fixed = kind === "source" ? sourceScope : targetScope;
  if (!(input.schema === fixed.schema && input.runtimeRole === fixed.runtimeRole)
    && !(typeof input.schema === "string" && /^asha_market_readiness_[a-f0-9]{16}$/.test(input.schema)
      && typeof input.runtimeRole === "string" && /^asha_cutover_(source|target)_[a-f0-9]{16}$/.test(input.runtimeRole))) throw failure();
  return Object.freeze({ schema: input.schema as string, runtimeRole: input.runtimeRole as string });
}
function profile(value: PrivateMarketDatabaseIdentity, scope: Scope, kind: "source" | "target" | "runtime") {
  if (scope.schema !== "public") {
    if (value.database !== "asha_integration") throw failure();
    return;
  }
  if (kind === "source") {
    if (value.database !== "asha_local" || value.port !== 55432 || !["postgres", "asha_owner"].includes(value.role)) throw failure();
  } else if (value.database !== "asha_private" || value.port !== 15432
    || value.role !== (kind === "target" ? "asha_private_admin" : "asha_private_runtime")) throw failure();
}
function sameDatabase(left: PrivateMarketDatabaseIdentity, right: PrivateMarketDatabaseIdentity) {
  return left.database === right.database && left.address === right.address && left.port === right.port && left.databaseOid === right.databaseOid;
}
async function checkDatabase(database: SqlExecutor, expected: PrivateMarketDatabaseIdentity) {
  const result = await database.query(`SELECT current_database() AS database,host(inet_server_addr()) AS address,
    inet_server_port() AS port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS "databaseOid",current_user AS role`);
  if (result.rows?.length !== 1 || JSON.stringify(identity(result.rows[0])) !== JSON.stringify(expected)) throw failure();
}
async function clock(database: SqlExecutor) {
  const result = await database.query<{ at: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', ${format}) AS at`);
  if (result.rows?.length !== 1) throw failure();
  return timestamp(result.rows[0].at);
}
function migrations(value: readonly MigrationIdentity[]) {
  if (!Array.isArray(value) || value.length < 11 || value.length > 1000) throw failure();
  const result = value.map(row => {
    if (!row || typeof row.id !== "string" || !/^\d{4}_[a-z0-9_]+\.sql$/.test(row.id)
      || typeof row.checksum !== "string" || !/^[a-f0-9]{64}$/.test(row.checksum)) throw failure();
    return Object.freeze({ id: row.id, checksum: row.checksum });
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(result.map(row => row.id)).size !== result.length
    || !["0010_provider_quota_ledger.sql", "0011_provider_runtime_status.sql"].every(id => result.some(row => row.id === id))) throw failure();
  return Object.freeze(result);
}
async function checkMigrations(database: SqlExecutor, expected: readonly MigrationIdentity[], scope: Scope) {
  const result = await database.query(`SELECT id,checksum FROM "${scope.schema}".asha_schema_migrations ORDER BY id`);
  if (JSON.stringify(result.rows) !== JSON.stringify(expected)) throw failure();
}
async function lock(database: SqlExecutor) {
  await database.query("SET LOCAL lock_timeout = '3s'");
  await database.query("SET LOCAL statement_timeout = '5s'");
  await database.query("SELECT pg_advisory_xact_lock(174228531,10)");
}
function matchReferences(manifest: NavasanQuotaHandoffManifest, expected: NavasanQuotaHandoffReferences) {
  if (manifest.sha256 !== expected.handoffSha256 || manifest.data.quotaScopeRef !== expected.quotaScopeRef
    || manifest.data.targetLedgerId !== expected.targetLedgerId || manifest.data.targetOrigin !== expected.targetOrigin
    || manifest.data.identityBindingHash !== expected.identityBindingHash || manifest.data.ownerTransferApprovalRef !== expected.ownerTransferApprovalRef) throw failure();
}
function sourceCapture(value: unknown, observedAt: string): PrivateMarketSourceCapture {
  const input = fields(value, ["sourceDatabase", "sourceFenceRecordedAt", "sourceRetirement", "handoffRaw"]);
  const retirement = fields(input.sourceRetirement, ["evidenceRef", "recordedAt"]);
  if (typeof retirement.evidenceRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(retirement.evidenceRef)
    || typeof input.handoffRaw !== "string") throw failure();
  const manifest = decodeNavasanQuotaHandoff(input.handoffRaw, observedAt);
  const fenced = timestamp(input.sourceFenceRecordedAt), retired = timestamp(retirement.recordedAt);
  if (fenced > retired || retired > manifest.data.capturedAt) throw failure();
  return Object.freeze({ sourceDatabase: identity(input.sourceDatabase), sourceFenceRecordedAt: fenced,
    sourceRetirement: Object.freeze({ evidenceRef: retirement.evidenceRef, recordedAt: retired }), handoffRaw: input.handoffRaw });
}

/** Strict persisted operation receipt, never a substitute for actual account,
 * process-retirement or SSH/host evidence. The publisher protects these bytes.
 * The expected reference/digest must originate independently of incoming data. */
export function parsePrivateMarketCutoverReceipt(raw: string, observedAt: string): PrivateMarketCutoverReceipt {
  try {
    timestamp(observedAt);
    if (typeof raw !== "string" || Buffer.byteLength(raw) > PRIVATE_MARKET_CUTOVER_MAX_BYTES) throw failure();
    const input = fields(JSON.parse(raw), ["version", "expectedReferences", "sourceDatabase", "sourceFenceRecordedAt", "sourceRetirement", "handoffRaw",
      "targetDatabase", "targetRuntimeDatabase", "targetAdmissionNotBefore", "targetRefreshSeconds"]);
    if (input.version !== PRIVATE_MARKET_CUTOVER_VERSION) throw failure();
    const source = sourceCapture({ sourceDatabase: input.sourceDatabase, sourceFenceRecordedAt: input.sourceFenceRecordedAt,
      sourceRetirement: input.sourceRetirement, handoffRaw: input.handoffRaw }, observedAt);
    const expectedReferences = validateNavasanQuotaHandoffReferences(input.expectedReferences), manifest = decodeNavasanQuotaHandoff(source.handoffRaw, observedAt);
    matchReferences(manifest, expectedReferences);
    const targetDatabase = identity(input.targetDatabase), targetRuntimeDatabase = identity(input.targetRuntimeDatabase);
    const targetAdmissionNotBefore = timestamp(input.targetAdmissionNotBefore);
    if (!sameDatabase(targetDatabase, targetRuntimeDatabase) || targetDatabase.role === targetRuntimeDatabase.role
      || targetAdmissionNotBefore < manifest.data.capturedAt || targetAdmissionNotBefore > observedAt
      || !Number.isSafeInteger(input.targetRefreshSeconds) || Number(input.targetRefreshSeconds) < manifest.data.sourceRefreshSeconds
      || Number(input.targetRefreshSeconds) > NAVASAN_MAX_REFRESH_SECONDS) throw failure();
    const receipt = Object.freeze({ version: PRIVATE_MARKET_CUTOVER_VERSION, expectedReferences, ...source,
      targetDatabase, targetRuntimeDatabase, targetAdmissionNotBefore, targetRefreshSeconds: input.targetRefreshSeconds as number });
    if (raw !== JSON.stringify(receipt)) throw failure();
    return receipt;
  } catch { throw failure(); }
}

/** Mutating operator operation. A successful first transaction commits the fence
 * BEFORE external retirement/capture. Failure thereafter NEVER regrants INSERT.
 * retireCallers must perform/verify actual process retirement and retain its
 * inventory evidence; it is not a boolean approval or an eight-second delay. */
export async function fenceAndCapturePrivateMarketSource(options: {
  runner: TransactionRunner; expectedDatabase: PrivateMarketDatabaseIdentity; expectedMigrations: readonly MigrationIdentity[];
  references: CaptureReferences; retireCallers: () => Promise<{ evidenceRef: string }>; scope?: Scope;
}) {
  try {
    const scope = scopeValue(options.scope ?? sourceScope, "source"), expected = identity(options.expectedDatabase), journal = migrations(options.expectedMigrations);
    profile(expected, scope, "source");
    if (typeof options.retireCallers !== "function") throw failure();
    const references = Object.freeze({ ...options.references });
    const sourceFenceRecordedAt = await options.runner.transaction(async database => {
      await lock(database); await checkDatabase(database, expected); await checkMigrations(database, journal, scope);
      await database.query(`REVOKE INSERT ON "${scope.schema}".provider_request_reservations FROM "${scope.runtimeRole}"`);
      // Reuse the strict effective-denial/ownership/data validation. This early
      // sample is discarded; the transferable capture follows caller retirement.
      const checked = await exportCapturedRows(database, references, scope);
      return checked.manifest.data.capturedAt;
    });
    const retirement = await options.retireCallers();
    if (!retirement || typeof retirement.evidenceRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(retirement.evidenceRef)) throw failure();
    return await options.runner.transaction(async database => {
      await lock(database); await checkDatabase(database, expected); await checkMigrations(database, journal, scope);
      const recordedAt = await clock(database), captured = await exportCapturedRows(database, references, scope);
      const { data, sha256 } = captured.manifest;
      const expectedReferences = validateNavasanQuotaHandoffReferences({ quotaScopeRef: data.quotaScopeRef, targetLedgerId: data.targetLedgerId,
        targetOrigin: data.targetOrigin, identityBindingHash: data.identityBindingHash, ownerTransferApprovalRef: data.ownerTransferApprovalRef, handoffSha256: sha256 });
      const capture = sourceCapture({ sourceDatabase: expected, sourceFenceRecordedAt, sourceRetirement: { evidenceRef: retirement.evidenceRef, recordedAt },
        handoffRaw: JSON.stringify(captured.manifest) }, data.capturedAt);
      return Object.freeze({ capture, expectedReferences, accounting: captured.accounting });
    });
  } catch { throw failure(); }
}

/** One administrative transaction imports/verifies and applies only the existing
 * two narrow grants. The receipt is returned only after successful COMMIT.
 * Runtime metadata/baseline/cache publication is separately checked before mount. */
export async function importAndGrantPrivateMarketTarget(options: {
  runner: TransactionRunner; expectedDatabase: PrivateMarketDatabaseIdentity; targetRuntimeDatabase: PrivateMarketDatabaseIdentity;
  expectedMigrations: readonly MigrationIdentity[]; capture: PrivateMarketSourceCapture;
  expectedReferences: NavasanQuotaHandoffReferences; refreshSeconds: number; scope?: Scope;
}) {
  try {
    const scope = scopeValue(options.scope ?? targetScope, "target"), expected = identity(options.expectedDatabase), runtime = identity(options.targetRuntimeDatabase);
    const journal = migrations(options.expectedMigrations), trusted = validateNavasanQuotaHandoffReferences(options.expectedReferences);
    profile(expected, scope, "target"); profile(runtime, scope, "runtime");
    if (!sameDatabase(expected, runtime) || runtime.role !== scope.runtimeRole || journal.length < 14
      || !journal.some(row => row.id === "0014_owner_passkeys.sql")) throw failure();
    return await options.runner.transaction(async database => {
      await lock(database); await checkDatabase(database, expected); await checkMigrations(database, journal, scope);
      const observedAt = await clock(database), captured = sourceCapture(options.capture, observedAt);
      profile(captured.sourceDatabase, scope.schema === "public" ? sourceScope : scope, "source");
      const manifest = decodeNavasanQuotaHandoff(captured.handoffRaw, observedAt); matchReferences(manifest, trusted);
      if (!Number.isSafeInteger(options.refreshSeconds) || options.refreshSeconds < manifest.data.sourceRefreshSeconds || options.refreshSeconds > NAVASAN_MAX_REFRESH_SECONDS) throw failure();
      const imported = await importNavasanQuotaHandoff({ transaction: work => work(database) }, captured.handoffRaw, trusted, scope);
      const targetAdmissionNotBefore = await clock(database);
      for (const grant of privateMarketRuntimeGrants()) {
        await database.query(grant.replaceAll("public.", `"${scope.schema}".`).replaceAll("asha_private_runtime", `"${scope.runtimeRole}"`));
      }
      const receipt = parsePrivateMarketCutoverReceipt(JSON.stringify({ version: PRIVATE_MARKET_CUTOVER_VERSION, expectedReferences: trusted, ...captured,
        targetDatabase: expected, targetRuntimeDatabase: runtime, targetAdmissionNotBefore, targetRefreshSeconds: options.refreshSeconds }), await clock(database));
      return Object.freeze({ receipt, imported });
    });
  } catch { throw failure(); }
}

/** Restart verification, inside an existing runtime transaction and AFTER the
 * existing metadata/immutability probe passes. It performs no grants or imports.
 * Baseline IDs remain exact forever; later reservations/outcomes may accumulate.
 * A protected receipt is retained operational evidence, not proof against a
 * malicious administrator or an independent source caller re-enabled elsewhere. */
export async function verifyPrivateMarketCutoverBaseline(database: SqlExecutor, receiptValue: PrivateMarketCutoverReceipt,
  configuration: { bindingHash: string; origin: string; refreshSeconds: number }, scopeInput: Scope = targetScope) {
  try {
    const scope = scopeValue(scopeInput, "target");
    await lock(database);
    const observedAt = await clock(database), receipt = parsePrivateMarketCutoverReceipt(JSON.stringify(receiptValue), observedAt);
    profile(receipt.targetDatabase, scope, "target"); profile(receipt.targetRuntimeDatabase, scope, "runtime");
    profile(receipt.sourceDatabase, scope.schema === "public" ? sourceScope : scope, "source");
    if (receipt.targetRuntimeDatabase.role !== scope.runtimeRole || configuration.bindingHash !== receipt.expectedReferences.identityBindingHash
      || configuration.origin !== receipt.expectedReferences.targetOrigin || !Number.isSafeInteger(configuration.refreshSeconds)
      || configuration.refreshSeconds < receipt.targetRefreshSeconds || configuration.refreshSeconds > NAVASAN_MAX_REFRESH_SECONDS) throw failure();
    await checkDatabase(database, receipt.targetRuntimeDatabase);
    const manifest = decodeNavasanQuotaHandoff(receipt.handoffRaw, observedAt), baseline = manifest.data.reservations;
    const ids = baseline.map(row => row.id), relation = `"${scope.schema}".provider_request_reservations`;
    const result = await database.query<{ matched: number; additions: boolean; cadence: boolean; outcomes: boolean }>(`WITH expected AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text,endpoint text,"requestHash" text,"reservedAt" text,"createdAt" text,"windowDays" integer,"limitSnapshot" integer)
    ), latest AS (
      SELECT id,reserved_at,lag(reserved_at) OVER(ORDER BY reserved_at,id) AS previous_at FROM ${relation} WHERE provider_id='navasan' AND endpoint='latest'
    ) SELECT
      (SELECT count(*)::integer FROM expected e JOIN ${relation} r ON r.id=e.id AND r.provider_id='navasan'
        AND r.endpoint=e.endpoint AND r.request_hash=e."requestHash" AND r.reserved_at=e."reservedAt"::timestamptz
        AND r.created_at=e."createdAt"::timestamptz AND r.window_days=e."windowDays" AND r.limit_snapshot=e."limitSnapshot") AS matched,
      NOT EXISTS(SELECT 1 FROM ${relation} r WHERE NOT(r.id=ANY($2::text[])) AND
        (r.provider_id<>'navasan' OR r.endpoint<>'latest' OR r.reserved_at<$3::timestamptz OR r.reserved_at<$4::timestamptz
          OR r.created_at<r.reserved_at OR r.created_at>statement_timestamp() OR r.window_days<>${NAVASAN_ROLLING_WINDOW_DAYS} OR r.limit_snapshot<>${NAVASAN_DURABLE_CALL_LIMIT})) AS additions,
      NOT EXISTS(SELECT 1 FROM latest l WHERE NOT(l.id=ANY($2::text[])) AND previous_at IS NOT NULL
        AND l.reserved_at<l.previous_at+make_interval(secs=>$5)) AS cadence,
      NOT EXISTS(SELECT 1 FROM "${scope.schema}".provider_runtime_status s LEFT JOIN ${relation} r ON r.id=s.last_reservation_id
        WHERE r.id IS NULL OR r.id=ANY($2::text[]) OR r.endpoint<>'latest' OR s.completed_at<r.reserved_at OR s.completed_at>statement_timestamp()) AS outcomes`,
    [JSON.stringify(baseline), ids, receipt.targetAdmissionNotBefore, manifest.data.capturedAt, receipt.targetRefreshSeconds]);
    const verified = result.rows?.[0];
    if (result.rows?.length !== 1 || !verified || verified.matched !== baseline.length || !verified.additions || !verified.cadence || !verified.outcomes) throw failure();
    return Object.freeze({ handoffSha256: manifest.sha256, baselineRows: baseline.length,
      sourceRefreshSeconds: manifest.data.sourceRefreshSeconds, targetRefreshSeconds: receipt.targetRefreshSeconds });
  } catch { throw failure(); }
}
