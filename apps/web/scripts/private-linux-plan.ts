/** Fixed project-only preparation policy. No I/O, secrets, enrollment or fallback. */
export const PRIVATE_LINUX_PLAN = Object.freeze({
  account: "wealthos_dev", home: "/home/wealthos_dev", origin: "https://goldsilver.wealthos.ir",
  parent: "/home/wealthos_dev/.asha-private", root: "/home/wealthos_dev/.asha-private/goldsilver",
  tools: "/home/wealthos_dev/.goldsilver-service/tools/postgresql-17.11/bin", version: "17.11",
  data: "/home/wealthos_dev/.asha-private/goldsilver/database",
  log: "/home/wealthos_dev/.asha-private/goldsilver/database.log",
  started: "/home/wealthos_dev/.asha-private/goldsilver/preparation-started.json",
  complete: "/home/wealthos_dev/.asha-private/goldsilver/preparation-complete.json",
  runtime: "/home/wealthos_dev/.asha-private/goldsilver/runtime.json",
  administration: "/home/wealthos_dev/.asha-private/goldsilver/administration.json",
  clusterAdministration: "/home/wealthos_dev/.asha-private/goldsilver/cluster-administration.json",
  host: "127.0.0.1", port: 15432, database: "asha_private", minimumBytes: 8 * 1024 ** 3,
  ownerSubject: "owner-primary-v1", portfolioSubject: "hosted-owner-v1",
  clusterRole: "asha_private_cluster", adminRole: "asha_private_admin", runtimeRole: "asha_private_runtime",
});
export const PRIVATE_RUNTIME_TABLES = Object.freeze([
  "user_portfolios", "portfolio_holdings", "portfolio_preferences", "private_owner_login_transactions", "private_owner_sessions",
  "private_passkey_owners", "private_passkey_credentials", "private_passkey_bootstrap_grants", "private_passkey_challenges",
]);
const invalid = () => new Error("Private preparation policy denied; details withheld");
export function assertPrivatePreparationContext(value: { platform: string; uid: number; homeUid: number; username: string; availableBytes: number; portAvailable: boolean }) {
  if (value.platform !== "linux" || !Number.isSafeInteger(value.uid) || value.uid <= 0 || value.uid !== value.homeUid
    || value.username !== PRIVATE_LINUX_PLAN.account || !Number.isSafeInteger(value.availableBytes) || value.availableBytes < PRIVATE_LINUX_PLAN.minimumBytes
    || value.portAvailable !== true) throw invalid();
}
export function assertPrivateMetadata(value: { uid: number; mode: number; nlink: number; directory: boolean; file: boolean; symlink: boolean }, uid: number, kind: "ancestor" | "directory" | "file" | "tool") {
  if (value.symlink || !Number.isSafeInteger(uid) || uid <= 0 || !Number.isInteger(value.mode) || !Number.isInteger(value.nlink)) throw invalid();
  const mode = value.mode & 0o7777;
  if (kind === "ancestor") {
    if (!value.directory || ![0, uid].includes(value.uid) || (mode & 0o7022) !== 0) throw invalid();
  } else if (kind === "directory") {
    if (!value.directory || value.uid !== uid || mode !== 0o700) throw invalid();
  } else if (kind === "file") {
    if (!value.file || value.uid !== uid || value.nlink !== 1 || mode !== 0o600) throw invalid();
  } else if (!value.file || ![0, uid].includes(value.uid) || value.nlink !== 1 || (mode & 0o7022) !== 0 || (mode & 0o100) === 0) throw invalid();
}
export function privateDatabaseUrl(role: string, password: string, database = PRIVATE_LINUX_PLAN.database): string {
  if (![PRIVATE_LINUX_PLAN.clusterRole, PRIVATE_LINUX_PLAN.adminRole, PRIVATE_LINUX_PLAN.runtimeRole].some(value => value === role) || !/^[a-f0-9]{64}$/.test(password)
    || ![PRIVATE_LINUX_PLAN.database, "postgres"].includes(database)) throw invalid();
  return `postgresql://${role}:${password}@127.0.0.1:15432/${database}`;
}
export function privateRoleSql(role: string, password: string) {
  if (![PRIVATE_LINUX_PLAN.adminRole, PRIVATE_LINUX_PLAN.runtimeRole].some(value => value === role) || !/^[a-f0-9]{64}$/.test(password)) throw invalid();
  // Generated hex only, never user input. Do not log this SQL or a database error.
  return `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${password}'`;
}
export function privateRuntimeGrants() {
  return [
    "REVOKE ALL ON SCHEMA public FROM PUBLIC",
    "GRANT USAGE ON SCHEMA public TO asha_private_runtime",
    "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC",
    "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC",
    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC",
    "GRANT SELECT ON asha_schema_migrations TO asha_private_runtime",
    ...PRIVATE_RUNTIME_TABLES.map(table => `GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO asha_private_runtime`),
  ];
}
export function privatePostgresConfiguration() {
  return `# Generated only for a new project cluster. No inherited network/socket defaults.
listen_addresses = '127.0.0.1'
port = 15432
unix_socket_directories = ''
cluster_name = 'asha-private-project'
password_encryption = 'scram-sha-256'
max_connections = 16
shared_buffers = '64MB'
work_mem = '4MB'
maintenance_work_mem = '64MB'
max_parallel_workers = 0
max_worker_processes = 2
max_wal_size = '512MB'
min_wal_size = '80MB'
temp_file_limit = '256MB'
fsync = on
full_page_writes = on
synchronous_commit = on
logging_collector = off
log_statement = 'none'
log_min_error_statement = 'panic'
log_parameter_max_length = 0
log_parameter_max_length_on_error = 0
log_min_duration_statement = -1
log_min_duration_sample = -1
log_duration = off
log_connections = off
log_disconnections = off
log_error_verbosity = terse
`;
}
export function privatePostgresHba() {
  return `# Only this new project cluster. No trust, socket, remote or replication access.
local all all reject
host postgres asha_private_cluster 127.0.0.1/32 scram-sha-256
host asha_private asha_private_cluster,asha_private_admin,asha_private_runtime 127.0.0.1/32 scram-sha-256
host /^asha_backup_verify_[a-f0-9]{8}$ asha_private_cluster 127.0.0.1/32 scram-sha-256
host all all 0.0.0.0/0 reject
host all all ::/0 reject
host replication all 0.0.0.0/0 reject
host replication all ::/0 reject
`;
}
