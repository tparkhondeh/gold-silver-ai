import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { posix } from "node:path";
import { createPrivateBackupVerifier, parsePrivateBackupManifest, PRIVATE_BACKUP_ROOT, PRIVATE_BACKUP_RECEIPT } from "../scripts/private-retained-backup.ts";
import { localBackupTables } from "../scripts/local-backup.ts";

const now = 1_790_000_000_000, commit = "a".repeat(40);
const dumpPath = `${PRIVATE_BACKUP_ROOT}/private-${now - 1000}-abcdef01.dump`;
const retainedPath = dumpPath.replace(/\.dump$/, ".json");
const dump = Buffer.from("synthetic private dump, no owner information");
const manifest = { version: 1, state: "verified", commit, verifiedAt: now, backup: dumpPath,
  sha256: createHash("sha256").update(dump).digest("hex"), persistentTablesVerified: localBackupTables.length,
  authorizationRestored: false, offHostBackup: false };
const selection = { commit, now };
const safeError = { message: "Retained private backup unavailable or unsafe; details withheld" };

// Virtual Linux filesystem: no actual private path, credentials or backup data.
function fixture(options = {}) {
  const entries = new Map(), opened = [], closed = [];
  let inode = 1;
  const fileStat = (size, change = {}) => ({ dev: 3, ino: inode++, uid: 1001, mode: 0o100600, nlink: 1, size, mtimeMs: 1, ctimeMs: 1,
    isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, ...change });
  const put = (path, value, change) => { const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(JSON.stringify(value)); entries.set(path, { bytes, stat: fileStat(bytes.length, change) }); };
  for (let path = PRIVATE_BACKUP_ROOT;; path = posix.dirname(path)) {
    const privatePath = path.includes("/.asha-private");
    entries.set(path, { stat: fileStat(0, { uid: privatePath ? 1001 : 0, mode: privatePath ? 0o40700 : 0o40755, nlink: 2, isFile: () => false, isDirectory: () => true }) });
    if (path === "/") break;
  }
  put(dumpPath, dump); put(retainedPath, manifest); put(PRIVATE_BACKUP_RECEIPT, manifest);
  const io = {
    platform: "linux", uid: 1001,
    lstat: async path => { options.onLstat?.(path, entries); if (!entries.has(path)) throw Error("Synthetic missing private data path"); return { ...entries.get(path).stat }; },
    open: async (path, flags) => {
      opened.push({ path, flags }); options.onOpen?.(path, entries);
      const entry = entries.get(path); if (!entry) throw Error("Synthetic missing private data path");
      return {
        stat: async () => ({ ...entry.stat }), close: async () => { closed.push(path); },
        read: async (buffer, offset, length, position) => {
          options.onRead?.(path, entries, entry);
          const bytesRead = Math.max(0, Math.min(length, options.chunkSize ?? Infinity, entry.bytes.length - position));
          entry.bytes.copy(buffer, offset, position, position + bytesRead); return { bytesRead, buffer };
        },
      };
    },
    ...options.io,
  };
  return { entries, opened, closed, put, verifier: createPrivateBackupVerifier(io) };
}

test("retained verification reads fixed protected receipts and actual streamed digest without writes", async () => {
  const f = fixture({ chunkSize: 3 });
  const result = await f.verifier.verifyRetainedPrivateBackup(selection);
  assert.deepEqual(result, manifest); assert.equal(Object.isFrozen(result), true);
  assert.equal(await f.verifier.hashPrivateBackupDump(dumpPath), manifest.sha256);
  assert.deepEqual(await f.verifier.verifyPrivateBackupCandidate({ ...selection, manifest: JSON.stringify(manifest) }), manifest);
  assert.ok(f.opened.every(({ flags }) => flags === (constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)));
  assert.equal(f.closed.length, f.opened.length);
  assert.ok(f.opened.every(({ path }) => [dumpPath, retainedPath, PRIVATE_BACKUP_RECEIPT].includes(path)));
});

