import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import test from "node:test";
import { PRIVATE_LINUX_PLAN as plan, privateDatabaseUrl } from "../scripts/private-linux-plan.ts";
import { INITIALIZATION_ATTEMPT_MARKER, INITDB_STDIN_PIPELINE, assertEmptyInitializationLayout, inspectRetainedInitialization, privateInitdbInvocation } from "../scripts/private-empty-initialization.ts";
import { runPrivateInitdb, preparePrivateDatabase } from "../scripts/prepare-private-database.mjs";

const now = Date.parse("2026-09-21T12:00:00.000Z");
const directory = { uid: 1001, mode: 0o40700, nlink: 2, directory: true, file: false, symlink: false };
const file = { uid: 1001, mode: 0o100600, nlink: 1, directory: false, file: true, symlink: false };
const layout = () => ({ uid: 1001, entries: [plan.data, plan.started, plan.runtime, plan.administration, plan.clusterAdministration].map(path => basename(path)), databaseEntries: [],
  metadata: { parent: { ...directory }, root: { ...directory }, database: { ...directory }, started: { ...file }, runtime: { ...file }, administration: { ...file }, clusterAdministration: { ...file } } });
const retained = () => ({ started: { version: 1, state: "preparing", startedAt: "2026-09-21T11:59:00.000Z" },
  runtime: { version: 2, authentication: "passkey", origin: plan.origin, ownerSubject: plan.ownerSubject, portfolioSubject: plan.portfolioSubject, databaseUrl: privateDatabaseUrl(plan.runtimeRole, "c".repeat(64)) },
  administration: { version: 1, databaseUrl: privateDatabaseUrl(plan.adminRole, "b".repeat(64)) },
  clusterAdministration: { version: 1, databaseUrl: privateDatabaseUrl(plan.clusterRole, "a".repeat(64)) } });

test("empty recovery accepts only exact protected retained entries and never alters inspection input", () => {
  const input = layout(), saved = structuredClone(input);
  assert.doesNotThrow(() => assertEmptyInitializationLayout(input)); assert.deepEqual(input, saved);
  for (const extra of [basename(plan.log), basename(plan.complete), basename(INITIALIZATION_ATTEMPT_MARKER), "unexpected", "database.old"]) {
    const invalid = layout(); invalid.entries.push(extra); assert.throws(() => assertEmptyInitializationLayout(invalid), /details withheld/);
  }
  for (const missing of layout().entries) { const invalid = layout(); invalid.entries = invalid.entries.filter(name => name !== missing); assert.throws(() => assertEmptyInitializationLayout(invalid)); }
  const duplicate = layout(); duplicate.entries.push(duplicate.entries[0]); assert.throws(() => assertEmptyInitializationLayout(duplicate));
  for (const entry of ["PG_VERSION", "base", "postgresql.conf", ".hidden", "lost+found"]) assert.throws(() => assertEmptyInitializationLayout({ ...layout(), databaseEntries: [entry] }));
});

test("every retained directory/config/marker rejects unsafe metadata without repair", () => {
  for (const key of ["parent", "root", "database"]) for (const change of [{ uid: 0 }, { mode: 0o750 }, { mode: 0o1700 }, { directory: false }, { symlink: true }]) {
    const invalid = layout(); Object.assign(invalid.metadata[key], change); assert.throws(() => assertEmptyInitializationLayout(invalid));
  }
  for (const key of ["started", "runtime", "administration", "clusterAdministration"]) for (const change of [{ uid: 0 }, { mode: 0o640 }, { mode: 0o1600 }, { file: false }, { symlink: true }, { nlink: 2 }]) {
    const invalid = layout(); Object.assign(invalid.metadata[key], change); assert.throws(() => assertEmptyInitializationLayout(invalid));
  }
});

test("the common exclusive attempt is accepted only for the claiming process's post-lock check", () => {
  const input = layout(); input.entries.push(basename(INITIALIZATION_ATTEMPT_MARKER));
  assert.throws(() => assertEmptyInitializationLayout(input));
  input.claimedAttempt = { ...file }; assert.doesNotThrow(() => assertEmptyInitializationLayout(input));
  input.claimedAttempt.nlink = 2; assert.throws(() => assertEmptyInitializationLayout(input));
});

test("resume reuses three distinct generated credentials with exact binding, roles, host, port and database", () => {
  const input = retained(), before = structuredClone(input);
  assert.deepEqual(inspectRetainedInitialization(input, now), { clusterPassword: "a".repeat(64), adminPassword: "b".repeat(64), runtimePassword: "c".repeat(64) });
  assert.deepEqual(input, before);
  for (const change of [{ version: 1 }, { authentication: "google" }, { origin: "https://other.invalid" }, { ownerSubject: "other-owner" }, { portfolioSubject: "other-portfolio" }, { extra: true }]) {
    const invalid = retained(); Object.assign(invalid.runtime, change); assert.throws(() => inspectRetainedInitialization(invalid, now), /details withheld/);
  }
  for (const key of ["runtime", "administration", "clusterAdministration"]) for (const transform of [
    url => url.replace(":15432/", ":5432/"), url => url.replace("127.0.0.1", "localhost"), url => url.replace("/asha_private", "/postgres"),
    url => url.replace(/asha_private_(?:runtime|admin|cluster):/, "postgres:"), url => url + "?sslmode=disable",
    url => url.replace(/:[a-f0-9]{64}@/, ":short@"), url => url.replace(/:[a-f0-9]{64}@/, ":" + "A".repeat(64) + "@"),
  ]) { const invalid = retained(); invalid[key].databaseUrl = transform(invalid[key].databaseUrl); assert.throws(() => inspectRetainedInitialization(invalid, now)); }
  const shared = retained(); shared.administration.databaseUrl = privateDatabaseUrl(plan.adminRole, "a".repeat(64)); assert.throws(() => inspectRetainedInitialization(shared, now));
});

