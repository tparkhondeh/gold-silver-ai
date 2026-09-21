import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerPasskeyGate } from "../auth/passkey-identity.ts";
import { PasskeyDeniedError, PasskeyRateLimitError, PasskeyUnavailableError } from "../auth/passkey-types.ts";
import { fixture, authenticator, request, cookieFrom, beginAuthentication, authenticate, paths, origin, subject, hash } from "./fixtures/passkey-fixture.mjs";

async function beginRegistration(f, json, cookie) {
  const response = await f.gate.registrationOptions(request(paths.registrationOptions, { json, cookie }));
  return { response, cookie: cookieFrom(response), options: (await response.json()).options };
}
async function registered(f, key, changes = {}) {
  const start = await beginRegistration(f, { bootstrapToken: f.grant() });
  assert.equal(start.response.status, 200);
  const value = key.registration(start.options.challenge, changes);
  const response = await f.gate.verifyRegistration(request(paths.registrationVerify, { json: value, cookie: start.cookie }));
  return { start, value, response };
}
const getSession = (f, cookie) => f.gate.session(request("/auth/session", { method: "GET", cookie }));

test("real WebAuthn registration and signed assertion require owner grant, bind known owner, and reuse hardened opaque sessions", async t => {
  t.mock.method(globalThis, "fetch", () => { throw Error("No network allowed"); });
  const f = fixture(), key = authenticator();
  assert.equal((await f.gate.authenticationOptions(request(paths.authenticationOptions))).status, 401);
  assert.equal((await beginRegistration(f, {})).response.status, 401);
  const result = await registered(f, key);
  assert.equal(result.response.status, 200); assert.deepEqual(await result.response.json(), { registered: true });
  assert.equal(f.sessions.size, 0); assert.equal((await getSession(f, result.start.cookie)).status, 401);
  const options = result.start.options;
  assert.equal(options.rp.id, "portfolio.invalid"); assert.equal(options.attestation, "none");
  assert.equal(options.authenticatorSelection.userVerification, "required"); assert.equal(options.authenticatorSelection.residentKey, "required");
  const login = await authenticate(f, key);
  assert.equal(login.start.options.userVerification, "required"); assert.equal(login.start.options.allowCredentials[0].id, key.id);
  assert.equal(login.response.status, 200); assert.deepEqual(await login.response.json(), { authenticated: true, subject, expiresAt: f.state.now + 1_800_000 });
  const fullCookie = login.response.headers.getSetCookie().find(value => value.startsWith("__Host-asha-owner=") && !value.includes("Max-Age=0"));
  for (const value of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"]) assert.ok(fullCookie.includes(value));
  assert.ok(!fullCookie.includes("Domain=")); assert.equal(f.credentials.get(key.id).counter, 1);
  assert.equal((await getSession(f, login.cookie)).status, 200);
  let proof;
  const protectedResponse = await f.gate.requireOwner(request("/api/portfolio", { method: "GET", cookie: login.cookie }), (_request, owner, authorization) => { proof = authorization; assert.equal(owner.issuer, origin); return Response.json({ private: true }); });
  assert.equal(protectedResponse.status, 200); assert.equal(proof.subject, subject); assert.equal(proof.sessionHash, hash(login.cookie.split("=")[1]));
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test("unknown credential, wrong signature/origin/RP/challenge/type, missing UV/UP, cross-origin and wrong userHandle fail closed", async () => {
  const mutations = [
    () => ({ privateKey: authenticator().keys.privateKey }), () => ({ rpID: "other.invalid" }),
    () => ({ flags: 1 }), () => ({ flags: 4 }), () => ({ flags: 0 }),
    () => ({ clientData: { origin: "https://other.invalid" } }), () => ({ clientData: { challenge: "wrong" } }),
    () => ({ clientData: { type: "webauthn.create" } }), () => ({ clientData: { crossOrigin: true } }),
    () => ({ clientData: { topOrigin: origin } }), () => ({ userHandle: "other-owner" }),
  ];
  for (const change of mutations) {
    const f = fixture(), key = authenticator(); f.credentials.set(key.id, key.credential);
    assert.equal((await authenticate(f, key, change(key))).response.status, 401);
    assert.equal(f.sessions.size, 0); assert.equal(f.challenges.size, 0);
  }
  const f = fixture(), known = authenticator(), other = authenticator(); f.credentials.set(known.id, known.credential);
  assert.equal((await authenticate(f, other)).response.status, 401); assert.equal(f.sessions.size, 0);
});

test("registration rejects invalid origin/challenge/RP/UV/UP and all non-none attestations without network or enrollment", async t => {
  t.mock.method(globalThis, "fetch", () => { throw Error("No attestation networking"); });
  for (const changes of [{ rpID: "other.invalid" }, { flags: 0x41 }, { flags: 0x44 }, { clientData: { challenge: "wrong" } }, { clientData: { origin: "https://other.invalid" } }, { clientData: { crossOrigin: true } }, { fmt: "packed" }, { fmt: "none", attStmt: new Map([["x5c", []]]) }]) {
    const f = fixture(), key = authenticator(), result = await registered(f, key, changes);
    assert.equal(result.response.status, 401); assert.equal(f.credentials.size, 0); assert.equal(f.sessions.size, 0); assert.equal(f.challenges.size, 0);
  }
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test("grant/challenge replay, duplicate credential and concurrent assertions cannot mint another session", async () => {
  const f = fixture(), key = authenticator(), token = f.grant();
  const first = await beginRegistration(f, { bootstrapToken: token });
  assert.equal((await beginRegistration(f, { bootstrapToken: token })).response.status, 401);
  const value = key.registration(first.options.challenge);
  assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: first.cookie, json: value }))).status, 200);
  assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: first.cookie, json: value }))).status, 401);
  const start = await beginAuthentication(f), assertion = key.assertion(start.options.challenge);
  const results = await Promise.all([1, 2].map(() => f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: start.cookie, json: assertion }))));
  assert.deepEqual(results.map(value => value.status).sort(), [200, 401]); assert.equal(f.sessions.size, 1);
  const sessionCookie = cookieFrom(results.find(value => value.status === 200), "__Host-asha-owner");
  const duplicate = await beginRegistration(f, {}, sessionCookie);
  assert.equal(duplicate.options.excludeCredentials[0].id, key.id);
  assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: duplicate.cookie, json: key.registration(duplicate.options.challenge) }))).status, 401);
  assert.equal(f.credentials.size, 1);
});

