import { execFileSync, spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { parseProtectedRuntimeEnvironment } from "./local-app.ts";
import { evaluateLocalHealth, validateLocalHealthUrl } from "./local-readiness.ts";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const postgresScript = fileURLToPath(new URL("./local-postgres.mjs", import.meta.url));
const runtimeEnvironmentFile = fileURLToPath(new URL("../../../.cache/postgres-local/runtime.env", import.meta.url));
const vinextCli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const healthUrl = validateLocalHealthUrl("http://127.0.0.1:4174/api/health");

async function existingReadiness() {
  let response;
  try {
    response = await fetch(healthUrl, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    return { reachable: false, ready: false };
  }
  if (!response.ok) return { reachable: true, ready: false };
  try {
    const result = evaluateLocalHealth(await response.json());
    return { reachable: true, ready: result.readyForLocalEvaluation };
  } catch {
    return { reachable: true, ready: false };
  }
}

try {
  if (process.platform !== "win32") throw new Error("The owner-local launcher is Windows-specific");
  await access(vinextCli);
  execFileSync(process.execPath, ["--experimental-strip-types", postgresScript, "start"], {
    cwd: webRoot,
    stdio: "inherit",
    timeout: 60_000,
    windowsHide: true,
  });
  const runtimeEnvironment = parseProtectedRuntimeEnvironment(await readFile(runtimeEnvironmentFile, "utf8"));
  const current = await existingReadiness();
  if (current.ready) {
    console.log("برنامه از قبل سالم و آماده است: http://127.0.0.1:4174/");
    process.exitCode = 0;
  } else if (current.reachable) {
    throw new Error("Port 4174 is already serving an application that failed the Asha readiness contract");
  } else {
    console.log("برنامهٔ محلی در حال اجراست: http://127.0.0.1:4174/ (برای توقف Ctrl+C)");
    const child = spawn(process.execPath, [vinextCli, "dev", "--port", "4174", "--hostname", "127.0.0.1"], {
      cwd: webRoot,
      env: {
        ...process.env,
        ...runtimeEnvironment,
        CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      },
      stdio: "inherit",
      windowsHide: true,
    });
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  }
} catch (error) {
  console.error(`اجرای محلی ناموفق بود: ${error instanceof Error ? error.message : "Unknown local launch error"}`);
  process.exitCode = 1;
}
