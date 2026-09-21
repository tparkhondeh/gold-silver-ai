// Project-only verified backup; no owner enrollment, provider request or off-host
// data transfer. Restore uses a NEW disposable verification DB, never the live DB.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, statfs } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { readPrivateClusterAdministrationConfig, readPrivateServerConfig, assertPrivateProcessEnvironment } from "./private-server-config.ts";
import { PRIVATE_DATA_ROOT, PRIVATE_PG_BIN, assertPrivateReleaseDirectory } from "./private-supervision.ts";
import { identityBackupExclusions, transientIdentityTables } from "./private-backup-policy.ts";
import { localBackupTables, migrationJournalMatches, quoteVerificationDatabase } from "./local-backup.ts";
import { readMigrations } from "../db/migrations.ts";
import { PRIVATE_BACKUP_ROOT, PRIVATE_BACKUP_RECEIPT, hashPrivateBackupDump, verifyPrivateBackupCandidate } from "./private-retained-backup.ts";

let source, controller, restored, verificationDatabase, created = false, locked = false, verified = false;
const safeClient = async connectionString => {
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000, statement_timeout: 60_000 });
  client.on("error", () => {}); await client.connect(); return client;
};
async function privateFile(path, body) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(body); await file.sync(); } finally { await file.close(); }
}
async function syncDirectory(path) {
  const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await directory.sync(); } finally { await directory.close(); }
}
async function fingerprint(client, table) {
  if (!localBackupTables.includes(table)) throw Error();
  return (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(to_jsonb(row)::text,E'\\n' ORDER BY to_jsonb(row)::text),'')) AS digest FROM "${table}" row`)).rows[0];
}
try {
  if (process.platform !== "linux" || process.getuid() === 0 || process.argv.length !== 2) throw Error();
  process.umask(0o077);
  assertPrivateProcessEnvironment(process.env);
  const repository = resolve(fileURLToPath(new URL("../", import.meta.url)), "../..");
  const commit = assertPrivateReleaseDirectory(repository);
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000, maxBuffer: 1_048_576 }).trim();
  if (git("rev-parse", "HEAD") !== commit || git("status", "--porcelain") || git("branch", "--show-current") !== "codex/phase-2-decision-engine") throw Error();
  const config = await readPrivateServerConfig(), admin = await readPrivateClusterAdministrationConfig();
  const db = new URL(admin.databaseUrl), runtime = new URL(config.databaseUrl);
  if (db.port !== "15432" || db.host !== runtime.host || db.pathname !== runtime.pathname) throw Error();
  const backupRoot = PRIVATE_BACKUP_ROOT;
  try { await mkdir(backupRoot, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  const stat = await lstat(backupRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o7777) !== 0o700) throw Error();
  const disk = await statfs(backupRoot);
  if (disk.bavail * disk.bsize < 8 * 1024 ** 3) throw Error();
  const nonce = randomBytes(4).toString("hex"), stamp = Date.now();
  verificationDatabase = `asha_backup_verify_${nonce}`;
  const quoted = quoteVerificationDatabase(verificationDatabase), dump = join(backupRoot, `private-${stamp}-${nonce}.dump`);
  controller = await safeClient(admin.databaseUrl);
  // Prevent overlapping manual/cron backups. No trust in process-local state.
  locked = (await controller.query("SELECT pg_try_advisory_lock(174228532,9) AS locked")).rows[0]?.locked === true;
  if (!locked) throw Error();
  source = await safeClient(admin.databaseUrl);
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (await source.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
  if (!/^[0-9A-F-]+$/i.test(snapshot)) throw Error();
  const expected = {};
  for (const table of localBackupTables) expected[table] = await fingerprint(source, table);
  const actualTables = (await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename);
  if (JSON.stringify(actualTables) !== JSON.stringify([...localBackupTables, ...transientIdentityTables].sort())) throw Error();
  const journal = (await source.query("SELECT id,checksum FROM asha_schema_migrations ORDER BY id")).rows;
  if (!migrationJournalMatches(journal, await readMigrations())) throw Error();
  const env = { PATH: "/usr/bin:/bin", PGHOST: "127.0.0.1", PGPORT: "15432", PGUSER: "asha_private_cluster", PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: "asha_private" };
  // Reserve output exclusively and provide its FD; pg_dump never opens a path link.
  const dumpFile = await open(dump, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { execFileSync(join(PRIVATE_PG_BIN, "pg_dump"), ["--format=custom", "--no-owner", "--no-acl", `--snapshot=${snapshot}`, ...identityBackupExclusions], { env, stdio: ["ignore", dumpFile.fd, "pipe"], timeout: 120_000 }); await dumpFile.sync(); }
  finally { await dumpFile.close(); }
  await syncDirectory(backupRoot);
  const beforeRestoreHash = await hashPrivateBackupDump(dump);
  await source.query("COMMIT");
  await controller.query(`CREATE DATABASE ${quoted}`); created = true;
  // Supply a checked descriptor, not a path pg_restore might follow later.
  const restoreFile = await open(dump, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const entry = await restoreFile.stat();
    if (!entry.isFile() || entry.nlink !== 1 || entry.uid !== process.getuid() || (entry.mode & 0o7777) !== 0o600) throw Error();
    execFileSync(join(PRIVATE_PG_BIN, "pg_restore"), ["--exit-on-error", "--no-owner", "--no-acl", `--dbname=${verificationDatabase}`], { env, stdio: [restoreFile.fd, "pipe", "pipe"], timeout: 120_000 });
  } finally { await restoreFile.close(); }
  const restoreUrl = new URL(admin.databaseUrl); restoreUrl.pathname = "/" + verificationDatabase;
  restored = await safeClient(restoreUrl.href);
  for (const table of localBackupTables) if (JSON.stringify(await fingerprint(restored, table)) !== JSON.stringify(expected[table])) throw Error();
  for (const table of transientIdentityTables) if (Number((await restored.query(`SELECT count(*) AS count FROM "${table}"`)).rows[0].count) !== 0) throw Error();
  const sha256 = await hashPrivateBackupDump(dump);
  if (sha256 !== beforeRestoreHash) throw Error();
  const manifest = JSON.stringify({ version: 1, state: "verified", commit, verifiedAt: Date.now(), backup: dump, sha256, persistentTablesVerified: localBackupTables.length, authorizationRestored: false, offHostBackup: false });
  await privateFile(join(backupRoot, `private-${stamp}-${nonce}.json`), manifest);
  await syncDirectory(backupRoot);
  await verifyPrivateBackupCandidate({ commit, manifest });
  // Activation evidence certifies the whole successful run. Retain the dump and
  // sibling receipt, but never publish latest while a verification DB remains.
  await restored.end(); restored = undefined;
  await controller.query(`DROP DATABASE ${quoted}`); created = false;
  // A failed verification/cleanup never replaces the prior retained success record.
  const latest = PRIVATE_BACKUP_RECEIPT, pending = join(PRIVATE_DATA_ROOT, `verified-backup-${nonce}.tmp`);
  try { const previous = await lstat(latest); if (!previous.isFile() || previous.isSymbolicLink() || previous.nlink !== 1 || previous.uid !== process.getuid() || (previous.mode & 0o7777) !== 0o600) throw Error(); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await privateFile(pending, manifest); await rename(pending, latest);
  await syncDirectory(PRIVATE_DATA_ROOT);
  verified = true;
} catch { process.stderr.write("Private backup NOT confirmed. Existing data/backups preserved; no secret details logged.\n"); process.exitCode = 1; }
finally {
  await restored?.end().catch(() => {}); await source?.end().catch(() => {});
  // Only this run's positively-created disposable copy; never live/old databases.
  if (created && controller) { try { await controller.query(`DROP DATABASE ${quoteVerificationDatabase(verificationDatabase)}`); } catch { process.stderr.write("Disposable restore copy preserved for scoped inspection.\n"); process.exitCode = 1; } }
  if (locked) await controller?.query("SELECT pg_advisory_unlock(174228532,9)").catch(() => {});
  await controller?.end().catch(() => {});
}
if (verified && process.exitCode !== 1) process.stdout.write("Private backup and separate restore verified; authorization was not restored. No private values logged.\n");
