// Explicit project-only installation after reviewed release/DB/backup checks.
// Preserves unrelated crontab bytes, privately backs them up and verifies result.
// Does not enroll owner, transfer secrets, run migrations or edit the public proxy.
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { Pool } from "pg";
import { readPrivateServerConfig, assertPrivateProcessEnvironment } from "./private-server-config.ts";
import { PRIVATE_DATA_ROOT, PRIVATE_SERVICE_ROOT, planPrivateSupervision, parsePrivateSupervisionArguments, privateSupervisionUpgradeMarker, assertPrivateServiceLockMetadata, assertPrivateReleaseDirectory, isEmptyPrivateCrontab } from "./private-supervision.ts";
import { probePrivatePortfolioDatabase } from "../auth/private-database-readiness.ts";
import { readMigrations } from "../db/migrations.ts";
import { verifyRetainedPrivateBackup } from "./private-retained-backup.ts";

let pool, serviceLock;
try {
  const { previousCommit } = parsePrivateSupervisionArguments(process.argv.slice(2));
  const uid = process.getuid?.();
  if (process.platform !== "linux" || !Number.isSafeInteger(uid) || uid <= 0) throw Error();
  process.umask(0o077);
  assertPrivateProcessEnvironment(process.env);
  const web = fileURLToPath(new URL("../", import.meta.url)), repository = resolve(web, "../..");
  const commit = assertPrivateReleaseDirectory(repository);
  if (previousCommit === commit) throw Error();
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const manifest = JSON.parse(await readFile(join(web, "dist-private/release.json"), "utf8"));
  if (manifest.commit !== commit || manifest.deploymentEligible !== true || git("rev-parse", "HEAD") !== commit || git("status", "--porcelain") || git("branch", "--show-current") !== "codex/phase-2-decision-engine") throw Error();
  const config = await readPrivateServerConfig();
  if (config.version !== 2 || new URL(config.databaseUrl).port !== "15432") throw Error();
  pool = new Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  pool.on("error", () => {});
  if ((await probePrivatePortfolioDatabase(pool, await readMigrations())).state !== "ready") throw Error();
  // Metadata alone cannot certify a retained artifact: verify exact protected
  // manifests and the current dump's streamed SHA before changing any schedule.
  await verifyRetainedPrivateBackup({ commit });
  const cronEnvironment = { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
  const readCron = () => {
    try { return execFileSync("/usr/local/bin/crontab", ["-l"], { encoding: "utf8", env: cronEnvironment, stdio: ["ignore", "pipe", "pipe"], timeout: 5000, maxBuffer: 1_048_576 }); }
    catch (error) { if (isEmptyPrivateCrontab(error)) return ""; throw Error(); }
  };
  const current = readCron(), plan = planPrivateSupervision(current, repository, previousCommit ? `${PRIVATE_SERVICE_ROOT}/releases/${previousCommit}` : undefined);
  const lockPath = join(PRIVATE_DATA_ROOT, "service.lock");
  const inspectLock = stat => assertPrivateServiceLockMetadata({ file: stat.isFile(), symlink: stat.isSymbolicLink(), uid: stat.uid, mode: stat.mode, nlink: stat.nlink }, uid);
  let expectedLock;
  if (previousCommit) {
    // The running supervisor can hold flock on this inode. Read-only validation
    // must never truncate, replace, delete, create or acquire its advisory lock.
    expectedLock = await lstat(lockPath); inspectLock(expectedLock);
    serviceLock = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } else {
    serviceLock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  }
  const openedLock = await serviceLock.stat(); inspectLock(openedLock);
  if (expectedLock && (openedLock.dev !== expectedLock.dev || openedLock.ino !== expectedLock.ino)) throw Error();
  if (previousCommit) {
    // Serialize upgrades FROM one prior release without interfering with its
    // live flock. Keep this exclusive marker on both success and failure: an
    // ambiguous attempt needs explicit review, never automatic retry/eviction.
    const attempt = await open(privateSupervisionUpgradeMarker(previousCommit), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      inspectLock(await attempt.stat());
      await attempt.writeFile(JSON.stringify({ version: 1, previousCommit, commit, attemptedAt: new Date().toISOString() }), "utf8");
      await attempt.sync();
    } finally { await attempt.close(); }
  }
  const destination = join(PRIVATE_DATA_ROOT, `crontab-before-${Date.now()}.txt`);
  const backupFile = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await backupFile.writeFile(current, "utf8"); await backupFile.sync(); } finally { await backupFile.close(); }
  if (readCron() !== current) throw Error();
  const currentLock = await lstat(lockPath); inspectLock(currentLock);
  if (currentLock.dev !== openedLock.dev || currentLock.ino !== openedLock.ino) throw Error();
  execFileSync("/usr/local/bin/crontab", ["-"], { input: plan.next, env: cronEnvironment, stdio: ["pipe", "pipe", "pipe"], timeout: 5000, maxBuffer: 1_048_576 });
  if (readCron() !== plan.next) throw Error();
  process.stdout.write(JSON.stringify({ state: "project-supervision-installed", scope: "project-schedule-only", runningProcessRestarted: false, commit, ...(previousCommit ? { replacedCommit: previousCommit } : {}), previousCrontab: destination, restart: "boot-and-minute-recovery", backupSchedule: "daily-03:17-server-local", actualRebootTested: false }) + "\n");
} catch { process.stderr.write("Private supervision installation NOT confirmed. Existing records preserved; inspect scoped state before retry. No secret details logged.\n"); process.exitCode = 1; }
finally { await serviceLock?.close(); await pool?.end(); }