test("missing dump or same-size byte corruption cannot certify a retained backup", async () => {
  const missing = fixture(); missing.entries.delete(dumpPath);
  await assert.rejects(missing.verifier.verifyRetainedPrivateBackup(selection), safeError);
  const corrupt = fixture(); const bytes = corrupt.entries.get(dumpPath).bytes; bytes[0] ^= 1;
  assert.equal(bytes.length, dump.length);
  await assert.rejects(corrupt.verifier.verifyRetainedPrivateBackup(selection), safeError);
  assert.deepEqual(JSON.parse(corrupt.entries.get(PRIVATE_BACKUP_RECEIPT).bytes), manifest);
});

test("receipt and dump require exact owner0600 ordinary single-link files", async () => {
  for (const path of [PRIVATE_BACKUP_RECEIPT, retainedPath, dumpPath]) for (const change of [
    { uid: 0 }, { uid: 999 }, { mode: 0o100640 }, { mode: 0o100400 }, { mode: 0o104600 }, { nlink: 2 },
    { isSymbolicLink: () => true }, { isFile: () => false }, { size: 0 }, { size: NaN },
  ]) {
    const f = fixture(); Object.assign(f.entries.get(path).stat, change);
    await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError);
  }
});

test("all ancestors are nonlinked and nonwritable; private directories exact owner0700", async () => {
  for (const path of ["/", "/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", "/home/wealthos_dev/.asha-private/goldsilver", PRIVATE_BACKUP_ROOT]) {
    for (const change of [{ isSymbolicLink: () => true }, { isDirectory: () => false }, { uid: 999 }, { mode: 0o40777 }, { mode: 0o41755 }]) {
      const f = fixture(); Object.assign(f.entries.get(path).stat, change);
      await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError); assert.equal(f.opened.length, 0);
    }
  }
  for (const change of [{ uid: 0 }, { mode: 0o40750 }, { mode: 0o40500 }]) {
    const f = fixture(); Object.assign(f.entries.get(PRIVATE_BACKUP_ROOT).stat, change);
    await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError);
  }
});

test("platform/account rejection never opens an artifact or accepts root", async () => {
  for (const io of [{ platform: "win32" }, { uid: 0 }, { uid: undefined }, { uid: NaN }, { uid: -1 }, { uid: 1.5 }]) {
    const f = fixture({ io }); await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError); assert.equal(f.opened.length, 0);
  }
});

test("strict manifest rejects unknown keys, stale/future/wrong-release and incomplete verification", () => {
  for (const change of [{ extra: true }, { version: 2 }, { state: "pending" }, { commit: "b".repeat(40) }, { verifiedAt: now + 1 },
    { verifiedAt: now - 86_400_001 }, { verifiedAt: 1.1 }, { sha256: "A".repeat(64) }, { sha256: "x" },
    { persistentTablesVerified: localBackupTables.length - 1 }, { authorizationRestored: true }, { offHostBackup: true }]) {
    assert.throws(() => parsePrivateBackupManifest(JSON.stringify({ ...manifest, ...change }), selection), safeError);
  }
  for (const raw of ["null", "[]", "{", " ".repeat(4097), JSON.stringify({ ...manifest, sha256: undefined })]) assert.throws(() => parsePrivateBackupManifest(raw, selection), safeError);
  for (const bad of [{ commit: "main" }, { now: NaN }, { now: -1 }, { now: 1.5 }]) assert.throws(() => parsePrivateBackupManifest(JSON.stringify(manifest), { ...selection, ...bad }), safeError);
  assert.deepEqual(parsePrivateBackupManifest(JSON.stringify(manifest), { commit, now: now + 86_400_000 }), manifest);
});

