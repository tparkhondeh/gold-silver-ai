import assert from "node:assert/strict";
import test from "node:test";
import { PostgresPasskeyStore, issuePasskeyBootstrap, resetOwnerPasskeys } from "../auth/postgres-passkey-store.ts";
import { OwnerAuthorizationError, identityBindingHash } from "../auth/postgres-owner-identity-store.ts";
import { PasskeyRateLimitError } from "../auth/passkey-types.ts";

const owner = { origin: "https://portfolio.invalid", issuer: "https://portfolio.invalid", ownerSubject: "synthetic-owner", portfolioSubject: "private-test" };
const at = Date.parse("2026-09-21T12:00:00Z"), opaque = letter => letter.repeat(43);
const credential = () => ({ id: "YQ", publicKey: new Uint8Array([1, 2]), counter: 0, transports: ["internal"], deviceType: "singleDevice", backedUp: false });
const session = () => ({ issuer: owner.origin, subject: owner.ownerSubject, createdAt: at, expiresAt: at + 30_000 });
const auth = () => ({ challengeKey: opaque("a"), credentialId: "YQ", expectedCounter: 0, newCounter: 1, sessionKey: opaque("b"), session: session(), previousSessionKey: null, now: at });
function fixture(change = {}) {
  const state = { revision: 1, credentials: [credential()], challenge: true, granted: true, fresh: true, ownerExists: true, administrator: true, existingGrant: false, ...change };
  const queries = [], events = [];
  const runner = { async transaction(work) {
    events.push("begin");
    try { const value = await work({ async query(sql, values = []) {
      queries.push({ sql, values });
      if (state.fail?.(sql)) throw Error("Synthetic SQL failure");
      if (state.respond) { const response = state.respond(sql, values); if (response !== undefined) return response; }
      if (sql.startsWith("SELECT count(*)::integer AS count,") && sql.includes("bool_and")) return { rowCount: 1, rows: [{ count: 6, owned: state.administrator }] };
      if (sql.startsWith("UPDATE private_passkey_owners SET\n")) return state.revision === null ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ revision: state.revision }] };
      if (sql.startsWith("SELECT binding_hash")) return { rowCount: state.ownerExists ? 1 : 0, rows: [] };
      if (sql.startsWith("SELECT id,public_key")) return { rowCount: state.credentials.length, rows: state.credentials.map(value => ({ id: value.id, public_key: value.publicKey, counter: String(value.counter), transports: value.transports, device_type: value.deviceType, backed_up: value.backedUp })) };
      if (sql.startsWith("SELECT c.*")) return state.challenge ? { rowCount: 1, rows: [{ hash: values[0], purpose: values[2], challenge: opaque("c"), owner_revision: 1, created_at: new Date(at), expires_at: new Date(at + 300_000), claimed: sql.includes("c.claimed=true"), authority_kind: state.authority ?? "bootstrap", authority_hash: opaque("d") }] } : { rowCount: 0, rows: [] };
      if (sql.startsWith("SELECT hash FROM private_owner_sessions")) return { rowCount: state.fresh ? 1 : 0, rows: [] };
      if (sql.startsWith("UPDATE private_passkey_bootstrap_grants") || (sql.startsWith("SELECT hash FROM private_passkey_bootstrap_grants") && sql.includes("owner_revision"))) return { rowCount: state.granted ? 1 : 0, rows: [] };
      if (sql.startsWith("SELECT id FROM private_passkey_credentials")) return { rowCount: state.credentials.length, rows: [] };
      if (sql.startsWith("SELECT hash FROM private_passkey_bootstrap_grants")) return { rowCount: state.existingGrant ? 1 : 0, rows: [] };
      if (sql.startsWith("SELECT count")) return { rowCount: 1, rows: [{ count: state.sessionCount ?? 0 }] };
      return { rowCount: 1, rows: [] };
    } }); events.push("commit"); return value; }
    catch (error) { events.push("rollback"); throw error; }
  } };
  return { state, queries, events, runner, store: new PostgresPasskeyStore(runner, owner) };
}

