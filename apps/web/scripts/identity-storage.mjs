// Fixed-path, Windows-only metadata preflight. Never opens credential contents.
import { execFileSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { identityStorageBooleanFields, identityStorageReport } from "./identity-storage-policy.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const checker = fileURLToPath(new URL("./identity-storage-windows.ps1", import.meta.url));
const relativeDirectory = ".cache/identity/google-owner-login";
const relativeCredential = `${relativeDirectory}/credentials.json`;

export async function runIdentityStoragePreflight(args, dependencies = {}) {
  const execute = dependencies.execute ?? execFileSync;
  const inspect = dependencies.inspect ?? lstat;
  const platform = dependencies.platform ?? process.platform;
  const facts = Object.fromEntries(identityStorageBooleanFields.map(key => [key, false]));
  facts.windowsSupported = platform === "win32";
  // No path argument, environment override, credentials, or arbitrary subprocess arguments.
  if (args.length !== 1 || !["--check", "--prepare"].includes(args[0]) || !facts.windowsSupported) return identityStorageReport(facts);
  const options = { windowsHide: true, stdio: "pipe", timeout: 15_000, maxBuffer: 16_384 };
  try {
    for (const path of [".cache/identity/", `${relativeDirectory}/`, relativeCredential]) {
      execute("git.exe", ["-C", repository, "check-ignore", "--quiet", "--no-index", "--", path], options);
    }
    facts.gitIgnored = true;
    const tracked = execute("git.exe", ["-C", repository, "ls-files", "-z", "--", ".cache/identity"], options);
    facts.gitUntracked = tracked.length === 0;
    const gather = async mode => {
      const output = execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", checker, "-Mode", mode], options);
      const metadata = JSON.parse(output.toString("utf8").replace(/^\uFEFF/, ""));
      const fields = identityStorageBooleanFields.filter(key => !["windowsSupported", "gitIgnored", "gitUntracked", "credentialSingleLink"].includes(key));
      if (!metadata || typeof metadata !== "object" || Object.keys(metadata).length !== fields.length
        || fields.some(key => typeof metadata[key] !== "boolean")) throw Error("Invalid metadata result");
      Object.assign(facts, metadata);
      if (!facts.pathChainSafe) { facts.credentialSingleLink = false; return; }
      try {
        const info = await inspect(join(repository, relativeCredential));
        facts.credentialSingleLink = facts.credentialPresent && info.isFile() && !info.isSymbolicLink() && info.nlink === 1;
      } catch (error) {
        if (error?.code !== "ENOENT" || facts.credentialPresent) throw Error("Metadata changed");
        facts.credentialSingleLink = true; // An absent file has no linked contents.
      }
    };
    await gather("Check");
    if (args[0] === "--prepare" && identityStorageReport(facts).canPrepare) await gather("Prepare");
  } catch {
    // No raw PowerShell/Git error, path, SID, filename, or data ever reaches output.
    facts.metadataComplete = false;
  }
  return identityStorageReport(facts);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await runIdentityStoragePreflight(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.readyForDirectSaveAs || result.retainedFileMetadataSafe ? 0 : 1;
}