test("counter regressions are rejected while authenticators with legitimate zero counters remain usable", async () => {
  const f = fixture(), key = authenticator(); f.credentials.set(key.id, key.credential);
  assert.equal((await authenticate(f, key, { counter: 0, flags: 0x1d })).response.status, 200);
  assert.equal((await authenticate(f, key, { counter: 0, flags: 0x1d })).response.status, 200);
  assert.equal((await authenticate(f, key, { counter: 2 })).response.status, 200);
  assert.equal((await authenticate(f, key, { counter: 2 })).response.status, 401);
  assert.equal((await authenticate(f, key, { counter: 1 })).response.status, 401);
});

test("additional registration requires fresh authentication at both options and completion, and never replaces a session", async () => {
  const f = fixture(), first = authenticator(), second = authenticator(); f.credentials.set(first.id, first.credential);
  const login = await authenticate(f, first), sessionCount = f.sessions.size;
  const start = await beginRegistration(f, {}, login.cookie);
  assert.equal(start.response.status, 200);
  assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: start.cookie, json: second.registration(start.options.challenge) }))).status, 200);
  assert.equal(f.credentials.size, 2); assert.equal(f.sessions.size, sessionCount); assert.equal((await getSession(f, login.cookie)).status, 200);
  f.state.now += 300_001;
  assert.equal((await beginRegistration(f, {}, login.cookie)).response.status, 401);
  const fresh = await authenticate(f, first, { counter: 2 }, login.cookie), third = authenticator();
  f.state.now += 299_999;
  const nearExpiry = await beginRegistration(f, {}, fresh.cookie); assert.equal(nearExpiry.response.status, 200);
  f.state.now += 2;
  assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: nearExpiry.cookie, json: third.registration(nearExpiry.options.challenge) }))).status, 401);
  assert.equal(f.credentials.size, 2);
});

