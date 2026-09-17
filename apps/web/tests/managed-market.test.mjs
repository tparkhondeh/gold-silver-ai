import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { makeNavasanSnapshot } from "../app/market-test-contract.ts";
import { MANAGED_MARKET_VERSION, validateManagedMarketResponse } from "../app/managed-market-contract.ts";
import { ManagedMarketRequestError, requestManagedMarket } from "../app/managed-market-client.ts";
import { handleManagedMarket } from "../app/api/managed-market/route.ts";
import { FileManagedMarketCache, encodeManagedCache, decodeManagedCache } from "../data/managed-market-cache.ts";
import { createManagedMarketService } from "../data/managed-market-service.ts";
import { prepareManagedMarketDirectory } from "../scripts/managed-market-runtime.ts";

const now = Date.parse("2000-01-01T12:00:00.000Z");
const environment = { ASHA_LOCAL_NODE_DEV: "true", ASHA_MANAGED_MARKET_ENABLED: "true", NAVASAN_API_KEY: "synthetic-secret-not-real", NAVASAN_KEY_ROTATION_CONFIRMED: "true", NAVASAN_VALUE_UNIT: "TOMAN", NAVASAN_PLAN: "free" };
const payload = (time = now, value = "5000000") => ({ "18ayar": { value, timestamp: String(Math.floor(time / 1000)) }, usd_sell: { value: "100000", timestamp: String(Math.floor(time / 1000)) } });
const snapshot = (time = now, published = time, value) => makeNavasanSnapshot(payload(published, value), "TOMAN", new Date(time).toISOString());
function serializedRunner() {
  let tail = Promise.resolve(); const calls = [];
  return { calls, transaction(work) {
    const task = tail.then(() => work({ async query(sql) { calls.push(sql); assert.equal(sql, "SELECT pg_advisory_xact_lock(174228531, 11)"); return { rows: [], rowCount: 1 }; } }));
    tail = task.catch(() => {}); return task;
  } };
}
async function temporary(context) {
  const directory = await mkdtemp(join(tmpdir(), "asha-managed-market-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function memory(initial = null) {
  let value = initial; let writes = 0;
  return { get value() { return structuredClone(value); }, get writes() { return writes; }, async read() { return structuredClone(value); }, async replace(candidate) { writes++; value = structuredClone(candidate); return structuredClone(candidate); } };
}
function dependencies(options = {}) {
  let used = 0, reservedAt = null; const calls = { reserve: [], fetch: 0, outcomes: [] };
  const cache = options.cache ?? memory(options.initial ?? null);
  const ledger = {
    async reserve(endpoint, hash, interval) {
      calls.reserve.push({ endpoint, hash, interval });
      if (options.reserveError) throw Error("private DB details");
      if (options.reservation) return options.reservation;
      if (reservedAt !== null) return { allowed: false, used, remaining: 115 - used, reservationId: null, retryAfterSeconds: interval };
      used++; reservedAt = now;
      return { allowed: true, used, remaining: 115 - used, reservationId: "navasan_request_test", retryAfterSeconds: null };
    },
    async recordLatestOutcome(input) { calls.outcomes.push(input); if (options.outcomeError) throw Error(environment.NAVASAN_API_KEY); },
  };
  const fetcher = async (url, init) => {
    calls.fetch++;
    assert.equal(used, options.reservation ? 0 : 1); // Reservation completes before outbound work.
    assert.equal(url.origin, "https://api.navasan.tech"); assert.equal(url.pathname, "/latest/");
    assert.deepEqual([...url.searchParams.keys()], ["api_key"]);
    assert.equal(init.redirect, "manual"); assert.equal(init.cache, "no-store"); assert.equal(init.body, undefined);
    if (options.fetcher) return options.fetcher(url, init);
    return Response.json(payload());
  };
  const config = { environment: { ...environment, ...options.environment }, cache, resolveLedger: async () => options.unavailable ? { available: false } : { available: true, ledger }, fetcher, clock: () => now };
  return { calls, cache, config, latest: createManagedMarketService(config) };
}
const request = (headers = {}, url = "http://127.0.0.1:4174/api/managed-market", options = {}) => new Request(url, { method: "POST", headers: { origin: new URL(url).origin, "sec-fetch-site": "same-origin", "x-asha-managed-market": "latest", ...headers }, ...options });
const responseBody = (overrides = {}) => ({ version: MANAGED_MARKET_VERSION, state: "received", snapshot: snapshot(), checkedAt: new Date(now).toISOString(), nextCheckAt: new Date(now + 24_000_000).toISOString(), reason: "updated", quota: { used: 1, remaining: 114 }, ...overrides });

test("latest cache survives new instances, stores only a snapshot and never creates a price archive", async context => {
  const directory = await temporary(context), runner = serializedRunner();
  const first = new FileManagedMarketCache(directory, runner);
  assert.equal(await first.read(now), null);
  assert.deepEqual(await first.replace(snapshot(), now), snapshot());
  const second = new FileManagedMarketCache(directory, runner);
  assert.deepEqual(await second.read(now + 8_000_000), snapshot()); // Stale stays stale.
  await second.replace(snapshot(now + 1000), now + 1000);
  assert.deepEqual(await readdir(directory), ["latest.json"]);
  const raw = await readFile(join(directory, "latest.json"), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["snapshot", "version"]);
  assert.doesNotMatch(raw, /synthetic-secret|holdings|purchaseBook|DATABASE_URL/);
  assert.deepEqual(decodeManagedCache(raw, now + 1000), snapshot(now + 1000));
  assert.equal(runner.calls.length, 2);
});

test("serialized independent writers preserve newest receipt, immutable input and equal-time conflicts", async context => {
  const directory = await temporary(context), runner = serializedRunner();
  const a = new FileManagedMarketCache(directory, runner), b = new FileManagedMarketCache(directory, runner);
  const latest = snapshot(now + 2000);
  await Promise.all([a.replace(latest, now + 2000), b.replace(snapshot(), now + 2000)]);
  assert.deepEqual(await a.read(now + 2000), latest);
  assert.deepEqual(await a.replace(latest, now + 2000), latest);
  await assert.rejects(a.replace(snapshot(now + 2000, now + 2000, "5000001"), now + 2000));
  const candidate = snapshot(now + 3000), expected = structuredClone(candidate);
  const pending = b.replace(candidate, now + 3000); candidate.observations[0].priceRial = "1";
  await pending;
  assert.deepEqual(await b.read(now + 3000), expected);
});

test("later receipt never hides missing coverage, older source time, or a same-publication conflicting price", async context => {
  const directory = await temporary(context), cache = new FileManagedMarketCache(directory, serializedRunner());
  await cache.replace(snapshot(), now);
  const before = await readFile(join(directory, "latest.json"), "utf8");
  const missing = snapshot(now + 1000); missing.observations.pop();
  const addedWithRegression = snapshot(now + 1000, now - 1000);
  const extra = makeNavasanSnapshot({ sekkeh: { value: "50000", timestamp: String(now / 1000) } }, "TOMAN", new Date(now + 1000).toISOString());
  addedWithRegression.observations.push(...extra.observations);
  const old = snapshot(now + 1000, now - 1000);
  for (const next of [missing, old, addedWithRegression, snapshot(now + 1000, now, "5000001")]) {
    await assert.rejects(cache.replace(next, now + 1000));
    assert.equal(await readFile(join(directory, "latest.json"), "utf8"), before);
  }
  const samePublication = snapshot(now + 1000, now);
  await cache.replace(samePublication, now + 1000);
  assert.equal((await cache.read(now + 1000)).observations[0].publishedAt, snapshot().observations[0].publishedAt);
  const partialDirectory = await temporary(context), partial = new FileManagedMarketCache(partialDirectory, serializedRunner());
  await partial.replace(missing, now + 1000);
  assert.equal((await partial.read(now + 1000)).observations.length, 1);
});

test("unreadable/corrupt/oversized existing cache and staging files remain untouched", async context => {
  const directory = await temporary(context), cache = new FileManagedMarketCache(directory, serializedRunner());
  for (const raw of ["corrupt", "x".repeat(65_537), encodeManagedCache(snapshot(), now).replace('"version":', '"version":"duplicate","version":')]) {
    await writeFile(join(directory, "latest.json"), raw, { mode: 0o600 });
    await assert.rejects(cache.read(now)); await assert.rejects(cache.replace(snapshot(now + 1000), now + 1000));
    assert.equal(await readFile(join(directory, "latest.json"), "utf8"), raw);
  }
  await writeFile(join(directory, "latest.json"), encodeManagedCache(snapshot(), now), { mode: 0o600 });
  await writeFile(join(directory, "latest.pending"), "interrupted-invalid", { mode: 0o600 });
  await assert.rejects(cache.replace(snapshot(now + 1000), now + 1000));
  assert.equal(await readFile(join(directory, "latest.pending"), "utf8"), "interrupted-invalid");
  assert.deepEqual(await cache.read(now), snapshot());
  await writeFile(join(directory, "latest.pending"), encodeManagedCache(snapshot(now + 1000), now + 1000), { mode: 0o600 });
  await cache.replace(snapshot(now + 2000), now + 2000);
  assert.deepEqual(await readdir(directory), ["latest.json"]);
});

test("cache rejects link indirection and directory/file confusion before replacement", async context => {
  const directory = await temporary(context), target = await temporary(context);
  const cache = new FileManagedMarketCache(directory, serializedRunner());
  await mkdir(join(directory, "latest.json"));
  await assert.rejects(cache.read(now));
  const linkDir = join(target, "linked");
  await symlink(directory, linkDir, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(new FileManagedMarketCache(linkDir, serializedRunner()).read(now));
  const hardDir = await temporary(context);
  await writeFile(join(hardDir, "source"), encodeManagedCache(snapshot(), now), { mode: 0o600 });
  await link(join(hardDir, "source"), join(hardDir, "latest.json"));
  await assert.rejects(new FileManagedMarketCache(hardDir, serializedRunner()).read(now));
});

test("crash lock cannot be evicted, and advisory-connection loss cannot permit a competing stale file write", async context => {
  const directory = await temporary(context), cache = new FileManagedMarketCache(directory, serializedRunner());
  await cache.replace(snapshot(), now);
  await writeFile(join(directory, "latest.lock"), "", { mode: 0o600 });
  await assert.rejects(cache.replace(snapshot(now + 1000), now + 1000));
  assert.deepEqual(await cache.read(now), snapshot());
  assert.equal(await readFile(join(directory, "latest.lock"), "utf8"), "");
  await rm(join(directory, "latest.lock")); // Explicit synthetic recovery only.
  const noDatabaseExclusion = { async transaction(work) { return work({ async query() { return { rows: [], rowCount: 1 }; } }); } };
  const a = new FileManagedMarketCache(directory, noDatabaseExclusion), b = new FileManagedMarketCache(directory, noDatabaseExclusion);
  const results = await Promise.allSettled([a.replace(snapshot(now + 2000), now + 2000), b.replace(snapshot(now + 1000), now + 2000)]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(results.filter(item => item.status === "rejected").length, 1);
  assert.deepEqual(await readdir(directory), ["latest.json"]);
});

test("in-process overlapping browser requests share exactly one durable reservation and provider call", async () => {
  let complete;
  const d = dependencies({ fetcher: () => new Promise(resolve => { complete = resolve; }) });
  const one = d.latest(), two = d.latest();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(d.calls.fetch, 1); assert.equal(d.calls.reserve.length, 1);
  complete(Response.json(payload()));
  const [a, b] = await Promise.all([one, two]);
  assert.equal(a.reason, "updated"); assert.deepEqual(a, b);
  a.snapshot.observations[0].priceRial = "1"; assert.notEqual(a.snapshot.observations[0].priceRial, b.snapshot.observations[0].priceRial);
  const next = await d.latest(); assert.equal(next.reason, "refresh_cooldown"); assert.equal(d.calls.fetch, 1);
  assert.deepEqual(next.snapshot, snapshot()); validateManagedMarketResponse(next, now);
});

test("independent worker/service instances share durable admission and cache without double acquisition", async () => {
  let complete;
  const d = dependencies({ initial: snapshot(now - 1000), fetcher: () => new Promise(resolve => { complete = resolve; }) });
  const otherWorker = createManagedMarketService(d.config);
  const acquiring = d.latest(); await new Promise(resolve => setImmediate(resolve));
  const waiting = await otherWorker();
  assert.equal(waiting.reason, "refresh_cooldown"); assert.equal(Date.parse(waiting.nextCheckAt) - now, 30_000);
  assert.equal(d.calls.fetch, 1);
  complete(Response.json(payload())); await acquiring;
  const restartedWorker = createManagedMarketService(d.config);
  assert.deepEqual((await restartedWorker()).snapshot, snapshot()); assert.equal(d.calls.fetch, 1);
});

test("configured cadence, safe minimum/default and exhausted quota are never bypassed", async () => {
  for (const [configured, expected] of [[undefined, 24000], ["1", 24000], ["86400", 86400], ["31536001", 31536000], ["invalid", 24000]]) {
    const d = dependencies({ environment: { NAVASAN_REFRESH_SECONDS: configured } });
    const result = await d.latest(); assert.equal(result.reason, "updated"); assert.equal(d.calls.reserve[0].interval, expected);
    assert.equal(Date.parse(result.nextCheckAt) - now, expected * 1000);
  }
  const d = dependencies({ initial: snapshot(), reservation: { allowed: false, used: 115, remaining: 0, reservationId: null, retryAfterSeconds: null } });
  const result = await d.latest(); assert.equal(result.reason, "quota_exhausted"); assert.deepEqual(result.snapshot, snapshot()); assert.equal(d.calls.fetch, 0);
});

test("configuration/cache/quota failure preserves valid cache and performs no provider request", async () => {
  for (const [options, reason] of [[{ environment: { NAVASAN_PLAN: "gold" } }, "free_plan_required"], [{ environment: { NAVASAN_API_KEY: "" } }, "missing_key"], [{ environment: { NAVASAN_KEY_ROTATION_CONFIRMED: "false" } }, "key_rotation_required"], [{ environment: { NAVASAN_VALUE_UNIT: "unknown" } }, "invalid_unit"], [{ unavailable: true }, "quota_unavailable"], [{ reserveError: true }, "quota_unavailable"]]) {
    const d = dependencies({ initial: snapshot(), ...options }); const result = await d.latest();
    assert.equal(result.reason, reason); assert.deepEqual(result.snapshot, snapshot()); assert.equal(d.calls.fetch, 0); assert.equal(d.cache.writes, 0);
  }
  const d = dependencies({ cache: { async read() { throw Error("private path"); } } });
  assert.equal((await d.latest()).reason, "cache_unavailable"); assert.equal(d.calls.reserve.length, 0); assert.equal(d.calls.fetch, 0);
});

test("upstream/validation/outcome/cache failure never retries or leaks raw data and keeps last-good in memory", async () => {
  const failures = [() => { throw Error(environment.NAVASAN_API_KEY); }, () => Response.redirect("https://private.invalid/", 302), () => Response.json({}, { status: 503 }), () => new Response("not-json"), () => new Response("x".repeat(262145)), () => new Response(new Uint8Array([0xff])), () => Response.json({})];
  for (const fetcher of failures) {
    const d = dependencies({ initial: snapshot(now - 1000), fetcher }); const result = await d.latest();
    assert.equal(result.reason, "provider_or_validation_failed"); assert.deepEqual(result.snapshot, snapshot(now - 1000));
    assert.equal(d.calls.fetch, 1); assert.equal(d.cache.writes, 0); assert.equal(d.calls.outcomes.at(-1).outcome, "failure");
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|private.invalid/);
  }
  const recording = dependencies({ initial: snapshot(now - 1000), outcomeError: true });
  assert.equal((await recording.latest()).reason, "provider_or_validation_failed"); assert.equal(recording.cache.writes, 0);
  const failedWrite = dependencies({ cache: { async read() { return snapshot(now - 1000); }, async replace() { throw Error("private path"); } } });
  assert.equal((await failedWrite.latest()).reason, "cache_unavailable"); assert.equal(failedWrite.calls.fetch, 1);
});

test("eight-second upstream deadline counts the attempt and suppresses an ignored late success", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let complete, receivedSignal;
  const d = dependencies({ initial: snapshot(now - 1000), fetcher: (_url, init) => { receivedSignal = init.signal; return new Promise(resolve => { complete = resolve; }); } });
  const pending = d.latest(); await new Promise(resolve => setImmediate(resolve));
  context.mock.timers.tick(8000);
  const result = await pending; assert.equal(result.reason, "provider_or_validation_failed"); assert.equal(receivedSignal.aborted, true);
  complete(Response.json(payload())); await new Promise(resolve => setImmediate(resolve));
  assert.equal(d.cache.writes, 0); assert.equal(d.calls.outcomes.at(-1).outcome, "failure");
  context.mock.timers.reset();
});

test("managed route requires local Node enablement, exact same-origin intent and no caller data", async () => {
  let calls = 0; const latest = async () => { calls++; return responseBody(); };
  for (const req of [request({ origin: "https://evil.invalid" }), request({ "sec-fetch-site": "cross-site" }), request({ "x-asha-managed-market": "force" }), request({}, "https://public.invalid/api/managed-market"), request({}, "http://127.0.0.1:4174/api/managed-market?force=true"), request({ "content-length": "1" }), request({}, undefined, { method: "GET" }), request({}, undefined, { body: '{"holdings":[]}' })]) assert.ok((await handleManagedMarket(req, environment, latest)).status >= 400);
  for (const env of [{}, { ...environment, ASHA_LOCAL_NODE_DEV: "false" }, { ...environment, ASHA_MANAGED_MARKET_ENABLED: "false" }]) assert.equal((await handleManagedMarket(request(), env, latest)).status, 403);
  assert.equal(calls, 0);
  const result = await handleManagedMarket(request({ "x-force-refresh": "true" }), environment, latest);
  assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(calls, 1);
  assert.deepEqual(await result.json(), responseBody());
  const failed = await handleManagedMarket(request(), environment, async () => { throw Error("private path or key"); });
  assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { reason: "cache_unavailable" });
});

test("managed client sends only fixed bodyless intent and validates every returned field", async () => {
  let calls = 0;
  const result = await requestManagedMarket(undefined, async (url, init) => {
    calls++; assert.equal(url, "/api/managed-market"); assert.equal(init.body, undefined);
    assert.deepEqual(Object.keys(init).sort(), ["cache", "credentials", "headers", "method", "redirect", "signal"]);
    assert.deepEqual(init.headers, { "x-asha-managed-market": "latest" }); assert.equal(init.credentials, "same-origin");
    return Response.json(responseBody());
  }, () => now);
  assert.deepEqual(result, responseBody()); assert.equal(calls, 1);
  const malformed = [null, { ...responseBody(), secret: "raw" }, responseBody({ version: "wrong" }), responseBody({ nextCheckAt: responseBody().checkedAt }), responseBody({ quota: { used: 2, remaining: 114 } }), responseBody({ reason: "secret_raw_error" }), responseBody({ state: "unavailable" }), responseBody({ snapshot: { ...snapshot(), holdings: [] } })];
  for (const value of malformed) await assert.rejects(requestManagedMarket(undefined, async () => Response.json(value), () => now), error => error instanceof ManagedMarketRequestError && error.reason === "invalid_response");
  for (const reply of [new Response("{}", { headers: { "content-type": "text/html" } }), new Response("x".repeat(65537), { headers: { "content-type": "application/json" } }), Response.json({ reason: "RAW_SECRET" }, { status: 503 }), Response.json({ reason: "cache_unavailable", debug: "RAW_SECRET" }, { status: 503 })]) {
    await assert.rejects(requestManagedMarket(undefined, async () => reply, () => now), error => !error.message.includes("RAW_SECRET"));
  }
});

test("Node bridge empty stream is accepted while any byte or stalled body is rejected before service", async context => {
  let calls = 0;
  const latest = async () => { calls++; return responseBody(); };
  const streamRequest = body => request({}, undefined, { body, duplex: "half" });
  const empty = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array()); controller.close(); } });
  assert.equal((await handleManagedMarket(streamRequest(empty), environment, latest)).status, 200);
  const bytes = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([32])); controller.close(); } });
  assert.equal((await handleManagedMarket(streamRequest(bytes), environment, latest)).status, 400);
  context.mock.timers.enable({ apis: ["setTimeout"] }); let cancelled = 0;
  const stalled = handleManagedMarket(streamRequest(new ReadableStream({ cancel() { cancelled++; } })), environment, latest);
  context.mock.timers.tick(1000); assert.equal((await stalled).status, 400); assert.equal(cancelled, 1); assert.equal(calls, 1);
  context.mock.timers.reset();
});

