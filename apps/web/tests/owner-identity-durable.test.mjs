import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createOwnerIdentityGate, createMemoryOwnerIdentityStore } from "../auth/owner-identity.ts";
import { identityBindingHash, inspectOwnerIdentityBinding, OwnerAuthorizationError, PostgresOwnerIdentityStore, createOwnerAuthorizedRunner } from "../auth/postgres-owner-identity-store.ts";

const binding = { origin: "https://portfolio.invalid", issuer: "https://identity.invalid", ownerSubject: "owner-synthetic", portfolioSubject: "private-owner-synthetic" };
const key = "a".repeat(43), transactionKey = "b".repeat(43), previous = "c".repeat(43), at = Date.parse("2026-01-01T12:00:00Z");
const pending = () => ({ state: "d".repeat(43), nonce: "e".repeat(43), codeVerifier: "f".repeat(43), createdAt: at, expiresAt: at + 300_000, claimed: false });
const session = () => ({ issuer: binding.issuer, subject: binding.ownerSubject, createdAt: at, expiresAt: at + 1800_000 });
const proof = () => ({ sessionHash: key, issuer: binding.issuer, subject: binding.ownerSubject });
function runner(respond = () => ({ rowCount: 0, rows: [] })) {
  const queries = [], events = [];
  return { queries, events, async transaction(work) {
    events.push("begin");
    try { const result = await work({ async query(sql, values = []) { const compact = sql.replace(/\s+/g, " ").trim(); queries.push({ sql: compact, values }); return respond(compact, values); } }); events.push("commit"); return result; }
    catch (error) { events.push("rollback"); throw error; }
  } };
}
const controls = sql => sql.startsWith("SET LOCAL ") || sql.startsWith("SELECT set_config(") || sql.includes("pg_advisory_xact_lock");
function scripted(sql) {
  if (controls(sql) || sql.startsWith("DELETE ")) return { rowCount: 0, rows: [] };
  if (sql.startsWith("SELECT count")) return { rowCount: 1, rows: [{ count: 0 }] };
  if (sql.startsWith("INSERT ") || sql.startsWith("SELECT hash ")) return { rowCount: 1, rows: [{ hash: key }] };
  if (sql.startsWith("UPDATE private_owner_login")) return { rowCount: 1, rows: [{ ...pending(), pkce_verifier: pending().codeVerifier, created_at: new Date(at), expires_at: new Date(at + 300_000), claimed: true }] };
  if (sql.startsWith("SELECT issuer")) return { rowCount: 1, rows: [{ issuer: binding.issuer, subject: binding.ownerSubject, created_at: new Date(at), expires_at: new Date(at + 1800_000) }] };
  throw Error(`Unexpected synthetic SQL category: ${sql.slice(0, 30)}`);
}

test("durable identity validates immutable explicit bindings and never maps the local subject", () => {
  const copy = inspectOwnerIdentityBinding(binding); assert.ok(Object.isFrozen(copy)); assert.deepEqual(copy, binding);
  assert.match(identityBindingHash(binding), /^[a-f0-9]{64}$/);
  assert.notEqual(identityBindingHash(binding), identityBindingHash({ ...binding, portfolioSubject: "another-explicit-private-owner" }));
  for (const change of [{ origin: "http://portfolio.invalid" }, { origin: binding.origin + "/" }, { origin: "https://user@portfolio.invalid" }, { issuer: "http://identity.invalid" }, { issuer: binding.issuer + "?ignored=1" }, { ownerSubject: "" }, { ownerSubject: undefined }, { ownerSubject: "a".repeat(256) }, { portfolioSubject: undefined }, { portfolioSubject: "local-owner-v1" }, { portfolioSubject: "a".repeat(201) }, { portfolioSubject: "private owner" }]) assert.throws(() => inspectOwnerIdentityBinding({ ...binding, ...change }));
  for (const capacity of [0, 4097, 1.5, NaN]) assert.throws(() => new PostgresOwnerIdentityStore(runner(), binding, capacity));
  const adapter = { issuer: binding.issuer, redirectUri: binding.origin + "/auth/google/callback" };
  assert.throws(() => createOwnerIdentityGate({ origin: binding.origin, ownerSubject: binding.ownerSubject, adapter }), /Explicit identity store/);
});

