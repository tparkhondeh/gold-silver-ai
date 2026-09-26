import { assertPrivateReleaseDirectory } from "./private-supervision.ts";
import { evaluatePrivateReleaseReadiness } from "./private-release-readiness.ts";
import type { PrivateBackupManifest } from "./private-retained-backup.ts";

type ReleaseEvidence = { head: string; branch: string; clean: boolean; manifest: unknown };
type Inspection = {
  platform: string; uid: number | undefined; args: readonly string[]; repository: string;
  now: () => number;
  releaseEvidence: () => Promise<ReleaseEvidence>;
  disk: () => Promise<{ bavail: bigint; bsize: bigint }>;
  verifyBackup: (selection: { commit: string; now: number }) => Promise<PrivateBackupManifest>;
};

/** Read-only operator evidence, never a deployment authorization or a private-use
 * certificate. IO is injected for controlled tests; the CLI fixes every target. */
export async function inspectPrivateRelease(options: Inspection) {
  let now: unknown = null, release: string | null = null, availableBytes: bigint | null = null;
  try {
    now = options.now();
    if (options.platform !== "linux" || !Number.isSafeInteger(options.uid) || options.uid! <= 0
      || options.args.length !== 0 || !Number.isSafeInteger(now) || Number(now) <= 0
      || Number(now) > 8_640_000_000_000_000) throw Error();
    const expected = assertPrivateReleaseDirectory(options.repository);
    const evidence = await options.releaseEvidence();
    const manifest = evidence.manifest as Record<string, unknown> | null;
    if (evidence.head !== expected || evidence.branch !== "codex/phase-2-decision-engine" || evidence.clean !== true
      || !manifest || Array.isArray(manifest)
      || Object.keys(manifest).sort().join(",") !== "commit,deploymentEligible,sourceBranch,target,workingTreeClean"
      || manifest.commit !== expected || manifest.target !== "private-node" || manifest.workingTreeClean !== true
      || manifest.deploymentEligible !== true || manifest.sourceBranch !== evidence.branch) throw Error();
    release = expected;
  } catch { /* Never return exception text, paths, environment or configuration. */ }
  // A foreign checkout/platform/argument must not inspect the private filesystem.
  if (release !== null) {
    try {
      const disk = await options.disk();
      if (typeof disk.bavail !== "bigint" || disk.bavail < 0n || typeof disk.bsize !== "bigint" || disk.bsize <= 0n) throw Error();
      const bytes = disk.bavail * disk.bsize;
      if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) throw Error();
      availableBytes = bytes;
    } catch { /* Independent backup evidence remains useful if capacity is unknown. */ }
  }
  return evaluatePrivateReleaseReadiness({ release, now, availableBytes }, options.verifyBackup);
}