test("reset, logout and expiry during an awaited completion cannot resurrect sessions or enroll credentials", async () => {
  for (const action of [f => f.reset(), (f, pending) => f.store.revokeBrowser(null, hash(pending.split("=")[1])), f => { f.state.now += 300_000; }]) {
    const f = fixture(), key = authenticator(); f.credentials.set(key.id, key.credential);
    const start = await beginAuthentication(f);
    f.state.hook = async () => action(f, start.cookie);
    assert.equal((await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: start.cookie, json: key.assertion(start.options.challenge) }))).status, 401);
    assert.equal(f.sessions.size, 0);
  }
  const f = fixture(), key = authenticator(), start = await beginRegistration(f, { bootstrapToken: f.grant() });
  f.state.hook = async () => f.reset();
  assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: start.cookie, json: key.registration(start.options.challenge) }))).status, 401);
  assert.equal(f.credentials.size, 0);
});

test("absolute session/challenge boundaries and late protected responses retain the existing fail-closed session rules", async () => {
  const f = fixture({ gate: { sessionTtlMs: 1000 } }), key = authenticator(); f.credentials.set(key.id, key.credential);
  const login = await authenticate(f, key);
  f.state.now += 999; assert.equal((await getSession(f, login.cookie)).status, 200);
  f.state.now++; assert.equal((await getSession(f, login.cookie)).status, 401);
  const start = await beginAuthentication(f); f.state.now += 300_000;
  assert.equal((await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: start.cookie, json: key.assertion(start.options.challenge, { counter: 2 }) }))).status, 401);
  const fresh = await authenticate(f, key, { counter: 2 });
  const response = await f.gate.requireOwner(request("/api/portfolio", { method: "GET", cookie: fresh.cookie }), async () => { await f.gate.logout(request("/auth/logout", { cookie: fresh.cookie })); return Response.json({ private: "must not publish" }); });
  assert.equal(response.status, 401); assert.ok(!(await response.text()).includes("must not publish"));
});

test("strict same-origin intents, methods, paths, cookie ambiguity and JSON bounds reject before credential verification", async () => {
  const f = fixture(), key = authenticator(); f.credentials.set(key.id, key.credential);
  for (const bad of [request(paths.authenticationOptions, { method: "GET" }), request(paths.authenticationOptions, { headers: { origin: "https://other.invalid" } }), request(paths.authenticationOptions, { headers: { "sec-fetch-site": "cross-site" } }), request(paths.authenticationOptions, { intent: "owner-action" }), request(paths.authenticationOptions + "?extra=1"), request(paths.authenticationOptions, { body: "nonempty" })]) assert.equal((await f.gate.authenticationOptions(bad)).status, 403);
  const start = await beginAuthentication(f);
  for (const bad of [request(paths.authenticationVerify, { cookie: start.cookie + "; " + start.cookie, json: {} }), request(paths.authenticationVerify, { cookie: start.cookie, body: "{}", headers: { "content-type": "text/plain" } }), request(paths.authenticationVerify, { cookie: start.cookie, body: "x".repeat(65_537), headers: { "content-type": "application/json" } })]) assert.equal((await f.gate.verifyAuthentication(bad)).status, 401);
  assert.equal((await beginRegistration(f, { bootstrapToken: f.grant(), extra: true })).response.status, 403);
  assert.equal(f.sessions.size, 0);
});

test("fragmented/malformed bodies, corrupted storage and invalid configuration fail without private diagnostics", async () => {
  const f = fixture(), key = authenticator(); f.credentials.set(key.id, key.credential);
  const start = await beginAuthentication(f);
  const endlessEmpty = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()); } });
  const response = await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: start.cookie, body: endlessEmpty, headers: { "content-type": "application/json" } }));
  assert.equal(response.status, 401);
  f.store.beginAuthentication = async () => { throw Error("PRIVATE_DIAGNOSTIC"); };
  assert.ok(!(await (await f.gate.authenticationOptions(request(paths.authenticationOptions))).text()).includes("PRIVATE_DIAGNOSTIC"));
  for (const change of [{ origin: "http://portfolio.invalid" }, { origin: origin + "/path" }, { ownerSubject: "" }, { ownerSubject: undefined }, { ownerSubject: "local-owner-v1" }, { store: undefined }, { store: {} }, { sessionTtlMs: 999 }, { sessionTtlMs: 28_800_001 }]) assert.throws(() => createOwnerPasskeyGate({ origin, ownerSubject: subject, store: f.store, ...change }));
});

