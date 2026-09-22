// Fixed-destination entry point. The child exclusively owns the secret pipe and
// file handles; this wrapper receives only a strict metadata result.
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const child = fileURLToPath(new URL("./passkey-handoff-windows.ps1", import.meta.url));
export function runPasskeyHandoff(args, dependencies = {}) {
  const blocked = { version: 1, state: "blocked", networkUsed: false, secretWithheld: true };
  const modes = { "--check": "Check", "--prepare": "Prepare", "--issue-and-deliver-once": "Deliver" };
  if ((dependencies.platform ?? process.platform) !== "win32" || args.length !== 1 || !Object.hasOwn(modes, args[0])) return blocked;
  try {
    const raw = (dependencies.execute ?? execFileSync)("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", child, "-Mode", modes[args[0]]], {
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: 95_000, maxBuffer: 4096,
    });
    const result = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
    const fields = ["version", "state", "networkUsed", "secretWithheld", "pathSafe", "directoryPresent", "attemptPresent", "grantPresent", "grantMetadataSafe", "createdDirectory", "expiresAt"];
    if (!result || Object.keys(result).sort().join() !== fields.sort().join() || result.version !== 1
      || !["blocked", "ready", "delivered"].includes(result.state) || result.secretWithheld !== true
      || fields.filter(field => !["version", "state", "expiresAt"].includes(field)).some(field => typeof result[field] !== "boolean")
      || (result.expiresAt !== null && (typeof result.expiresAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result.expiresAt)))
      || (result.state === "delivered" && (!result.networkUsed || !result.grantMetadataSafe || result.expiresAt === null))
      || (args[0] !== "--issue-and-deliver-once" && (result.networkUsed || result.state === "delivered"))) throw Error();
    return result;
  } catch { return { ...blocked, networkUsed: args[0] === "--issue-and-deliver-once", state: args[0] === "--issue-and-deliver-once" ? "delivery_unconfirmed_do_not_retry" : "blocked" }; }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = runPasskeyHandoff(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = ["ready", "delivered"].includes(result.state) ? 0 : 1;
}
