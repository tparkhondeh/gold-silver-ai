import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PRIVATE_LINUX_PLAN as plan, PRIVATE_RUNTIME_TABLES, assertPrivatePreparationContext, assertPrivateMetadata, privateDatabaseUrl, privateRoleSql, privateRuntimeGrants, privatePostgresConfiguration, privatePostgresHba } from "../scripts/private-linux-plan.ts";
import { parsePrivateServerConfig, parsePrivateAdministrationConfig } from "../scripts/private-server-config.ts";

const context = { platform: "linux", uid: 1001, homeUid: 1001, username: "wealthos_dev", availableBytes: 8 * 1024 ** 3, portAvailable: true };
const directory = { uid: 1001, mode: 0o40700, nlink: 2, directory: true, file: false, symlink: false };
const file = { uid: 1001, mode: 0o100600, nlink: 1, directory: false, file: true, symlink: false };

test("private preparation has one fixed project root, cluster, port and nonlocal subject binding", () => {
  assert.equal(plan.data, "/home/wealthos_dev/.asha-private/goldsilver/database"); assert.equal(plan.port, 15432); assert.equal(plan.host, "127.0.0.1");
  assert.equal(plan.ownerSubject, "owner-primary-v1"); assert.equal(plan.portfolioSubject, "hosted-owner-v1"); assert.equal(plan.version, "17.11");
  for (const key of ["data", "log", "started", "complete", "runtime", "administration", "clusterAdministration"]) assert.ok(plan[key].startsWith(plan.root + "/"));
  assert.equal(Object.isFrozen(plan), true); assert.equal(new Set(PRIVATE_RUNTIME_TABLES).size, 9);
});

test("only intended nonroot Linux account, home owner, free port and at least8GiB can prepare", () => {
  assert.doesNotThrow(() => assertPrivatePreparationContext(context));
  for (const change of [{ platform: "win32" }, { uid: 0 }, { uid: -1 }, { uid: 1.5 }, { homeUid: 0 }, { username: "other" }, { portAvailable: false }, { availableBytes: plan.minimumBytes - 1 }, { availableBytes: Infinity }, { availableBytes: NaN }]) assert.throws(() => assertPrivatePreparationContext({ ...context, ...change }), /details withheld/);
});

test("private paths must be exact700/600, owner-only and nonlinked without repair", () => {
  assert.doesNotThrow(() => assertPrivateMetadata(directory, 1001, "directory")); assert.doesNotThrow(() => assertPrivateMetadata(file, 1001, "file"));
  for (const change of [{ uid: 0 }, { mode: 0o750 }, { mode: 0o1700 }, { directory: false }, { symlink: true }]) assert.throws(() => assertPrivateMetadata({ ...directory, ...change }, 1001, "directory"));
  for (const change of [{ uid: 0 }, { mode: 0o640 }, { mode: 0o1600 }, { file: false }, { symlink: true }, { nlink: 2 }]) assert.throws(() => assertPrivateMetadata({ ...file, ...change }, 1001, "file"));
});

test("ancestors/tools reject hostile ownership, links, write permission and executable privilege bits", () => {
  assert.doesNotThrow(() => assertPrivateMetadata({ ...directory, uid: 0, mode: 0o755 }, 1001, "ancestor"));
  assert.doesNotThrow(() => assertPrivateMetadata({ ...file, uid: 0, mode: 0o755 }, 1001, "tool"));
  for (const change of [{ uid: 999 }, { mode: 0o777 }, { mode: 0o4755 }, { symlink: true }, { directory: false }]) assert.throws(() => assertPrivateMetadata({ ...directory, ...change }, 1001, "ancestor"));
  for (const change of [{ uid: 999 }, { mode: 0o777 }, { mode: 0o4755 }, { mode: 0o644 }, { symlink: true }, { nlink: 2 }]) assert.throws(() => assertPrivateMetadata({ ...file, mode: 0o755, ...change }, 1001, "tool"));
});

