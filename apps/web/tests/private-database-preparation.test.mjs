import assert from "node:assert/strict";
import { constants, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as policy from "../scripts/private-linux-plan.ts";
import * as initialization from "../scripts/private-empty-initialization.ts";
import * as configuration from "../scripts/private-server-config.ts";

// Execute the actual preparation controller against an isolated memory filesystem,
// fake process/tools/PG and public fixture passwords. No OS/DB/network side effects.
const plan = policy.PRIVATE_LINUX_PLAN, uid = 1001;
const source = readFileSync(new URL("../scripts/prepare-private-database.mjs", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.slice(0, source.lastIndexOf("\nif (process.argv[1]")),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness({ fresh = false, initdbFails = false, portBusy = false } = {}) {
  const entries = new Map(), calls = { writes: [], initdb: 0, pg: 0, random: 0, ports: 0 };
  const put = (path, text = null, change = {}) => entries.set(path, { text, uid, mode: text === null ? 0o40700 : 0o100600, nlink: text === null ? 2 : 1, symlink: false, ...change });
  const error = code => Object.assign(Error("synthetic filesystem failure"), { code });
  const info = path => { const entry = entries.get(path); if (!entry) throw error("ENOENT"); return { ...entry, size: entry.text === null ? 0 : Buffer.byteLength(entry.text), isDirectory: () => entry.text === null, isFile: () => entry.text !== null, isSymbolicLink: () => entry.symlink }; };
  for (const path of ["/", "/home", plan.home]) put(path);
  for (let path = plan.tools; path !== plan.home; path = posix.dirname(path)) put(path);
  for (const name of ["initdb", "pg_ctl", "postgres", "pg_dump", "pg_restore"]) put(posix.join(plan.tools, name), "public executable fixture", { mode: 0o100755 });
  if (!fresh) {
    put(plan.parent); put(plan.root); put(plan.data);
    put(plan.started, JSON.stringify({ version: 1, state: "preparing", startedAt: new Date(Date.now() - 1000).toISOString() }));
    put(plan.runtime, JSON.stringify({ version: 2, authentication: "passkey", origin: plan.origin, ownerSubject: plan.ownerSubject, portfolioSubject: plan.portfolioSubject, databaseUrl: policy.privateDatabaseUrl(plan.runtimeRole, "c".repeat(64)) }));
    put(plan.administration, JSON.stringify({ version: 1, databaseUrl: policy.privateDatabaseUrl(plan.adminRole, "b".repeat(64)) }));
    put(plan.clusterAdministration, JSON.stringify({ version: 1, databaseUrl: policy.privateDatabaseUrl(plan.clusterRole, "a".repeat(64)) }));
  }
  const fs = {
    lstat: async path => info(path),
    statfs: async () => ({ bavail: 9 * 1024 ** 3, bsize: 1 }),
    readdir: async path => { if (!info(path).isDirectory()) throw error("ENOTDIR"); return [...entries.keys()].filter(value => posix.dirname(value) === path && value !== path).map(value => posix.basename(value)); },
    mkdir: async path => { if (entries.has(path)) throw error("EEXIST"); put(path); calls.writes.push(path); },
    open: async (path, flags) => {
      if (flags & constants.O_CREAT) { if (entries.has(path) && flags & constants.O_EXCL) throw error("EEXIST"); put(path, ""); calls.writes.push(path); }
      const entry = entries.get(path); if (!entry) throw error("ENOENT");
      if (entry.symlink || entry.text === null) throw error("EINVAL");
      return { stat: async () => info(path), close: async () => {}, sync: async () => {},
        read: async (buffer, offset, length) => { const bytes = Buffer.from(entry.text); bytes.copy(buffer, offset, 0, length); return { bytesRead: Math.min(bytes.length, length) }; },
        truncate: async () => { entry.text = ""; calls.writes.push(path); },
        writeFile: async text => { entry.text = text.toString(); calls.writes.push(path); } };
    },
  };
  const execute = (executable, args) => {
    if (args.length === 1 && args[0] === "--version") return Buffer.from(`${posix.basename(executable)} (PostgreSQL) ${plan.version}`);
    if (executable === "/bin/bash") {
      calls.initdb++; assert.equal(args.includes("--no-clean"), true);
      assert.equal([...entries.keys()].some(path => posix.dirname(path) === plan.data), false);
      put(posix.join(plan.data, "PG_VERSION"), "17\n");
      if (initdbFails) throw Error("synthetic initdb failure");
      put(posix.join(plan.data, "postgresql.conf"), "generated"); put(posix.join(plan.data, "pg_hba.conf"), "generated");
    } else assert.equal(posix.basename(executable), "pg_ctl");
    return Buffer.alloc(0);
  };
  class Pool {
    on() {} async end() {} async connect() { return { query: this.query.bind(this), release() {} }; }
    async query(sql) { calls.pg++; if (sql.startsWith("SELECT current_user")) return { rows: [{ role: plan.clusterRole, database: "postgres", data: plan.data, port: String(plan.port), listen: plan.host }] };
      return { rows: sql.startsWith("SELECT count(*)") ? [{ count: "0" }] : [] }; }
  }
  const reads = {
    readPrivateServerConfig: async () => configuration.parsePrivateServerConfig(entries.get(plan.runtime)?.text ?? ""),
    readPrivateAdministrationConfig: async () => configuration.parsePrivateAdministrationConfig(entries.get(plan.administration)?.text ?? ""),
    readPrivateClusterAdministrationConfig: async () => configuration.parsePrivateClusterAdministrationConfig(entries.get(plan.clusterAdministration)?.text ?? ""),
  };
  const modules = {
    "node:fs": { constants }, "node:fs/promises": fs, "node:path": posix, "node:url": { fileURLToPath }, "node:os": { userInfo: () => ({ username: plan.account }) },
    "node:crypto": { randomBytes: () => Buffer.alloc(32, ++calls.random) }, "node:child_process": { execFileSync: execute }, pg: { Pool },
    "node:net": { createServer: () => { const events = {}; return { once(name, callback) { events[name] = callback; }, listen(_port, _host, callback) { calls.ports++; if (portBusy) events.error(); else callback(); }, close(callback) { callback(); } }; } },
    "../db/migrations.ts": { readMigrations: async () => Array.from({ length: 14 }, (_, index) => ({ id: index === 13 ? "0014_owner_passkeys.sql" : `${String(index + 1).padStart(4, "0")}_fixture.sql`, checksum: "a".repeat(64) })), applyMigrations: async () => {} },
    "../auth/private-database-readiness.ts": { probePrivatePortfolioDatabase: async () => ({ state: "ready" }) },
    "./private-server-config.ts": { ...configuration, ...reads }, "./private-linux-plan.ts": policy, "./private-empty-initialization.ts": initialization,
  };
  const commonJs = { exports: {} }, fakeProcess = { getuid: () => uid, platform: "linux", umask() {}, argv: [] };
  new Function("require", "module", "exports", "process", compiled)(name => { if (!Object.hasOwn(modules, name)) throw Error("Unexpected test dependency"); return modules[name]; }, commonJs, commonJs.exports, fakeProcess);
  return { entries, calls, put, prepare: commonJs.exports.preparePrivateDatabase };
}

test("actual controller resumes exact empty state without rewriting retained configs or regenerating passwords", async () => {
  const fixture = harness(), paths = [plan.started, plan.runtime, plan.administration, plan.clusterAdministration];
  const before = paths.map(path => fixture.entries.get(path).text);
  await fixture.prepare("resume-empty-initialization");
  assert.deepEqual(paths.map(path => fixture.entries.get(path).text), before);
  assert.ok(paths.every(path => !fixture.calls.writes.includes(path))); assert.equal(fixture.calls.random, 0);
  assert.equal(fixture.calls.initdb, 1); assert.ok(fixture.calls.pg > 0);
  assert.ok(fixture.entries.has(initialization.INITIALIZATION_ATTEMPT_MARKER)); assert.ok(fixture.entries.has(plan.complete));
});

test("actual controller rejects PG files, any log/completion/attempt, unknown entries, unsafe metadata and bad retained documents without writes", async () => {
  const changes = [fixture => fixture.put(posix.join(plan.data, "PG_VERSION"), "17"), fixture => fixture.put(plan.log, ""), fixture => fixture.put(plan.complete, "{}"),
    fixture => fixture.put(initialization.INITIALIZATION_ATTEMPT_MARKER, "{}"), fixture => fixture.put(posix.join(plan.root, "unknown"), ""),
    fixture => { fixture.entries.get(plan.data).symlink = true; }, fixture => { fixture.entries.get(plan.runtime).mode = 0o100640; },
    fixture => { fixture.entries.get(plan.started).nlink = 2; }, fixture => { fixture.entries.get(plan.started).text = "malformed"; },
    fixture => { fixture.entries.get(plan.runtime).text = "{}"; }];
  for (const change of changes) { const fixture = harness(); change(fixture); const before = structuredClone([...fixture.entries]);
    await assert.rejects(fixture.prepare("resume-empty-initialization")); assert.equal(fixture.calls.writes.length, 0); assert.equal(fixture.calls.initdb, 0); assert.equal(fixture.calls.pg, 0); assert.deepEqual([...fixture.entries], before); }
  const occupied = harness({ portBusy: true }); await assert.rejects(occupied.prepare("resume-empty-initialization")); assert.equal(occupied.calls.writes.length, 0);
});

test("fresh mode cannot touch retained partial state, but a truly fresh start shares the exclusive attempt gate", async () => {
  const retained = harness(); await assert.rejects(retained.prepare("prepare")); assert.equal(retained.calls.writes.length, 0); assert.equal(retained.calls.initdb, 0);
  const fresh = harness({ fresh: true }); await fresh.prepare("prepare"); assert.equal(fresh.calls.random, 3); assert.equal(fresh.calls.initdb, 1);
  assert.ok(fresh.entries.has(initialization.INITIALIZATION_ATTEMPT_MARKER));
});

test("two concurrent resumes initialize once; failed initdb retains attempt and new PG files and rejects another attempt", async () => {
  const fixture = harness(), outcomes = await Promise.allSettled([fixture.prepare("resume-empty-initialization"), fixture.prepare("resume-empty-initialization")]);
  assert.equal(outcomes.filter(value => value.status === "fulfilled").length, 1); assert.equal(fixture.calls.initdb, 1);
  const failed = harness({ initdbFails: true }); await assert.rejects(failed.prepare("resume-empty-initialization"));
  assert.ok(failed.entries.has(initialization.INITIALIZATION_ATTEMPT_MARKER)); assert.ok(failed.entries.has(posix.join(plan.data, "PG_VERSION")));
  assert.equal(failed.entries.has(plan.complete), false); await assert.rejects(failed.prepare("resume-empty-initialization")); assert.equal(failed.calls.initdb, 1);
});
