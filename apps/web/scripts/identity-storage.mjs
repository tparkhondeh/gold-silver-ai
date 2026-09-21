// Fixed-path, Windows-only metadata preflight. Never opens credential contents.
import { execFileSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, win32 } from "node:path";
import { identityStorageBooleanFields, identityStorageReport } from "./identity-storage-policy.ts";

const checker = fileURLToPath(new URL("./identity-storage-windows.ps1", import.meta.url));
// This exact outside-workspace destination was owner-approved. Do not derive it
// from USERPROFILE/HOME or allow path arguments; moving it requires a new review.
const privateDirectory = String.raw`C:\Users\pc\.goldsilver-private\google-owner-login`;

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
    const gather = async mode => {
      const output = execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", checker, "-Mode", mode], options);
      const metadata = JSON.parse(output.toString("utf8").replace(/^\uFEFF/, ""));
      const fields = identityStorageBooleanFields.filter(key => !["windowsSupported", "credentialSingleLink", "probeSingleLink"].includes(key));
      if (!metadata || typeof metadata !== "object" || Object.keys(metadata).length !== fields.length
        || fields.some(key => typeof metadata[key] !== "boolean")) throw Error("Invalid metadata result");
      Object.assign(facts, metadata);
      if (!facts.pathChainSafe || !facts.outsideRepository || !facts.gitBoundarySafe) {
        facts.credentialSingleLink = false; facts.probeSingleLink = false; return;
      }
      for (const [name, prefix] of [["credentials.json", "credential"], ["save-as-probe.txt", "probe"]]) {
        try {
          const info = await inspect(win32.join(privateDirectory, name));
          facts[`${prefix}SingleLink`] = facts[`${prefix}Present`] && info.isFile() && !info.isSymbolicLink() && info.nlink === 1;
        } catch (error) {
          if (error?.code !== "ENOENT" || facts[`${prefix}Present`]) throw Error("Metadata changed");
          facts[`${prefix}SingleLink`] = true; // An absent file has no linked contents.
        }
      }
    };
    await gather("Check");
    if (args[0] === "--prepare" && identityStorageReport(facts).canPrepare) await gather("Prepare");
  } catch {
    // No raw PowerShell error, path, SID, filename, or data ever reaches output.
    facts.metadataComplete = false;
  }
  return identityStorageReport(facts);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await runIdentityStoragePreflight(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.readyForDirectSaveAs || result.retainedFileMetadataSafe ? 0 : 1;
}
