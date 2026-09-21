// Persistent project service, not a Codex/background task. Run under the reviewed
// exclusive flock crontab plan. Does not initialize DB, enroll owner, copy data,
// install cron or alter a proxy. The runtime revalidates exact SHA on every start.
import { spawn, execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { readPrivateServerConfig } from "./private-server-config.ts";
import { PRIVATE_DATA_ROOT, PRIVATE_PG_BIN, PRIVATE_PG_LOG, assertPrivateReleaseDirectory, assertPrivateLogMetadata } from "./private-supervision.ts";

let child, timer, stopping = false, restarting = false;
const environment = { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin" };
const web = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(web, "../..");
async function preparedLog() {
  const inspect = value => assertPrivateLogMetadata({ file: value.isFile(), symlink: value.isSymbolicLink(), uid: value.uid, mode: value.mode, nlink: value.nlink }, process.getuid());
  const before = await lstat(PRIVATE_PG_LOG); inspect(before);
  // No creation/repair/truncation. Compare the non-following descriptor with the
  // inspected path; only the owner's existing prepared log may receive output.
  const file = await open(PRIVATE_PG_LOG, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const current = await file.stat(); inspect(current);
    if (current.dev !== before.dev || current.ino !== before.ino) throw Error();
  } finally { await file.close(); }
}
async function event(name) {
  // Only fixed event labels, never child stderr, credentials or portfolio values.
  const file = await open(join(PRIVATE_DATA_ROOT, "service-events.log"), constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error();
    if (stat.size < 2_097_152) await file.write(`${new Date().toISOString()} ${name}\n`);
  } finally { await file.close(); }
}
async function start() {
  if (stopping || restarting) return;
  restarting = true;
  try {
    const configuration = await readPrivateServerConfig();
    if (configuration.version !== 2 || new URL(configuration.databaseUrl).port !== "15432") throw Error();
    const data = join(PRIVATE_DATA_ROOT, "database"), stat = await lstat(data);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) || (await readFile(join(data, "PG_VERSION"), "utf8")).trim() !== "17") throw Error();
    const pg = (args, timeout = 5000) => execFileSync(join(PRIVATE_PG_BIN, "pg_ctl"), args, { env: environment, stdio: ["ignore", "pipe", "pipe"], timeout });
    try { pg(["status", "-D", data]); }
    catch (error) {
      if (error.status !== 3) throw Error();
      await preparedLog();
      pg(["start", "-D", data, "-l", PRIVATE_PG_LOG, "-w", "-t", "30"], 35_000);
    }
    child = spawn(process.execPath, ["--experimental-strip-types", join(web, "scripts/start-private-server.mjs")], { cwd: web, env: environment, stdio: "ignore" });
    const finished = () => {
      if (!restarting) return;
      restarting = false; child = undefined;
      if (!stopping) { void event("private-runtime-stopped-retry-scheduled").catch(() => {}); timer = setTimeout(() => { void start(); }, 15_000); }
    };
    child.once("error", finished); child.once("exit", finished);
    await event("private-runtime-start-requested").catch(() => {});
  } catch {
    restarting = false;
    if (!stopping) { void event("private-runtime-preflight-unavailable").catch(() => {}); timer = setTimeout(() => { void start(); }, 60_000); }
  }
}
try {
  if (process.platform !== "linux" || process.getuid() === 0) throw Error();
  process.umask(0o077);
  const expected = assertPrivateReleaseDirectory(repository);
  const manifest = JSON.parse(await readFile(join(web, "dist-private/release.json"), "utf8"));
  if (manifest.commit !== expected || manifest.deploymentEligible !== true) throw Error();
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    stopping = true; clearTimeout(timer);
    if (child) child.kill("SIGTERM");
  });
  await start();
} catch { process.stderr.write("Private supervision unavailable; no secret details logged.\n"); process.exitCode = 1; }
