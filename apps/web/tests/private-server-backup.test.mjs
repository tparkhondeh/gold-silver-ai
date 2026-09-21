import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { PRIVATE_DATA_ROOT, PRIVATE_PG_BIN, assertPrivateReleaseDirectory } from "../scripts/private-supervision.ts";
import { PRIVATE_BACKUP_ROOT, PRIVATE_BACKUP_RECEIPT, createPrivateBackupVerifier } from "../scripts/private-retained-backup.ts";
import { localBackupTables, quoteVerificationDatabase } from "../scripts/local-backup.ts";
import { identityBackupExclusions, transientIdentityTables } from "../scripts/private-backup-policy.ts";

const commit = "a".repeat(40), release = `/home/wealthos_dev/.goldsilver-service/releases/${commit}`;
const timestamp = 1_790_000_000_000, previous = Buffer.from("previous retained record: synthetic only");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const source = (await readFile(new URL("../scripts/private-server-backup.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replaceAll("import.meta.url", JSON.stringify(`file://${release}/apps/web/scripts/private-server-backup.mjs`));

async function execute(options = {}) {
  const entries = new Map(), descriptors = new Map(), commands = [], events = [], output = [], masks = [];
  let inode = 1, connection = 0, fd = 100;
  const metadata = (size, directory = false) => ({ uid: directory ? 0 : 1001, mode: directory ? 0o40755 : 0o100600, nlink: directory ? 2 : 1,
    dev: 3, ino: inode++, size, mtimeMs: 1, ctimeMs: 1, isFile: () => !directory, isDirectory: () => directory, isSymbolicLink: () => false });
  for (let path = PRIVATE_BACKUP_ROOT;; path = posix.dirname(path)) {
    const stat = metadata(0, true); if (path.includes("/.asha-private")) Object.assign(stat, { uid: 1001, mode: 0o40700 });
    entries.set(path, { stat, bytes: Buffer.alloc(0) }); if (path === "/") break;
  }
  entries.set(PRIVATE_BACKUP_RECEIPT, { stat: metadata(previous.length), bytes: Buffer.from(previous) });
  const write = (entry, value) => { entry.bytes = Buffer.from(value); entry.stat.size = entry.bytes.length; entry.stat.mtimeMs++; };
  const io = {
    platform: "linux", uid: 1001,
    lstat: async path => { if (!entries.has(path)) throw Object.assign(Error("Synthetic missing"), { code: "ENOENT" }); return { ...entries.get(path).stat }; },
    open: async (path, flags, mode) => {
      events.push(`open:${path}`);
      if (flags & constants.O_CREAT) {
        if (entries.has(path) && flags & constants.O_EXCL) throw Error("Synthetic already exists");
        assert.equal(mode, 0o600); entries.set(path, { stat: metadata(0), bytes: Buffer.alloc(0) });
      }
      const entry = entries.get(path); if (!entry) throw Error("Synthetic missing");
      const id = fd++; descriptors.set(id, entry);
      return { fd: id, stat: async () => ({ ...entry.stat }), close: async () => {},
        sync: async () => { events.push(`sync:${path}`); if (options.postRenameSyncFailure && path === PRIVATE_DATA_ROOT && events.includes("rename-latest")) throw Error("Synthetic fsync failure"); },
        writeFile: async value => { write(entry, value); },
        read: async (buffer, offset, length, position) => { const bytesRead = Math.max(0, Math.min(length, entry.bytes.length - position)); entry.bytes.copy(buffer, offset, position, position + bytesRead); return { bytesRead, buffer }; },
      };
    },
  };
  const verifier = createPrivateBackupVerifier(io);
  class Client {
    constructor() { this.index = connection++; }
    on() {} async connect() {} async end() { events.push(`end:${this.index}`); }
    async query(sql) {
      events.push(sql);
      if (sql.startsWith("DROP DATABASE") && options.cleanupFailure) throw Error("Synthetic cleanup failure");
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: !options.overlap }] };
      if (sql.includes("pg_export_snapshot")) return { rows: [{ snapshot: "00000003-0000001B-1" }] };
      if (sql.includes("string_agg")) return { rows: [{ count: "1", digest: options.badRestore && this.index === 2 ? "bad" : "synthetic" }] };
      if (sql.includes("FROM pg_tables")) return { rows: [...localBackupTables, ...transientIdentityTables].sort().map(tablename => ({ tablename })) };
      if (sql.startsWith("SELECT id,checksum")) return { rows: [] };
      if (sql.startsWith("SELECT count(*) AS count")) return { rows: [{ count: options.restoredAuthorization ? "1" : "0" }] };
      return { rows: [] };
    }
  }
  const process = { platform: "linux", getuid: () => 1001, argv: ["node", "script"], env: {}, umask: value => masks.push(value), stdout: { write: value => output.push(value) }, stderr: { write: value => output.push(value) } };
  const dependencies = {
    process, Client, constants, ...io, PRIVATE_DATA_ROOT, PRIVATE_PG_BIN, PRIVATE_BACKUP_ROOT, PRIVATE_BACKUP_RECEIPT,
    assertPrivateReleaseDirectory, quoteVerificationDatabase, identityBackupExclusions, transientIdentityTables, localBackupTables,
    readPrivateServerConfig: async () => ({ databaseUrl: "postgresql://asha_private_runtime:synthetic@127.0.0.1:15432/asha_private" }),
    readPrivateClusterAdministrationConfig: async () => ({ databaseUrl: "postgresql://asha_private_cluster:synthetic@127.0.0.1:15432/asha_private" }),
    assertPrivateProcessEnvironment: () => {}, randomBytes: () => Buffer.from("abcdef01", "hex"), Date: class extends Date { static now() { return timestamp; } },
    resolve: posix.resolve, join: posix.join, fileURLToPath: () => `${release}/apps/web/`,
    mkdir: async () => { throw Object.assign(Error("Synthetic exists"), { code: "EEXIST" }); }, statfs: async () => ({ bavail: 9 * 1024 ** 3, bsize: 1 }),
    rename: async (from, to) => { assert.equal(to, PRIVATE_BACKUP_RECEIPT); events.push("rename-latest"); entries.set(to, entries.get(from)); entries.delete(from); },
    readMigrations: async () => [], migrationJournalMatches: () => true,
    hashPrivateBackupDump: path => verifier.hashPrivateBackupDump(path),
    verifyPrivateBackupCandidate: async input => { events.push("verify-candidate"); if (options.corruptCandidate) entries.get(JSON.parse(input.manifest).backup).bytes[0] ^= 1; return verifier.verifyPrivateBackupCandidate({ ...input, now: timestamp }); },
    execFileSync: (path, args, settings) => {
      commands.push({ path, args, settings });
      if (path === "git") {
        if (args.includes("rev-parse")) return commit;
        if (args.includes("status")) return options.dirty ? " M synthetic" : "";
        if (args.includes("branch")) return "codex/phase-2-decision-engine";
      }
      if (path.endsWith("pg_dump")) {
        events.push("dump"); write(descriptors.get(settings.stdio[1]), "synthetic-dump-content");
      }
      if (path.endsWith("pg_restore")) {
        events.push("restore"); assert.equal(typeof settings.stdio[0], "number");
        if (options.changedDuringRestore) descriptors.get(settings.stdio[0]).bytes[0] ^= 1;
      }
      return "";
    },
  };
  await new AsyncFunction(...Object.keys(dependencies), source)(...Object.values(dependencies));
  return { entries, commands, events, output, masks, process };
}

