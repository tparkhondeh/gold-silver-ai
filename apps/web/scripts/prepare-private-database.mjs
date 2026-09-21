// Preparation is explicit: fresh, or one reviewed empty-initialization recovery.
// Never run as part of application startup; never resume initialized PG files.
// No enrollment, provider keys, existing portfolio, proxy, cron or public listener.
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, statfs } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { userInfo } from "node:os";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { readMigrations, applyMigrations } from "../db/migrations.ts";
import { probePrivatePortfolioDatabase } from "../auth/private-database-readiness.ts";
import { parsePrivateServerConfig, parsePrivateAdministrationConfig, readPrivateServerConfig, readPrivateAdministrationConfig, readPrivateClusterAdministrationConfig } from "./private-server-config.ts";
import { PRIVATE_LINUX_PLAN as plan, PRIVATE_RUNTIME_TABLES, assertPrivatePreparationContext, assertPrivateMetadata,
  privateDatabaseUrl, privateRoleSql, privateRuntimeGrants, privatePostgresConfiguration, privatePostgresHba } from "./private-linux-plan.ts";
import { INITIALIZATION_ATTEMPT_MARKER, assertEmptyInitializationLayout, inspectRetainedInitialization, privateInitdbInvocation } from "./private-empty-initialization.ts";

