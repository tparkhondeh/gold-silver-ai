import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { localBackupTables } from "./local-backup.ts";
import type { LocalBackupStatus } from "./local-backup-supervisor.ts";

const MANIFEST_NAME = /^asha-local-\d{8}T\d{6}Z-[a-f0-9]{8}\.json$/;
const MAX_MANIFEST_BYTES = 16_384;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

// Verify retained bytes against the recorded full-restore manifest. Hashing is
// streamed and never parses, returns or logs private portfolio/dump contents.
export async function latestVerifiedLocalBackup(privateRoot: string, now = Date.now()): Promise<string | null> {
  const directory = join(privateRoot, "backups");
  let info;
  try { info = await lstat(directory); } catch (error) { if (missing(error)) return null; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink() || resolve(await realpath(directory)) !== resolve(directory)) throw Error("Unsafe backup metadata directory");
  const names = (await readdir(directory)).filter(name => MANIFEST_NAME.test(name)).sort().reverse();
  for (const name of names) {
    const path = join(directory, name);
    let handle;
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_MANIFEST_BYTES) continue;
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = await handle.stat();
      if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > MAX_MANIFEST_BYTES) continue;
      const bytes = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
      let size = 0;
      while (size < bytes.length) { const part = await handle.read(bytes, size, bytes.length - size, null); if (!part.bytesRead) break; size += part.bytesRead; }
      if (size > MAX_MANIFEST_BYTES) continue;
      const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
      if (manifest.version !== 1 || manifest.database !== "asha_local" || typeof manifest.createdAt !== "string"
        || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(manifest.createdAt) || !Number.isFinite(Date.parse(manifest.createdAt))
        || new Date(manifest.createdAt).toISOString() !== manifest.createdAt || Date.parse(manifest.createdAt) > now
        || !name.startsWith(`asha-local-${manifest.createdAt.replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z")}-`)
        || manifest.backupFile !== name.replace(/\.json$/, ".dump") || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1
        || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.tablesVerified !== localBackupTables.length
        || manifest.restoreVerification !== "temporary_database_full_restore_and_row_count_match"
        || manifest.containsSensitiveData !== true || manifest.encryption !== "none_owner_only_windows_acl"
        || manifest.retention !== "manual_no_automatic_deletion") continue;
      const backupPath = join(directory, manifest.backupFile), backup = await lstat(backupPath);
      if (!backup.isFile() || backup.isSymbolicLink() || backup.nlink !== 1 || backup.size !== manifest.bytes) continue;
      const dump = await open(backupPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const before = await dump.stat();
        if (before.ino !== backup.ino || before.dev !== backup.dev || before.size !== backup.size) continue;
        const hash = createHash("sha256");
        for await (const chunk of dump.createReadStream({ autoClose: false })) hash.update(chunk);
        const after = await dump.stat();
        if (after.size === before.size && after.mtimeMs === before.mtimeMs && hash.digest("hex") === manifest.sha256) return manifest.createdAt;
      } finally { await dump.close(); }
    } catch { /* An incomplete or altered manifest cannot certify a backup. */ }
    finally { await handle?.close(); }
  }
  return null;
}

export async function writeLocalBackupStatus(privateRoot: string, status: LocalBackupStatus) {
  const root = await lstat(privateRoot);
  if (!root.isDirectory() || root.isSymbolicLink() || resolve(await realpath(privateRoot)) !== resolve(privateRoot)) throw Error("Unsafe backup status directory");
  const path = join(privateRoot, "backup-status.json"), pending = join(privateRoot, "backup-status.pending");
  try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw Error("Unsafe backup status file"); }
  catch (error) { if (!missing(error)) throw error; }
  let created = false;
  try {
    const handle = await open(pending, "wx", 0o600); created = true;
    try { await handle.writeFile(`${JSON.stringify(status)}\n`); await handle.sync(); } finally { await handle.close(); }
    await rename(pending, path); created = false;
  } finally { if (created) await unlink(pending).catch(() => {}); }
}

type Launch = (command: string, args: string[], options: Parameters<typeof spawn>[2]) => ChildProcess;
export function createLocalBackupProcessRunner(nodePath: string, script: string, cwd: string, launch: Launch = spawn) {
  let running: Promise<boolean> | null = null;
  return (signal: AbortSignal): Promise<boolean> => {
    if (signal.aborted) return Promise.resolve(false);
    if (running) return running;
    running = new Promise<boolean>(resolveResult => {
      let child: ChildProcess;
      try { child = launch(nodePath, ["--experimental-strip-types", script, "backup"], { cwd, windowsHide: true, detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] }); }
      catch { resolveResult(false); return; }
      let cancelled = false, finished = false;
      const cancel = () => {
        cancelled = true;
        // Windows kill() is not graceful. Ask the existing command to stop at
        // a safe boundary and run its own temp/verification-DB cleanup instead.
        if (child.connected) { try { child.send({ type: "cancel-local-backup" }, () => {}); } catch { /* Exit handler will report failure. */ } }
      };
      const timer = setTimeout(cancel, 5 * 60_000); timer.unref?.();
      signal.addEventListener("abort", cancel, { once: true });
      const finish = (ok: boolean) => {
        if (finished) return; finished = true;
        clearTimeout(timer); signal.removeEventListener("abort", cancel);
        resolveResult(ok && !cancelled);
      };
      child.once("error", () => finish(false));
      child.once("exit", code => finish(code === 0));
      if (signal.aborted) cancel();
    }).finally(() => { running = null; });
    return running;
  };
}
