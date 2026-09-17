import { execFileSync, spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { parseProtectedRuntimeEnvironment } from "./local-app.ts";
import { evaluateLocalHealth, validateLocalHealthUrl } from "./local-readiness.ts";
import { prepareManagedMarketDirectory } from "./managed-market-runtime.ts";
import { startLocalBackupSupervisor } from "./local-backup-supervisor.ts";
import { createLocalBackupProcessRunner, latestVerifiedLocalBackup, writeLocalBackupStatus } from "./local-backup-runtime.ts";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const postgresScript = fileURLToPath(new URL("./local-postgres.mjs", import.meta.url));
const runtimeEnvironmentFile = fileURLToPath(new URL("../../../.cache/postgres-local/runtime.env", import.meta.url));
const vinextCli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const managedMarketDirectory = fileURLToPath(new URL("../../../.cache/postgres-local/managed-market", import.meta.url));
const privateRoot = fileURLToPath(new URL("../../../.cache/postgres-local", import.meta.url));
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
    const cacheDirectory = await prepareManagedMarketDirectory(managedMarketDirectory);
    console.log("برنامهٔ محلی در حال اجراست: http://127.0.0.1:4174/ (برای توقف Ctrl+C)");
    const child = spawn(process.execPath, [vinextCli, "dev", "--port", "4174", "--hostname", "127.0.0.1"], {
      cwd: webRoot,
      env: {
        ...process.env,
        ...runtimeEnvironment,
        ASHA_LOCAL_NODE_DEV: "true",
        ASHA_MARKET_NETWORK_ENABLED: "false",
        ASHA_LOCAL_MARKET_TEST_ENABLED: "true",
        ASHA_MANAGED_MARKET_ENABLED: "true",
        ASHA_MANAGED_MARKET_CACHE_DIRECTORY: cacheDirectory,
        NAVASAN_HISTORY_EXECUTION_ENABLED: "false",
        CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      },
      stdio: "inherit",
      windowsHide: true,
    });
    let backupSupervisor = null, readinessTimer = null, appFinished = false, readinessAttempts = 0, lastBackupState = null;
    const startBackupsWhenReady = async () => {
      const readiness = await existingReadiness();
      if (appFinished) return;
      if (readiness.ready) {
        backupSupervisor = startLocalBackupSupervisor({
          inspect: () => latestVerifiedLocalBackup(privateRoot),
          runBackup: createLocalBackupProcessRunner(process.execPath, postgresScript, webRoot),
          report: async status => {
            if (status.state !== lastBackupState) {
              lastBackupState = status.state;
              const message = status.state === "verified" ? "پشتیبان محلیِ تأییدشدهٔ کمتر از ۲۴ ساعت موجود است؛ بررسی روزانه تا زمان باز بودن برنامه ادامه دارد."
                : status.state === "running" ? "پشتیبان محلی در حال تهیه و آزمون بازیابی است؛ برنامه قابل استفاده می‌ماند."
                : "هشدار: پشتیبان تازهٔ تأییدشده موجود نیست؛ دادهٔ برنامه و نسخه‌های قبلی حذف نشده‌اند. بررسی دوباره یک ساعت دیگر، تا زمان باز بودن برنامه.";
              if (status.state === "overdue") console.warn(message); else console.log(message);
            }
            try { await writeLocalBackupStatus(privateRoot, status); }
            catch { console.warn("ثبت وضعیت پشتیبان کامل نشد؛ نتیجه فقط در همین پنجره گزارش می‌شود."); }
          },
        });
      } else if (++readinessAttempts < 24) {
        readinessTimer = setTimeout(() => { void startBackupsWhenReady(); }, 5_000);
      } else console.warn("آمادگی برنامه تأیید نشد؛ پشتیبان‌گیری منظم در این اجرا شروع نشد.");
    };
    // Health only; no provider acquisition and no delay to the app's startup.
    void startBackupsWhenReady();
    const stopSupervision = () => {
      appFinished = true;
      if (readinessTimer) clearTimeout(readinessTimer);
      backupSupervisor?.stop();
    };
    const stopOwnedApp = () => { stopSupervision(); child.kill("SIGTERM"); };
    process.once("SIGINT", stopOwnedApp);
    process.once("SIGTERM", stopOwnedApp);
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", error => { stopSupervision(); reject(error); });
      child.once("exit", (code) => { stopSupervision(); resolve(code ?? 1); });
    });
  }
} catch (error) {
  console.error(`اجرای محلی ناموفق بود: ${error instanceof Error ? error.message : "Unknown local launch error"}`);
  process.exitCode = 1;
}
