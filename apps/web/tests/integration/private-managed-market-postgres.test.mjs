import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { Client, Pool } from "pg";
import { readMigrations, applyMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { createPrivateManagedMarketAdapter } from "../../auth/private-managed-market.ts";
import { PostgresOwnerIdentityStore, OwnerAuthorizationError } from "../../auth/postgres-owner-identity-store.ts";
import { createOwnerSessionBoundary, createOwnerToken, ownerTokenHash } from "../../auth/owner-session.ts";
import { createPrivateApplication } from "../../auth/private-application.ts";

// Explicit disposable CI database only; never read .env/DATABASE_URL or fall back.
const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") throw Error("Market authorization integration requires explicit loopback asha_integration. No skipped DB acceptance.");
const origin = "https://private-market.invalid", binding = { origin, issuer: origin, ownerSubject: "synthetic-market-owner", portfolioSubject: "synthetic-market-portfolio" };
const opaque = () => randomBytes(32).toString("base64url");
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const environment = { NAVASAN_API_KEY: "synthetic-never-real-key", NAVASAN_KEY_ROTATION_CONFIRMED: "true", NAVASAN_VALUE_UNIT: "TOMAN", NAVASAN_PLAN: "free" };

test("real PostgreSQL proof-bound market admission and counted completion, with synthetic transport only", { timeout: 60_000 }, async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No external provider calls in disposable tests"));
  const suffix = randomBytes(8).toString("hex"), schema = `asha_market_test_${suffix}`, role = `asha_market_${suffix}`;
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 }), pool = new Pool({ connectionString, max: 6, connectionTimeoutMillis: 3000 });
  let schemaCreated = false, roleCreated = false;
  await admin.connect();
  t.after(async () => {
    await pool.end();
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  await admin.query(`SET search_path TO "${schema}"`); await applyMigrations(admin, await readMigrations());
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`); roleCreated = true;
  await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  for (const table of ["private_owner_login_transactions", "private_owner_sessions"]) await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON "${table}" TO "${role}"`);
  await admin.query(`GRANT SELECT,INSERT ON provider_request_reservations TO "${role}"`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON provider_runtime_status TO "${role}"`);
  const runner = createPgTransactionRunner({ async connect() {
    const client = await pool.connect(); await client.query(`SET ROLE "${role}"`); await client.query(`SET search_path TO "${schema}"`); return client;
  } });
  const store = new PostgresOwnerIdentityStore(runner, binding);
  const count = async () => Number((await admin.query("SELECT count(*)::integer AS count FROM provider_request_reservations")).rows[0].count);
  async function minted() {
    const now = Date.now(), transaction = opaque(), token = createOwnerToken(), sessionHash = ownerTokenHash(token);
    await store.putTransaction(transaction, { state: opaque(), nonce: opaque(), codeVerifier: opaque(), createdAt: now - 1000, expiresAt: now + 120_000, claimed: false }, now);
    assert.ok(await store.claimTransaction(transaction, Date.now()));
    assert.equal(await store.completeLogin(transaction, sessionHash, { issuer: origin, subject: binding.ownerSubject, createdAt: now - 1000, expiresAt: now + 120_000 }, null, Date.now()), true);
    return { token, sessionHash, proof: { sessionHash, issuer: origin, subject: binding.ownerSubject } };
  }
  function market(overrides = {}) {
    const state = { reads: 0, fetches: 0, writes: 0, snapshot: null };
    const cache = { async read() { state.reads++; return state.snapshot; }, async replace(value) { state.writes++; state.snapshot = value; return value; } };
    const adapter = createPrivateManagedMarketAdapter({ binding, runner, environment, cache, fetcher: async (url, input) => {
      state.fetches++; assert.equal(url.origin, "https://api.navasan.tech"); assert.equal(input.body, undefined); assert.equal(await count(), 1);
      return Response.json({ "18ayar": { value: "5000000", timestamp: String(Math.floor(Date.now() / 1000)) } });
    }, ...overrides });
    return { state, cache, adapter };
  }

  await t.test("invalid, cross-owner, expired and revoked proofs do not read cache or reserve", async () => {
    const expired = await minted(), revoked = await minted();
    await admin.query("UPDATE private_owner_sessions SET created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp()-interval '1 second' WHERE hash=$1", [expired.sessionHash]);
    await store.revokeBrowser(revoked.sessionHash, null);
    for (const proof of [{ ...expired.proof, sessionHash: "bad" }, { ...expired.proof, subject: "other-owner" }, expired.proof, revoked.proof]) {
      const f = market(); await assert.rejects(f.adapter.latest(proof), OwnerAuthorizationError); assert.equal(f.state.reads, 0); assert.equal(f.state.fetches, 0);
    }
    assert.equal(await count(), 0);
  });

  await t.test("missing quota grant refuses acquisition and runtime cannot rewrite accounting", async () => {
    const owner = await minted(), f = market();
    await admin.query(`REVOKE INSERT ON provider_request_reservations FROM "${role}"`);
    try { assert.equal((await f.adapter.latest(owner.proof)).reason, "quota_unavailable"); assert.equal(await count(), 0); assert.equal(f.state.fetches, 0); }
    finally { await admin.query(`GRANT INSERT ON provider_request_reservations TO "${role}"`); }
    await assert.rejects(runner.transaction(db => db.query("DELETE FROM provider_request_reservations")), /permission denied/);
    await assert.rejects(runner.transaction(db => db.query("TRUNCATE provider_request_reservations")), /permission denied/);
  });

  await t.test("DB-clock expiry after quota INSERT rolls back before any provider work", async () => {
    const owner = await minted(); let inserted = false;
    await admin.query("UPDATE private_owner_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE hash=$1", [owner.sessionHash]);
    const expiring = { transaction(work) { return runner.transaction(db => work({ async query(sql, values) {
      const result = await db.query(sql, values);
      if (sql.includes("INSERT INTO provider_request_reservations")) {
        inserted = true;
        // Wait against the actual DB timestamp, not a racing JS timeout. This
        // executes only inside the fresh disposable schema/session transaction.
        await db.query("SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM(expires_at-clock_timestamp())))+0.01) FROM private_owner_sessions WHERE hash=$1", [owner.sessionHash]);
      }
      return result;
    } })); } };
    const f = market({ runner: expiring }); await assert.rejects(f.adapter.latest(owner.proof), OwnerAuthorizationError);
    assert.equal(inserted, true); assert.equal(await count(), 0); assert.equal(f.state.fetches, 0); assert.equal(f.state.writes, 0);
  });

  await t.test("logout during cache await wins before reserve, even after successful initial check", async () => {
    const owner = await minted(), entered = deferred(), release = deferred(); const f = market({ cache: { async read() { entered.resolve(); await release.promise; return null; }, async replace() { assert.fail("No cache publication after denied admission"); } } });
    const pending = f.adapter.latest(owner.proof);
    await Promise.race([entered.promise, pending.then(() => { throw Error("Expected synthetic cache barrier"); })]);
    await store.revokeBrowser(owner.sessionHash, null); release.resolve();
    await assert.rejects(pending, OwnerAuthorizationError); assert.equal(await count(), 0); assert.equal(f.state.fetches, 0);
  });

  await t.test("two sessions share durable cadence; admitted completion survives logout but HTTP publication is denied", async () => {
    const owner = await minted(), other = await minted(), entered = deferred(), release = deferred(); let fetches = 0, cached = null;
    const cache = { async read() { return cached; }, async replace(value) { cached = value; return value; } };
    const fetcher = async (_url, input) => {
      assert.equal(input.body, undefined); assert.equal(await count(), 1); fetches++; entered.resolve(); await release.promise;
      return Response.json({ "18ayar": { value: "5000000", timestamp: String(Math.floor(Date.now() / 1000)) } });
    };
    const first = market({ cache, fetcher }), gate = createOwnerSessionBoundary({ origin, issuer: origin, ownerSubject: binding.ownerSubject, store });
    const app = createPrivateApplication({ origin, release: "a".repeat(40), gate, market: first.adapter, publicUi: async () => new Response("Synthetic shell"), portfolio: async () => assert.fail("Market must not load portfolio") });
    const request = path => new Request(origin + path, { method: "POST", headers: { cookie: `__Host-asha-owner=${owner.token}`, origin, "sec-fetch-site": "same-origin", "x-asha-intent": path === "/auth/logout" ? "owner-logout" : "owner-action", "x-asha-managed-market": "latest" } });
    const pending = app(request("/api/managed-market"));
    await Promise.race([entered.promise, pending.then(() => { throw Error("Expected admitted synthetic provider barrier"); })]);
    const second = market({ cache, fetcher }), response = await second.adapter.latest(other.proof);
    assert.equal(response.reason, "refresh_cooldown"); assert.deepEqual(response.quota, { used: 1, remaining: 114 });
    assert.equal((await app(request("/auth/logout"))).status, 200); release.resolve();
    assert.equal((await pending).status, 401); assert.equal(fetches, 1); assert.equal(await count(), 1); assert.ok(cached);
    assert.equal((await admin.query("SELECT last_outcome FROM provider_runtime_status")).rows[0].last_outcome, "success");
    const restarted = market({ cache, fetcher }); assert.equal((await restarted.adapter.latest(other.proof)).reason, "refresh_cooldown"); assert.equal(fetches, 1);
    assert.equal(await store.getSession(owner.sessionHash, Date.now()), null);
  });
});
