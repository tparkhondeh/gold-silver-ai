import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { evaluatePrivateReleaseReadiness, PRIVATE_RELEASE_RESERVE_BYTES } from "../scripts/private-release-readiness.ts";
import { createPrivateBackupVerifier, PRIVATE_BACKUP_ROOT, PRIVATE_BACKUP_RECEIPT } from "../scripts/private-retained-backup.ts";
import { localBackupTables } from "../scripts/local-backup.ts";

const now = 1_790_000_000_000, release = "a".repeat(40), reserve = 8n * 1024n ** 3n;
const dumpPath = `${PRIVATE_BACKUP_ROOT}/private-${now - 1000}-abcdef01.dump`;
const dump = Buffer.from("SYNTHETIC-DUMP-NOT-OWNER-DATA");
const manifest = { version: 1, state: "verified", commit: release, verifiedAt: now, backup: dumpPath,
  sha256: createHash("sha256").update(dump).digest("hex"), persistentTablesVerified: localBackupTables.length,
  authorizationRestored: false, offHostBackup: false };
const valid = () => ({ release, now, availableBytes: reserve });

test("exact reserve passes limited checks, never private/financial-use acceptance", async () => {
  let calls = 0;
  const result = await evaluatePrivateReleaseReadiness(valid(), async selection => {
    calls++; assert.deepEqual(selection, { commit: release, now }); assert.equal(Object.isFrozen(selection), true); return manifest;
  });
  assert.deepEqual(result, { version: 1, preflightChecksPass: true, privateUseReady: false, financialUseAllowed: false,
    release, checkedAt: new Date(now).toISOString(), availableBytes: "8589934592", requiredBytes: "8589934592", backupVerified: true, reasons: [] });
  assert.equal(calls, 1); assert.equal(PRIVATE_RELEASE_RESERVE_BYTES, reserve);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.reasons), true);
  assert.equal("backup" in result, false); assert.equal("sha256" in result, false);
});

test("capacity boundaries use exact bigint; unknown, negative, overflow and number coercion fail closed", async () => {
  for (const bytes of [0n, reserve - 1n]) {
    const result = await evaluatePrivateReleaseReadiness({ ...valid(), availableBytes: bytes }, async () => manifest);
    assert.deepEqual(result.reasons, ["low_capacity"]); assert.equal(result.availableBytes, bytes.toString()); assert.equal(result.backupVerified, true);
  }
  for (const bytes of [reserve, reserve + 1n, BigInt(Number.MAX_SAFE_INTEGER)]) assert.equal((await evaluatePrivateReleaseReadiness({ ...valid(), availableBytes: bytes }, async () => manifest)).preflightChecksPass, true);
  for (const bytes of [undefined, null, -1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n, 10n ** 100n, Number(reserve), NaN, Infinity, "8589934592", {}, []]) {
    const result = await evaluatePrivateReleaseReadiness({ ...valid(), availableBytes: bytes }, async () => manifest);
    assert.deepEqual(result.reasons, ["capacity_unavailable"]); assert.equal(result.availableBytes, null);
    assert.equal(result.preflightChecksPass, false); assert.equal(result.privateUseReady, false); assert.equal(result.financialUseAllowed, false);
  }
});

test("exact SHA and finite safe representable clock required before verifier invocation", async () => {
  for (const bad of [undefined, null, "main", "A".repeat(40), "a".repeat(39), "a".repeat(41), release + "\n", {}, 1]) {
    const result = await evaluatePrivateReleaseReadiness({ ...valid(), release: bad }, async () => assert.fail("unverified release must not check artifacts"));
    assert.deepEqual(result.reasons, ["release_unverified"]); assert.equal(result.release, null); assert.equal(result.backupVerified, false);
  }
  for (const bad of [undefined, null, 0, -1, now + 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER, 8_640_000_000_000_001, String(now), BigInt(now)]) {
    const result = await evaluatePrivateReleaseReadiness({ ...valid(), now: bad }, async () => assert.fail("invalid clock must not check artifacts"));
    assert.deepEqual(result.reasons, ["release_unverified"]); assert.equal(result.checkedAt, null); assert.equal(result.backupVerified, false);
  }
});

test("existing manifest parser retains exact24h boundary and denies stale/future/wrong-release artifacts", async () => {
  const exact = await evaluatePrivateReleaseReadiness({ ...valid(), now: now + 86_400_000 }, async () => manifest);
  assert.equal(exact.preflightChecksPass, true);
  const stale = await evaluatePrivateReleaseReadiness({ ...valid(), now: now + 86_400_001 }, async () => manifest);
  assert.deepEqual(stale.reasons, ["backup_unverified"]);
  for (const changed of [{ verifiedAt: now + 1 }, { commit: "b".repeat(40) }, { state: "pending" }, { persistentTablesVerified: 0 }, { authorizationRestored: true }, { offHostBackup: true }, { sha256: "invalid" }, { backup: "/unapproved/file.dump" }, { extra: "SYNTHETIC-PRIVATE-DETAIL" }]) {
    const result = await evaluatePrivateReleaseReadiness(valid(), async () => ({ ...manifest, ...changed }));
    assert.deepEqual(result.reasons, ["backup_unverified"]); assert.equal(JSON.stringify(result).includes("SYNTHETIC-PRIVATE-DETAIL"), false);
  }
  for (const bad of [null, undefined, [], "SYNTHETIC-PRIVATE-DETAIL", { toJSON() { throw Error("SYNTHETIC-PRIVATE-DETAIL"); } }]) assert.deepEqual((await evaluatePrivateReleaseReadiness(valid(), async () => bad)).reasons, ["backup_unverified"]);
});

