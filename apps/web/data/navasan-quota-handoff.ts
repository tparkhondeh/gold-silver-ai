import { createHash } from "node:crypto";
import { NAVASAN_DURABLE_CALL_LIMIT, NAVASAN_ROLLING_WINDOW_DAYS, type NavasanQuotaEndpoint } from "./navasan-quota-ledger.ts";
import { NAVASAN_FREE_REFRESH_SECONDS, NAVASAN_MAX_REFRESH_SECONDS } from "./navasan-refresh-policy.ts";

/** Preparatory data contract only, NOT an accepted operational handoff protocol.
 * No I/O, source/account verification, grant, fence, import, key or activation.
 * A canonical digest proves byte consistency, never completeness or authority.
 * Scope/ledger/approval references are opaque operator references, not provider
 * account identities, key fingerprints, verified approval or fencing evidence. */
export const NAVASAN_QUOTA_HANDOFF_VERSION = "asha.navasan_quota_handoff_data.v1";
export const NAVASAN_QUOTA_HANDOFF_MAX_ROWS = 4096;
export const NAVASAN_QUOTA_HANDOFF_MAX_BYTES = 2 * 1024 * 1024;
const targetOrigin = "https://goldsilver.wealthos.ir";
const hexHash = /^[a-f0-9]{64}$/;
const scopeRef = /^qscope_[a-f0-9]{32}$/;
const ledgerRef = /^qledger_[a-f0-9]{32}$/;
const approvalRef = /^approval_[a-f0-9]{32}$/;
// Match the existing storage ID boundary; this is not a new UUID-version policy.
const reservationId = /^navasan_request_[0-9a-f-]{36}$/;
const endpoints = new Set<NavasanQuotaEndpoint>(["latest", "dailyCurrency", "ohlcSearch"]);
const windowMicros = BigInt(NAVASAN_ROLLING_WINDOW_DAYS) * 86_400_000_000n;
type RecordValue = Record<string, unknown>;
const invalid = () => new Error("Invalid preparatory Navasan quota handoff; details withheld");

export type NavasanQuotaHandoffReferences = Readonly<{
  quotaScopeRef: string; targetLedgerId: string; targetOrigin: typeof targetOrigin;
  identityBindingHash: string; handoffSha256: string; ownerTransferApprovalRef: string;
}>;
export type NavasanQuotaHandoffReservation = Readonly<{
  id: string; endpoint: NavasanQuotaEndpoint; requestHash: string;
  reservedAt: string; createdAt: string; windowDays: number; limitSnapshot: number;
}>;
export type NavasanQuotaHandoffData = Readonly<{
  version: typeof NAVASAN_QUOTA_HANDOFF_VERSION; provider: "navasan"; plan: "free";
  quotaScopeRef: string; sourceLedgerId: string; targetLedgerId: string;
  targetOrigin: typeof targetOrigin; identityBindingHash: string; ownerTransferApprovalRef: string;
  capturedAt: string; sourceRefreshSeconds: number; latestReservationId: string | null;
  reservations: readonly NavasanQuotaHandoffReservation[];
}>;
export type NavasanQuotaHandoffManifest = Readonly<{ sha256: string; data: NavasanQuotaHandoffData }>;

function record(value: unknown, keys: readonly string[]): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) throw invalid();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw invalid();
  }
  return value as RecordValue;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw invalid();
  return value;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw invalid();
  return value;
}
/** PostgreSQL microseconds must not pass through pg's default Date->JSON path.
 * Only the whole-second component enters Date; the six fractional digits stay exact. */
function micros(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) || value.startsWith("0000-")) throw invalid();
  const seconds = value.slice(0, 19), milliseconds = Date.parse(`${seconds}.000Z`);
  if (!Number.isSafeInteger(milliseconds) || new Date(milliseconds).toISOString() !== `${seconds}.000Z`) throw invalid();
  return BigInt(milliseconds) * 1000n + BigInt(value.slice(20, 26));
}
function timestamp(value: bigint): string {
  let seconds = value / 1_000_000n, fraction = value % 1_000_000n;
  if (fraction < 0n) { seconds--; fraction += 1_000_000n; }
  const iso = new Date(Number(seconds) * 1000).toISOString();
  const result = `${iso.slice(0, -5)}.${fraction.toString().padStart(6, "0")}Z`;
  micros(result); return result;
}