test("only generated-form secrets and fixed roles/databases can enter password SQL or URLs", () => {
  const secret = "a".repeat(64);
  assert.equal(new URL(privateDatabaseUrl(plan.runtimeRole, secret)).port, "15432");
  assert.match(privateRoleSql(plan.adminRole, secret), /^CREATE ROLE asha_private_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '/);
  for (const role of ["postgres", plan.clusterRole, "x;DROP ROLE x"]) assert.throws(() => privateRoleSql(role, secret));
  for (const password of ["", "short", "'" + secret, "b".repeat(63), "A".repeat(64)]) { assert.throws(() => privateDatabaseUrl(plan.runtimeRole, password)); assert.throws(() => privateRoleSql(plan.runtimeRole, password)); }
  assert.throws(() => privateDatabaseUrl(plan.runtimeRole, secret, "owner_local"));
});

test("generated runtime/admin shapes match actual exact private configuration parsers", () => {
  const runtime = { version: 2, authentication: "passkey", origin: plan.origin, ownerSubject: plan.ownerSubject, portfolioSubject: plan.portfolioSubject, databaseUrl: privateDatabaseUrl(plan.runtimeRole, "a".repeat(64)) };
  const admin = { version: 1, databaseUrl: privateDatabaseUrl(plan.adminRole, "b".repeat(64)) };
  assert.deepEqual(parsePrivateServerConfig(JSON.stringify(runtime)), runtime); assert.deepEqual(parsePrivateAdministrationConfig(JSON.stringify(admin)), admin);
  assert.throws(() => parsePrivateServerConfig(JSON.stringify({ ...runtime, databaseUrl: admin.databaseUrl })));
});

test("runtime grants are exactly journalSELECT and nine private tableCRUD, never membership or broad powers", () => {
  const grants = privateRuntimeGrants().filter(sql => sql.startsWith("GRANT"));
  assert.equal(grants.length, 11); assert.ok(grants.includes("GRANT SELECT ON asha_schema_migrations TO asha_private_runtime"));
  for (const table of PRIVATE_RUNTIME_TABLES) assert.ok(grants.includes(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO asha_private_runtime`));
  assert.ok(grants.every(sql => !/\b(?:ALL|TRUNCATE|TRIGGER|REFERENCES|CREATE|MEMBER)\b/.test(sql)));
  assert.ok(privateRuntimeGrants().includes("REVOKE ALL ON SCHEMA public FROM PUBLIC"));
});

test("cluster has no public/socket/trust paths and no credential-bearing query or parameter logs", () => {
  const config = privatePostgresConfiguration(), hba = privatePostgresHba();
  assert.match(config, /listen_addresses = '127\.0\.0\.1'/); assert.match(config, /port = 15432/); assert.match(config, /unix_socket_directories = ''/);
  assert.match(config, /log_statement = 'none'/); assert.match(config, /log_min_error_statement = 'panic'/); assert.match(config, /log_parameter_max_length_on_error = 0/);
  assert.match(config, /fsync = on/); assert.match(config, /synchronous_commit = on/); assert.match(config, /max_connections = 16/);
  const rules = hba.split("\n").filter(line => line && !line.startsWith("#"));
  assert.equal(rules.filter(line => !line.endsWith("reject")).length, 3); assert.ok(rules.filter(line => !line.endsWith("reject")).every(line => line.endsWith("127.0.0.1/32 scram-sha-256")));
});

test("backup restore HBA admits only exact disposable names for the cluster role on loopback SCRAM", () => {
  // PostgreSQL17 HBA uses one leading slash; the remainder is the regex, not
  // JavaScript /pattern/ syntax. No trailing slash belongs in the database token.
  const line = privatePostgresHba().split("\n").find(value => value.startsWith("host /"));
  assert.equal(line, "host /^asha_backup_verify_[a-f0-9]{8}$ asha_private_cluster 127.0.0.1/32 scram-sha-256");
  const [kind, database, role, address, method] = line.split(" ");
  assert.equal(kind, "host"); assert.equal(role, plan.clusterRole); assert.equal(address, "127.0.0.1/32"); assert.equal(method, "scram-sha-256");
  assert.equal(database.endsWith("/"), false); const pattern = new RegExp(database.slice(1));
  for (const name of ["asha_backup_verify_00000000", "asha_backup_verify_0123abcd", "asha_backup_verify_ffffffff"]) assert.equal(pattern.test(name), true);
  for (const name of ["asha_private", "postgres", "asha_backup_verify_ABCDEF12", "asha_backup_verify_1234567", "asha_backup_verify_123456789", "asha_backup_verify_1234ghij", "prefix_asha_backup_verify_12345678", "asha_backup_verify_12345678_extra"]) assert.equal(pattern.test(name), false);
  assert.equal(privatePostgresHba().split("\n").filter(value => value.startsWith("host /")).length, 1);
});

test("preparation source retains exclusive creation, stdin secret, bounded commands and readiness before completion", () => {
  const source = readFileSync(new URL("../scripts/prepare-private-database.mjs", import.meta.url), "utf8");
  const initialization = readFileSync(new URL("../scripts/private-empty-initialization.ts", import.meta.url), "utf8");
  assert.match(source, /O_EXCL \| constants\.O_NOFOLLOW/); assert.match(initialization, /"--pwfile", "\/dev\/stdin"/); assert.match(source, /randomBytes\(32\)/);
  assert.ok(source.indexOf("await exclusiveFile(plan.started") < source.indexOf("runPrivateInitdb(clusterPassword)"));
  assert.ok(source.indexOf("probePrivatePortfolioDatabase(runtimeClient") < source.indexOf("await exclusiveFile(plan.complete"));
  assert.doesNotMatch(source, /process\.env|\b(?:unlink|rm|chmod|chown)\(|shell:\s*true|stdio:\s*["']inherit|console\./);
  assert.doesNotMatch(source, /bootstrapToken|issueGrant|resetCredentials|5432\b|3012\b/);
  assert.match(source, /No owner enrollment, portfolio transfer or application activation/);
});
