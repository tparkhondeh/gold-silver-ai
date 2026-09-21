import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createOwnerToken, ownerTokenHash, createOwnerSessionBoundary } from "../auth/owner-session.ts";
import { createPrivateApplication } from "../auth/private-application.ts";
import { createPrivatePasskeyRuntime, createPrivatePortfolioRuntime } from "../auth/private-runtime.ts";
import { MANAGED_MARKET_VERSION } from "../app/managed-market-contract.ts";
import { createManagedMarketService } from "../data/managed-market-service.ts";

const origin = "https://goldsilver.wealthos.ir", subject = "synthetic-market-owner", release = "a".repeat(40);
const start = Date.parse("2000-01-01T12:00:00.000Z");
const unavailable = (now = start) => ({ version: MANAGED_MARKET_VERSION, state: "unavailable", snapshot: null,
  checkedAt: new Date(now).toISOString(), nextCheckAt: new Date(now + 300_000).toISOString(), reason: "missing_key", quota: null });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function fixture(market) {
  const token = createOwnerToken(), hash = ownerTokenHash(token), state = { now: start, active: true };
  const gate = createOwnerSessionBoundary({ origin, issuer: origin, ownerSubject: subject, clock: () => state.now,
    store: { async getSession(key) { return key === hash && state.active ? { issuer: origin, subject, createdAt: start - 1000, expiresAt: start + 60_000 } : null; }, async revokeBrowser() { state.active = false; } } });
  const app = createPrivateApplication({ origin, release, gate, market, clock: () => state.now,
    portfolio: async () => { throw Error("Unrelated portfolio must not be read"); }, publicUi: async () => new Response("Synthetic shell") });
  const request = (changes = {}) => new Request(`${origin}${changes.path ?? "/api/managed-market"}`, { method: changes.method ?? "POST",
    headers: { cookie: `__Host-asha-owner=${token}`, origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-action", "x-asha-managed-market": "latest", ...changes.headers },
    ...(changes.body === undefined ? {} : { body: changes.body, duplex: "half" }) });
  return { app, request, state, hash };
}

test("omitted market adapter preserves disabled response and performs no provider I/O", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No provider calls are authorized"));
  const f = fixture(); const response = await f.app(f.request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), unavailable());
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("anonymous, CSRF and invalid market requests never invoke the server adapter", async () => {
  let calls = 0;
  const f = fixture({ async latest() { calls++; return unavailable(); } });
  for (const [changes, status] of [
    [{ headers: { cookie: "" } }, 401], [{ headers: { "x-oai-subject": subject, cookie: "" } }, 401],
    [{ headers: { origin: "https://evil.invalid" } }, 403], [{ headers: { "sec-fetch-site": "cross-site" } }, 403],
    [{ headers: { "x-asha-intent": "" } }, 403], [{ headers: { "x-asha-managed-market": "other" } }, 400],
    [{ headers: { host: "evil.invalid" } }, 400], [{ path: "/api/managed-market?force=true" }, 400],
    [{ method: "GET" }, 400], [{ method: "PUT" }, 400], [{ body: "private-input" }, 400],
    [{ body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()); } }) }, 400],
  ]) assert.equal((await f.app(f.request(changes))).status, status);
  assert.equal(calls, 0);
});

test("authorized request receives exact validated response and a fresh immutable opaque proof only", async () => {
  const proofs = [], dependency = { async latest(proof) { proofs.push(proof); return unavailable(); } };
  const f = fixture(dependency);
  dependency.latest = async () => { throw Error("Changed dependency must not replace captured handler"); };
  const first = await f.app(f.request({ body: new ReadableStream({ start(controller) { controller.close(); } }) }));
  assert.equal(first.status, 200); assert.deepEqual(await first.json(), unavailable());
  assert.equal((await f.app(f.request())).status, 200);
  assert.deepEqual(proofs[0], { sessionHash: f.hash, issuer: origin, subject });
  assert.equal(Object.isFrozen(proofs[0]), true); assert.notEqual(proofs[0], proofs[1]);
  assert.equal(first.headers.get("content-type"), "application/json");
});

test("invalid, oversized, serialization-changing and failing adapters return only generic503", async () => {
  const serialization = output => Object.defineProperty(unavailable(), "toJSON", { value: () => output });
  for (const implementation of [
    async () => { throw Error("synthetic-key-or-private-upstream-detail"); }, async () => null,
    async () => ({ ...unavailable(), apiKey: "synthetic-key-or-private-upstream-detail" }),
    async () => ({ ...unavailable(), reason: "unknown" }), async () => ({ ...unavailable(), quota: { used: 1, remaining: 115 } }),
    async () => ({ ...unavailable(), checkedAt: new Date(start + 300_001).toISOString() }),
    async () => ({ ...unavailable(), state: "received" }),
    async () => serialization({ ...unavailable(), privateExtra: "synthetic-key-or-private-upstream-detail" }),
    async () => serialization({ ...unavailable(), privateExtra: "x".repeat(65_536) }),
  ]) {
    const f = fixture({ latest: implementation }), response = await f.app(f.request());
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "service_unavailable" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const market of [null, {}, { latest: true }]) assert.throws(() => fixture(market), /Invalid private market dependency/);
});