test("passkey store validates binding, bounded inputs and clones mutable verified material before awaiting", async () => {
  assert.throws(() => new PostgresPasskeyStore(fixture().runner, { ...owner, issuer: "https://other.invalid" }), OwnerAuthorizationError);
  const f = fixture({ credentials: [] }), value = credential();
  const promise = f.store.completeRegistration({ challengeKey: opaque("a"), credential: value, now: at });
  value.publicKey[0] = 9; value.transports.push("usb");
  assert.equal(await promise, true);
  const inserted = f.queries.find(row => row.sql.startsWith("INSERT INTO private_passkey_credentials"));
  assert.deepEqual([...inserted.values[2]], [1, 2]); assert.deepEqual(inserted.values[4], ["internal"]);
  for (const change of [{ id: "a" }, { id: "!" }, { publicKey: new Uint8Array() }, { counter: -1 }, { counter: 2 ** 32 }, { transports: ["internal", "internal"] }, { transports: ["unknown"] }, { backedUp: true }, { deviceType: "unknown" }]) await assert.rejects(f.store.completeRegistration({ challengeKey: opaque("a"), credential: { ...credential(), ...change }, now: at }), OwnerAuthorizationError);
  for (const change of [{ key: "invalid" }, { challenge: "invalid" }, { now: NaN }]) await assert.rejects(f.store.beginAuthentication({ key: opaque("a"), challenge: opaque("b"), now: at, ...change }), OwnerAuthorizationError);
});

test("bad bootstrap attempts commit admission; missing owner stays denied; cap is explicit and not reset", async () => {
  for (const change of [{ credentials: [], granted: false }, { credentials: [], revision: null, ownerExists: false }]) {
    const f = fixture(change);
    await assert.rejects(f.store.beginRegistration({ key: opaque("a"), challenge: opaque("b"), authority: { kind: "bootstrap", grantHash: opaque("d") }, now: at }), OwnerAuthorizationError);
    assert.deepEqual(f.events, ["begin", "commit"]);
    assert.equal(f.queries.some(row => row.sql.startsWith("INSERT INTO private_passkey_owners")), false);
  }
  const capped = fixture({ revision: null });
  await assert.rejects(capped.store.beginAuthentication({ key: opaque("a"), challenge: opaque("b"), now: at }), PasskeyRateLimitError);
  assert.equal(capped.queries.some(row => row.sql.includes("attempts=0")), false);
});

test("begin binds exact scope, consumes grant once and rejects absent credentials/stale reauth/capacity", async () => {
  const f = fixture(); assert.equal((await f.store.beginAuthentication({ key: opaque("a"), challenge: opaque("b"), now: at })).credentials.length, 1);
  const inserted = f.queries.find(row => row.sql.startsWith("INSERT INTO private_passkey_challenges")); assert.equal(inserted.values[1], identityBindingHash(owner)); assert.equal(inserted.values[2], "authentication");
  const bootstrap = fixture({ credentials: [] }); await bootstrap.store.beginRegistration({ key: opaque("a"), challenge: opaque("b"), authority: { kind: "bootstrap", grantHash: opaque("d") }, now: at });
  assert.ok(bootstrap.queries.some(row => row.sql.includes("challenge_hash IS NULL")));
  for (const change of [{ credentials: [] }, { fresh: false }, { credentials: Array.from({ length: 10 }, (_, i) => ({ ...credential(), id: Buffer.from(`id-${i}`).toString("base64url") })) }]) {
    const blocked = fixture(change);
    if (!change.credentials?.length && change.fresh === undefined) await assert.rejects(blocked.store.beginAuthentication({ key: opaque("a"), challenge: opaque("b"), now: at }), OwnerAuthorizationError);
    else await assert.rejects(blocked.store.beginRegistration({ key: opaque("a"), challenge: opaque("b"), authority: { kind: "session", sessionHash: opaque("d") }, now: at }), OwnerAuthorizationError);
  }
});

test("claim is one-use, authority checked and denial commits without mutating claim", async () => {
  const f = fixture(); const found = await f.store.claimChallenge(opaque("a"), "authentication", at);
  assert.equal(found.claimed, true); assert.equal(found.createdAt, at); assert.equal(found.ownerRevision, 1);
  assert.ok(f.queries.some(row => row.sql.includes("c.claimed=false FOR UPDATE OF c")));
  for (const change of [{ challenge: false }, { credentials: [], granted: false }, { authority: "session", fresh: false }]) {
    const blocked = fixture(change); assert.equal(await blocked.store.claimChallenge(opaque("a"), "registration", at), null);
    assert.deepEqual(blocked.events, ["begin", "commit"]); assert.equal(blocked.queries.some(row => row.sql.startsWith("UPDATE private_passkey_challenges SET claimed")), false);
  }
});

