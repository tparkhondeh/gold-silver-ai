// Browser acceptance only. Creates one new isolated database; never connects to
// asha_local, changes cluster roles, copies owner rows or deletes a database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { applyMigrations, readMigrations } from "../db/migrations.ts";
import { phase1Instruments, phase1Sources } from "../data/phase1-registry.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const script = fileURLToPath(import.meta.url);
const privateRoot = join(root, ".cache", "postgres-local");
const checkpoint = join(root, ".cache", "checkpoints", "unified-20260917");
const host = "127.0.0.1", databasePort = 55432, appPort = 4174;
const databasePattern = /^asha_acceptance_[0-9]{14}_[a-f0-9]{8}$/;

export function validateAcceptanceDatabase(value) {
  if (typeof value !== "string" || !databasePattern.test(value)) throw Error("Invalid isolated acceptance database");
  return value;
}
export function acceptanceChildEnvironment(parent, connectionString, database) {
  validateAcceptanceDatabase(database);
  const url = new URL(connectionString);
  if (url.protocol !== "postgresql:" || url.hostname !== host || url.port !== String(databasePort)
    || url.username !== "asha_runtime" || !/^[a-f0-9]{64}$/.test(url.password)
    || url.pathname !== `/${database}` || url.search || url.hash) throw Error("Invalid isolated runtime connection");
  // No spread of the invoking shell, runtime.env, .env.local, provider or Google
  // credentials. Vite's and vinext's dotenv loaders are disabled in the child.
  const osKeys = new Set(["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"]);
  const environment = Object.fromEntries(Object.entries(parent).filter(([key, value]) => osKeys.has(key.toUpperCase()) && typeof value === "string"));
  return { ...environment, NODE_ENV: "development", DATABASE_URL: connectionString, ASHA_ACCEPTANCE_DATABASE: database,
    ASHA_LOCAL_NODE_DEV: "true", ASHA_OPERATOR_COMMIT_ENABLED: "true", ASHA_LOCAL_PORTFOLIO_ENABLED: "true",
    ASHA_MARKET_NETWORK_ENABLED: "false", ASHA_LOCAL_MARKET_TEST_ENABLED: "false", ASHA_MANAGED_MARKET_ENABLED: "false",
    NAVASAN_HISTORY_EXECUTION_ENABLED: "false", ASHA_LOCAL_BACKUP_ENABLED: "false" };
}

