import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

// Execute the actual entrypoint body with bounded dependency substitutes. No
// private configuration, database, provider, listener or production OS access.
const url = new URL("../scripts/start-private-server.mjs", import.meta.url);
const source = await readFile(url, "utf8");
const body = source.replace(/^import .+;\r?\n/gm, "").replaceAll("import.meta.url", JSON.stringify(url.href));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const release = "a".repeat(40), canary = "PRIVATE_CONFIG_OR_PROVIDER_SECRET_DO_NOT_LOG";
async function run({ args = ["--check-startup"], failure, databaseState = "ready", mode = "passkey" } = {}) {
  const calls = [], output = [], errors = [], listeners = new Map();
  let providerCalls = 0, databaseWrites = 0, poolClosed = 0, readOnlyTransactions = 0;
  const process = { argv: ["node", "start-private-server.mjs", ...args], env: {}, exitCode: undefined,
    stdout: { write: value => output.push(value) }, stderr: { write: value => errors.push(value) }, once: (signal, callback) => listeners.set(signal, callback) };
  const fetcher = async () => { providerCalls++; throw Error(canary); };
  const server = label => ({ closeAllConnections() { calls.push(`${label}-connections-closed`); }, close(done) { calls.push(`${label}-closed`); done(); } });
  const dependencies = {
    process, globalThis: { fetch: fetcher }, fileURLToPath, resolve,
    readFile: async () => { calls.push("manifest"); return JSON.stringify({ target: "private-node", workingTreeClean: true, deploymentEligible: true, sourceBranch: "codex/phase-2-decision-engine", commit: release }); },
    execFileSync: (_program, values) => values.includes("HEAD") ? release : values.includes("--porcelain") ? "" : "codex/phase-2-decision-engine",
    assertPrivateProcessEnvironment: () => calls.push("environment"),
    readPrivateServerConfig: async () => { calls.push("configuration"); if (failure === "configuration") throw Error(canary); return { version: mode === "passkey" ? 2 : 1, origin: "https://goldsilver.wealthos.ir", ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-portfolio", databaseUrl: canary, googleClientId: "synthetic", googleClientSecret: canary }; },
    Pool: class { constructor() { calls.push("pool"); } on() {} async end() { poolClosed++; calls.push("pool-closed"); } },
    createPgTransactionRunner: () => ({ async transaction(work) {
      let readOnly = false; calls.push("transaction");
      return work({ async query(sql) {
        if (sql === "SET TRANSACTION READ ONLY") { readOnly = true; readOnlyTransactions++; calls.push("read-only"); return { rows: [] }; }
        if (sql.startsWith("UPDATE")) { if (readOnly) throw Error(canary); databaseWrites++; }
        calls.push("query"); return { rows: [] };
      }, get readOnly() { return readOnly; } });
    } }),
    readMigrations: async () => { calls.push("migrations"); return [{ id: "synthetic_migration", checksum: "b".repeat(64) }]; },
    probePrivatePortfolioDatabase: async database => { calls.push("database-probe"); assert.equal(database.readOnly, args.includes("--check-startup")); return { state: databaseState }; },
    preparePrivateMarketActivation: async input => {
      calls.push("market-prepare");
      if (failure === "ancestor") throw Error(`/home mode0711 ${canary}`);
      if (failure === "provider") await input.fetcher("https://provider.invalid/");
      await input.runner.transaction(async database => {
        assert.equal(database.readOnly, args.includes("--check-startup"));
        if (failure === "write") await database.query("UPDATE synthetic_quota SET reserved=true");
        else await database.query("SELECT synthetic_metadata");
      });
      return Object.freeze({ preparedOnly: true });
    },
    startProdServer: async options => { calls.push("ui-listener"); assert.equal(options.host, "127.0.0.1"); assert.equal(options.port, 0); return { server: server("ui"), port: 12345 }; },
    createPrivatePasskeyRuntime: options => { calls.push("passkey-runtime"); assert.equal(options.release, release); return () => {}; },
    createPrivatePortfolioRuntime: options => { calls.push("google-runtime"); assert.equal(options.release, release); return () => {}; },
    createGoogleIdentityAdapter: () => { calls.push("google-adapter"); return {}; },
    privateUiResponse: value => value,
    createPrivateHttpServer: () => { calls.push("gateway"); return { ...server("gateway"), once() {}, listen(port, host, done) { assert.equal(port, 3012); assert.equal(host, "127.0.0.1"); calls.push("gateway-listener"); done(); } }; },
  };
  await new AsyncFunction(...Object.keys(dependencies), body)(...Object.values(dependencies));
  return { calls, output, errors, providerCalls, databaseWrites, poolClosed, readOnlyTransactions, listeners, exitCode: process.exitCode };
}

test("startup check follows real preparation order then closes without listeners, runtime identity or writes", async () => {
  const result = await run();
  assert.deepEqual(result.calls, ["environment", "configuration", "manifest", "pool", "migrations", "transaction", "read-only", "database-probe", "market-prepare", "transaction", "read-only", "query", "pool-closed"]);
  assert.deepEqual(JSON.parse(result.output.join("")), { version: "asha.private_startup_preflight.v1", startupChecksPass: true, release,
    privateConfigurationChecked: true, databaseReady: true, marketPreparationChecked: true, providerAcquisitionAllowed: false, listenersStarted: false, ownerLoginVerified: false });
  assert.equal(result.providerCalls, 0); assert.equal(result.databaseWrites, 0); assert.equal(result.poolClosed, 1); assert.equal(result.listeners.size, 0); assert.equal(result.exitCode, undefined);
});

test("actual preparation failure including non-readable ancestor fails before listener and is sanitized", async () => {
  const result = await run({ failure: "ancestor" });
  assert.ok(result.calls.includes("configuration")); assert.ok(result.calls.includes("database-probe")); assert.ok(result.calls.includes("market-prepare"));
  assert.equal(JSON.parse(result.output.join("")).stage, "market_preparation"); assert.equal(result.exitCode, 1);
  assert.equal(result.poolClosed, 1); assert.equal(result.calls.includes("ui-listener"), false);
  assert.doesNotMatch(result.output.join("") + result.errors.join(""), /PRIVATE_CONFIG|\/home|0711|stack|password|SELECT/);
});

test("startup preflight refuses provider acquisition and DB mutation even if preparation regresses", async () => {
  for (const failure of ["provider", "write"]) {
    const result = await run({ failure });
    assert.equal(result.exitCode, 1); assert.equal(result.providerCalls, 0); assert.equal(result.databaseWrites, 0);
    assert.equal(result.calls.includes("gateway"), false); assert.equal(result.poolClosed, 1);
    assert.equal(JSON.parse(result.output.join("")).startupChecksPass, false);
    assert.doesNotMatch(result.output.join("") + result.errors.join(""), /PRIVATE_CONFIG/);
  }
});

test("configuration, readiness and argument failures stop early without bypassing normal guards", async () => {
  const config = await run({ failure: "configuration" }); assert.equal(config.exitCode, 1); assert.equal(config.calls.includes("pool"), false);
  const database = await run({ databaseState: "blocked" }); assert.equal(database.exitCode, 1); assert.equal(database.calls.includes("market-prepare"), false);
  for (const args of [["--unknown"], ["--check-startup", "--unknown"], ["--check-startup", "--check-startup"]]) {
    const result = await run({ args }); assert.equal(result.exitCode, 1); assert.deepEqual(result.calls, []); assert.equal(result.providerCalls, 0);
  }
});

test("no-argument normal startup retains real runtime, loopback listeners and existing transactions", async () => {
  for (const mode of ["passkey", "google"]) {
    const result = await run({ args: [], mode });
    assert.equal(result.exitCode, undefined); assert.equal(result.readOnlyTransactions, 0); assert.equal(result.poolClosed, 0);
    assert.ok(result.calls.includes(mode === "passkey" ? "passkey-runtime" : "google-runtime"));
    assert.ok(result.calls.indexOf("market-prepare") < result.calls.indexOf("ui-listener"));
    assert.ok(result.calls.includes("gateway-listener")); assert.deepEqual([...result.listeners.keys()], ["SIGINT", "SIGTERM"]);
    assert.match(result.output.join(""), /Private service listening on loopback/); assert.equal(result.providerCalls, 0);
  }
});