test("only the original preparing marker and exact valid configuration documents are eligible", () => {
  for (const marker of [null, [], {}, { ...retained().started, state: "prepared" }, { ...retained().started, version: 2 },
    { ...retained().started, extra: "untrusted" }, { ...retained().started, startedAt: "invalid" }, { ...retained().started, startedAt: "2026-09-21" },
    { ...retained().started, startedAt: "2026-09-21T12:00:00.001Z" }]) assert.throws(() => inspectRetainedInitialization({ ...retained(), started: marker }, now));
  for (const at of [NaN, Infinity, -Infinity]) assert.throws(() => inspectRetainedInitialization(retained(), at));
  for (const key of ["runtime", "administration", "clusterAdministration"]) for (const value of [null, [], "malformed", { version: 1, databaseUrl: "malformed" }, { ...retained()[key], unexpected: true }]) {
    const invalid = retained(); invalid[key] = value; assert.throws(() => inspectRetainedInitialization(invalid, now));
  }
});

test("initdb uses fixed literal pipeline, clean environment, stdin only, bounded capture and no cleanup", () => {
  const fixture = "d".repeat(64), calls = [];
  runPrivateInitdb(fixture, (...args) => { calls.push(args); return Buffer.from("not emitted"); });
  assert.equal(calls.length, 1); const [executable, args, options] = calls[0];
  assert.equal(executable, "/bin/bash"); assert.deepEqual(args, privateInitdbInvocation().args);
  assert.deepEqual(args.slice(0, 7), ["--noprofile", "--norc", "-o", "pipefail", "-c", '/usr/bin/cat | "$@"', "asha-initdb"]);
  assert.equal(args[7], plan.tools + "/initdb"); assert.ok(args.includes("--no-clean"));
  assert.deepEqual(args.slice(-2), ["--pwfile", "/dev/stdin"]); assert.ok(!args.some(value => value.includes(fixture)));
  assert.equal(options.input.toString(), fixture + "\n"); assert.equal(options.cwd, plan.root);
  assert.deepEqual(options.env, { PATH: `${plan.tools}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" });
  assert.equal(options.timeout, 120_000); assert.equal(options.maxBuffer, 1024 * 1024); assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(options.shell, undefined); assert.equal(runPrivateInitdb(fixture, () => Buffer.from("hidden")), undefined);
});

test("invalid password or execution failures cannot expose input or child diagnostics", () => {
  for (const value of ["", "secret", "x\n".repeat(32), "e".repeat(63), "E".repeat(64)]) assert.throws(() => runPrivateInitdb(value, () => assert.fail("must not execute")), /details withheld/);
  const fixture = "f".repeat(64);
  assert.throws(() => runPrivateInitdb(fixture, () => { throw Error(fixture + " child output"); }), error => error.message === "Private database preparation unconfirmed; details withheld" && !JSON.stringify(error).includes(fixture));
});

test("Linux real pipe can reopen /dev/stdin with only a public harmless fixture", { skip: process.platform !== "linux" }, () => {
  const fixture = "public-initdb-pipe-fixture\n";
  const output = execFileSync("/bin/bash", ["--noprofile", "--norc", "-o", "pipefail", "-c", INITDB_STDIN_PIPELINE, "asha-pipe-fixture", "/usr/bin/head", "-c", String(Buffer.byteLength(fixture)), "/dev/stdin"],
    { input: fixture, env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, timeout: 5000, maxBuffer: 1024, stdio: ["pipe", "pipe", "pipe"] });
  assert.equal(output.toString(), fixture);
});

test("entry is passive and accepts only explicit fresh/resume modes; common lock precedes recheck and initdb", async () => {
  await assert.rejects(preparePrivateDatabase("unknown"), /details withheld/);
  const source = readFileSync(new URL("../scripts/prepare-private-database.mjs", import.meta.url), "utf8");
  const lock = source.indexOf("await exclusiveFile(INITIALIZATION_ATTEMPT_MARKER");
  assert.ok(lock > source.indexOf("await retainedEmptyInitialization(uid)"));
  assert.ok(lock < source.indexOf("await retainedEmptyInitialization(uid, true)"));
  assert.ok(source.indexOf("await retainedEmptyInitialization(uid, true)") < source.indexOf("runPrivateInitdb(clusterPassword)"));
  assert.match(source, /\["--prepare", "--resume-empty-initialization"\]/);
  assert.match(source, /O_EXCL \| constants\.O_NOFOLLOW/); assert.match(source, /retained\.clusterPassword !== clusterPassword/);
  assert.doesNotMatch(source, /\b(?:unlink|rm|chmod|chown)\(|process\.env|shell:\s*true|console\./);
});