test("logout or expiry while adapter awaits suppresses its eventual valid result", async () => {
  for (const action of ["logout", "expiry"]) {
    const entered = deferred(), release = deferred();
    const f = fixture({ async latest() { entered.resolve(); await release.promise; return unavailable(f.state.now); } });
    const pending = f.app(f.request()); await entered.promise;
    if (action === "expiry") f.state.now += 60_000;
    else assert.equal((await f.app(f.request({ path: "/auth/logout", headers: { "x-asha-intent": "owner-logout" } }))).status, 200);
    release.resolve();
    const response = await pending; assert.equal(response.status, 401); assert.deepEqual(await response.json(), { authenticated: false, error: "identity_denied" });
  }
});

test("existing service composition preserves reservation-before-fetch and cadence with synthetic dependencies", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Real provider transport is forbidden"));
  const calls = [], secret = "synthetic-only-not-a-real-key"; let snapshot = null, reserved = false;
  const latest = createManagedMarketService({ environment: { NAVASAN_API_KEY: secret, NAVASAN_KEY_ROTATION_CONFIRMED: "true", NAVASAN_VALUE_UNIT: "TOMAN", NAVASAN_PLAN: "free" }, clock: () => start,
    cache: { async read() { calls.push("cache-read"); return snapshot; }, async replace(value) { calls.push("cache-write"); snapshot = value; return value; } },
    resolveLedger: async () => ({ available: true, ledger: {
      async reserve(endpoint, fingerprint, cadence) { calls.push("reserve"); assert.equal(endpoint, "latest"); assert.match(fingerprint, /^[a-f0-9]{64}$/); assert.equal(cadence, 24_000);
        if (reserved) return { allowed: false, used: 1, remaining: 114, reservationId: null, retryAfterSeconds: cadence };
        reserved = true; return { allowed: true, used: 1, remaining: 114, reservationId: "synthetic-reservation", retryAfterSeconds: null }; },
      async recordLatestOutcome(input) { calls.push("outcome"); assert.equal(input.outcome, "success"); },
    } }),
    fetcher: async (url, input) => { assert.equal(reserved, true); calls.push("synthetic-fetch"); assert.equal(url.origin, "https://api.navasan.tech"); assert.equal(url.pathname, "/latest/"); assert.equal(input.body, undefined);
      return Response.json({ "18ayar": { value: "5000000", timestamp: String(start / 1000) } }); },
  });
  const f = fixture({ latest });
  const first = await f.app(f.request()); assert.equal(first.status, 200);
  const raw = await first.text(), received = JSON.parse(raw); assert.equal(received.reason, "updated"); assert.equal(raw.includes(secret), false);
  assert.deepEqual(calls, ["cache-read", "reserve", "synthetic-fetch", "outcome", "cache-write"]);
  const cached = await f.app(f.request()); assert.equal((await cached.json()).reason, "refresh_cooldown");
  assert.equal(calls.filter(value => value === "synthetic-fetch").length, 1);
});

test("both runtime factories forward the optional dependency without environment, provider or database fallback", async () => {
  const token = createOwnerToken(), hash = ownerTokenHash(token);
  for (const passkey of [false, true]) {
    const issuer = passkey ? origin : "https://identity.invalid", binding = { origin, issuer, ownerSubject: subject, portfolioSubject: "synthetic-market-portfolio" };
    let calls = 0;
    // Executes actual store getSession/composition against a synthetic SQL adapter;
    // real PostgreSQL/session correctness is covered by the separate integration lane.
    const runner = { async transaction(work) { return work({ async query(sql, parameters) {
      if (sql.startsWith("SELECT issuer,subject,created_at,expires_at FROM private_owner_sessions")) {
        assert.equal(parameters[0], hash); return { rows: [{ issuer, subject, created_at: new Date(Date.now() - 1000), expires_at: new Date(Date.now() + 60_000) }], rowCount: 1 };
      }
      if (sql.startsWith("SET LOCAL") || sql.includes("set_config('asha.identity_binding'")) return { rows: [], rowCount: 1 };
      throw Error("Unexpected synthetic SQL");
    } }); } };
    const input = { binding, runner, release, publicUi: async () => new Response("shell"), market: { async latest(proof) { calls++; assert.deepEqual(proof, { sessionHash: hash, issuer, subject }); return unavailable(Date.now()); } } };
    const app = passkey ? createPrivatePasskeyRuntime(input) : createPrivatePortfolioRuntime({ ...input, adapter: { issuer, redirectUri: origin + "/auth/google/callback", authorizationUrl() { throw Error("No provider calls"); }, exchange() { throw Error("No provider calls"); } } });
    const request = new Request(origin + "/api/managed-market", { method: "POST", headers: { cookie: `__Host-asha-owner=${token}`, origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-action", "x-asha-managed-market": "latest" } });
    assert.equal((await app(request)).status, 200); assert.equal(calls, 1);
  }
  const startup = await readFile(new URL("../scripts/start-private-server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(startup, /market\s*:|managedMarketLatest|createManagedMarketService|FileManagedMarketCache|NAVASAN_API_KEY/);
});
