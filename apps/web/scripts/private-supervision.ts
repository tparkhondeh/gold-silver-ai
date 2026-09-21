export const PRIVATE_SERVICE_ROOT = "/home/wealthos_dev/.goldsilver-service";
export const PRIVATE_DATA_ROOT = "/home/wealthos_dev/.asha-private/goldsilver";
export const PRIVATE_PG_BIN = `${PRIVATE_SERVICE_ROOT}/tools/postgresql-17.11/bin`;
export const PRIVATE_PG_LOG = `${PRIVATE_DATA_ROOT}/database.log`;
const begin = "# BEGIN GOLDSILVER PRIVATE SERVICE V1";
const end = "# END GOLDSILVER PRIVATE SERVICE V1";

/** Fixed owner/project only. Do not modify other jobs or silently replace an
 * existing deployment. The caller must privately back up and compare crontab
 * again immediately before installing this reviewed plan. */
export function planPrivateSupervision(existing: string, releaseDirectory: string, previousReleaseDirectory?: string): { previous: string; next: string; releaseDirectory: string } {
  if (typeof existing !== "string" || existing.length > 1_048_576 || existing.includes("\0")) throw new Error("Existing service schedule needs review");
  assertPrivateReleaseDirectory(releaseDirectory);
  const command = `/usr/bin/flock -n ${PRIVATE_DATA_ROOT}/service.lock /usr/local/bin/node --experimental-strip-types ${releaseDirectory}/apps/web/scripts/supervise-private-service.mjs >/dev/null 2>&1`;
  // Server-local time; the backup command holds its own database advisory lock.
  // No deletion, credential arguments, unrelated job/environment changes or RPO promise.
  const backup = `/usr/local/bin/node --experimental-strip-types ${releaseDirectory}/apps/web/scripts/private-server-backup.mjs >/dev/null 2>&1`;
  const additions = `${begin}\n@reboot ${command}\n* * * * * ${command}\n17 3 * * * ${backup}\n${end}\n`;
  const markers = existing.match(/(?:BEGIN|END) GOLDSILVER PRIVATE SERVICE/gi) ?? [];
  if (previousReleaseDirectory !== undefined) {
    assertPrivateReleaseDirectory(previousReleaseDirectory);
    if (previousReleaseDirectory === releaseDirectory) throw new Error("Previous private release must differ");
    const expected = planPrivateSupervision("", previousReleaseDirectory).next;
    const offset = existing.indexOf(expected);
    if (markers.length !== 2 || offset < 0 || (offset > 0 && existing[offset - 1] !== "\n")
      || existing.indexOf(expected, offset + 1) !== -1) throw new Error("Existing service schedule needs review");
    return { previous: existing, next: existing.slice(0, offset) + additions + existing.slice(offset + expected.length), releaseDirectory };
  }
  if (markers.length) throw new Error("Existing service schedule needs review");
  return { previous: existing, next: existing + (existing && !existing.endsWith("\n") ? "\n" : "") + additions, releaseDirectory };
}

/** Replacement is never inferred from a live schedule or an arbitrary path. */
export function parsePrivateSupervisionArguments(args: readonly string[]) {
  if (!Array.isArray(args) || args.filter(value => value === "--activate-reviewed-release").length !== 1
    || args.length < 1 || args.length > 2) throw new Error("Explicit reviewed activation required");
  if (args.length === 1) return { previousCommit: null };
  const replacement = args.find(value => value !== "--activate-reviewed-release");
  const match = typeof replacement === "string" ? /^--replace-reviewed-release=([a-f0-9]{40})$/.exec(replacement) : null;
  if (!match) throw new Error("Explicit previous release required");
  return { previousCommit: match[1] };
}

export function privateSupervisionUpgradeMarker(previousCommit: string) {
  if (!/^[a-f0-9]{40}$/.test(previousCommit)) throw new Error("Invalid previous private release");
  return `${PRIVATE_DATA_ROOT}/supervision-upgrade-from-${previousCommit}.json`;
}

/** Only crontab's normal C-locale empty-account result is absence. Permission,
 * command, timeout, partial output and unknown diagnostics must stop installation. */
export function isEmptyPrivateCrontab(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; signal?: unknown; stdout?: unknown; stderr?: unknown; code?: unknown };
  return value.status === 1 && (value.signal === null || value.signal === undefined) && value.code === undefined
    && value.stdout === "" && value.stderr === "no crontab for wealthos_dev\n";
}

export function assertPrivateLogMetadata(value: { file: boolean; symlink: boolean; uid: number; mode: number; nlink: number }, uid: number) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || !value.file || value.symlink || value.uid !== uid
    || value.nlink !== 1 || (value.mode & 0o7777) !== 0o600) throw new Error("Unsafe prepared PostgreSQL log");
}

export function assertPrivateServiceLockMetadata(value: { file: boolean; symlink: boolean; uid: number; mode: number; nlink: number }, uid: number) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || !value.file || value.symlink || value.uid !== uid
    || value.nlink !== 1 || (value.mode & 0o7777) !== 0o600) throw new Error("Unsafe existing private service lock");
}

export function assertPrivateReleaseDirectory(path: string) {
  if (!/^\/home\/wealthos_dev\/\.goldsilver-service\/releases\/[a-f0-9]{40}$/.test(path)) throw new Error("Invalid private release directory");
  return path.slice(path.lastIndexOf("/") + 1);
}