async function connect(user, password, database) {
  if (database !== "postgres") validateAcceptanceDatabase(database);
  const client = new Client({ host, port: databasePort, user, password, database,
    connectionTimeoutMillis: 3000, query_timeout: 45_000, statement_timeout: 40_000 });
  await client.connect(); return client;
}
async function readCredentials() {
  const path = join(privateRoot, "credentials.json"), info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw Error("Invalid private local manifest");
  const secret = JSON.parse(await readFile(path, "utf8"));
  if (secret.version !== 1 || secret.port !== databasePort || resolve(secret.dataDirectory) !== resolve(privateRoot, "data")
    || ![secret.admin, secret.owner, secret.runtime].every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) throw Error("Invalid private local manifest");
  return secret;
}
async function requireUnusedPort() {
  const probe = createTcpServer();
  await new Promise((done, reject) => { probe.once("error", reject); probe.listen({ host, port: appPort, exclusive: true }, done); });
  await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
}
async function createIsolatedDatabase(secret, database) {
  validateAcceptanceDatabase(database);
  const admin = await connect("postgres", secret.admin, "postgres");
  try {
    const identity = (await admin.query("SELECT current_database() AS database, current_setting('data_directory') AS directory, current_setting('listen_addresses') AS listeners, current_setting('server_version_num') AS version")).rows[0];
    if (identity.database !== "postgres" || resolve(identity.directory) !== resolve(privateRoot, "data") || identity.listeners !== host || identity.version !== "170011") throw Error("Unexpected local PostgreSQL identity");
    const roles = (await admin.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('asha_owner','asha_runtime')")).rows;
    if (roles.length !== 2 || roles.some(role => role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls || !role.rolcanlogin)
      || (await admin.query("SELECT pg_has_role('asha_runtime','asha_owner','MEMBER') AS member")).rows[0].member) throw Error("Existing role boundary is unsafe");
    if ((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) throw Error("Acceptance target already exists");
    await admin.query(`CREATE DATABASE "${database}" OWNER asha_owner TEMPLATE template0 ENCODING 'UTF8'`);
    await admin.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE "${database}" TO asha_runtime`);
  } finally { await admin.end(); }
}
async function initializeIsolatedDatabase(secret, database) {
  const owner = await connect("asha_owner", secret.owner, database);
  const migrations = await readMigrations();
  try {
    await owner.query("SET search_path TO public");
    await owner.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await applyMigrations(owner, migrations);
    await owner.query("BEGIN");
    for (const instrument of phase1Instruments) await owner.query("INSERT INTO instruments VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [instrument.code, instrument.schemaVersion, instrument.displayName, instrument.assetClass, instrument.canonicalCurrency, instrument.canonicalUnit, instrument.activeFrom, instrument.retiredAt]);
    for (const source of phase1Sources) {
      await owner.query("INSERT INTO sources VALUES ($1,$2,$3,$4,$5,$6)", [source.id, source.schemaVersion, source.displayName, source.quality, source.accessMode, source.active]);
      await owner.query("INSERT INTO source_contract_versions (source_id,version,display_name,quality,access_mode,active) VALUES ($1,$2,$3,$4,$5,$6)", [source.id, source.schemaVersion, source.displayName, source.quality, source.accessMode, source.active]);
    }
    // Same reviewed grants as local-postgres.mjs; scoped to this new database.
    await owner.query("GRANT USAGE ON SCHEMA public TO asha_runtime");
    await owner.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO asha_runtime");
    await owner.query("GRANT INSERT ON ingestion_batches, observations, quarantine_records, validation_results, quarantine_resolutions TO asha_runtime");
    await owner.query("GRANT INSERT ON provider_request_reservations TO asha_runtime");
    await owner.query("GRANT INSERT, UPDATE ON provider_runtime_status TO asha_runtime");
    await owner.query("GRANT INSERT, UPDATE, DELETE ON user_portfolios, portfolio_holdings, portfolio_preferences TO asha_runtime");
    await owner.query("COMMIT");
  } catch (error) { await owner.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await owner.end(); }
  const runtime = await connect("asha_runtime", secret.runtime, database);
  try {
    await runtime.query("SET search_path TO public");
    const identity = (await runtime.query("SELECT current_database() AS database, current_user AS role")).rows[0];
    if (identity.database !== database || identity.role !== "asha_runtime") throw Error("Wrong acceptance runtime target");
    const journal = (await runtime.query("SELECT id,checksum FROM asha_schema_migrations ORDER BY id")).rows;
    assert.deepEqual(journal, migrations.map(({ id, checksum }) => ({ id, checksum })));
    const policies = (await runtime.query(`SELECT count(*)::integer AS tables, bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname IN ('user_portfolios','portfolio_holdings','portfolio_preferences','portfolio_transaction_events','portfolio_valuation_snapshots','portfolio_valuation_positions','portfolio_valuation_transactions')`)).rows[0];
    if (policies.tables !== 7 || !policies.forced) throw Error("Acceptance row-level isolation is missing");
    const grants = (await runtime.query(`SELECT count(*)::integer AS tables,
      bool_and(has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege(current_user,c.oid,'TRUNCATE,TRIGGER') AND NOT pg_has_role(current_user,c.relowner,'MEMBER')) AS safe
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('user_portfolios','portfolio_holdings','portfolio_preferences')`)).rows[0];
    if (grants.tables !== 3 || !grants.safe) throw Error("Acceptance runtime grants are unsafe");
    if ((await runtime.query("SELECT count(*)::integer AS count FROM observations")).rows[0].count !== 0) throw Error("Acceptance observations must start empty");
  } finally { await runtime.end(); }
  return migrations.map(({ id, checksum }) => ({ id, checksum }));
}

async function serve(database) {
  const environment = acceptanceChildEnvironment(process.env, process.env.DATABASE_URL, database);
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(environment, key)) delete process.env[key];
  Object.assign(process.env, environment);
  // Use the existing app/config/plugins, but bypass CLI dotenv loading. Both
  // Vite and the installed vinext plugin explicitly honor envDir:false.
  const { createServer } = await import("vite");
  const server = await createServer({ root: webRoot, configFile: join(webRoot, "vite.config.ts"), envDir: false, logLevel: "silent",
    server: { host, port: appPort, strictPort: true } });
  await server.listen();
  process.send?.({ type: "ready", database, pid: process.pid, url: `http://${host}:${appPort}/` });
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await server.close(); process.exit(0); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop); process.on("disconnect", stop);
}

async function launch() {
  if (process.platform !== "win32") throw Error("This acceptance launcher requires the reviewed Windows runtime");
  await requireUnusedPort();
  const database = validateAcceptanceDatabase(`asha_acceptance_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${randomBytes(4).toString("hex")}`);
  await mkdir(checkpoint, { recursive: true });
  const manifest = join(checkpoint, `${database}.jsonl`);
  const record = (state, detail = {}) => appendFile(manifest, `${JSON.stringify({ at: new Date().toISOString(), state, database, ...detail })}\n`, "utf8");
  await writeFile(manifest, `${JSON.stringify({ at: new Date().toISOString(), state: "planned", database, ownerDatabaseAccess: false, marketNetwork: false, dotenvLoading: false, quoteSeed: "none", retention: "no automatic deletion" })}\n`, { flag: "wx", mode: 0o600 });
  try {
    const secret = await readCredentials();
    await createIsolatedDatabase(secret, database); await record("created");
    const migrations = await initializeIsolatedDatabase(secret, database); await record("schema_verified", { migrations });
    const runtimeUrl = `postgresql://asha_runtime:${secret.runtime}@${host}:${databasePort}/${database}`;
    const child = spawn(process.execPath, ["--experimental-strip-types", script, "--serve", database], {
      cwd: webRoot, windowsHide: true, env: acceptanceChildEnvironment(process.env, runtimeUrl, database),
      // Runtime logs may contain arbitrary dependency errors. Only bounded,
      // explicitly safe lifecycle metadata crosses this process boundary.
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const stop = () => child.kill("SIGTERM");
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
    let ready = false;
    const deadline = setTimeout(stop, 60_000);
    child.on("message", message => {
      if (message?.type !== "ready" || message.database !== database || !Number.isSafeInteger(message.pid) || ready) return;
      ready = true; clearTimeout(deadline);
      void record("browser_ready", { pid: message.pid, url: `http://${host}:${appPort}/` }).catch(() => stop());
      console.log(JSON.stringify({ acceptanceDatabase: database, pid: message.pid, url: `http://${host}:${appPort}/`, syntheticAcceptanceOnly: true, providerNetwork: false }));
    });
    const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", (code, signal) => done(signal ? 1 : code ?? 1)); });
    clearTimeout(deadline); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await record(ready ? "stopped_database_retained" : "startup_failed_database_retained", { exitCode: code });
    process.exitCode = ready ? code : 1;
  } catch {
    await record("failed_no_automatic_cleanup").catch(() => {});
    throw Error("Acceptance launch failed; isolated database, if created, was retained");
  }
}

function selfTest() {
  const database = "asha_acceptance_20000101120000_abcdef12";
  const url = `postgresql://asha_runtime:${"a".repeat(64)}@127.0.0.1:55432/${database}`;
  const child = acceptanceChildEnvironment({ SystemRoot: "C:\\Windows", NAVASAN_API_KEY: "must-not-cross", DATABASE_URL: "must-not-cross", GOOGLE_CLIENT_SECRET: "must-not-cross", NODE_OPTIONS: "must-not-cross" }, url, database);
  assert.equal(child.DATABASE_URL, url); assert.equal(child.SystemRoot, "C:\\Windows");
  for (const key of ["NAVASAN_API_KEY", "GOOGLE_CLIENT_SECRET", "NODE_OPTIONS"]) assert.equal(child[key], undefined);
  for (const name of ["asha_local", "asha_integration", `${database};DROP DATABASE anything`, ""]) assert.throws(() => validateAcceptanceDatabase(name));
  assert.throws(() => acceptanceChildEnvironment({}, url.replace(database, "asha_local"), database));
  assert.throws(() => acceptanceChildEnvironment({}, url.replace("asha_runtime", "postgres"), database));
  assert.equal(child.ASHA_MANAGED_MARKET_ENABLED, "false"); assert.equal(child.ASHA_LOCAL_PORTFOLIO_ENABLED, "true");
  console.log("Acceptance launcher pure safety checks passed; no credentials, database or server accessed.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(script)) {
  try {
    if (process.argv[2] === "--check") selfTest();
    else if (process.argv[2] === "--serve" && process.argv.length === 4 && process.send) await serve(validateAcceptanceDatabase(process.argv[3]));
    else if (process.argv.length === 2) await launch();
    else throw Error("Invalid acceptance launcher command");
  } catch {
    console.error("Isolated acceptance launch failed. Owner data and credentials were not reset; any created acceptance database is retained. Review non-secret checkpoint metadata locally.");
    process.exitCode = 1;
  }
}
