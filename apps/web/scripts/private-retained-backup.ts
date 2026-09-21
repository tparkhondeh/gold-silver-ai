import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { posix } from "node:path";
import { PRIVATE_DATA_ROOT } from "./private-supervision.ts";
import { localBackupTables } from "./local-backup.ts";

export const PRIVATE_BACKUP_ROOT = `${PRIVATE_DATA_ROOT}/backups`;
export const PRIVATE_BACKUP_RECEIPT = `${PRIVATE_DATA_ROOT}/verified-backup.json`;
const MAX_MANIFEST_BYTES = 4096;
const MAX_DUMP_BYTES = 8 * 1024 ** 3;
const MAX_AGE_MS = 86_400_000;
const failure = () => new Error("Retained private backup unavailable or unsafe; details withheld");

export type PrivateBackupManifest = Readonly<{
  version: 1; state: "verified"; commit: string; verifiedAt: number;
  backup: string; sha256: string; persistentTablesVerified: number;
  authorizationRestored: false; offHostBackup: false;
}>;
type Selection = { commit: string; now?: number };
type Handle = Pick<FileHandle, "stat" | "read" | "close">;
type BackupIO = {
  platform: string; uid: number | undefined;
  lstat: (path: string) => Promise<Stats>;
  open: (path: string, flags: number) => Promise<Handle>;
};

function backupStamp(path: unknown): number {
  if (typeof path !== "string" || !path.startsWith(PRIVATE_BACKUP_ROOT + "/")) throw failure();
  const name = path.slice(PRIVATE_BACKUP_ROOT.length + 1);
  const match = /^private-([1-9][0-9]{12})-([a-f0-9]{8})\.dump$/.exec(name);
  if (!match) throw failure();
  return Number(match[1]);
}

export function parsePrivateBackupManifest(raw: string, { commit, now = Date.now() }: Selection): PrivateBackupManifest {
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_MANIFEST_BYTES || !/^[a-f0-9]{40}$/.test(commit)
      || !Number.isSafeInteger(now) || now <= 0) throw failure();
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== "authorizationRestored,backup,commit,offHostBackup,persistentTablesVerified,sha256,state,verifiedAt,version"
      || value.version !== 1 || value.state !== "verified" || value.commit !== commit
      || !Number.isSafeInteger(value.verifiedAt) || value.verifiedAt > now || now - value.verifiedAt > MAX_AGE_MS
      || backupStamp(value.backup) > value.verifiedAt || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)
      || value.persistentTablesVerified !== localBackupTables.length || value.authorizationRestored !== false || value.offHostBackup !== false) throw failure();
    return Object.freeze({ ...value });
  } catch { throw failure(); }
}

function sameMetadata(a: Stats, b: Stats) {
  return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

/** Explicit IO seam for synthetic tests; production entry points below never
 * accept a path, platform, account or filesystem override. Every path remains fixed. */
export function createPrivateBackupVerifier(io: BackupIO) {
  function uid() {
    if (io.platform !== "linux" || !Number.isSafeInteger(io.uid) || io.uid! <= 0) throw failure();
    return io.uid!;
  }
  function assertFile(stat: Stats, maximum: number) {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== uid() || (stat.mode & 0o7777) !== 0o600
      || stat.nlink !== 1 || !Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > maximum) throw failure();
  }
  async function directories() {
    const identities: Array<[string, Stats]> = [];
    for (let path: string = PRIVATE_BACKUP_ROOT;; path = posix.dirname(path)) {
      const stat = await io.lstat(path);
      const privatePath = path === "/home/wealthos_dev/.asha-private" || path.startsWith("/home/wealthos_dev/.asha-private/");
      if (!stat.isDirectory() || stat.isSymbolicLink() || ![0, uid()].includes(stat.uid) || (stat.mode & 0o7022) !== 0
        || (privatePath && (stat.uid !== uid() || (stat.mode & 0o7777) !== 0o700))) throw failure();
      identities.push([path, stat]);
      if (path === "/") return identities;
    }
  }
  async function recheckDirectories(before: Array<[string, Stats]>) {
    const after = await directories();
    if (after.length !== before.length || after.some(([path, stat], i) => path !== before[i][0]
      || stat.dev !== before[i][1].dev || stat.ino !== before[i][1].ino)) throw failure();
  }
  async function readFile<T>(path: string, maximum: number, consume: (file: Handle, stat: Stats) => Promise<T>) {
    const before = await io.lstat(path); assertFile(before, maximum);
    // NONBLOCK also prevents a malicious swap to a pipe from blocking open.
    const file = await io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const descriptor = await file.stat(); assertFile(descriptor, maximum);
      if (!sameMetadata(before, descriptor)) throw failure();
      const result = await consume(file, descriptor);
      const after = await file.stat(), named = await io.lstat(path);
      assertFile(after, maximum); assertFile(named, maximum);
      if (!sameMetadata(descriptor, after) || !sameMetadata(after, named)) throw failure();
      return result;
    } finally { await file.close(); }
  }
  async function manifest(path: string) {
    return readFile(path, MAX_MANIFEST_BYTES, async (file, stat) => {
      const buffer = Buffer.alloc(stat.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== stat.size) throw failure();
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset));
    });
  }
  async function digest(path: string) {
    backupStamp(path);
    return readFile(path, MAX_DUMP_BYTES, async (file, stat) => {
      const hash = createHash("sha256"), buffer = Buffer.alloc(1024 * 1024), started = performance.now();
      let offset = 0;
      while (offset <= stat.size) {
        if (performance.now() - started > 120_000) throw failure();
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, stat.size - offset + 1), offset);
        if (!bytesRead) break;
        offset += bytesRead;
        if (offset > stat.size) throw failure();
        hash.update(buffer.subarray(0, bytesRead));
      }
      if (offset !== stat.size) throw failure();
      return hash.digest("hex");
    });
  }
  async function verifyCandidate(raw: string, selection: Selection) {
    const value = parsePrivateBackupManifest(raw, selection);
    const retained = parsePrivateBackupManifest(await manifest(value.backup.replace(/\.dump$/, ".json")), selection);
    if (Object.keys(value).some(key => value[key as keyof PrivateBackupManifest] !== retained[key as keyof PrivateBackupManifest])
      || await digest(value.backup) !== value.sha256) throw failure();
    return value;
  }
  return {
    async verifyRetainedPrivateBackup(selection: Selection) {
      try {
        const paths = await directories();
        const raw = await manifest(PRIVATE_BACKUP_RECEIPT);
        const value = await verifyCandidate(raw, selection);
        // Publication during verification is not permission to activate against
        // evidence different from the bytes we actually checked.
        if (await manifest(PRIVATE_BACKUP_RECEIPT) !== raw) throw failure();
        await recheckDirectories(paths); return value;
      } catch { throw failure(); }
    },
    async verifyPrivateBackupCandidate({ manifest: raw, ...selection }: Selection & { manifest: string }) {
      try { const paths = await directories(); const value = await verifyCandidate(raw, selection); await recheckDirectories(paths); return value; }
      catch { throw failure(); }
    },
    async hashPrivateBackupDump(path: string) {
      try { const paths = await directories(); const result = await digest(path); await recheckDirectories(paths); return result; }
      catch { throw failure(); }
    },
  };
}

const verifier = createPrivateBackupVerifier({ platform: process.platform, uid: process.getuid?.(), lstat, open });
export const { verifyRetainedPrivateBackup, verifyPrivateBackupCandidate, hashPrivateBackupDump } = verifier;