test("executed producer exports one snapshot, restores checked descriptor and verifies auth-free retained artifact before publication", async () => {
  const result = await execute(); assert.equal(result.process.exitCode, undefined); assert.deepEqual(result.masks, [0o077]);
  const dump = result.commands.find(value => value.path.endsWith("pg_dump"));
  assert.ok(dump.args.includes("--snapshot=00000003-0000001B-1"));
  for (const exclusion of identityBackupExclusions) assert.ok(dump.args.includes(exclusion));
  assert.ok(result.events.indexOf("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") < result.events.indexOf("dump"));
  assert.ok(result.events.indexOf("dump") < result.events.indexOf("COMMIT"));
  assert.ok(result.events.indexOf("COMMIT") < result.events.indexOf("restore"));
  assert.ok(result.events.indexOf("restore") < result.events.indexOf("verify-candidate"));
  assert.ok(result.events.indexOf("verify-candidate") < result.events.indexOf("rename-latest"));
  assert.ok(result.events.indexOf('DROP DATABASE "asha_backup_verify_abcdef01"') < result.events.indexOf("rename-latest"));
  const restore = result.commands.find(value => value.path.endsWith("pg_restore"));
  assert.equal(restore.args.some(value => value.endsWith(".dump")), false);
  const latest = JSON.parse(result.entries.get(PRIVATE_BACKUP_RECEIPT).bytes);
  assert.equal(latest.persistentTablesVerified, localBackupTables.length); assert.equal(latest.authorizationRestored, false);
  assert.equal(latest.offHostBackup, false); assert.equal(latest.commit, commit);
  assert.deepEqual(JSON.parse(result.entries.get(latest.backup.replace(/\.dump$/, ".json")).bytes), latest);
  assert.ok(result.events.includes('DROP DATABASE "asha_backup_verify_abcdef01"'));
  assert.equal(result.output.length, 1); assert.match(result.output[0], /separate restore verified/);
});

