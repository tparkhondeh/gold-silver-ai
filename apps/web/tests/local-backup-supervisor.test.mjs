import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startLocalBackupSupervisor, LOCAL_BACKUP_INTERVAL_MS, LOCAL_BACKUP_RETRY_MS } from "../scripts/local-backup-supervisor.ts";
import { createLocalBackupProcessRunner, latestVerifiedLocalBackup, writeLocalBackupStatus } from "../scripts/local-backup-runtime.ts";
import { createLocalBackupPlan, localBackupTables, quoteVerificationDatabase } from "../scripts/local-backup.ts";
import { identityBackupExclusions, transientIdentityTables } from "../scripts/private-backup-policy.ts";

const now = Date.parse("2000-01-02T12:00:00.000Z");
const iso = time => new Date(time).toISOString();
async function temporary(context) {
  const directory = await mkdtemp(join(tmpdir(), "asha-backup-supervisor-test-"));
  context.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
function supervisor(options = {}) {
  let time = now, retained = options.retained ?? null, runs = 0;
  const reports = [], timers = [];
  const control = startLocalBackupSupervisor({
    clock: () => time,
    inspect: async () => { if (options.inspectError) throw Error("PRIVATE metadata path"); return retained; },
    runBackup: async signal => { runs++; if (options.run) return options.run(signal); retained = iso(time); return true; },
    report: async status => { reports.push(status); if (options.reportError) throw Error("PRIVATE status path"); },
    setTimer: (callback, delay) => { const timer = { callback, delay, cleared: false, unref() {} }; timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; },
  });
  return { control, reports, timers, get runs() { return runs; }, setTime(value) { time = value; }, setRetained(value) { retained = value; } };
}

test("recent verified backup is reused until exact daily boundary, then one new backup is required", async () => {
  const s = supervisor({ retained: iso(now - 1000) }); await s.control.check();
  assert.equal(s.runs, 0); assert.equal(s.reports.at(-1).state, "verified");
  assert.equal(s.timers.at(-1).delay, LOCAL_BACKUP_INTERVAL_MS - 1000);
  s.setTime(now + LOCAL_BACKUP_INTERVAL_MS - 1000); await s.control.check();
  assert.equal(s.runs, 1); assert.deepEqual(s.reports.map(item => item.state), ["verified", "running", "verified"]);
  assert.equal(s.timers.at(-1).delay, LOCAL_BACKUP_INTERVAL_MS); s.control.stop();
});

test("missing/old/future/invalid metadata causes immediate backup and failure is safe overdue status", async () => {
  for (const retained of [null, iso(now - LOCAL_BACKUP_INTERVAL_MS), iso(now + 1), "invalid"]) {
    const s = supervisor({ retained, run: async () => { throw Error("PRIVATE raw child output"); } });
    await s.control.check(); assert.equal(s.runs, 1); assert.equal(s.reports.at(-1).state, "overdue");
    assert.equal(s.reports.at(-1).reason, "backup_failed"); assert.equal(s.timers.at(-1).delay, LOCAL_BACKUP_RETRY_MS);
    assert.doesNotMatch(JSON.stringify(s.reports), /PRIVATE/); s.control.stop();
  }
  const s = supervisor({ inspectError: true, run: async () => false }); await s.control.check();
  assert.equal(s.reports[0].reason, "verification_metadata_unavailable"); assert.equal(s.reports.at(-1).state, "overdue"); s.control.stop();
});

test("zero exit alone never certifies a retained dump; reporting failures do not disable future attempts", async () => {
  const s = supervisor({ run: async () => true, reportError: true }); await s.control.check();
  assert.equal(s.runs, 1); assert.equal(s.reports.at(-1).state, "overdue"); assert.equal(s.timers.at(-1).delay, LOCAL_BACKUP_RETRY_MS);
  s.control.stop();
});

test("overlapping checks share one backup and stopping cooperatively cancels without stale publication", async () => {
  let complete, signal;
  const s = supervisor({ run: async value => { signal = value; return new Promise(resolve => { complete = resolve; }); } });
  const one = s.control.check(), two = s.control.check(); assert.equal(one, two);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(s.runs, 1);
  s.control.stop(); assert.equal(signal.aborted, true); complete(true); await one;
  assert.deepEqual(s.reports.map(item => item.state), ["running"]); assert.equal(s.timers.length, 0);
  await s.control.check(); assert.equal(s.runs, 1);
});

async function fixture(root, time = now - 1000, edit = {}) {
  const plan = createLocalBackupPlan(root, new Date(time), "a1b2c3d4"); await mkdir(plan.backupRoot, { recursive: true });
  const data = Buffer.from("SYNTHETIC dump bytes, no real holdings");
  await writeFile(plan.backupPath, data);
  const manifest = { version: 1, database: "asha_local", createdAt: iso(time), backupFile: plan.backupFile, bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"), sourceFingerprint: "b".repeat(64), postgresVersion: "17.11", tablesVerified: localBackupTables.length,
    restoreVerification: "temporary_database_full_restore_and_row_count_match", containsSensitiveData: true,
    encryption: "none_owner_only_windows_acl", retention: "manual_no_automatic_deletion", ...edit };
  await writeFile(plan.manifestPath, JSON.stringify(manifest)); return { plan, data, manifest };
}

test("metadata inspection requires an extant matching dump and current checksum, never private output", async context => {
  const root = await temporary(context); assert.equal(await latestVerifiedLocalBackup(root, now), null);
  const f = await fixture(root); assert.equal(await latestVerifiedLocalBackup(root, now), iso(now - 1000));
  const changed = Buffer.from(f.data); changed[0] ^= 1; await writeFile(f.plan.backupPath, changed);
  assert.equal(changed.length, f.data.length); assert.equal(await latestVerifiedLocalBackup(root, now), null); // Same-size corruption.
  await writeFile(f.plan.backupPath, f.data); assert.equal(await latestVerifiedLocalBackup(root, now), iso(now - 1000));
  await rm(f.plan.backupPath); assert.equal(await latestVerifiedLocalBackup(root, now), null);
});

test("future, incomplete, path-like, invalid or oversized manifests cannot claim a verified backup", async context => {
  for (const edit of [{ createdAt: iso(now + 1) }, { database: "other" }, { backupFile: "../owner.dump" }, { tablesVerified: 24 }, { bytes: 1 }, { sha256: "a".repeat(64) }, { restoreVerification: "not_verified" }]) {
    const root = await temporary(context); await fixture(root, now - 1000, edit); assert.equal(await latestVerifiedLocalBackup(root, now), null);
  }
  const root = await temporary(context), f = await fixture(root);
  await writeFile(f.plan.manifestPath, "x".repeat(16_385)); assert.equal(await latestVerifiedLocalBackup(root, now), null);
  const linkedRoot = await temporary(context); await symlink(join(root, "backups"), join(linkedRoot, "backups"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(latestVerifiedLocalBackup(linkedRoot, now));
});

test("backup status file contains only safe state metadata and does not delete or rotate backups", async context => {
  const root = await temporary(context), f = await fixture(root);
  const status = { version: "asha.local_backup_status.v1", state: "overdue", lastVerifiedAt: null, checkedAt: iso(now), nextDueAt: null, reason: "backup_failed" };
  await writeLocalBackupStatus(root, status); assert.deepEqual(JSON.parse(await readFile(join(root, "backup-status.json"), "utf8")), status);
  await writeLocalBackupStatus(root, { ...status, state: "running", reason: "backup_running" });
  assert.deepEqual(await readFile(f.plan.backupPath), f.data);
  assert.deepEqual((await readdir(root)).sort(), ["backup-status.json", "backups"]);
  await writeFile(join(root, "backup-status.pending"), "unfinished");
  await assert.rejects(writeLocalBackupStatus(root, status)); assert.equal(await readFile(join(root, "backup-status.pending"), "utf8"), "unfinished");
});

function childFixture() {
  const child = new EventEmitter(); child.connected = true; child.messages = [];
  child.send = (message, callback) => { child.messages.push(message); callback?.(); };
  child.kill = () => { throw Error("Must not force-kill backup mid-rename"); };
  return child;
}
test("backup process runner uses fixed hidden local command, suppresses raw output and prevents overlap", async () => {
  const child = childFixture(); let calls = 0;
  const run = createLocalBackupProcessRunner("synthetic-node", "synthetic-backup-script", "synthetic-workdir", (command, args, options) => {
    calls++; assert.equal(command, "synthetic-node"); assert.deepEqual(args, ["--experimental-strip-types", "synthetic-backup-script", "backup"]);
    assert.equal(options.windowsHide, true); assert.equal(options.detached, true); assert.deepEqual(options.stdio, ["ignore", "ignore", "ignore", "ipc"]); return child;
  });
  const controller = new AbortController(); const one = run(controller.signal), two = run(controller.signal); assert.equal(one, two); assert.equal(calls, 1);
  child.emit("exit", 0); assert.equal(await one, true);
  controller.abort(); assert.equal(await run(controller.signal), false); assert.equal(calls, 1);
});

test("five-minute deadline and launcher stop request cooperative cleanup, never force-kill a backup", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const child = childFixture(), run = createLocalBackupProcessRunner("node", "script", "cwd", () => child), controller = new AbortController();
  const pending = run(controller.signal); context.mock.timers.tick(5 * 60_000);
  assert.deepEqual(child.messages, [{ type: "cancel-local-backup" }]);
  controller.abort(); assert.equal(child.messages.length, 2);
  child.emit("exit", 0); assert.equal(await pending, false);
  context.mock.timers.reset();
});

test("backup spawn/exit errors are safe false results and can be retried", async () => {
  const broken = createLocalBackupProcessRunner("node", "script", "cwd", () => { throw Error("PRIVATE child details"); });
  assert.equal(await broken(new AbortController().signal), false);
  const child = childFixture(), run = createLocalBackupProcessRunner("node", "script", "cwd", () => child);
  const pending = run(new AbortController().signal); child.emit("error", Error("PRIVATE")); assert.equal(await pending, false);
});

function backupCommandHarness({ cancelAfter = null, occupiedLock = false } = {}) {
  // Execute only the actual backup functions. Never import the CLI entrypoint,
  // read local credentials, spawn tools or connect to any database in this test.
  const source = readFileSync(new URL("../scripts/local-postgres.mjs", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("async function verifiedBackup("), source.indexOf('\ntry {\n  if (process.platform'));
  const calls = [], files = new Map([["retained-original.dump", "KEEP"]]);
  let cancelled = false, liveCount = 1, snapshotOpen = false, connectedSources = 0;
  const privateRoot = join(tmpdir(), "synthetic-backup-harness-no-io");
  if (occupiedLock) files.set(join(privateRoot, "backup-active.lock"), "OTHER_OWNER");
  const dependencies = {
    privateRoot, join, identityBackupExclusions, transientIdentityTables, privateDirectory: async () => {}, start: async () => {},
    open: async (path, flags) => { assert.equal(flags, "wx"); if (files.has(path)) throw Error("exists"); files.set(path, "LOCK"); return { async close() {} }; },
    assertBackupActive: () => { if (cancelled) throw Error("safe cancellation"); },
    createLocalBackupPlan, randomBytes: () => Buffer.from("a1b2c3d4", "hex"), quoteVerificationDatabase,
    mkdir: async () => {}, exists: async path => files.has(path),
    url: (user, _password, db) => `${user}/${db}`,
    connect: async (target, timeout) => {
      assert.equal(timeout, 30_000); calls.push(["connect", target]);
      if (target === "postgres/asha_local") connectedSources++;
      return { async query(sql) {
        calls.push([target, sql]);
        if (sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") { snapshotOpen = true; return {}; }
        if (sql === "SELECT pg_export_snapshot() AS snapshot") { assert.equal(snapshotOpen, true); return { rows: [{ snapshot: "00000001-00000002-1" }] }; }
        if (sql.startsWith("SELECT 1 FROM pg_database")) return { rowCount: 0 };
        if (sql.includes("SELECT id,checksum")) return { rows: [{ id: "synthetic", checksum: "a".repeat(64) }] };
        if (sql.includes("count(*)::text")) return { rows: [{ count: String(target === "postgres/asha_local" ? snapshotOpen ? 1 : liveCount : 1) }] };
        return { rows: [], rowCount: 0 };
      }, async end() { calls.push(["end", target]); if (target === "postgres/asha_local") snapshotOpen = false; } };
    },
    verifyActivation: async (_client, options) => { assert.deepEqual(options, { allowPendingMigrations: true }); },
    runWithPassword: (name, args) => {
      calls.push([name, args]);
      if (name === "pg_dump") { assert.ok(snapshotOpen); assert.ok(identityBackupExclusions.every(flag => args.includes(flag))); assert.equal(args[args.indexOf("--snapshot") + 1], "00000001-00000002-1"); files.set(args[args.indexOf("--file") + 1], "DUMP"); liveCount = 99; }
      if (name === cancelAfter) cancelled = true;
    },
    localBackupTables, stat: async () => ({ size: 4 }), fileFingerprint: async () => "a".repeat(64), sourceFingerprint: async () => "b".repeat(64),
    writeFile: async (path, raw) => { files.set(path, raw); },
    rename: async (from, to) => { calls.push(["rename", from, to]); files.set(to, files.get(from)); files.delete(from); },
    unlink: async path => { calls.push(["unlink", path]); files.delete(path); },
    port: 55432, console: { log: value => calls.push(["log", value]) },
  };
  const execute = new Function(...Object.keys(dependencies), `${code}; return verifiedBackup;`)(...Object.values(dependencies));
  return { execute: () => execute({ admin: "synthetic", runtime: "synthetic" }), calls, files, get connectedSources() { return connectedSources; }, get snapshotOpen() { return snapshotOpen; } };
}

test("actual backup command dumps and compares one exported snapshot while live owner writes continue", async () => {
  const h = backupCommandHarness(); await h.execute();
  assert.equal(h.connectedSources, 1); assert.equal(h.snapshotOpen, false);
  assert.equal(h.calls.filter(call => call[0] === "pg_dump").length, 1); assert.equal(h.calls.filter(call => call[0] === "pg_restore").length, 1);
  assert.equal(h.calls.filter(call => typeof call[1] === "string" && call[1].includes("count(*)::text")).length, 50);
  assert.equal(h.files.get("retained-original.dump"), "KEEP");
  assert.equal([...h.files.keys()].filter(path => path.endsWith(".dump")).length, 2);
  assert.equal([...h.files.keys()].some(path => path.endsWith(".lock") || path.endsWith(".tmp")), false);
  assert.ok(h.calls.some(call => typeof call[1] === "string" && call[1].startsWith("DROP DATABASE")));
});

test("actual command cancellation cleans temporary files and verification DB but retains original backups", async () => {
  for (const cancelAfter of ["pg_dump", "pg_restore"]) {
    const h = backupCommandHarness({ cancelAfter }); await assert.rejects(h.execute(), /safe cancellation/);
    assert.equal(h.snapshotOpen, false); assert.deepEqual([...h.files], [["retained-original.dump", "KEEP"]]);
    assert.equal(h.calls.some(call => call[0] === "rename"), false);
    if (cancelAfter === "pg_restore") assert.ok(h.calls.some(call => typeof call[1] === "string" && call[1].startsWith("DROP DATABASE")));
  }
  const locked = backupCommandHarness({ occupiedLock: true }); await assert.rejects(locked.execute(), /exists/);
  assert.equal(locked.calls.length, 0); assert.ok([...locked.files.keys()].some(path => path.endsWith("backup-active.lock")));
});