/** Shape/lexical validation only. A present approval reference is NOT approval. */
export function validateNavasanQuotaHandoffReferences(value: unknown): NavasanQuotaHandoffReferences {
  const input = record(value, ["quotaScopeRef", "targetLedgerId", "targetOrigin", "identityBindingHash", "handoffSha256", "ownerTransferApprovalRef"]);
  if (input.targetOrigin !== targetOrigin) throw invalid();
  return Object.freeze({ quotaScopeRef: text(input.quotaScopeRef, scopeRef), targetLedgerId: text(input.targetLedgerId, ledgerRef), targetOrigin,
    identityBindingHash: text(input.identityBindingHash, hexHash), handoffSha256: text(input.handoffSha256, hexHash), ownerTransferApprovalRef: text(input.ownerTransferApprovalRef, approvalRef) });
}

export function validateNavasanQuotaHandoffData(value: unknown, observedAt: string): NavasanQuotaHandoffData {
  const input = record(value, ["version", "provider", "plan", "quotaScopeRef", "sourceLedgerId", "targetLedgerId", "targetOrigin", "identityBindingHash", "ownerTransferApprovalRef", "capturedAt", "sourceRefreshSeconds", "latestReservationId", "reservations"]);
  if (input.version !== NAVASAN_QUOTA_HANDOFF_VERSION || input.provider !== "navasan" || input.plan !== "free" || input.targetOrigin !== targetOrigin) throw invalid();
  const captured = micros(input.capturedAt), cutoff = captured - windowMicros;
  // Explicit caller clock keeps the validator pure; a document cannot declare
  // its own future capture instant as trustworthy "now". No clock is inferred.
  if (captured > micros(observedAt)) throw invalid();
  timestamp(cutoff); // Reject date arithmetic outside this contract's bounded year range.
  const sourceRefreshSeconds = integer(input.sourceRefreshSeconds, NAVASAN_FREE_REFRESH_SECONDS, NAVASAN_MAX_REFRESH_SECONDS);
  const sourceLedgerId = text(input.sourceLedgerId, ledgerRef), targetLedgerId = text(input.targetLedgerId, ledgerRef);
  if (sourceLedgerId === targetLedgerId) throw invalid();
  const latestReservationId = input.latestReservationId === null ? null : text(input.latestReservationId, reservationId);
  if (!Array.isArray(input.reservations) || Object.getPrototypeOf(input.reservations) !== Array.prototype
    || input.reservations.length > NAVASAN_QUOTA_HANDOFF_MAX_ROWS
    || Reflect.ownKeys(input.reservations).length !== input.reservations.length + 1) throw invalid();
  const seen = new Set<string>();
  const reservations: NavasanQuotaHandoffReservation[] = [];
  for (let index = 0; index < input.reservations.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input.reservations, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw invalid();
    const row = record(descriptor.value, ["id", "endpoint", "requestHash", "reservedAt", "createdAt", "windowDays", "limitSnapshot"]);
    const id = text(row.id, reservationId), reserved = micros(row.reservedAt), created = micros(row.createdAt);
    if (seen.has(id) || !endpoints.has(row.endpoint as NavasanQuotaEndpoint) || reserved > captured || created > captured
      || (reserved < cutoff && id !== latestReservationId)) throw invalid();
    seen.add(id);
    // Accept the existing schema's original snapshots only. An out-of-schema
    // original is rejected, never rewritten to hide a historical discrepancy.
    if (row.windowDays !== NAVASAN_ROLLING_WINDOW_DAYS || row.limitSnapshot !== NAVASAN_DURABLE_CALL_LIMIT) throw invalid();
    reservations.push(Object.freeze({ id, endpoint: row.endpoint as NavasanQuotaEndpoint, requestHash: text(row.requestHash, hexHash),
      reservedAt: row.reservedAt as string, createdAt: row.createdAt as string,
      windowDays: row.windowDays, limitSnapshot: row.limitSnapshot }));
  }
  const latest = latestReservationId === null ? null : reservations.find(row => row.id === latestReservationId);
  if (latestReservationId !== null && (!latest || latest.endpoint !== "latest")) throw invalid();
  if (reservations.some(row => row.endpoint === "latest" && (!latest || micros(row.reservedAt) > micros(latest.reservedAt)))) throw invalid();
  if (latest) timestamp(micros(latest.reservedAt) + BigInt(sourceRefreshSeconds) * 1_000_000n);
  reservations.sort((a, b) => a.reservedAt < b.reservedAt ? -1 : a.reservedAt > b.reservedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return Object.freeze({ version: NAVASAN_QUOTA_HANDOFF_VERSION, provider: "navasan", plan: "free",
    quotaScopeRef: text(input.quotaScopeRef, scopeRef), sourceLedgerId, targetLedgerId, targetOrigin,
    identityBindingHash: text(input.identityBindingHash, hexHash), ownerTransferApprovalRef: text(input.ownerTransferApprovalRef, approvalRef),
    capturedAt: input.capturedAt as string, sourceRefreshSeconds, latestReservationId, reservations: Object.freeze(reservations) });
}

export function createNavasanQuotaHandoffManifest(value: unknown, observedAt: string): NavasanQuotaHandoffManifest {
  const data = validateNavasanQuotaHandoffData(value, observedAt), canonical = JSON.stringify(data);
  if (Buffer.byteLength(canonical) > NAVASAN_QUOTA_HANDOFF_MAX_BYTES) throw invalid();
  return Object.freeze({ sha256: createHash("sha256").update(canonical).digest("hex"), data });
}
export function encodeNavasanQuotaHandoff(value: unknown, observedAt: string): string {
  const encoded = JSON.stringify(createNavasanQuotaHandoffManifest(value, observedAt));
  if (Buffer.byteLength(encoded) > NAVASAN_QUOTA_HANDOFF_MAX_BYTES) throw invalid();
  return encoded;
}
export function decodeNavasanQuotaHandoff(raw: string, observedAt: string): NavasanQuotaHandoffManifest {
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > NAVASAN_QUOTA_HANDOFF_MAX_BYTES) throw invalid();
    const value = record(JSON.parse(raw), ["sha256", "data"]), manifest = createNavasanQuotaHandoffManifest(value.data, observedAt);
    if (value.sha256 !== manifest.sha256 || raw !== JSON.stringify(manifest)) throw invalid();
    return manifest;
  } catch { throw invalid(); }
}

