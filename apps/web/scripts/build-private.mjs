import { execFileSync } from "node:child_process";
import { writeFile, mkdir, cp, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(root, "../..");
const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", windowsHide: true }).trim();
try {
  // PR CI uses detached HEAD. Building is read-only verification, not activation;
  // the production entry separately enforces the authorized working branch.
  const commit = git("rev-parse", "HEAD");
  const sourceBranch = git("branch", "--show-current");
  const before = git("status", "--porcelain");
  execFileSync(process.execPath, [resolve(root, "node_modules/vinext/dist/cli.js"), "build"], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, ASHA_BUILD_TARGET: "private-node" } });
  // This pinned Vinext CLI deliberately builds to dist regardless of Vite outDir.
  // Preserve a separate generated Node artifact before the default Worker build.
  await access(resolve(root, "dist/server/index.js"));
  await cp(resolve(root, "dist"), resolve(root, "dist-private"), { recursive: true });
  const workingTreeClean = before === "" && git("status", "--porcelain") === "" && git("rev-parse", "HEAD") === commit;
  await mkdir(resolve(root, "dist-private"), { recursive: true });
  const deploymentEligible = workingTreeClean && sourceBranch === "codex/phase-2-decision-engine";
  await writeFile(resolve(root, "dist-private/release.json"), JSON.stringify({ target: "private-node", commit, sourceBranch, workingTreeClean, deploymentEligible }));
  process.stdout.write(deploymentEligible ? "Private production build matches committed source; activation gates still apply.\n" : "Private build verified for tests only; this checkout is NOT deployable.\n");
} catch { process.stderr.write("Private build failed; release not approved.\n"); process.exitCode = 1; }
