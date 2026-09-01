// Project-owned Windows PostgreSQL only. Never installs a service, opens a
// firewall, resets a database, or prints credentials. Runtime files are ignored.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, writeFile, unlink, readdir, rename, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { applyMigrations, readMigrations } from "../db/migrations.ts";
import { probeObservationDatabase } from "../db/postgres-runtime.ts";
import { phase1Instruments, phase1Sources } from "../data/phase1-registry.ts";
import { createLocalBackupPlan, localBackupTables, quoteVerificationDatabase } from "./local-backup.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const runtime = join(root, ".cache", "postgres-17.11", "runtime", "bin");
const privateRoot = join(root, ".cache", "postgres-local");
const data = join(privateRoot, "data");
const secretFile = join(privateRoot, "credentials.json");
const evidenceFile = join(privateRoot, "integration-evidence.json");
const port = 55432;
const command = process.argv[2] ?? "status";
const exists = async (path) => { try { await access(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } };
const binary = (name) => join(runtime, `${name}.exe`);
const run = (name, args) => execFileSync(binary(name), args, { windowsHide: true, stdio: "pipe", timeout: 60_000 }).toString();
const runWithPassword = (name, args, password, timeout = 120_000) => execFileSync(binary(name), args, { windowsHide: true, stdio: "pipe", timeout, env: { ...process.env, PGPASSWORD: password } }).toString();
const connect = async (connectionString) => {
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  await client.connect();
  return client;
};

function windowsIdentity() {
  const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true, stdio: "pipe" }).toString();
  const sid = identity.match(/S-1-5-[0-9-]+/)?.[0];
  if (!sid) throw new Error("Cannot identify current Windows account");
  return { sid, identity };
}
async function privateDirectory() {
  const { sid } = windowsIdentity();
  await mkdir(privateRoot, { recursive: true });
  execFileSync("icacls.exe", [privateRoot, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { windowsHide: true, stdio: "pipe" });
}

async function sourceFingerprint() {
  const files = ["scripts/local-postgres.mjs", "package-lock.json"];
  for (const folder of ["db", "data", "tests/integration"]) {
    for (const file of await readdir(join(webRoot, folder), { recursive: true, withFileTypes: true })) {
      if (file.isFile() && /\.(ts|mjs|sql)$/.test(file.name)) files.push(join(file.parentPath, file.name));
    }
  }
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(await readFile(resolve(webRoot, file), "utf8"));
  return hash.digest("hex");
}

async function fileFingerprint(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyActivation(client) {
  const expected = await readMigrations();
  const stored = (await client.query("SELECT id,checksum FROM asha_schema_migrations ORDER BY id")).rows;
  if (stored.length !== expected.length || stored.some((row, index) => row.id !== expected[index].id || row.checksum !== expected[index].checksum)) throw new Error("Migration journal does not match reviewed SQL");
  const grants = await client.query(`SELECT bool_and(
    has_table_privilege(current_user,c.oid,'SELECT')
    AND NOT pg_has_role(current_user,c.relowner,'MEMBER')
    AND CASE
      WHEN c.relname IN ('instruments','sources','asha_schema_migrations','source_contract_versions','artifact_versions','dataset_observations','decision_records','decision_assumptions','decision_features','source_reconciliations','source_reconciliation_candidates','portfolio_transaction_events','portfolio_valuation_snapshots','portfolio_valuation_positions','portfolio_valuation_transactions')
        THEN NOT has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
      WHEN c.relname IN ('user_portfolios','portfolio_holdings','portfolio_preferences')
        THEN has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE')
          AND NOT has_table_privilege(current_user,c.oid,'TRUNCATE,TRIGGER')
      ELSE has_table_privilege(current_user,c.oid,'INSERT')
        AND NOT has_table_privilege(current_user,c.oid,'UPDATE,DELETE,TRUNCATE,TRIGGER')
      END
    ) AS safe, count(*)::integer AS tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN
      ('instruments','sources','asha_schema_migrations','ingestion_batches','observations','quarantine_records','validation_results','quarantine_resolutions','user_portfolios','portfolio_holdings','portfolio_preferences','source_contract_versions','artifact_versions','dataset_observations','decision_records','decision_assumptions','decision_features','source_reconciliations','source_reconciliation_candidates','portfolio_transaction_events','portfolio_valuation_snapshots','portfolio_valuation_positions','portfolio_valuation_transactions','provider_request_reservations')`);
  if (grants.rows[0]?.safe !== true || grants.rows[0]?.tables !== 24) throw new Error("Runtime table privileges do not match the least-privilege contract");
  const portfolioPolicies = await client.query(`SELECT count(*)::integer AS tables, bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('user_portfolios','portfolio_holdings','portfolio_preferences','portfolio_transaction_events','portfolio_valuation_snapshots','portfolio_valuation_positions','portfolio_valuation_transactions')`);
  if (portfolioPolicies.rows[0]?.tables !== 7 || portfolioPolicies.rows[0]?.forced !== true) throw new Error("Portfolio row-level security is missing or not forced");
  const triggerNames = ["observations_are_immutable", "quarantine_records_are_immutable", "validation_results_are_immutable", "quarantine_resolutions_are_immutable", "ingestion_batches_are_immutable", "observation_contract_before_insert", "observations_cannot_be_truncated", "batches_cannot_be_truncated", "quarantine_cannot_be_truncated", "validations_cannot_be_truncated", "resolutions_cannot_be_truncated", "source_contract_versions_are_immutable", "artifact_versions_are_immutable", "dataset_observations_are_immutable", "decision_records_are_immutable", "decision_assumptions_are_immutable", "decision_features_are_immutable", "source_contract_versions_cannot_be_truncated", "artifact_versions_cannot_be_truncated", "dataset_observations_cannot_be_truncated", "decision_records_cannot_be_truncated", "decision_assumptions_cannot_be_truncated", "decision_features_cannot_be_truncated", "source_reconciliations_are_immutable", "source_reconciliation_candidates_are_immutable", "source_reconciliations_cannot_be_truncated", "source_reconciliation_candidates_cannot_be_truncated", "portfolio_transaction_correction_before_insert", "portfolio_transactions_are_immutable", "portfolio_valuations_are_immutable", "portfolio_valuation_positions_are_immutable", "portfolio_valuation_transactions_are_immutable", "portfolio_transactions_cannot_be_truncated", "portfolio_valuations_cannot_be_truncated", "portfolio_valuation_positions_cannot_be_truncated", "portfolio_valuation_transactions_cannot_be_truncated", "portfolio_valuation_parent_before_insert", "portfolio_valuation_position_lineage_before_insert", "portfolio_valuation_transaction_owner_before_insert", "provider_request_reservations_are_immutable", "provider_request_reservations_cannot_be_truncated"];
  const triggers = (await client.query("SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')")).rows.map((row) => row.tgname);
  if (triggerNames.some((name) => !triggers.includes(name))) throw new Error("Required integrity trigger missing or disabled");
  const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
  const age = Date.now() - Date.parse(evidence.completedAt);
  if (evidence.fingerprint !== await sourceFingerprint() || !Number.isFinite(age) || age < 0 || age > 86_400_000) throw new Error("Successful current-source integration evidence is required before activation");
}

async function credentials(create = false) {
  if (!await exists(secretFile)) {
    if (!create || await exists(data)) throw new Error("Missing credentials; existing data will not be reset");
    await privateDirectory();
    const password = () => randomBytes(32).toString("hex");
    await writeFile(secretFile, JSON.stringify({ version: 1, dataDirectory: data, port, admin: password(), owner: password(), runtime: password() }), { flag: "wx", mode: 0o600 });
  }
  const secret = JSON.parse(await readFile(secretFile, "utf8"));
  if (secret.version !== 1 || resolve(secret.dataDirectory) !== resolve(data) || secret.port !== port || ![secret.admin, secret.owner, secret.runtime].every((v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))) {
    throw new Error("Local database manifest is invalid; refusing to modify it");
  }
  return secret;
}
const url = (user, password, db) => `postgresql://${user}:${password}@127.0.0.1:${port}/${db}`;

async function start(secret) {
  if (!await exists(join(data, "PG_VERSION"))) {
    if (await exists(data)) throw new Error("Incomplete cluster exists; manual inspection required, no reset");
    const passwordFile = join(privateRoot, "init-password.tmp");
    await writeFile(passwordFile, secret.admin, { flag: "wx", mode: 0o600 });
    try {
      run("initdb", ["-D", data, "-U", "postgres", "--pwfile", passwordFile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C", "--data-checksums"]);
      // Newly initialized project-owned file only; no existing configuration is overwritten.
      await writeFile(join(data, "postgresql.conf"), `\nlisten_addresses = '127.0.0.1'\nport = ${port}\ntimezone = 'UTC'\nlog_timezone = 'UTC'\npassword_encryption = 'scram-sha-256'\nmax_connections = 20\nshared_buffers = '64MB'\n`, { flag: "a" });
    } finally { await unlink(passwordFile); }
  }
  if ((await readFile(join(data, "PG_VERSION"), "utf8")).trim() !== "17") throw new Error("Unexpected PostgreSQL major version");
  try { run("pg_ctl", ["status", "-D", data]); }
  catch { run("pg_ctl", ["start", "-D", data, "-l", join(privateRoot, "postgres.log"), "-w", "-t", "30"]); }
  const admin = await connect(url("postgres", secret.admin, "postgres"));
  try {
    const result = await admin.query("SELECT current_setting('data_directory') AS directory, current_setting('listen_addresses') AS listeners");
    if (resolve(result.rows[0].directory) !== resolve(data) || result.rows[0].listeners !== "127.0.0.1") throw new Error("Database identity or network boundary mismatch");
  } finally { await admin.end(); }
}

async function initialize(secret) {
  await start(secret);
  const admin = await connect(url("postgres", secret.admin, "postgres"));
  try {
    for (const [role, password] of [["asha_owner", secret.owner], ["asha_runtime", secret.runtime]]) {
      const found = await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
      if (!found.rowCount) await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    }
    for (const [db, owner] of [["asha_local", "asha_owner"], ["asha_integration", "postgres"]]) {
      if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [db])).rowCount) await admin.query(`CREATE DATABASE ${db} OWNER ${owner}`);
      await admin.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
    }
    await admin.query("GRANT CONNECT ON DATABASE asha_local TO asha_runtime");
    await admin.query("ALTER ROLE asha_runtime SET search_path TO public");
  } finally { await admin.end(); }
  const owner = await connect(url("asha_owner", secret.owner, "asha_local"));
  try {
    await owner.query("SET search_path TO public");
    await owner.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    const applied = await applyMigrations(owner, await readMigrations());
    await owner.query("BEGIN");
    for (const i of phase1Instruments) await owner.query("INSERT INTO instruments VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (code) DO NOTHING", [i.code,i.schemaVersion,i.displayName,i.assetClass,i.canonicalCurrency,i.canonicalUnit,i.activeFrom,i.retiredAt]);
    for (const s of phase1Sources) {
      await owner.query("INSERT INTO sources VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING", [s.id,s.schemaVersion,s.displayName,s.quality,s.accessMode,s.active]);
      await owner.query(`INSERT INTO source_contract_versions (source_id,version,display_name,quality,access_mode,active)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (source_id,version) DO NOTHING`, [s.id,s.schemaVersion,s.displayName,s.quality,s.accessMode,s.active]);
    }
    await owner.query("GRANT USAGE ON SCHEMA public TO asha_runtime");
    await owner.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO asha_runtime");
    await owner.query("GRANT INSERT ON ingestion_batches, observations, quarantine_records, validation_results, quarantine_resolutions TO asha_runtime");
    await owner.query("GRANT INSERT ON provider_request_reservations TO asha_runtime");
    await owner.query("GRANT INSERT, UPDATE, DELETE ON user_portfolios, portfolio_holdings, portfolio_preferences TO asha_runtime");
    await owner.query("COMMIT");
    console.log(JSON.stringify({ localDatabase: "asha_local", testDatabase: "asha_integration", migrationsApplied: applied, syntheticMarketRowsSeeded: 0 }));
  } finally { await owner.end(); }
}

async function configure(secret) {
  const runtimeClient = await connect(url("asha_runtime", secret.runtime, "asha_local"));
  try {
    if ((await probeObservationDatabase(runtimeClient)).state !== "connected") throw new Error("Runtime health gate failed");
    await verifyActivation(runtimeClient);
  } finally { await runtimeClient.end(); }
  const envPath = join(webRoot, ".env.local");
  const existing = await exists(envPath) ? await readFile(envPath, "utf8") : "";
  const parsed = parseEnv(existing);
  const runtimeUrl = url("asha_runtime", secret.runtime, "asha_local");
  if ([parsed.DATABASE_URL, process.env.DATABASE_URL].some((value) => value && value !== runtimeUrl)) throw new Error("A different database is configured; refusing to redirect it");
  // Never rewrite the user's .env.local. The protected runtime environment is
  // opt-in at server startup, and contains no market-provider credentials.
  const runtimeEnvPath = join(privateRoot, "runtime.env");
  const legacyContents = `DATABASE_URL=${runtimeUrl}\nASHA_OPERATOR_COMMIT_ENABLED=true\n`;
  const contents = `${legacyContents}ASHA_LOCAL_PORTFOLIO_ENABLED=true\n`;
  if (await exists(runtimeEnvPath)) {
    const current = await readFile(runtimeEnvPath, "utf8");
    if (current === legacyContents) await writeFile(runtimeEnvPath, contents, { mode: 0o600 });
    else if (current !== contents) throw new Error("Existing runtime environment differs; manual review required");
  } else await writeFile(runtimeEnvPath, contents, { flag: "wx", mode: 0o600 });
  console.log("Protected runtime.env prepared; load it explicitly when starting the local server. Existing .env.local is unchanged. Portfolio authentication remains a separate gate.");
}

async function verifiedBackup(secret) {
  await start(secret);
  await privateDirectory();
  const createdAt = new Date();
  const plan = createLocalBackupPlan(privateRoot, createdAt, randomBytes(4).toString("hex"));
  const verificationDatabase = quoteVerificationDatabase(plan.verificationDatabase);
  await mkdir(plan.backupRoot, { recursive: true });
  for (const path of [plan.backupPath, plan.manifestPath, plan.temporaryBackupPath, plan.temporaryManifestPath]) {
    if (await exists(path)) throw new Error("Backup target already exists");
  }
  let verificationCreated = false;
  let completedBackup = null;
  try {
    const runtimeClient = await connect(url("asha_runtime", secret.runtime, "asha_local"));
    try { await verifyActivation(runtimeClient); }
    finally { await runtimeClient.end(); }

    runWithPassword("pg_dump", [
      "--host", "127.0.0.1", "--port", port.toString(), "--username", "postgres",
      "--dbname", "asha_local", "--no-password", "--format", "custom",
      "--compress", "6", "--no-owner", "--no-privileges", "--file", plan.temporaryBackupPath,
    ], secret.admin);

    const controller = await connect(url("postgres", secret.admin, "postgres"));
    try {
      if ((await controller.query("SELECT 1 FROM pg_database WHERE datname=$1", [plan.verificationDatabase])).rowCount) {
        throw new Error("Verification database already exists");
      }
      await controller.query(`CREATE DATABASE ${verificationDatabase}`);
      verificationCreated = true;
      await controller.query(`REVOKE CONNECT ON DATABASE ${verificationDatabase} FROM PUBLIC`);
    } finally { await controller.end(); }

    runWithPassword("pg_restore", [
      "--host", "127.0.0.1", "--port", port.toString(), "--username", "postgres",
      "--dbname", plan.verificationDatabase, "--no-password", "--exit-on-error",
      "--single-transaction", "--no-owner", "--no-privileges", plan.temporaryBackupPath,
    ], secret.admin);

    let source;
    let restored;
    try {
      source = await connect(url("postgres", secret.admin, "asha_local"));
      restored = await connect(url("postgres", secret.admin, plan.verificationDatabase));
      const expectedMigrations = (await source.query("SELECT id,checksum FROM asha_schema_migrations ORDER BY id")).rows;
      const restoredMigrations = (await restored.query("SELECT id,checksum FROM asha_schema_migrations ORDER BY id")).rows;
      if (JSON.stringify(restoredMigrations) !== JSON.stringify(expectedMigrations)) throw new Error("Restored migration journal differs");
      for (const table of localBackupTables) {
        const sourceCount = (await source.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows[0]?.count;
        const restoredCount = (await restored.query(`SELECT count(*)::text AS count FROM public."${table}"`)).rows[0]?.count;
        if (sourceCount !== restoredCount) throw new Error("Restored table count differs");
      }
    } finally {
      if (source) await source.end();
      if (restored) await restored.end();
    }

    const backupStat = await stat(plan.temporaryBackupPath);
    const sha256 = await fileFingerprint(plan.temporaryBackupPath);
    const manifest = {
      version: 1,
      database: "asha_local",
      createdAt: createdAt.toISOString(),
      backupFile: plan.backupFile,
      bytes: backupStat.size,
      sha256,
      sourceFingerprint: await sourceFingerprint(),
      postgresVersion: "17.11",
      tablesVerified: localBackupTables.length,
      restoreVerification: "temporary_database_full_restore_and_row_count_match",
      containsSensitiveData: true,
      encryption: "none_owner_only_windows_acl",
      retention: "manual_no_automatic_deletion",
    };
    await writeFile(plan.temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(plan.temporaryBackupPath, plan.backupPath);
    await rename(plan.temporaryManifestPath, plan.manifestPath);
    completedBackup = { backupCreated: plan.backupFile, manifestCreated: plan.manifestFile, bytes: backupStat.size, sha256, fullRestoreVerified: true, tablesVerified: localBackupTables.length };
  } finally {
    try {
      if (verificationCreated) {
        const controller = await connect(url("postgres", secret.admin, "postgres"));
        try { await controller.query(`DROP DATABASE ${verificationDatabase} WITH (FORCE)`); }
        finally { await controller.end(); }
      }
    } finally {
      for (const path of [plan.temporaryBackupPath, plan.temporaryManifestPath]) if (await exists(path)) await unlink(path);
    }
  }
  console.log(JSON.stringify(completedBackup));
}

try {
  if (process.platform !== "win32") throw new Error("This local bootstrap is Windows-specific");
  if (!["init", "start", "status", "stop", "test", "configure", "backup"].includes(command)) throw new Error("Unknown local database command");
  // A sandbox identity and the interactive Windows owner are different users.
  // Do not create private storage under a temporary account or repair its ACLs.
  if (/codexsandbox/i.test(windowsIdentity().identity)) throw new Error("Run local PostgreSQL setup as the Windows owner, not a temporary sandbox account");
  if (!run("postgres", ["--version"]).includes("17.11")) throw new Error("Expected reviewed PostgreSQL 17.11 runtime");
  const secret = await credentials(command === "init");
  if (command === "init") await initialize(secret);
  else if (command === "start") { await start(secret); console.log("Project PostgreSQL started on 127.0.0.1:55432."); }
  else if (command === "stop") { run("pg_ctl", ["stop", "-D", data, "-m", "fast", "-w", "-t", "30"]); console.log("Project PostgreSQL stopped cleanly; data preserved."); }
  else if (command === "configure") await configure(secret);
  else if (command === "backup") await verifiedBackup(secret);
  else if (command === "test") {
    await start(secret);
    if (await exists(evidenceFile)) await unlink(evidenceFile);
    execFileSync(process.execPath, ["--experimental-strip-types", "--test", "tests/integration/*.test.mjs"], { cwd: webRoot, windowsHide: true, stdio: "inherit", env: { ...process.env, ASHA_PG_BIN: runtime, ASHA_TEST_DATABASE_URL: url("postgres", secret.admin, "asha_integration") }, timeout: 120_000 });
    await writeFile(evidenceFile, JSON.stringify({ fingerprint: await sourceFingerprint(), completedAt: new Date().toISOString(), database: "asha_integration" }), { mode: 0o600 });
  } else {
    const client = await connect(url("asha_runtime", secret.runtime, "asha_local"));
    try { console.log(JSON.stringify(await probeObservationDatabase(client))); } finally { await client.end(); }
  }
} catch {
  console.error("Local PostgreSQL operation failed. Existing data and secrets were not reset. Inspect the project-owned server log privately; do not paste credentials.");
  process.exitCode = 1;
}
