import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { EventEmitter } from "node:events";
import { PRIVATE_DATA_ROOT, PRIVATE_SERVICE_ROOT, PRIVATE_PG_BIN, PRIVATE_PG_LOG, planPrivateSupervision, parsePrivateSupervisionArguments, privateSupervisionUpgradeMarker, assertPrivateServiceLockMetadata, assertPrivateReleaseDirectory, isEmptyPrivateCrontab, assertPrivateLogMetadata } from "../scripts/private-supervision.ts";

const release = "/home/wealthos_dev/.goldsilver-service/releases/" + "a".repeat(40);
const previousCommit = "b".repeat(40), previousRelease = `${PRIVATE_SERVICE_ROOT}/releases/${previousCommit}`;
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

test("reviewed replacement changes only the exact old block in place, preserving unrelated bytes", () => {
  const oldBlock = planPrivateSupervision("", previousRelease).next, nextBlock = planPrivateSupervision("", release).next;
  for (const [before, after] of [["", ""], ["# before\r\n5 3 * * * /usr/bin/true\n", "# after without final newline"], ["# before\n", "\n# unrelated\r\n"]]) {
    const existing = before + oldBlock + after, plan = planPrivateSupervision(existing, release, previousRelease);
    assert.equal(plan.previous, existing); assert.equal(plan.next, before + nextBlock + after);
    assert.equal(plan.next.indexOf(nextBlock), before.length); assert.equal(plan.next.includes(previousRelease), false);
  }
});

test("replacement rejects altered, missing, duplicated, mixed-release or unrecognized own blocks", () => {
  const block = planPrivateSupervision("", previousRelease).next;
  const candidates = ["", "# unrelated\n", block + block, block.replace("@reboot", "@daily"), block.replace("17 3", "18 3"),
    block.replaceAll(previousRelease, release), block.replace(previousRelease, release), block.replace("SERVICE V1", "SERVICE V2"),
    block.replaceAll("\n", "\r\n"), block.trimEnd(), "# prefix " + block,
    block + "# BEGIN GOLDSILVER PRIVATE SERVICE V1\n", block + "# END GOLDSILVER PRIVATE SERVICE V2\n", block + "# begin goldsilver private service v1\n"];
  for (const existing of candidates) assert.throws(() => planPrivateSupervision(existing, release, previousRelease));
  assert.throws(() => planPrivateSupervision(block, release, release));
  assert.throws(() => planPrivateSupervision(block, release, previousRelease + "/../other"));
  assert.throws(() => planPrivateSupervision(block, release));
});

test("replacement CLI requires activation plus exactly one explicit lowercase prior SHA", () => {
  assert.deepEqual(parsePrivateSupervisionArguments(["--activate-reviewed-release"]), { previousCommit: null });
  for (const args of [["--activate-reviewed-release", `--replace-reviewed-release=${previousCommit}`], [`--replace-reviewed-release=${previousCommit}`, "--activate-reviewed-release"]]) assert.deepEqual(parsePrivateSupervisionArguments(args), { previousCommit });
  for (const args of [[], [`--replace-reviewed-release=${previousCommit}`], ["--activate-reviewed-release", "--activate-reviewed-release"],
    ["--activate-reviewed-release", "--replace-reviewed-release"], ["--activate-reviewed-release", `--replace-reviewed-release=${"A".repeat(40)}`],
    ["--activate-reviewed-release", `--replace-reviewed-release=${previousCommit}\n`], ["--activate-reviewed-release", `--replace-reviewed-release=${previousRelease}`],
    ["--activate-reviewed-release", `--replace-reviewed-release=${previousCommit}`, "--force"]]) assert.throws(() => parsePrivateSupervisionArguments(args));
});