test("only exact fixed dump filename is allowed, never traversal, alternative suffix, URI or root override", async () => {
  for (const path of ["/etc/passwd", `${PRIVATE_BACKUP_ROOT}/../private-${now}-abcdef01.dump`, `${PRIVATE_BACKUP_ROOT}//private-${now}-abcdef01.dump`,
    dumpPath + "/other", dumpPath + "\n", dumpPath.replace("abcdef01", "ABCDEF01"), dumpPath.replace(".dump", ".json"),
    dumpPath.replace(String(now - 1000), "123"), dumpPath.replace("backups/", "backup/"), "file://" + dumpPath]) {
    assert.throws(() => parsePrivateBackupManifest(JSON.stringify({ ...manifest, backup: path }), selection), safeError);
    const f = fixture(); await assert.rejects(f.verifier.hashPrivateBackupDump(path), safeError); assert.equal(f.opened.length, 0);
  }
  assert.throws(() => parsePrivateBackupManifest(JSON.stringify({ ...manifest, backup: dumpPath.replace(String(now - 1000), String(now + 1)) }), selection), safeError);
});

test("named retained receipt is required and must match every current receipt field", async () => {
  const missing = fixture(); missing.entries.delete(retainedPath);
  await assert.rejects(missing.verifier.verifyRetainedPrivateBackup(selection), safeError);
  for (const change of [{ verifiedAt: now - 1 }, { sha256: "b".repeat(64) }]) {
    const f = fixture(); f.put(retainedPath, { ...manifest, ...change });
    await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError);
  }
});

test("oversize/invalidUTF8 receipts and oversize dumps fail before unbounded reads", async () => {
  for (const path of [PRIVATE_BACKUP_RECEIPT, retainedPath]) {
    const big = fixture(); big.put(path, Buffer.alloc(4097)); await assert.rejects(big.verifier.verifyRetainedPrivateBackup(selection), safeError);
    const utf = fixture(); utf.put(path, Buffer.from([0xff])); await assert.rejects(utf.verifier.verifyRetainedPrivateBackup(selection), safeError);
  }
  const f = fixture(); f.entries.get(dumpPath).stat.size = 8 * 1024 ** 3 + 1;
  await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError); assert.equal(f.opened.some(value => value.path === dumpPath), false);
});

test("replacement between name check and descriptor open is rejected and closed", async () => {
  for (const change of [{ ino: 999 }, { dev: 9 }, { mode: 0o100644 }, { nlink: 2 }]) {
    const f = fixture({ onOpen: (path, entries) => { if (path === dumpPath) Object.assign(entries.get(path).stat, change); } });
    await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError); assert.equal(f.opened.length, f.closed.length);
  }
});

test("in-place mutation, growth, truncation and directory swap during digest are rejected", async () => {
  for (const action of [
    entry => { entry.stat.mtimeMs++; }, entry => { entry.stat.ctimeMs++; }, entry => { entry.bytes = Buffer.concat([entry.bytes, Buffer.from("x")]); },
    entry => { entry.bytes = entry.bytes.subarray(0, entry.bytes.length - 1); },
    (_entry, entries) => { entries.get(PRIVATE_BACKUP_ROOT).stat.ino++; },
  ]) {
    let changed = false;
    const f = fixture({ onRead: (path, entries, entry) => { if (path === dumpPath && !changed) { changed = true; action(entry, entries); } } });
    await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError); assert.equal(f.opened.length, f.closed.length);
  }
});

test("latest publication changing during verification is rejected without modifying prior artifacts", async () => {
  let changed = false;
  const f = fixture({ onRead: (path, entries) => { if (path === dumpPath && !changed) { changed = true; entries.get(PRIVATE_BACKUP_RECEIPT).bytes = Buffer.from(JSON.stringify({ ...manifest, verifiedAt: now - 1 })); } } });
  await assert.rejects(f.verifier.verifyRetainedPrivateBackup(selection), safeError);
  assert.deepEqual(f.entries.get(dumpPath).bytes, dump);
});
