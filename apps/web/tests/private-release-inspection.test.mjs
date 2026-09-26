import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectPrivateRelease } from "../scripts/private-release-inspection.ts";
import { localBackupTables } from "../scripts/local-backup.ts";
import { PRIVATE_BACKUP_ROOT } from "../scripts/private-retained-backup.ts";

const commit = "a".repeat(40), now = 1_790_000_000_000;
const manifest = { target: "private-node", commit, sourceBranch: "codex/phase-2-decision-engine", workingTreeClean: true, deploymentEligible: true };
function fixture(changes = {}) {
  const calls = [];
  return { calls, options: {
    platform: "linux", uid: 1056, args: [], repository: `/home/wealthos_dev/.goldsilver-service/releases/${commit}`, now: () => now,
    releaseEvidence: async () => { calls.push("release"); return { head: commit, branch: manifest.sourceBranch, clean: true, manifest }; },
    disk: async () => { calls.push("disk"); return { bavail: 2_097_152n, bsize: 4096n }; },
    verifyBackup: async selection => {
      calls.push("backup"); assert.deepEqual(selection, { commit, now });
      return { version: 1, state: "verified", commit, verifiedAt: now, backup: `${PRIVATE_BACKUP_ROOT}/private-${now - 1000}-abcdef12.dump`,
        sha256: "b".repeat(64), persistentTablesVerified: localBackupTables.length, authorizationRestored: false, offHostBackup: false };
    }, ...changes,
  } };
}
test("operator inspection combines exact release, available disk and verified backup without claiming private readiness", async () => {
  const f = fixture(), result = await inspectPrivateRelease(f.options);
  assert.deepEqual(f.calls, ["release", "disk", "backup"]);
  assert.equal(result.preflightChecksPass, true); assert.equal(result.privateUseReady, false); assert.equal(result.financialUseAllowed, false);
  assert.equal(result.availableBytes, String(8n * 1024n ** 3n));
});
test("foreign platform, root, nonfixed path, arguments or invalid clock cannot inspect private state", async () => {
  for (const change of [
    { platform: "win32" }, { uid: 0 }, { uid: undefined }, { uid: NaN }, { args: ["--path=/tmp/secret"] },
    { repository: "/tmp/clone" }, { repository: `/home/wealthos_dev/.goldsilver-service/releases/${commit}/../${commit}` },
    { now: () => NaN }, { now: () => 0 }, { now: () => 8_640_000_000_000_001 }, { now: () => { throw Error("CANARY"); } },
  ]) {
    const f = fixture(change), result = await inspectPrivateRelease(f.options);
    assert.equal(result.preflightChecksPass, false); assert.equal(result.release, null); assert.deepEqual(f.calls, []);
  }
});
test("dirty, wrong SHA/branch or unapproved build cannot probe private storage", async () => {
  for (const change of [{ head: "b".repeat(40) }, { branch: "main" }, { clean: false }, { manifest: null },
    ...["commit", "sourceBranch", "target", "workingTreeClean", "deploymentEligible"].map(key => ({ manifest: { ...manifest, [key]: "CANARY" } })),
    { manifest: { ...manifest, injected: "CANARY" } }, { manifest: [] }]) {
    const f = fixture({ releaseEvidence: async () => ({ head: commit, branch: manifest.sourceBranch, clean: true, manifest, ...change }) });
    const result = await inspectPrivateRelease(f.options);
    assert.equal(result.release, null); assert.equal(result.preflightChecksPass, false); assert.deepEqual(f.calls, []);
    assert.ok(!JSON.stringify(result).includes("CANARY"));
  }
});
test("disk rejection does not skip independent backup verification or reflect unsafe input", async () => {
  for (const disk of [{ bavail: -1n, bsize: 4096n }, { bavail: 1n, bsize: 0n }, { bavail: 12, bsize: 4096n },
    { bavail: BigInt(Number.MAX_SAFE_INTEGER), bsize: 4096n }]) {
    const f = fixture({ disk: async () => disk }), result = await inspectPrivateRelease(f.options);
    assert.equal(result.availableBytes, null); assert.equal(result.backupVerified, true); assert.equal(result.preflightChecksPass, false);
    assert.ok(result.reasons.includes("capacity_unavailable")); assert.deepEqual(f.calls, ["release", "backup"]);
  }
  const f = fixture({ disk: async () => { throw Error("CANARY"); }, verifyBackup: async () => { throw Error("CANARY"); } });
  const result = await inspectPrivateRelease(f.options);
  assert.ok(result.reasons.includes("capacity_unavailable")); assert.ok(result.reasons.includes("backup_unverified"));
  assert.ok(!JSON.stringify(result).includes("CANARY"));
});
test("actual CLI fails closed in a development checkout, emits only sanitized JSON and accepts no override", () => {
  const script = fileURLToPath(new URL("../scripts/check-private-readiness.mjs", import.meta.url));
  for (const args of [[], ["--path=/tmp/CANARY"]]) {
    let failure;
    try { execFileSync(process.execPath, ["--experimental-strip-types", script, ...args], { encoding: "utf8", windowsHide: true, timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SECRET_CANARY: "DO_NOT_REFLECT" } }); } catch (error) { failure = error; }
    assert.ok(failure); assert.equal(failure.status, 1);
    const raw = failure.stdout, result = JSON.parse(raw);
    assert.equal(result.preflightChecksPass, false); assert.equal(result.privateUseReady, false); assert.equal(result.release, null);
    assert.ok(!raw.includes("CANARY") && !raw.includes("DO_NOT_REFLECT"));
    assert.ok(result.reasons.includes("release_unverified"));
  }
});