/** Counts declared records at the declared capture instant, not verified provider
 * usage or authority. Even an empty valid document cannot enable acquisition. */
export function inspectNavasanQuotaHandoff(value: unknown, observedAt: string) {
  const manifest = createNavasanQuotaHandoffManifest(value, observedAt), data = manifest.data;
  const cutoff = micros(data.capturedAt) - windowMicros;
  const used = data.reservations.filter(row => micros(row.reservedAt) >= cutoff).length;
  const latest = data.reservations.find(row => row.id === data.latestReservationId);
  const remainingMicros = latest ? micros(latest.reservedAt) + BigInt(data.sourceRefreshSeconds) * 1_000_000n - micros(data.capturedAt) : 0n;
  return Object.freeze({ manifest, declaredWindowStart: timestamp(cutoff), declaredUsed: used,
    declaredRemaining: Math.max(0, NAVASAN_DURABLE_CALL_LIMIT - used), declaredExhausted: used >= NAVASAN_DURABLE_CALL_LIMIT,
    declaredLatestNextEligibleAt: latest ? timestamp(micros(latest.reservedAt) + BigInt(data.sourceRefreshSeconds) * 1_000_000n) : null,
    declaredCooldownSeconds: remainingMicros <= 0n ? 0 : Number((remainingMicros + 999_999n) / 1_000_000n),
    sourceCompletenessVerified: false as const, providerAccountVerified: false as const, sourceFenced: false as const,
    ownerTransferApproved: false as const, activationReady: false as const });
}