test("actual PG store uses scoped transactions, one-use claim, bounded inserts and atomic completion/revocation SQL", async () => {
  const execution = runner(scripted), store = new PostgresOwnerIdentityStore(execution, binding);
  const candidate = pending(); const write = store.putTransaction(transactionKey, candidate, at); candidate.state = "tampered"; await write;
  assert.equal(execution.queries.find(row => row.sql.startsWith("INSERT INTO private_owner_login")).values[5], pending().state);
  assert.deepEqual(await store.claimTransaction(transactionKey, at), { ...pending(), claimed: true });
  assert.equal(await store.completeLogin(transactionKey, key, session(), previous, at), true);
  assert.deepEqual(await store.getSession(key, at), session());
  await store.revokeBrowser(key, transactionKey); await store.deleteTransaction(transactionKey);
  assert.ok(execution.queries.filter(row => row.sql.startsWith("SELECT set_config('asha.identity_binding'")).every(row => row.values[0] === identityBindingHash(binding)));
  assert.ok(execution.queries.some(row => row.sql.includes("FOR UPDATE") && row.sql.includes("expires_at > clock_timestamp()")));
  const insert = execution.queries.find(row => row.sql.startsWith("INSERT INTO private_owner_sessions"));
  assert.ok(insert.sql.includes("FROM private_owner_login_transactions")); assert.ok(insert.sql.includes("claimed=true")); assert.equal(insert.values[2], transactionKey);
  const revocation = execution.queries.findIndex(row => row.sql.includes("(hash=$2 OR login_transaction_hash=$3)"));
  assert.match(execution.queries[revocation - 1].sql, /^DELETE FROM private_owner_login_transactions/);
  assert.deepEqual(execution.queries[revocation].values, [identityBindingHash(binding), key, transactionKey]);
  assert.ok(!execution.events.includes("rollback"));
});

test("store fails closed for malformed state, bounds, missing/expired rows, capacity and SQL failures", async () => {
  const noRows = runner(sql => controls(sql) ? { rowCount: 0 } : { rowCount: 0, rows: [] });
  const empty = new PostgresOwnerIdentityStore(noRows, binding);
  assert.equal(await empty.claimTransaction(transactionKey, at), null); assert.equal(await empty.getSession(key, at), null);
  assert.equal(await empty.completeLogin(transactionKey, key, session(), null, at), false);
  await empty.revokeBrowser(null, null);
  for (const method of [() => empty.getSession("bad", at), () => empty.getSession(key, NaN), () => empty.putTransaction(transactionKey, { ...pending(), claimed: true }, at), () => empty.putTransaction(transactionKey, { ...pending(), state: "bad" }, at), () => empty.putTransaction(transactionKey, pending(), at - 1), () => empty.putTransaction(transactionKey, { ...pending(), expiresAt: at + 300_001 }, at), () => empty.completeLogin(transactionKey, key, { ...session(), subject: "another-owner" }, null, at), () => empty.completeLogin(transactionKey, key, { ...session(), expiresAt: at }, null, at)]) await assert.rejects(method(), OwnerAuthorizationError);
  const full = new PostgresOwnerIdentityStore(runner(sql => sql.startsWith("SELECT count") ? { rowCount: 1, rows: [{ count: 1 }] } : scripted(sql)), binding, 1);
  await assert.rejects(full.putTransaction(transactionKey, pending(), at), /capacity/);
  const broken = new PostgresOwnerIdentityStore(runner(() => { throw Error("SYNTHETIC-DB-FAILURE"); }), binding);
  await assert.rejects(broken.getSession(key, at), /SYNTHETIC-DB-FAILURE/); // Adapter layer, not public HTTP output.
  for (const row of [{ issuer: binding.issuer, subject: "wrong" }, { issuer: binding.issuer, subject: binding.ownerSubject, created_at: "invalid", expires_at: new Date(at + 1000) }]) {
    const malformed = new PostgresOwnerIdentityStore(runner(sql => sql.startsWith("SELECT issuer") ? { rowCount: 1, rows: [row] } : scripted(sql)), binding);
    await assert.rejects(malformed.getSession(key, at), OwnerAuthorizationError);
  }
});

