import { parsePrivateBackupManifest, type PrivateBackupManifest } from "./private-retained-backup.ts";

export const PRIVATE_RELEASE_RESERVE_BYTES = 8n * 1024n ** 3n;
const MAX_SAFE_CAPACITY_BYTES = BigInt(Number.MAX_SAFE_INTEGER);

export type PrivateReleaseReadinessReason = "low_capacity" | "capacity_unavailable" | "backup_unverified" | "release_unverified";
export type PrivateReleaseReadiness = Readonly<{
  version: 1;
  preflightChecksPass: boolean;
  privateUseReady: false;
  financialUseAllowed: false;
  release: string | null;
  checkedAt: string | null;
  availableBytes: string | null;
  requiredBytes: string;
  backupVerified: boolean;
  reasons: readonly PrivateReleaseReadinessReason[];
}>;
export type RetainedBackupCheck = (selection: { commit: string; now: number }) => Promise<PrivateBackupManifest>;

/** Pure composition: the production wrapper supplies an already checked release,
 * bigint statfs capacity and the existing verifyRetainedPrivateBackup function.
 * No files, DB, network, environment, service health or owner acceptance are read
 * here. Passing these limited preflight checks is NOT approval for private use.
 * Never infer backup freshness/integrity from an unchecked receipt timestamp. */
export async function evaluatePrivateReleaseReadiness(
  input: { release: unknown; now: unknown; availableBytes: unknown },
  verifyBackup: RetainedBackupCheck,
): Promise<PrivateReleaseReadiness> {
  let release: string | null = null, checkedAt: string | null = null, clock: number | null = null;
  let availableBytes: bigint | null = null;
  // Read/copy before the first await; mutable caller input cannot change the
  // release, clock or capacity associated with a later verification result.
  try {
    const value = input.release;
    if (typeof value === "string" && /^[a-f0-9]{40}$/.test(value)) release = value;
  } catch { /* Fixed reason only, never reflect input/exception values. */ }
  try {
    const value = input.now;
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime())) {
      clock = value; checkedAt = new Date(value).toISOString();
    }
  } catch { /* Invalid verification context is release_unverified. */ }
  try {
    const value = input.availableBytes;
    if (typeof value === "bigint" && value >= 0n && value <= MAX_SAFE_CAPACITY_BYTES) availableBytes = value;
  } catch { /* Missing/unsafe capacity is not treated as zero or sufficient. */ }
  const reasons: PrivateReleaseReadinessReason[] = [];
  if (release === null || clock === null) reasons.push("release_unverified");
  if (availableBytes === null) reasons.push("capacity_unavailable");
  else if (availableBytes < PRIVATE_RELEASE_RESERVE_BYTES) reasons.push("low_capacity");

  let backupVerified = false;
  if (release !== null && clock !== null) {
    try {
      const selection = { commit: release, now: clock };
      const manifest = await verifyBackup(Object.freeze({ ...selection }));
      // Validate the verifier's return contract with its existing parser. This
      // is not a replacement for protected-descriptor/streamed-SHA verification.
      parsePrivateBackupManifest(JSON.stringify(manifest), selection);
      backupVerified = true;
    } catch { reasons.push("backup_unverified"); }
  }
  return Object.freeze({
    version: 1,
    preflightChecksPass: reasons.length === 0,
    privateUseReady: false,
    financialUseAllowed: false,
    release,
    checkedAt,
    availableBytes: availableBytes?.toString() ?? null,
    requiredBytes: PRIVATE_RELEASE_RESERVE_BYTES.toString(),
    backupVerified,
    reasons: Object.freeze(reasons),
  });
}
