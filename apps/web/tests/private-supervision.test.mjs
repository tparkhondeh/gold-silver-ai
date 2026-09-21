import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { EventEmitter } from "node:events";
import { PRIVATE_DATA_ROOT, PRIVATE_PG_BIN, PRIVATE_PG_LOG, planPrivateSupervision, assertPrivateReleaseDirectory, isEmptyPrivateCrontab, assertPrivateLogMetadata } from "../scripts/private-supervision.ts";

const release = "/home/wealthos_dev/.goldsilver-service/releases/" + "a".repeat(40);
test("private supervision preserves all unrelated jobs and pins one reviewed release", () => {
  const existing = "# Unrelated synthetic job\n5 3 * * * /usr/bin/true\n";
  const plan = planPrivateSupervision(existing, release);
  assert.equal(plan.previous, existing); assert.ok(plan.next.startsWith(existing));
  assert.equal(plan.next.match(/@reboot/g).length, 1);
  assert.equal(plan.next.match(/\/usr\/bin\/flock -n/g).length, 2);
  assert.equal(plan.next.match(/17 3 \* \* \* /g).length, 1);
  assert.ok(plan.next.includes(`17 3 * * * /usr/local/bin/node --experimental-strip-types ${release}/apps/web/scripts/private-server-backup.mjs >/dev/null 2>&1\n`));
  assert.doesNotMatch(plan.next, /PGPASSWORD|DATABASE_URL|bootstrap|rm |\benv /);
  assert.match(plan.next, /\/usr\/local\/bin\/node --experimental-strip-types/);
  assert.equal(assertPrivateReleaseDirectory(release), "a".repeat(40));
  assert.ok(planPrivateSupervision("# no newline", release).next.startsWith("# no newline\n"));
  assert.ok(planPrivateSupervision("", release).next.startsWith("# BEGIN"));
});

test("only exact C-locale no-crontab result means an empty owner schedule", () => {
  const empty = { status: 1, signal: null, stdout: "", stderr: "no crontab for wealthos_dev\n" };
  assert.equal(isEmptyPrivateCrontab(empty), true);
  for (const change of [{ status: 0 }, { status: 2 }, { signal: "SIGTERM" }, { code: "ETIMEDOUT" }, { stdout: "partial job" }, { stderr: "no crontab for another\n" }, { stderr: "permission denied\n" }, { stderr: "no crontab for wealthos_dev\nwarning\n" }, { stderr: "" }]) assert.equal(isEmptyPrivateCrontab({ ...empty, ...change }), false);
  for (const value of [null, undefined, "no crontab", {}, new Error("No crontab")]) assert.equal(isEmptyPrivateCrontab(value), false);
});

test("prepared PostgreSQL log policy requires exact private ordinary single-link file", () => {
  const value = { file: true, symlink: false, uid: 1001, mode: 0o100600, nlink: 1 };
  assert.equal(PRIVATE_PG_LOG, `${PRIVATE_DATA_ROOT}/database.log`);
  assert.doesNotThrow(() => assertPrivateLogMetadata(value, 1001));
  for (const change of [{ file: false }, { symlink: true }, { uid: 0 }, { nlink: 2 }, { mode: 0o100640 }, { mode: 0o101600 }, { mode: 0o100400 }]) assert.throws(() => assertPrivateLogMetadata({ ...value, ...change }, 1001));
  for (const uid of [0, -1, 1.5, NaN]) assert.throws(() => assertPrivateLogMetadata(value, uid));
});