test("existing active service lock admission is exact600 ordinary own single-link only", () => {
  const value = { file: true, symlink: false, uid: 1001, mode: 0o100600, nlink: 1 };
  assert.doesNotThrow(() => assertPrivateServiceLockMetadata(value, 1001));
  for (const change of [{ file: false }, { symlink: true }, { uid: 0 }, { nlink: 2 }, { mode: 0o100640 }, { mode: 0o104600 }, { mode: 0o100400 }]) assert.throws(() => assertPrivateServiceLockMetadata({ ...value, ...change }, 1001));
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
async function executeEntry(filename, dependencies, sourceRelease = release) {
  const source = (await readFile(new URL(`../scripts/${filename}`, import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("import.meta.url", JSON.stringify(`file://${sourceRelease}/apps/web/scripts/${filename}`));
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
  const targetCommit = options.targetCommit ?? "a".repeat(40), targetRelease = `${PRIVATE_SERVICE_ROOT}/releases/${targetCommit}`;
  const claimedMarkers = options.claimedMarkers ?? new Set();
  let schedule = options.existing ?? "# Existing synthetic job\n5 3 * * * /usr/bin/true\n", reads = 0, ended = false, lockReads = 0;
  const readSchedule = () => options.sharedCron?.value ?? schedule;
  let lockExists = options.existingLock ?? !!options.replace;
  const process = { argv: ["node", "installer", ...(options.args ?? ["--activate-reviewed-release", ...(options.replace ? [`--replace-reviewed-release=${options.replace}`] : [])])], platform: "linux", getuid: () => 1001, env: {}, umask: value => masks.push(value), stdout: { write: value => output.push(value) }, stderr: { write: value => errors.push(value) } };
  await executeEntry("install-private-supervision.mjs", {
    constants, PRIVATE_DATA_ROOT, PRIVATE_SERVICE_ROOT, planPrivateSupervision, parsePrivateSupervisionArguments, privateSupervisionUpgradeMarker, assertPrivateServiceLockMetadata, assertPrivateReleaseDirectory, isEmptyPrivateCrontab, process,
    resolve: posix.resolve, join: posix.join, fileURLToPath: () => `${targetRelease}/apps/web/`,
    Pool: class { on() {} async end() { ended = true; } },
    readPrivateServerConfig: async () => ({ version: 2, databaseUrl: "postgresql://synthetic:withheld@127.0.0.1:15432/asha_private" }),
    assertPrivateProcessEnvironment: () => {}, probePrivatePortfolioDatabase: async () => ({ state: "ready" }), readMigrations: async () => [],
    verifyRetainedPrivateBackup: async value => { calls.push({ kind: "verify-backup", value }); if (options.invalidBackup) throw Error("Synthetic missing/corrupt backup"); return {}; },
    readFile: async () => JSON.stringify({ commit: targetCommit, deploymentEligible: true }),
    lstat: async path => {
      calls.push({ kind: "lstat", path }); lockReads++;
      if (!lockExists) throw Error("Synthetic missing lock");
      return logStat(lockReads > 1 && options.changedLock ? { ino: 100 } : options.lockStat);
    },
    open: async (path, flags, mode) => {
      calls.push({ kind: "open", path, flags, mode });
      if (path.endsWith("/service.lock")) {
        if (flags & constants.O_CREAT) { if (lockExists && flags & constants.O_EXCL) throw Error("Synthetic existing lock"); lockExists = true; }
        else if (!lockExists) throw Error("Synthetic missing lock");
      }
      if (path.includes("/supervision-upgrade-from-")) {
        assert.equal(flags, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW);
        if (claimedMarkers.has(path)) throw Error("Synthetic already claimed upgrade");
        claimedMarkers.add(path);
      }
      return { stat: async () => logStat(path.includes("/supervision-upgrade-from-") ? options.markerStat : options.lockDescriptorStat), writeFile: async contents => writes.push({ path, contents }), sync: async () => {}, close: async () => { calls.push({ kind: "close", path }); } };
    },
    execFileSync: (path, args, settings) => {
      calls.push({ kind: "command", path, args, settings });
      if (path === "git") return args.includes("rev-parse") ? targetCommit : args.includes("branch") ? "codex/phase-2-decision-engine" : "";
      if (args[0] === "-") { schedule = settings.input; if (options.sharedCron) options.sharedCron.value = schedule; return ""; }
      reads++;
      if (options.cronFailure) throw options.cronFailure;
      if (options.concurrentChange && reads === 2) return readSchedule() + "# Concurrent operator change\n";
      if (options.verifyMismatch && reads === 3) return readSchedule() + "# Changed after install\n";
      if (readSchedule() === "") throw { status: 1, signal: null, stdout: "", stderr: "no crontab for wealthos_dev\n" };
      return readSchedule();
    },
  }, targetRelease);
  return { calls, writes, output, errors, masks, process, ended, schedule: readSchedule(), claimedMarkers };
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

test("executed upgrade backs up exact prior cron and reuses active lock read-only without flock or process stop", async () => {
  const prior = "# keep before\r\n" + planPrivateSupervision("", previousRelease).next + "# keep after";
  const result = await installationHarness({ existing: prior, replace: previousCommit });
  assert.equal(result.process.exitCode, undefined); assert.equal(result.ended, true);
  assert.equal(result.schedule, planPrivateSupervision(prior, release, previousRelease).next);
  assert.equal(result.writes.length, 2); assert.equal(result.writes.find(value => value.path.includes("/crontab-before-")).contents, prior);
  const marker = result.writes.find(value => value.path === privateSupervisionUpgradeMarker(previousCommit));
  assert.equal(JSON.parse(marker.contents).previousCommit, previousCommit); assert.equal(JSON.parse(marker.contents).commit, "a".repeat(40));
  const lock = result.calls.find(value => value.kind === "open" && value.path.endsWith("/service.lock"));
  assert.equal(lock.flags, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); assert.equal(lock.mode, undefined);
  assert.equal(lock.flags & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | constants.O_EXCL), 0);
  assert.ok(result.calls.some(value => value.kind === "close" && value.path === lock.path));
  assert.ok(result.calls.filter(value => value.kind === "command").every(value => ["git", "/usr/local/bin/crontab"].includes(value.path)));
  assert.equal(JSON.parse(result.output[0]).replacedCommit, previousCommit);
  assert.equal(JSON.parse(result.output[0]).scope, "project-schedule-only"); assert.equal(JSON.parse(result.output[0]).runningProcessRestarted, false);
});

test("executed upgrade rejects incorrect release/block/backup or absent unsafe replaced lock before cron mutation", async () => {
  const existing = planPrivateSupervision("", previousRelease).next;
  const optionsList = [
    { replace: "a".repeat(40) }, { replace: "c".repeat(40) }, { args: [`--replace-reviewed-release=${previousCommit}`] },
    { existing: existing.replace("17 3", "18 3") }, { existing: existing + existing }, { invalidBackup: true }, { existingLock: false },
    { lockStat: { isFile: () => false } }, { lockStat: { isSymbolicLink: () => true } }, { lockStat: { uid: 0 } }, { lockStat: { mode: 0o100644 } }, { lockStat: { nlink: 2 } },
    { lockDescriptorStat: { ino: 10 } }, { lockDescriptorStat: { dev: 8 } }, { lockDescriptorStat: { mode: 0o100640 } },
    { changedLock: true }, { concurrentChange: true }, { markerStat: { mode: 0o100640 } },
  ];
  for (const options of optionsList) {
    const result = await installationHarness({ existing, replace: previousCommit, ...options });
    assert.equal(result.process.exitCode, 1); assert.equal(result.output.length, 0);
    assert.equal(result.calls.some(value => value.path === "/usr/local/bin/crontab" && value.args[0] === "-"), false);
    assert.ok(result.writes.every(value => !value.path.endsWith("/service.lock")));
  }
});

test("fresh install still refuses existing lock and replacement is unconfirmed if exact installed cron differs", async () => {
  const fresh = await installationHarness({ existingLock: true });
  assert.equal(fresh.process.exitCode, 1); assert.equal(fresh.writes.length, 0);
  const lock = fresh.calls.find(value => value.kind === "open" && value.path.endsWith("/service.lock"));
  assert.equal(lock.flags, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW);
  const changed = await installationHarness({ existing: planPrivateSupervision("", previousRelease).next, replace: previousCommit, verifyMismatch: true });
  assert.equal(changed.process.exitCode, 1); assert.equal(changed.output.length, 0); assert.equal(changed.writes.length, 2);
  assert.equal(changed.calls.filter(value => value.path === "/usr/local/bin/crontab" && value.args[0] === "-").length, 1);
});

test("upgrade marker is fixed to the old SHA and remains after a failed attempt with no automatic retry", async () => {
  assert.equal(privateSupervisionUpgradeMarker(previousCommit), `${PRIVATE_DATA_ROOT}/supervision-upgrade-from-${previousCommit}.json`);
  for (const value of ["", "main", previousCommit + "/../x", previousCommit + "\n", "B".repeat(40)]) assert.throws(() => privateSupervisionUpgradeMarker(value));
  const existing = planPrivateSupervision("", previousRelease).next, claimedMarkers = new Set();
  const failed = await installationHarness({ existing, replace: previousCommit, concurrentChange: true, claimedMarkers });
  assert.equal(failed.process.exitCode, 1); assert.equal(claimedMarkers.size, 1);
  const retry = await installationHarness({ existing, replace: previousCommit, claimedMarkers });
  assert.equal(retry.process.exitCode, 1); assert.equal(retry.writes.length, 0);
  assert.equal(retry.calls.some(value => value.path === "/usr/local/bin/crontab" && value.args[0] === "-"), false);
});

test("two different target releases replacing the same old SHA cannot both install", async () => {
  const sharedCron = { value: planPrivateSupervision("", previousRelease).next }, claimedMarkers = new Set();
  const results = await Promise.all(["a", "c"].map(char => installationHarness({ targetCommit: char.repeat(40), replace: previousCommit, sharedCron, claimedMarkers })));
  assert.equal(results.filter(result => result.process.exitCode === undefined).length, 1);
  assert.equal(results.flatMap(result => result.calls).filter(value => value.path === "/usr/local/bin/crontab" && value.args[0] === "-").length, 1);
  assert.equal(claimedMarkers.size, 1);
  const winner = results.find(result => result.process.exitCode === undefined), installed = JSON.parse(winner.output[0]);
  assert.equal(sharedCron.value, planPrivateSupervision("", `${PRIVATE_SERVICE_ROOT}/releases/${installed.commit}`).next);
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
