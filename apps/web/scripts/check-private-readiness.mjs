// Operator-only, fixed-scope, read-only. No keys, configuration, database, network,
// backup creation, enrollment, cleanup, schedule changes or deployment.
import { execFileSync } from "node:child_process";
import { realpath, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPrivateRelease } from "./private-release-inspection.ts";
import { verifyRetainedPrivateBackup } from "./private-retained-backup.ts";
import { PRIVATE_DATA_ROOT } from "./private-supervision.ts";
import { readPrivateBuildEvidence } from "./private-build-evidence.ts";

const repository = resolve(fileURLToPath(new URL("../", import.meta.url)), "../..");
const result = await inspectPrivateRelease({
  platform: process.platform, uid: process.getuid?.(), args: process.argv.slice(2), repository,
  now: Date.now,
  async releaseEvidence() {
    if (await realpath(repository) !== repository) throw Error();
    const git = (...args) => execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000, maxBuffer: 65_536,
      env: { PATH: "/usr/bin:/bin", GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
    }).trim();
    const head = git("rev-parse", "HEAD"), branch = git("branch", "--show-current");
    const clean = git("status", "--porcelain") === "";
    const manifest = await readPrivateBuildEvidence(repository);
    if (git("rev-parse", "HEAD") !== head || git("branch", "--show-current") !== branch || git("status", "--porcelain") !== "") throw Error();
    return { head, branch, clean, manifest };
  },
  disk: () => statfs(PRIVATE_DATA_ROOT, { bigint: true }),
  verifyBackup: verifyRetainedPrivateBackup,
});
process.stdout.write(JSON.stringify({ ...result, messageFa: result.preflightChecksPass
  ? "فضا و پشتیبان بررسی شدند؛ این نتیجه تأیید انتشار، ورود مالک یا استفادهٔ خصوصی نیست."
  : "آمادگی عملیاتی تأیید نشد؛ فضای آزاد، نسخه و پشتیبان معتبر را بررسی کنید. جزئیات خصوصی نمایش داده نمی‌شوند."
}) + "\n");
if (!result.preflightChecksPass) process.exitCode = 1;