test("unknown/throwing inputs and verifier errors reveal only fixed reasons", async () => {
  for (const input of [null, undefined, {}, "SYNTHETIC-PRIVATE-DETAIL", new Proxy({}, { get() { throw Error("SYNTHETIC-PRIVATE-DETAIL"); } })]) {
    const result = await evaluatePrivateReleaseReadiness(input, async () => assert.fail());
    assert.deepEqual(result.reasons, ["release_unverified", "capacity_unavailable"]);
    assert.equal(JSON.stringify(result).includes("SYNTHETIC-PRIVATE-DETAIL"), false);
  }
  for (const verification of [async () => { throw Error("SYNTHETIC-PRIVATE-DETAIL password=forbidden"); }, () => { throw "SYNTHETIC-PRIVATE-DETAIL"; }, undefined]) {
    const result = await evaluatePrivateReleaseReadiness({ ...valid(), availableBytes: reserve - 1n }, verification);
    assert.deepEqual(result.reasons, ["low_capacity", "backup_unverified"]); assert.equal(result.backupVerified, false);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC|password|forbidden/);
  }
});

test("verification owns immutable selection and caller mutation cannot relabel an awaited result", async () => {
  const input = valid(); let finish;
  const pending = evaluatePrivateReleaseReadiness(input, selection => { assert.deepEqual(selection, { commit: release, now }); return new Promise(resolve => { finish = resolve; }); });
  input.release = "b".repeat(40); input.now = now + 86_400_001; input.availableBytes = 0n; finish(manifest);
  const result = await pending; assert.equal(result.preflightChecksPass, true); assert.equal(result.release, release); assert.equal(result.availableBytes, reserve.toString()); assert.equal(result.checkedAt, new Date(now).toISOString());
});

test("existing protected-file verifier rejects missing/same-size corrupt dumps in read-only synthetic composition", async () => {
  const makeVerifier = () => {
    const entries = new Map(); let inode = 1, opened = 0, closed = 0;
    const stat = (size, extra = {}) => ({ dev: 1, ino: inode++, uid: 1001, mode: 0o100600, nlink: 1, size, mtimeMs: 1, ctimeMs: 1,
      isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, ...extra });
    for (let path = PRIVATE_BACKUP_ROOT;; path = posix.dirname(path)) {
      const privatePath = path.includes("/.asha-private");
      entries.set(path, { stat: stat(0, { uid: privatePath ? 1001 : 0, mode: privatePath ? 0o40700 : 0o40755, nlink: 2, isFile: () => false, isDirectory: () => true }) });
      if (path === "/") break;
    }
    for (const [path, bytes] of [[dumpPath, Buffer.from(dump)], [dumpPath.replace(/\.dump$/, ".json"), Buffer.from(JSON.stringify(manifest))], [PRIVATE_BACKUP_RECEIPT, Buffer.from(JSON.stringify(manifest))]]) entries.set(path, { bytes, stat: stat(bytes.length) });
    const verifier = createPrivateBackupVerifier({ platform: "linux", uid: 1001,
      lstat: async path => { if (!entries.has(path)) throw Error("SYNTHETIC-PRIVATE-MISSING"); return { ...entries.get(path).stat }; },
      open: async path => { opened++; const entry = entries.get(path); return { stat: async () => ({ ...entry.stat }), close: async () => { closed++; }, read: async (buffer, offset, length, position) => { const count = Math.max(0, Math.min(length, entry.bytes.length - position)); entry.bytes.copy(buffer, offset, position, position + count); return { bytesRead: count }; } }; },
    });
    return { entries, verify: verifier.verifyRetainedPrivateBackup, balanced: () => opened === closed };
  };
  const good = makeVerifier(); assert.equal((await evaluatePrivateReleaseReadiness(valid(), good.verify)).preflightChecksPass, true); assert.equal(good.balanced(), true);
  for (const failure of ["missing", "corrupt"]) {
    const fixture = makeVerifier();
    if (failure === "missing") fixture.entries.delete(dumpPath); else fixture.entries.get(dumpPath).bytes[0] ^= 1;
    const result = await evaluatePrivateReleaseReadiness(valid(), fixture.verify);
    assert.deepEqual(result.reasons, ["backup_unverified"]); assert.equal(fixture.balanced(), true);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC|\.dump|\.asha-private/);
  }
});