test("raw attested credential ID must equal browser id/rawId; malformed verification consumes its pending challenge", async () => {
  const f = fixture(), key = authenticator(), other = authenticator();
  const start = await beginRegistration(f, { bootstrapToken: f.grant() });
  const value = key.registration(start.options.challenge); value.id = value.rawId = other.id;
  assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: start.cookie, json: value }))).status, 401);
  assert.equal(f.credentials.size, 0); assert.equal(f.challenges.size, 0);
  f.credentials.set(key.id, key.credential);
  const login = await beginAuthentication(f);
  assert.equal((await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: login.cookie, body: "not-json", headers: { "content-type": "application/json" } }))).status, 401);
  assert.equal(f.challenges.size, 0);
  assert.equal((await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: login.cookie, json: key.assertion(login.options.challenge) }))).status, 401);
});

test("durable limit, expected denial and unavailable storage return distinct fixed status codes without raw diagnostics", async () => {
  for (const [error, status] of [[new PasskeyDeniedError(), 401], [new PasskeyRateLimitError(), 429], [new PasskeyUnavailableError(), 503], [Error("PRIVATE_DB_CONNECTION"), 503]]) {
    const f = fixture(); f.store.beginAuthentication = async () => { throw error; };
    const response = await f.gate.authenticationOptions(request(paths.authenticationOptions));
    assert.equal(response.status, status); assert.ok(!(await response.text()).includes("PRIVATE_DB_CONNECTION"));
  }
  const f = fixture(), key = authenticator(); f.credentials.set(key.id, key.credential);
  const start = await beginAuthentication(f);
  f.store.claimChallenge = async () => { throw new PasskeyRateLimitError(); };
  assert.equal((await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: start.cookie, json: key.assertion(start.options.challenge) }))).status, 429);
  const register = fixture(); register.store.beginRegistration = async () => { throw new PasskeyRateLimitError(); };
  assert.equal((await beginRegistration(register, { bootstrapToken: register.grant() })).response.status, 429);
});

test("pending-registration logout and authorizing-session logout both prevent later enrollment", async () => {
  for (const pendingOnly of [true, false]) {
    const f = fixture(), first = authenticator(), second = authenticator(); f.credentials.set(first.id, first.credential);
    const login = await authenticate(f, first), start = await beginRegistration(f, {}, login.cookie);
    const logout = await f.gate.logout(request("/auth/logout", { cookie: pendingOnly ? start.cookie : login.cookie }));
    assert.equal(logout.status, 200);
    assert.equal((await f.gate.verifyRegistration(request(paths.registrationVerify, { cookie: start.cookie, json: second.registration(start.options.challenge) }))).status, 401);
    assert.equal(f.credentials.size, 1);
  }
});

test("new login clears the old cookie and logout can revoke a committed but undelivered session using the pending cookie", async () => {
  const f = fixture(), key = authenticator(); f.credentials.set(key.id, key.credential);
  const old = await authenticate(f, key), start = await beginAuthentication(f, old.cookie);
  assert.ok(start.response.headers.getSetCookie().some(value => value.startsWith("__Host-asha-owner=") && value.includes("Max-Age=0")));
  assert.equal((await getSession(f, old.cookie)).status, 401);
  const complete = f.store.completeAuthentication;
  f.store.completeAuthentication = async input => { const result = await complete(input); await f.store.revokeBrowser(null, hash(start.cookie.split("=")[1])); return result; };
  const response = await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: start.cookie, json: key.assertion(start.options.challenge, { counter: 2 }) }));
  assert.equal(response.status, 200); // A delivered cookie is not proof the session remains live.
  assert.equal((await getSession(f, cookieFrom(response, "__Host-asha-owner"))).status, 401);
  assert.equal(f.sessions.size, 0);
});