const metadata = stat => ({ uid: stat.uid, mode: stat.mode, nlink: stat.nlink, directory: stat.isDirectory(), file: stat.isFile(), symlink: stat.isSymbolicLink() });
const failure = () => Error("Private database preparation unconfirmed; details withheld");
async function missing(path) {
  try { await lstat(path); return false; } catch (error) { if (error?.code === "ENOENT") return true; throw failure(); }
}
async function checked(path, uid, kind) { assertPrivateMetadata(metadata(await lstat(path)), uid, kind); }
async function privateDirectory(path, uid) {
  if (await missing(path)) await mkdir(path, { mode: 0o700 }); // Not recursive; exact reviewed parents only.
  await checked(path, uid, "directory");
}
async function exclusiveFile(path, contents, uid) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { assertPrivateMetadata(metadata(await file.stat()), uid, "file"); await file.writeFile(contents); await file.sync(); }
  finally { await file.close(); }
}
async function replaceGeneratedConfig(path, contents, uid) {
  // Only initdb's freshly generated files inside this invocation's new cluster.
  if (![join(plan.data, "postgresql.conf"), join(plan.data, "pg_hba.conf")].includes(path)) throw failure();
  await checked(plan.data, uid, "directory");
  const file = await open(path, constants.O_WRONLY | constants.O_NOFOLLOW);
  try { assertPrivateMetadata(metadata(await file.stat()), uid, "file"); await file.truncate(0); await file.writeFile(contents); await file.sync(); }
  finally { await file.close(); }
}
async function portAvailable() {
  const server = createServer();
  return new Promise(resolve => { server.once("error", () => resolve(false)); server.listen(plan.port, plan.host, () => server.close(() => resolve(true))); });
}
const processEnvironment = Object.freeze({ PATH: `${plan.tools}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" });
function command(name, args, input, timeout) {
  try { return execFileSync(join(plan.tools, name), args, { cwd: plan.root, env: processEnvironment, input, timeout, maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).toString().trim(); }
  catch { throw failure(); } // Never print child output, argv, SQL or credentials.
}

export function runPrivateInitdb(password, execute = execFileSync) {
  if (!/^[a-f0-9]{64}$/.test(password)) throw failure();
  const invocation = privateInitdbInvocation();
  try {
    // Node's exec input may be a socket. cat supplies a genuine pipe that initdb
    // can reopen as /dev/stdin; no password enters shell text, argv or a file.
    execute(invocation.executable, invocation.args, { cwd: plan.root, env: processEnvironment, input: Buffer.from(password + "\n"),
      timeout: 120_000, maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  } catch { throw failure(); }
}

async function retainedEmptyInitialization(uid, claimedAttempt = false) {
  const paths = { parent: plan.parent, root: plan.root, database: plan.data, started: plan.started,
    runtime: plan.runtime, administration: plan.administration, clusterAdministration: plan.clusterAdministration };
  const retainedMetadata = {};
  for (const [key, path] of Object.entries(paths)) {
    const info = metadata(await lstat(path));
    assertPrivateMetadata(info, uid, ["parent", "root", "database"].includes(key) ? "directory" : "file");
    retainedMetadata[key] = info;
  }
  assertEmptyInitializationLayout({ uid, metadata: retainedMetadata, entries: await readdir(plan.root), databaseEntries: await readdir(plan.data),
    ...(claimedAttempt ? { claimedAttempt: metadata(await lstat(INITIALIZATION_ATTEMPT_MARKER)) } : {}) });
  const marker = await open(plan.started, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let started;
  try {
    const info = await marker.stat(); assertPrivateMetadata(metadata(info), uid, "file");
    if (info.size < 1 || info.size > 512) throw failure();
    const buffer = Buffer.alloc(513), result = await marker.read(buffer, 0, buffer.length, 0);
    if (result.bytesRead !== info.size || result.bytesRead > 512) throw failure();
    started = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, result.bytesRead)));
  } finally { await marker.close(); }
  const [runtime, administration, clusterAdministration] = await Promise.all([
    readPrivateServerConfig(), readPrivateAdministrationConfig(), readPrivateClusterAdministrationConfig(),
  ]);
  return inspectRetainedInitialization({ started, runtime, administration, clusterAdministration }, Date.now());
}

export async function preparePrivateDatabase(mode = "prepare") {
  if (!["prepare", "resume-empty-initialization"].includes(mode)) throw failure();
  const uid = process.getuid?.();
  if (process.platform !== "linux" || !Number.isInteger(uid) || uid <= 0 || userInfo().username !== plan.account) throw failure();
  process.umask(0o077);
  for (const path of ["/", "/home", plan.home]) await checked(path, uid, "ancestor");
  const home = await lstat(plan.home), space = await statfs(plan.home);
  assertPrivatePreparationContext({ platform: process.platform, uid, homeUid: home.uid, username: userInfo().username,
    availableBytes: space.bavail * space.bsize, portAvailable: await portAvailable() });
  // Validate the already installed project tools, never install or repair them.
  for (let path = plan.tools; path !== plan.home; path = dirname(path)) await checked(path, uid, "ancestor");
  for (const name of ["initdb", "pg_ctl", "postgres", "pg_dump", "pg_restore"]) await checked(join(plan.tools, name), uid, "tool");
  const migrations = await readMigrations();
  if (migrations.length < 14 || !migrations.some(value => value.id === "0014_owner_passkeys.sql")) throw failure();
  if (mode === "prepare") {
    await privateDirectory(plan.parent, uid); await privateDirectory(plan.root, uid);
    for (const path of [plan.data, plan.log, plan.started, plan.complete, plan.runtime, plan.administration, plan.clusterAdministration, INITIALIZATION_ATTEMPT_MARKER]) if (!await missing(path)) throw failure();
  } else { await checked(plan.parent, uid, "directory"); await checked(plan.root, uid, "directory"); }
  for (const name of ["initdb", "pg_ctl", "postgres", "pg_dump", "pg_restore"]) if (command(name, ["--version"], undefined, 5000) !== `${name} (PostgreSQL) ${plan.version}`) throw failure();
  let clusterPassword, adminPassword, runtimePassword;
  if (mode === "prepare") {
    // Exclusive persistent marker serializes fresh preparations. Never remove it.
    await exclusiveFile(plan.started, JSON.stringify({ version: 1, state: "preparing", startedAt: new Date().toISOString() }), uid);
    clusterPassword = randomBytes(32).toString("hex"); adminPassword = randomBytes(32).toString("hex"); runtimePassword = randomBytes(32).toString("hex");
    const runtime = { version: 2, authentication: "passkey", origin: plan.origin, ownerSubject: plan.ownerSubject, portfolioSubject: plan.portfolioSubject, databaseUrl: privateDatabaseUrl(plan.runtimeRole, runtimePassword) };
    const administration = { version: 1, databaseUrl: privateDatabaseUrl(plan.adminRole, adminPassword) };
    parsePrivateServerConfig(JSON.stringify(runtime)); parsePrivateAdministrationConfig(JSON.stringify(administration));
    await exclusiveFile(plan.clusterAdministration, JSON.stringify({ version: 1, databaseUrl: privateDatabaseUrl(plan.clusterRole, clusterPassword) }), uid);
    await exclusiveFile(plan.administration, JSON.stringify(administration), uid);
    await exclusiveFile(plan.runtime, JSON.stringify(runtime), uid);
    await mkdir(plan.data, { mode: 0o700 }); await checked(plan.data, uid, "directory");
  } else {
    ({ clusterPassword, adminPassword, runtimePassword } = await retainedEmptyInitialization(uid));
  }
  // Both fresh and resumed invocations claim the same persistent exclusive
  // attempt. This also prevents a resume racing a fresh process before initdb.
  await exclusiveFile(INITIALIZATION_ATTEMPT_MARKER, JSON.stringify({ version: 1, state: "initializing", mode, attemptedAt: new Date().toISOString() }), uid);
  const retained = await retainedEmptyInitialization(uid, true);
  if (retained.clusterPassword !== clusterPassword || retained.adminPassword !== adminPassword || retained.runtimePassword !== runtimePassword
    || !await portAvailable()) throw failure();
  runPrivateInitdb(clusterPassword);
  await replaceGeneratedConfig(join(plan.data, "postgresql.conf"), privatePostgresConfiguration(), uid);
  await replaceGeneratedConfig(join(plan.data, "pg_hba.conf"), privatePostgresHba(), uid);
  await exclusiveFile(plan.log, "", uid);
  command("pg_ctl", ["-D", plan.data, "-l", plan.log, "-w", "-t", "30", "start"], undefined, 40_000);
  const pools = [];
  const connect = (role, password, database) => {
    const pool = new Pool({ host: plan.host, port: plan.port, database, user: role, password, ssl: false,
      max: 1, connectionTimeoutMillis: 3000, query_timeout: 35_000, statement_timeout: 30_000, idle_in_transaction_session_timeout: 10_000,
      options: "-c search_path=public", application_name: "asha-private-preparation" });
    pool.on("error", () => {}); pools.push(pool); return pool;
  };
  try {
    const cluster = connect(plan.clusterRole, clusterPassword, "postgres"), control = await cluster.connect();
    try {
      const identity = await control.query("SELECT current_user AS role, current_database() AS database, current_setting('data_directory') AS data, current_setting('port') AS port, current_setting('listen_addresses') AS listen");
      const row = identity.rows[0];
      if (row?.role !== plan.clusterRole || row.database !== "postgres" || row.data !== plan.data || row.port !== String(plan.port) || row.listen !== plan.host) throw failure();
      await control.query(privateRoleSql(plan.adminRole, adminPassword));
      await control.query(privateRoleSql(plan.runtimeRole, runtimePassword));
      await control.query("CREATE DATABASE asha_private OWNER asha_private_admin TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");
      await control.query("REVOKE ALL ON DATABASE asha_private FROM PUBLIC");
      await control.query("GRANT CONNECT ON DATABASE asha_private TO asha_private_admin, asha_private_runtime");
      await control.query("REVOKE CONNECT ON DATABASE postgres FROM PUBLIC");
    } finally { control.release(); }
    const verification = connect(plan.clusterRole, clusterPassword, plan.database);
    // Explicit ownership from the fresh cluster administrator; do not depend on
    // implicit pg_database_owner membership for the NOINHERIT migration role.
    await verification.query("ALTER SCHEMA public OWNER TO asha_private_admin");
    await verification.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    const administrationPool = connect(plan.adminRole, adminPassword, plan.database), admin = await administrationPool.connect();
    try {
      await applyMigrations(admin, migrations);
      await admin.query("BEGIN");
      try { for (const sql of privateRuntimeGrants()) await admin.query(sql); await admin.query("COMMIT"); }
      catch { await admin.query("ROLLBACK"); throw failure(); }
    } finally { admin.release(); }
    const runtimePool = connect(plan.runtimeRole, runtimePassword, plan.database), runtimeClient = await runtimePool.connect();
    try { const ready = await probePrivatePortfolioDatabase(runtimeClient, migrations); if (ready.state !== "ready") throw failure(); }
    finally { runtimeClient.release(); }
    for (const table of PRIVATE_RUNTIME_TABLES) {
      const result = await verification.query(`SELECT count(*) AS count FROM public.${table}`); // Fixed allowlist, never caller text.
      if (result.rows[0]?.count !== "0") throw failure();
    }
    for (const path of [plan.runtime, plan.administration, plan.clusterAdministration, plan.log, plan.started]) await checked(path, uid, "file");
    await checked(plan.data, uid, "directory");
    await exclusiveFile(plan.complete, JSON.stringify({ version: 1, state: "prepared", completedAt: new Date().toISOString(), port: plan.port, migrations: migrations.map(({ id, checksum }) => ({ id, checksum })), privateTablesEmpty: true, runtimeReadiness: "ready", enrollment: "not-created" }), uid);
  } finally { for (const pool of pools) await pool.end().catch(() => {}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv.slice(2).join(" ");
    if (!["--prepare", "--resume-empty-initialization"].includes(mode)) throw failure();
    await preparePrivateDatabase(mode.slice(2));
    process.stdout.write("Private empty project database prepared on fixed loopback port. Runtime readiness verified. No owner enrollment, portfolio transfer or application activation.\n");
  } catch {
    process.stderr.write("Private database preparation unconfirmed. Partial project files/database/listener, if any, are preserved; do not rerun or reset automatically. No login is enabled by this script.\n");
    process.exitCode = 1;
  }
}