test("authorized runner locks before work, binds RLS, and checks DB expiry again before commit", async () => {
  const base = runner(scripted), input = proof(), authorized = createOwnerAuthorizedRunner(base, input, binding);
  input.subject = "mutated";
  assert.equal(await authorized.transaction(async executor => { await executor.query("SELECT hash FROM synthetic_work"); return "synthetic-result"; }), "synthetic-result");
  const lock = base.queries.findIndex(row => row.sql.includes("FOR SHARE")), work = base.queries.findIndex(row => row.sql.includes("synthetic_work"));
  assert.ok(lock < work); assert.deepEqual(base.queries[lock].values, [key, identityBindingHash(binding), binding.origin, binding.issuer, binding.ownerSubject, binding.portfolioSubject]);
  assert.ok(base.queries.at(-1).sql.includes("expires_at > clock_timestamp()")); assert.ok(base.queries.at(-1).sql.includes("current_setting('asha.subject_id',true)=$6"));
  assert.deepEqual(base.events, ["begin", "commit"]);
  for (const change of [{ sessionHash: "bad" }, { issuer: "https://attacker.invalid" }, { subject: "another-owner" }]) assert.throws(() => createOwnerAuthorizedRunner(base, { ...proof(), ...change }, binding), OwnerAuthorizationError);
});

test("revoked session never runs work and an expiry/context change after work rolls the transaction back", async () => {
  for (const failAfterWork of [false, true]) {
    let checks = 0, performed = false;
    const base = runner(sql => sql.startsWith("SELECT hash FROM private_owner_sessions") ? { rowCount: ++checks === 1 && failAfterWork ? 1 : 0, rows: [] } : scripted(sql));
    await assert.rejects(createOwnerAuthorizedRunner(base, proof(), binding).transaction(async () => { performed = true; }), OwnerAuthorizationError);
    assert.equal(performed, failAfterWork); assert.deepEqual(base.events, ["begin", "rollback"]);
  }
});

test("async login completion followed by pending-cookie logout cannot resurrect an undelivered session", async () => {
  const memory = createMemoryOwnerIdentityStore(); let completed, release;
  const ready = new Promise(resolve => { completed = resolve; }), wait = new Promise(resolve => { release = resolve; });
  const store = Object.fromEntries(Object.keys(memory).map(name => [name, async (...args) => memory[name](...args)]));
  store.completeLogin = async (...args) => { const result = memory.completeLogin(...args); completed(); await wait; return result; };
  const adapter = { issuer: binding.issuer, redirectUri: binding.origin + "/auth/google/callback", authorizationUrl({ state }) { return new URL(`${binding.issuer}/authorize?state=${state}`); }, async exchange() { return { issuer: binding.issuer, subject: binding.ownerSubject, emailVerified: true, expiresAt: Date.now() + 60_000 }; } };
  const gate = createOwnerIdentityGate({ origin: binding.origin, ownerSubject: binding.ownerSubject, adapter, store });
  const post = (path, intent, cookie) => new Request(binding.origin + path, { method: "POST", headers: { origin: binding.origin, "sec-fetch-site": "same-origin", "x-asha-intent": intent, ...(cookie ? { cookie } : {}) } });
  const begun = await gate.begin(post("/auth/google/start", "owner-login"));
  const pendingCookie = begun.headers.getSetCookie().find(value => value.startsWith("__Host-asha-login=") && !value.includes("Max-Age=0")).split(";")[0];
  const state = new URL((await begun.json()).authorizationUrl).searchParams.get("state");
  const callback = gate.callback(new Request(`${adapter.redirectUri}?state=${state}&code=synthetic-code`, { headers: { cookie: pendingCookie } }));
  await ready;
  assert.equal((await gate.logout(post("/auth/logout", "owner-logout", pendingCookie))).status, 200);
  release(); const result = await callback;
  const issued = result.headers.getSetCookie().find(value => value.startsWith("__Host-asha-owner=") && !value.includes("Max-Age=0"));
  if (issued) {
    const cookie = issued.split(";")[0];
    assert.equal((await gate.session(new Request(binding.origin + "/auth/session", { headers: { cookie } }))).status, 401);
    const hash = createHash("sha256").update(cookie.split("=")[1]).digest("base64url"); assert.equal(memory.getSession(hash, Date.now()), null);
  } else assert.equal(result.status, 401);
});