test("atomic authentication counter/session writes roll back together and reject stale proof", async () => {
  const f = fixture(); assert.equal(await f.store.completeAuthentication({ ...auth(), previousSessionKey: opaque("e") }), true);
  assert.deepEqual(f.events, ["begin", "commit"]); assert.ok(f.queries.some(row => row.sql.includes("AND counter=$4")));
  const zero = fixture(); assert.equal(await zero.store.completeAuthentication({ ...auth(), newCounter: 0 }), true);
  for (const change of [{ session: { ...session(), subject: "wrong" } }, { session: { ...session(), createdAt: at + 1 } }, { session: { ...session(), expiresAt: at } }, { expectedCounter: 1, newCounter: 1 }, { expectedCounter: 2, newCounter: 1 }, { newCounter: -1 }]) await assert.rejects(f.store.completeAuthentication({ ...auth(), ...change }), OwnerAuthorizationError);
  assert.equal(await fixture({ challenge: false }).store.completeAuthentication(auth()), false);
  const cas = fixture({ respond: sql => sql.startsWith("UPDATE private_passkey_credentials") ? { rowCount: 0 } : undefined }); assert.equal(await cas.store.completeAuthentication(auth()), false);
  for (const change of [{ sessionCount: 256 }, { fail: sql => sql.startsWith("INSERT INTO private_owner_sessions") }, { respond: sql => sql.startsWith("INSERT INTO private_owner_sessions") ? { rowCount: 0 } : undefined }]) {
    const failing = fixture(change); await assert.rejects(failing.store.completeAuthentication(auth())); assert.equal(failing.events.at(-1), "rollback");
  }
});

test("registration retains no login session and rechecks authority after mutation", async () => {
  const f = fixture({ credentials: [], authority: "session" }); assert.equal(await f.store.completeRegistration({ challengeKey: opaque("a"), credential: credential(), now: at }), true);
  assert.equal(f.queries.filter(row => row.sql.startsWith("SELECT hash FROM private_owner_sessions")).length, 2);
  assert.equal(f.queries.some(row => row.sql.startsWith("INSERT INTO private_owner_sessions")), false);
  assert.ok(f.queries.some(row => row.sql.includes("revision=revision+1")));
  assert.equal(await fixture().store.completeRegistration({ challengeKey: opaque("a"), credential: credential(), now: at }), false);
  let checks = 0;
  const expired = fixture({ credentials: [], authority: "session", respond: sql => sql.startsWith("SELECT hash FROM private_owner_sessions") ? { rowCount: ++checks === 1 ? 1 : 0 } : undefined });
  await assert.rejects(expired.store.completeRegistration({ challengeKey: opaque("a"), credential: credential(), now: at }), OwnerAuthorizationError);
  assert.equal(expired.events.at(-1), "rollback");
});

test("revocation shares completion lock, removes session-authorized ceremonies and undelivered session links", async () => {
  const f = fixture(); await f.store.revokeBrowser(null, null); assert.equal(f.events.length, 0);
  await f.store.revokeBrowser(opaque("a"), opaque("b"));
  assert.ok(f.queries.findIndex(row => row.sql.includes("pg_advisory_xact_lock")) < f.queries.findIndex(row => row.sql.startsWith("DELETE")));
  assert.ok(f.queries.some(row => row.sql.includes("authority_kind='session'")));
  assert.ok(f.queries.some(row => row.sql.includes("login_transaction_hash=$3")));
  await f.store.deleteChallenge(opaque("a")); assert.equal(f.events.at(-1), "commit");
});

test("administrator helpers require real ownership, never reset portfolio or roll back a prior grant on denial", async () => {
  for (const operation of [(f) => issuePasskeyBootstrap(f.runner, owner, { grantHash: opaque("a"), now: at, expiresAt: at + 300_000 }), f => resetOwnerPasskeys(f.runner, owner)]) {
    const f = fixture({ administrator: false }); await assert.rejects(operation(f), OwnerAuthorizationError);
    assert.equal(f.queries.some(row => /^(INSERT|UPDATE|DELETE)/.test(row.sql)), false);
  }
  const f = fixture({ credentials: [] }); await issuePasskeyBootstrap(f.runner, owner, { grantHash: opaque("a"), now: at, expiresAt: at + 300_000 });
  assert.equal(f.events.at(-1), "commit");
  await resetOwnerPasskeys(f.runner, owner); assert.equal(f.events.at(-1), "commit");
  assert.ok(f.queries.some(row => row.sql.includes("revision=revision+1")));
  assert.ok(f.queries.every(row => !/\b(?:user_portfolios|portfolio_holdings|portfolio_preferences)\b/.test(row.sql)));
  for (const change of [{ credentials: [credential()] }, { credentials: [], existingGrant: true }]) {
    const blocked = fixture(change); await assert.rejects(issuePasskeyBootstrap(blocked.runner, owner, { grantHash: opaque("a"), now: at, expiresAt: at + 300_000 }), OwnerAuthorizationError);
    assert.equal(blocked.queries.some(row => row.sql.startsWith("DELETE FROM private_passkey_bootstrap_grants")), false); assert.equal(blocked.events.at(-1), "rollback");
  }
});