test("failed restore, auth resurrection, changed dump or rejected retained candidate preserves prior success bytes", async () => {
  for (const options of [{ badRestore: true }, { restoredAuthorization: true }, { changedDuringRestore: true }, { corruptCandidate: true }]) {
    const result = await execute(options);
    assert.equal(result.process.exitCode, 1); assert.deepEqual(result.entries.get(PRIVATE_BACKUP_RECEIPT).bytes, previous);
    assert.equal(result.events.includes("rename-latest"), false); assert.match(result.output.join(""), /NOT confirmed/);
    assert.doesNotMatch(result.output.join(""), /synthetic|postgresql|abcdef01|sha256/);
    assert.ok(result.events.includes('DROP DATABASE "asha_backup_verify_abcdef01"'));
  }
});

test("overlap and dirty source fail before dump without touching old retained artifacts", async () => {
  for (const options of [{ overlap: true }, { dirty: true }]) {
    const result = await execute(options); assert.equal(result.process.exitCode, 1);
    assert.equal(result.commands.some(value => value.path.endsWith("pg_dump")), false);
    assert.deepEqual(result.entries.get(PRIVATE_BACKUP_RECEIPT).bytes, previous);
    assert.equal(result.events.some(value => value.startsWith("DROP DATABASE")), false);
  }
});

test("post-rename directory-sync uncertainty reports failure without falsely claiming rollback", async () => {
  const result = await execute({ postRenameSyncFailure: true });
  assert.equal(result.process.exitCode, 1); assert.ok(result.events.includes("rename-latest"));
  assert.equal(JSON.parse(result.entries.get(PRIVATE_BACKUP_RECEIPT).bytes).state, "verified");
  assert.match(result.output.join(""), /NOT confirmed/); assert.doesNotMatch(result.output.join(""), /separate restore verified/);
});

test("cleanup failure preserves candidate artifact and prior latest, reports nonzero exit and no success message", async () => {
  const result = await execute({ cleanupFailure: true });
  assert.equal(result.process.exitCode, 1); assert.deepEqual(result.entries.get(PRIVATE_BACKUP_RECEIPT).bytes, previous);
  const candidate = `${PRIVATE_BACKUP_ROOT}/private-${timestamp}-abcdef01`;
  assert.equal(JSON.parse(result.entries.get(candidate + ".json").bytes).state, "verified");
  assert.ok(result.entries.has(candidate + ".dump")); assert.equal(result.events.includes("rename-latest"), false);
  assert.match(result.output.join(""), /Disposable restore copy preserved/); assert.doesNotMatch(result.output.join(""), /separate restore verified/);
  assert.ok(result.events.includes("SELECT pg_advisory_unlock(174228532,9)"));
});