// Execute the shipped entry with synthetic process/files/commands. No actual
// crontab, private path, database, server or child process is touched by this lane.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function executeEntry(filename, dependencies) {
  const source = (await readFile(new URL(`../scripts/${filename}`, import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("import.meta.url", JSON.stringify(`file://${release}/apps/web/scripts/${filename}`));
  return new AsyncFunction(...Object.keys(dependencies), source)(...Object.values(dependencies));
}
const logStat = (change = {}) => ({ uid: 1001, mode: 0o100600, nlink: 1, dev: 7, ino: 9, size: 12, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, ...change });
async function supervisorHarness(options = {}) {
  const commands = [], opened = [], timers = [], masks = [], output = [], children = [], signals = {};
  const process = { platform: "linux", getuid: () => 1001, execPath: "/usr/local/bin/node", umask: value => masks.push(value), once: (name, callback) => { signals[name] = callback; }, stderr: { write: value => output.push(value) } };
  await executeEntry("supervise-private-service.mjs", {
    constants, PRIVATE_DATA_ROOT, PRIVATE_PG_BIN, PRIVATE_PG_LOG, assertPrivateReleaseDirectory, assertPrivateLogMetadata, process,
    resolve: posix.resolve, join: posix.join, fileURLToPath: () => `${release}/apps/web/`,
    readPrivateServerConfig: async () => ({ version: 2, databaseUrl: "postgresql://synthetic:withheld@127.0.0.1:15432/asha_private" }),
    readFile: async path => path.endsWith("release.json") ? JSON.stringify({ commit: "a".repeat(40), deploymentEligible: true }) : "17\n",
    lstat: async path => {
      if (path === PRIVATE_PG_LOG) { if (options.missing) throw Error("Synthetic absent log"); return logStat(options.pathStat); }
      return { isDirectory: () => true, isSymbolicLink: () => false, uid: 1001, mode: 0o40700 };
    },
    open: async (path, flags, mode) => {
      opened.push({ path, flags, mode });
      return { stat: async () => logStat(path === PRIVATE_PG_LOG ? options.descriptorStat : {}), close: async () => {}, write: async () => {} };
    },
    execFileSync: (path, args, settings) => { commands.push({ path, args, settings }); if (args[0] === "status" && !options.running) throw Object.assign(Error("Synthetic stopped"), { status: options.status ?? 3 }); return ""; },
    spawn: (...args) => { const child = new EventEmitter(); child.kill = signal => { child.lastSignal = signal; }; children.push({ child, args }); return child; },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout: () => {},
  });
  return { commands, opened, timers, masks, output, children, signals, process };
}

test("executed supervisor restarts only through the prepared protected log and restrictive umask", async () => {
  const result = await supervisorHarness();
  assert.deepEqual(result.masks, [0o077]);
  assert.deepEqual(result.commands.map(value => value.args[0]), ["status", "start"]);
  const start = result.commands[1];
  assert.equal(start.args[start.args.indexOf("-l") + 1], PRIVATE_PG_LOG);
  const log = result.opened.find(value => value.path === PRIVATE_PG_LOG);
  assert.equal(log.flags & constants.O_TRUNC, 0); assert.equal(log.flags & constants.O_CREAT, 0);
  assert.equal(result.children.length, 1); assert.equal(result.timers.length, 0);
  result.signals.SIGTERM(); assert.equal(result.children[0].child.lastSignal, "SIGTERM");
});

test("executed supervisor refuses absent, linked, unsafe or replaced logs without starting PostgreSQL", async () => {
  for (const options of [{ missing: true }, { pathStat: { isSymbolicLink: () => true } }, { pathStat: { nlink: 2 } }, { pathStat: { uid: 0 } }, { pathStat: { mode: 0o100644 } }, { descriptorStat: { ino: 10 } }, { descriptorStat: { dev: 8 } }, { descriptorStat: { mode: 0o100640 } }]) {
    const result = await supervisorHarness(options);
    assert.deepEqual(result.commands.map(value => value.args[0]), ["status"]); assert.equal(result.children.length, 0);
    assert.equal(result.timers[0].delay, 60_000);
    assert.ok(result.opened.every(value => value.path === PRIVATE_PG_LOG || value.path.endsWith("service-events.log")));
  }
});

test("executed supervisor preserves a running cluster and retries unknown pg_ctl failures without starting another", async () => {
  const running = await supervisorHarness({ running: true });
  assert.deepEqual(running.commands.map(value => value.args[0]), ["status"]); assert.equal(running.children.length, 1);
  assert.equal(running.opened.some(value => value.path === PRIVATE_PG_LOG), false);
  const failed = await supervisorHarness({ status: 1 }); assert.equal(failed.children.length, 0); assert.equal(failed.timers[0].delay, 60_000);
  running.children[0].child.emit("exit"); assert.equal(running.timers[0].delay, 15_000);
});

async function installationHarness(options = {}) {
  const calls = [], writes = [], output = [], errors = [], masks = [];
  let schedule = options.existing ?? "# Existing synthetic job\n5 3 * * * /usr/bin/true\n", reads = 0, ended = false;
  const process = { argv: ["node", "installer", "--activate-reviewed-release"], platform: "linux", getuid: () => 1001, env: {}, umask: value => masks.push(value), stdout: { write: value => output.push(value) }, stderr: { write: value => errors.push(value) } };
  await executeEntry("install-private-supervision.mjs", {
    constants, PRIVATE_DATA_ROOT, planPrivateSupervision, assertPrivateReleaseDirectory, isEmptyPrivateCrontab, process,
    resolve: posix.resolve, join: posix.join, fileURLToPath: () => `${release}/apps/web/`,
    Pool: class { on() {} async end() { ended = true; } },
    readPrivateServerConfig: async () => ({ version: 2, databaseUrl: "postgresql://synthetic:withheld@127.0.0.1:15432/asha_private" }),
    assertPrivateProcessEnvironment: () => {}, probePrivatePortfolioDatabase: async () => ({ state: "ready" }), readMigrations: async () => [],
    verifyRetainedPrivateBackup: async value => { calls.push({ kind: "verify-backup", value }); if (options.invalidBackup) throw Error("Synthetic missing/corrupt backup"); return {}; },
    readFile: async () => JSON.stringify({ commit: "a".repeat(40), deploymentEligible: true }),
    open: async (path, flags, mode) => { calls.push({ kind: "open", path, flags, mode }); return { writeFile: async contents => writes.push({ path, contents }), sync: async () => {}, close: async () => {} }; },
    execFileSync: (path, args, settings) => {
      calls.push({ kind: "command", path, args, settings });
      if (path === "git") return args.includes("rev-parse") ? "a".repeat(40) : args.includes("branch") ? "codex/phase-2-decision-engine" : "";
      if (args[0] === "-") { schedule = settings.input; return ""; }
      reads++;
      if (options.cronFailure) throw options.cronFailure;
      if (options.concurrentChange && reads === 2) return schedule + "# Concurrent operator change\n";
      if (schedule === "") throw { status: 1, signal: null, stdout: "", stderr: "no crontab for wealthos_dev\n" };
      return schedule;
    },
  });
  return { calls, writes, output, errors, masks, process, ended, schedule };
}

test("executed installer verifies retained artifact before lock or cron writes, preserving exact prior jobs", async () => {
  const result = await installationHarness();
  assert.equal(result.process.exitCode, undefined); assert.equal(result.ended, true); assert.deepEqual(result.masks, [0o077]);
  const verified = result.calls.findIndex(value => value.kind === "verify-backup"), firstWrite = result.calls.findIndex(value => value.kind === "open");
  assert.ok(verified >= 0 && verified < firstWrite);
  assert.deepEqual(result.calls[verified].value, { commit: "a".repeat(40) });
  assert.equal(result.writes[0].contents, "# Existing synthetic job\n5 3 * * * /usr/bin/true\n");
  assert.ok(result.schedule.startsWith(result.writes[0].contents));
  assert.equal(JSON.parse(result.output[0]).backupSchedule, "daily-03:17-server-local");
  for (const call of result.calls.filter(value => value.path === "/usr/local/bin/crontab")) assert.equal(call.settings.env.LC_ALL, "C");
});

test("executed installer safely starts from an absent crontab but never treats other failures as empty", async () => {
  const fresh = await installationHarness({ existing: "" });
  assert.equal(fresh.process.exitCode, undefined); assert.equal(fresh.writes[0].contents, "");
  assert.ok(fresh.schedule.startsWith("# BEGIN GOLDSILVER"));
  for (const cronFailure of [{ status: 1, stdout: "", stderr: "permission denied\n" }, { status: 1, stdout: "partial", stderr: "no crontab for wealthos_dev\n" }, { status: 1, stdout: "", stderr: "no crontab for another\n" }, { code: "ETIMEDOUT", status: null, stdout: "", stderr: "" }]) {
    const result = await installationHarness({ cronFailure });
    assert.equal(result.process.exitCode, 1); assert.equal(result.calls.some(value => value.path === "/usr/local/bin/crontab" && value.args[0] === "-"), false);
    assert.equal(result.writes.length, 0); assert.equal(result.errors.some(value => value.includes("permission denied")), false);
  }
});

test("executed installer blocks corrupted backup or concurrent schedule change without replacing crontab", async () => {
  const backup = await installationHarness({ invalidBackup: true });
  assert.equal(backup.process.exitCode, 1); assert.equal(backup.calls.some(value => value.kind === "open"), false);
  assert.equal(backup.calls.some(value => value.path === "/usr/local/bin/crontab"), false);
  const changed = await installationHarness({ concurrentChange: true });
  assert.equal(changed.process.exitCode, 1); assert.equal(changed.writes.length, 1);
  assert.equal(changed.calls.some(value => value.path === "/usr/local/bin/crontab" && value.args[0] === "-"), false);
});
test("supervision rejects duplicate deployment, unknown paths, injection and broad targets", () => {
  for (const path of ["/", "/home/wealthos_dev", release + "/../other", release + "\n", release + ";echo x", release.replace("a".repeat(40), "main")]) {
    assert.throws(() => planPrivateSupervision("", path)); assert.throws(() => assertPrivateReleaseDirectory(path));
  }
  for (const existing of ["# BEGIN GOLDSILVER PRIVATE SERVICE V1", "# END GOLDSILVER PRIVATE SERVICE V1", "a\0b", "x".repeat(1_048_577)]) assert.throws(() => planPrivateSupervision(existing, release));
});
