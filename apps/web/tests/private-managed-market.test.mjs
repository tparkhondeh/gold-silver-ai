import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPrivateManagedMarketAdapter } from "../auth/private-managed-market.ts";
import { OwnerAuthorizationError, identityBindingHash } from "../auth/postgres-owner-identity-store.ts";
import { createOwnerSessionBoundary, createOwnerToken, ownerTokenHash } from "../auth/owner-session.ts";
import { createPrivateApplication } from "../auth/private-application.ts";
import { makeNavasanSnapshot } from "../app/market-test-contract.ts";

const at = Date.parse("2000-01-01T12:00:00.000Z"), origin = "https://private-market.invalid";
const binding = { origin, issuer: origin, ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-market-owner" };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const token = createOwnerToken(), proof = { sessionHash: ownerTokenHash(token), issuer: origin, subject: binding.ownerSubject };
  const state = { now: at, active: new Set([proof.sessionHash]), reservations: [], outcomes: [], events: [], snapshot: null, transaction: false,
    afterInsert: null, readCache: null, receive: null, denyQuota: false, denyOutcome: false };
  const environment = { NAVASAN_API_KEY: "synthetic-never-real-key", NAVASAN_KEY_ROTATION_CONFIRMED: "true", NAVASAN_VALUE_UNIT: "TOMAN", NAVASAN_PLAN: "free" };
  const runner = { async transaction(work) {
    const pending = [...state.reservations], outcomes = [...state.outcomes]; const timeouts = [];
    state.events.push("begin"); state.transaction = true;
    try {
      const value = await work({ async query(sql, parameters = []) {
        if (sql.startsWith("SET LOCAL")) { timeouts.push(sql); return { rows: [], rowCount: 1 }; }
        if (sql.includes("set_config(")) return { rows: [], rowCount: 1 };
        if (sql.startsWith("SELECT hash FROM private_owner_sessions")) {
          assert.equal(parameters[1], identityBindingHash(binding));
          const allowed = state.active.has(parameters[0]); state.events.push(sql.includes("FOR SHARE") ? "session-lock" : "session-final");
          return { rows: allowed ? [{ hash: parameters[0] }] : [], rowCount: allowed ? 1 : 0 };
        }
        if (sql.includes("pg_advisory_xact_lock")) { assert.ok(sql.includes("174228531, 10")); state.events.push("quota-lock"); return { rows: [], rowCount: 1 }; }
        if (sql.includes("count(*) FILTER")) {
          if (state.denyQuota) throw Error("RAW-DB-DETAIL");
          const last = pending.filter(value => value.endpoint === "latest").at(-1);
          return { rows: [{ used: pending.length, retry_after_seconds: last ? Math.max(0, Math.ceil((last.at + parameters[0] * 1000 - state.now) / 1000)) : 0 }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO provider_request_reservations")) {
          pending.push({ id: parameters[0], endpoint: parameters[1], at: state.now }); state.events.push("reserve"); await state.afterInsert?.(); return { rows: [], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO provider_runtime_status")) {
          assert.deepEqual(timeouts, ["SET LOCAL lock_timeout = '3s'", "SET LOCAL statement_timeout = '5s'", "SET LOCAL idle_in_transaction_session_timeout = '5s'"]);
          if (state.denyOutcome) throw Error("RAW-OUTCOME-DETAIL");
          assert.ok(state.reservations.some(value => value.id === parameters[0]));
          outcomes.push({ id: parameters[0], outcome: parameters[1] }); state.events.push("outcome"); return { rows: [], rowCount: 1 };
        }
        assert.fail(`Unexpected synthetic SQL: ${sql}`);
      } });
      state.reservations = pending; state.outcomes = outcomes; state.events.push("commit"); return value;
    } catch (error) { state.events.push("rollback"); throw error; }
    finally { state.transaction = false; }
  } };
  const cache = { async read() { state.events.push("cache-read"); await state.readCache?.(); return state.snapshot; }, async replace(value) { assert.equal(state.transaction, false); state.events.push("cache-write"); state.snapshot = value; return value; } };
  const options = { binding: { ...binding }, runner, cache, environment, clock: () => state.now, fetcher: async (url, input) => {
    assert.equal(state.transaction, false); assert.equal(state.reservations.length > 0, true); assert.equal(url.origin, "https://api.navasan.tech"); assert.equal(url.pathname, "/latest/");
    assert.equal(url.searchParams.get("api_key"), "synthetic-never-real-key"); assert.equal(input.body, undefined);
    state.events.push("synthetic-fetch"); await state.receive?.();
    return Response.json({ "18ayar": { value: "5000000", timestamp: String(Math.floor(state.now / 1000)) } });
  } };
  const adapter = createPrivateManagedMarketAdapter(options);
  return { state, token, proof, options, adapter };
}

test("inactive construction captures dependencies/config without I/O, requires explicit transport and never wires startup", async () => {
  const f = fixture(); assert.deepEqual(f.state.events, []); assert.equal(Object.isFrozen(f.adapter), true);
  const replacement = () => assert.fail("Mutable dependency replaced captured implementation");
  f.options.environment.NAVASAN_API_KEY = "changed"; f.options.binding.ownerSubject = "changed";
  f.options.runner.transaction = replacement; f.options.cache.read = replacement; f.options.cache.replace = replacement; f.options.fetcher = replacement; f.options.clock = replacement;
  assert.equal((await f.adapter.latest(f.proof)).reason, "updated");
  for (const change of [{ fetcher: undefined }, { runner: {} }, { cache: {} }, { clock: 4 }, { binding: { ...binding, portfolioSubject: "local-owner-v1" } }]) assert.throws(() => createPrivateManagedMarketAdapter({ ...fixture().options, ...change }));
  const startup = readFileSync(new URL("../scripts/start-private-server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(startup, /private-managed-market|createPrivateManagedMarketAdapter|market\s*:/);
});

test("invalid binding/hash and revoked/expired proof reject before any cache, quota or transport work", async () => {
  for (const bad of [{ sessionHash: "invalid" }, { issuer: "https://other.invalid" }, { subject: "other" }]) {
    const f = fixture(); await assert.rejects(f.adapter.latest({ ...f.proof, ...bad }), OwnerAuthorizationError); assert.deepEqual(f.state.events, []);
  }
  const f = fixture(); f.state.active.clear(); f.state.snapshot = makeNavasanSnapshot({ "18ayar": { value: "5000000", timestamp: at / 1000 } }, "TOMAN", new Date(at).toISOString());
  const disabled = createPrivateManagedMarketAdapter({ ...f.options, environment: {} });
  await assert.rejects(disabled.latest(f.proof), OwnerAuthorizationError);
  assert.equal(f.state.events.includes("cache-read"), false); assert.equal(f.state.reservations.length, 0);
});

test("revocation during cache await rechecks at quota transaction and cannot become cached success", async () => {
  const f = fixture(); f.state.snapshot = makeNavasanSnapshot({ "18ayar": { value: "5000000", timestamp: at / 1000 } }, "TOMAN", new Date(at).toISOString());
  f.state.readCache = () => f.state.active.clear();
  await assert.rejects(f.adapter.latest(f.proof), OwnerAuthorizationError);
  assert.equal(f.state.reservations.length, 0); assert.equal(f.state.events.includes("synthetic-fetch"), false); assert.equal(f.state.events.includes("cache-write"), false);
});

test("expiry after reservation INSERT but before authorization final check rolls back spend before fetch", async () => {
  const f = fixture(); f.state.afterInsert = () => f.state.active.clear();
  await assert.rejects(f.adapter.latest(f.proof), OwnerAuthorizationError);
  assert.ok(f.state.events.includes("reserve")); assert.ok(f.state.events.includes("rollback")); assert.equal(f.state.reservations.length, 0);
  assert.equal(f.state.events.includes("synthetic-fetch"), false); assert.equal(f.state.outcomes.length, 0);
});

test("successful acquisition reserves/commits before transport, bounds outcome SQL and preserves shared cooldown", async () => {
  const f = fixture(), response = await f.adapter.latest(f.proof);
  assert.equal(response.reason, "updated"); assert.deepEqual(response.quota, { used: 1, remaining: 114 });
  const fetchIndex = f.state.events.indexOf("synthetic-fetch"); assert.equal(f.state.events[fetchIndex - 1], "commit");
  assert.equal(f.state.events.filter(value => value === "reserve").length, 1); assert.deepEqual(f.state.outcomes.map(value => value.outcome), ["success"]);
  assert.doesNotMatch(JSON.stringify(response), /synthetic-never-real-key|sessionHash|synthetic-owner/);
  const second = createPrivateManagedMarketAdapter(f.options); assert.equal((await second.latest(f.proof)).reason, "refresh_cooldown");
  assert.equal(f.state.events.filter(value => value === "synthetic-fetch").length, 1); assert.equal(f.state.reservations.length, 1);
});

test("overlapping invocations never borrow another proof or share a first caller's in-flight promise", async () => {
  const f = fixture(), entered = deferred(), release = deferred(); f.state.readCache = async () => { entered.resolve(); await release.promise; };
  const pending = f.adapter.latest(f.proof); await entered.promise;
  await assert.rejects(f.adapter.latest({ ...f.proof, sessionHash: ownerTokenHash(createOwnerToken()) }), OwnerAuthorizationError);
  release.resolve(); assert.equal((await pending).reason, "updated"); assert.equal(f.state.reservations.length, 1);
});

test("logout after admission cannot refund/drop bookkeeping; actual outer gate withholds the late snapshot", async () => {
  const f = fixture(), entered = deferred(), release = deferred(); f.state.receive = async () => { entered.resolve(); await release.promise; };
  const gate = createOwnerSessionBoundary({ origin, issuer: origin, ownerSubject: binding.ownerSubject, clock: () => f.state.now,
    store: { async getSession(key) { return f.state.active.has(key) ? { issuer: origin, subject: binding.ownerSubject, createdAt: at - 1000, expiresAt: at + 60_000 } : null; }, async revokeBrowser() { f.state.active.clear(); } } });
  const app = createPrivateApplication({ origin, release: "a".repeat(40), gate, market: f.adapter, clock: () => f.state.now, publicUi: async () => new Response("synthetic"), portfolio: async () => assert.fail("No portfolio access") });
  const request = path => new Request(origin + path, { method: "POST", headers: { cookie: `__Host-asha-owner=${f.token}`, origin, "sec-fetch-site": "same-origin", "x-asha-intent": path === "/auth/logout" ? "owner-logout" : "owner-action", "x-asha-managed-market": "latest" } });
  const pending = app(request("/api/managed-market")); await entered.promise;
  assert.equal((await app(request("/auth/logout"))).status, 200); release.resolve();
  assert.equal((await pending).status, 401); assert.equal(f.state.reservations.length, 1); assert.deepEqual(f.state.outcomes.map(value => value.outcome), ["success"]); assert.ok(f.state.snapshot);
});

test("missing quota/outcome permissions fail closed with no retry or refund", async () => {
  const quota = fixture(); quota.state.denyQuota = true;
  assert.equal((await quota.adapter.latest(quota.proof)).reason, "quota_unavailable"); assert.equal(quota.state.reservations.length, 0); assert.equal(quota.state.events.includes("synthetic-fetch"), false);
  const outcome = fixture(); outcome.state.denyOutcome = true;
  const result = await outcome.adapter.latest(outcome.proof); assert.equal(result.reason, "provider_or_validation_failed");
  assert.equal(outcome.state.reservations.length, 1); assert.equal(outcome.state.snapshot, null); assert.doesNotMatch(JSON.stringify(result), /RAW-|DETAIL/);
  assert.equal((await outcome.adapter.latest(outcome.proof)).reason, "refresh_cooldown"); assert.equal(outcome.state.events.filter(value => value === "synthetic-fetch").length, 1);
});
