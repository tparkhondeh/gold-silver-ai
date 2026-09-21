// Deliberate Linux-only production entry. No migrations, enrollment, key transfer,
// provider market calls, local-data copying or fallback credentials.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { startProdServer } from "vinext/server/prod-server";
import { readPrivateServerConfig, assertPrivateProcessEnvironment } from "./private-server-config.ts";
import { createGoogleIdentityAdapter } from "../auth/google-identity-adapter.ts";
import { createPrivatePortfolioRuntime, createPrivatePasskeyRuntime } from "../auth/private-runtime.ts";
import { createPrivateHttpServer } from "../auth/private-http.ts";
import { createPgTransactionRunner } from "../db/postgres-runtime.ts";
import { readMigrations } from "../db/migrations.ts";
import { probePrivatePortfolioDatabase } from "../auth/private-database-readiness.ts";
import { privateUiResponse } from "../auth/private-ui-response.ts";

let pool, ui, gateway;
const stop = async () => {
  gateway?.closeAllConnections(); ui?.server.closeAllConnections();
  await Promise.all([gateway && new Promise(done => gateway.close(done)), ui && new Promise(done => ui.server.close(done))]);
  await pool?.end();
};
try {
  assertPrivateProcessEnvironment(process.env);
  const configuration = await readPrivateServerConfig();
  const root = fileURLToPath(new URL("../", import.meta.url));
  const outDir = resolve(root, "dist-private");
  const manifest = JSON.parse(await readFile(resolve(outDir, "release.json"), "utf8"));
  const release = manifest.commit;
  if (manifest.target !== "private-node" || manifest.workingTreeClean !== true || manifest.deploymentEligible !== true || manifest.sourceBranch !== "codex/phase-2-decision-engine" || !/^[0-9a-f]{40}$/.test(release)) throw Error();
  // Server TS is executed from this checkout too, not just the built browser UI.
  const git = (...args) => execFileSync("git", ["-C", resolve(root, "../.."), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git("rev-parse", "HEAD") !== release || git("status", "--porcelain") !== "" || git("branch", "--show-current") !== "codex/phase-2-decision-engine") throw Error();
  pool = new Pool({ connectionString: configuration.databaseUrl, max: 4, connectionTimeoutMillis: 3000, statement_timeout: 5000, idle_in_transaction_session_timeout: 5000 });
  pool.on("error", () => { process.stderr.write("Private database connection unavailable.\n"); });
  const runner = createPgTransactionRunner(pool), migrations = await readMigrations();
  const probe = await runner.transaction(database => probePrivatePortfolioDatabase(database, migrations));
  if (probe.state !== "ready") throw Error();
  // Fixed private upstream in the same supervised process, not a development server.
  ui = await startProdServer({ host: "127.0.0.1", port: 0, outDir, silent: true, noCompression: true });
  const binding = { origin: configuration.origin, issuer: configuration.version === 2 ? configuration.origin : "https://accounts.google.com", ownerSubject: configuration.ownerSubject, portfolioSubject: configuration.portfolioSubject };
  const common = { binding, runner, release,
    async publicUi(request) {
      const path = new URL(request.url).pathname;
      return privateUiResponse(await fetch(`http://127.0.0.1:${ui.port}${path}`, { headers: { accept: request.headers.get("accept") ?? "*/*", "accept-encoding": "identity" }, redirect: "error", signal: AbortSignal.timeout(10_000) }));
    },
  };
  const application = configuration.version === 2 ? createPrivatePasskeyRuntime(common) : createPrivatePortfolioRuntime({ ...common,
    adapter: createGoogleIdentityAdapter({ clientId: configuration.googleClientId, clientSecret: configuration.googleClientSecret, redirectUri: `${configuration.origin}/auth/google/callback` }),
  });
  gateway = createPrivateHttpServer(configuration.origin, application);
  await new Promise((done, reject) => { gateway.once("error", reject); gateway.listen(3012, "127.0.0.1", done); });
  process.stdout.write(`Private service listening on loopback; release ${release}. Real login still requires acceptance verification.\n`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(); });
} catch {
  process.stderr.write("Private service NOT started: private configuration, database readiness or production build is unavailable. No secret details logged.\n");
  await stop(); process.exitCode = 1;
}