test("client pre-abort has no IO and timeout/abort suppress late reply without retry", async context => {
  const early = new AbortController(); early.abort(); let calls = 0;
  await assert.rejects(requestManagedMarket(early.signal, async () => { calls++; }), error => error.reason === "aborted"); assert.equal(calls, 0);
  const active = new AbortController(); let finish;
  const pending = requestManagedMarket(active.signal, async () => { calls++; return new Promise(resolve => { finish = resolve; }); }, () => now);
  active.abort(); await assert.rejects(pending, error => error.reason === "aborted"); finish(Response.json(responseBody()));
  context.mock.timers.enable({ apis: ["setTimeout"] }); let cancelled = 0;
  const stalled = requestManagedMarket(undefined, async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-type": "application/json" } }); }, () => now);
  await new Promise(resolve => setImmediate(resolve)); context.mock.timers.tick(15_000);
  await assert.rejects(stalled, error => error.reason === "timeout"); assert.equal(cancelled, 1); assert.equal(calls, 2);
  context.mock.timers.reset();
});

test("local launcher protects only its cache directory using the current owner SID", async context => {
  const parent = await temporary(context), directory = join(parent, "managed-market"), calls = [];
  const execute = (program, args, options) => { calls.push({ program, args, options }); return Buffer.from(program === "whoami.exe" ? '"fixture","S-1-5-21-123-456-789-1001"' : ""); };
  assert.equal(await prepareManagedMarketDirectory(directory, execute), directory);
  assert.equal(calls[1].program, "icacls.exe"); assert.deepEqual(calls[1].args, [directory, "/reset"]);
  assert.deepEqual(calls[2].args, [directory, "/inheritance:r", "/grant:r", "*S-1-5-21-123-456-789-1001:(OI)(CI)F"]);
  assert.ok(calls.every(call => call.options.windowsHide === true));
  await assert.rejects(prepareManagedMarketDirectory(directory, () => Buffer.from("no identity")));
  await assert.rejects(prepareManagedMarketDirectory("relative", execute));
  await mkdir(join(directory, "unknown-directory"));
  await assert.rejects(prepareManagedMarketDirectory(directory, execute));
});

test("Windows preparation removes prior explicit Everyone grants from the synthetic cache and file", { skip: process.platform !== "win32" }, async context => {
  const parent = await temporary(context), directory = join(parent, "managed-market");
  await mkdir(directory); const file = join(directory, "latest.json"); await writeFile(file, encodeManagedCache(snapshot(), now));
  for (const path of [directory, file]) execFileSync("icacls.exe", [path, "/grant", "*S-1-1-0:F"], { windowsHide: true, stdio: "pipe" });
  await prepareManagedMarketDirectory(directory);
  const script = "$ErrorActionPreference = 'Stop'; $p = $env:ASHA_SYNTHETIC_ACL_PATH; $acl = if ([System.IO.Directory]::Exists($p)) { [System.IO.Directory]::GetAccessControl($p) } else { [System.IO.File]::GetAccessControl($p) }; $rules = $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]); $result = @(); foreach ($rule in $rules) { $result += $rule.IdentityReference.Value }; [Console]::WriteLine([string]::Join(',', [string[]]$result))";
  const sid = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true, stdio: "pipe" }).toString().match(/S-1-5-[0-9-]+/)[0];
  for (const path of [directory, file]) {
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: "pipe", env: { ...process.env, ASHA_SYNTHETIC_ACL_PATH: path } }).toString();
    assert.deepEqual(raw.trim().split(","), [sid]);
  }
});
