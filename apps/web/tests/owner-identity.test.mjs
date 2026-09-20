import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createOwnerIdentityGate, createAcceptanceOwnerIdentityGate, createMemoryOwnerIdentityStore, OWNER_AUTH_PATHS } from "../auth/owner-identity.ts";
import { createGoogleIdentityAdapter, createAcceptanceOidcAdapter } from "../auth/google-identity-adapter.ts";

const origin = "https://portfolio.invalid", subject = "synthetic-owner-v1", clientId = "synthetic-client", secret = "SYNTHETIC-NOT-A-CREDENTIAL";
const metadata = { issuer: "https://identity.invalid", authorization_endpoint: "https://identity.invalid/authorize", token_endpoint: "https://identity.invalid/token", jwks_uri: "https://identity.invalid/jwks", id_token_signing_alg_values_supported: ["RS256"], authorization_response_iss_parameter_supported: true };
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "synthetic-key", alg: "RS256", use: "sig" };
const encoded = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const sha = value => createHash("sha256").update(value).digest("base64url");
function signed(claims, { badSignature = false, alg = "RS256", kid = "synthetic-key" } = {}) {
  const content = `${encoded({ alg, kid, typ: "JWT" })}.${encoded(claims)}`;
  return `${content}.${sign("RSA-SHA256", Buffer.from(content), (badSignature ? otherKeys : keys).privateKey).toString("base64url")}`;
}
function provider() {
  const codes = new Map(); let calls = 0, grants = 0, beforeToken = null, sequence = 0;
  const fetch = async (input, init) => {
    calls++;
    assert.equal(init.redirect, "error");
    if (String(input) === metadata.jwks_uri) return Response.json({ keys: [jwk] });
    assert.equal(String(input), metadata.token_endpoint); grants++;
    if (beforeToken) await beforeToken();
    const body = new URLSearchParams(init.body), code = body.get("code"), pending = codes.get(code);
    codes.delete(code);
    if (!pending || sha(body.get("code_verifier") ?? "") !== pending.challenge || body.get("client_id") !== clientId || body.get("client_secret") !== secret || body.get("redirect_uri") !== pending.redirectUri) return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json({ access_token: "SYNTHETIC-DISCARDED-ACCESS-TOKEN", token_type: "Bearer", expires_in: 3600, ...(pending.omitToken ? {} : { id_token: signed(pending.claims, pending.options) }) });
  };
  return { fetch, get calls() { return calls; }, get grants() { return grants; }, set beforeToken(value) { beforeToken = value; }, issue(authorizationUrl, changes = {}, options = {}) {
    const auth = new URL(authorizationUrl), seconds = Math.floor(Date.now() / 1000), code = `synthetic-code-${++sequence}`;
    assert.equal(auth.searchParams.get("scope"), "openid email"); assert.equal(auth.searchParams.get("code_challenge_method"), "S256"); assert.equal(auth.searchParams.get("response_type"), "code");
    const claims = { iss: metadata.issuer, aud: clientId, sub: subject, nonce: auth.searchParams.get("nonce"), email: "owner@example.invalid", email_verified: true, iat: seconds, exp: seconds + 3600, ...changes };
    for (const [key, value] of Object.entries(claims)) if (value === undefined) delete claims[key];
    codes.set(code, { claims, options, challenge: options.badPkce ? "invalid-challenge" : auth.searchParams.get("code_challenge"), redirectUri: auth.searchParams.get("redirect_uri"), omitToken: options.omitToken });
    const callback = new URL(auth.searchParams.get("redirect_uri")); callback.searchParams.set("code", code); callback.searchParams.set("state", auth.searchParams.get("state")); callback.searchParams.set("iss", metadata.issuer);
    return callback;
  } };
}
function request(path, { cookie, method = "GET", intent, base = origin, headers = {}, body } = {}) {
  return new Request(new URL(path, base), { method, headers: { ...(cookie ? { cookie } : {}), ...(intent ? { origin: base, "sec-fetch-site": "same-origin", "x-asha-intent": intent } : {}), ...headers }, ...(body === undefined ? {} : { body }) });
}
function cookieFrom(response, name = "__Host-asha-login") {
  const values = response.headers.getSetCookie().filter(item => item.startsWith(`${name}=`) && !item.includes("Max-Age=0"));
  assert.equal(values.length, 1); return values[0].split(";")[0];
}
function fixture(options = {}) {
  const fake = provider(), base = options.origin ?? origin;
  const adapter = createAcceptanceOidcAdapter({ clientId, clientSecret: secret, redirectUri: `${base}${OWNER_AUTH_PATHS.callback}`, metadata, fetch: fake.fetch });
  const gate = (options.acceptance ? createAcceptanceOwnerIdentityGate : createOwnerIdentityGate)({ origin: base, ownerSubject: subject, adapter, store: createMemoryOwnerIdentityStore(), ...options });
  return { fake, adapter, gate };
}
async function started(f, base = origin) {
  const response = await f.gate.begin(request(OWNER_AUTH_PATHS.begin, { method: "POST", intent: "owner-login", base })); assert.equal(response.status, 200);
  const { authorizationUrl } = await response.json(); return { cookie: cookieFrom(response, base === origin ? "__Host-asha-login" : "asha_acceptance_login"), authorizationUrl };
}
async function loggedIn(f, changes = {}, options = {}) {
  const start = await started(f), url = f.fake.issue(start.authorizationUrl, changes, options);
  const response = await f.gate.callback(request(url, { cookie: start.cookie }));
  return { ...start, url, response, cookie: response.status === 303 ? cookieFrom(response, "__Host-asha-owner") : start.cookie };
}

test("real signed fake OIDC exchange verifies owner, sets hardened opaque cookies and gates protected responses", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-01-01T00:00:00Z") });
  const f = fixture(), result = await loggedIn(f);
  assert.equal(result.response.status, 303); assert.equal(result.response.headers.get("location"), "/");
  const sessionCookie = result.response.headers.getSetCookie().find(value => value.startsWith("__Host-asha-owner=") && !value.includes("Max-Age=0"));
  for (const expected of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"]) assert.ok(sessionCookie.includes(expected));
  assert.ok(!sessionCookie.includes("Domain=")); assert.match(result.cookie, /^__Host-asha-owner=[\w-]{43}$/);
  const session = await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: result.cookie }));
  assert.deepEqual(await session.json(), { authenticated: true, subject, expiresAt: Date.now() + 30 * 60_000 });
  const protectedResponse = await f.gate.requireOwner(request("/private", { cookie: result.cookie }), (_req, owner) => Response.json({ owner }));
  assert.equal(protectedResponse.status, 200); assert.equal(protectedResponse.headers.get("cache-control"), "no-store"); assert.equal((await protectedResponse.json()).owner.subject, subject);
  assert.equal(f.fake.grants, 1); assert.equal(f.fake.calls, 2);
  assert.equal(JSON.stringify([...session.headers]).includes(secret), false);
});

test("signature, algorithm, key, issuer, audience, authorized party, nonce, dates and verified email all fail closed", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-01-01T00:00:00Z") });
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    [{}, { badSignature: true }], [{}, { alg: "none" }], [{}, { alg: "HS256" }], [{}, { kid: "unknown" }],
    [{ iss: "https://attacker.invalid" }], [{ aud: "other-client" }], [{ aud: [clientId, "other-client"], azp: "other-client" }],
    [{ nonce: "wrong" }], [{ nonce: undefined }], [{ exp: now }], [{ exp: undefined }], [{ iat: now + 1 }], [{ iat: undefined }], [{ nbf: now + 60 }],
    [{ email_verified: false }], [{ email_verified: "true" }], [{ email: undefined }], [{ sub: "non-owner", email: "owner@example.invalid" }], [{ sub: undefined }],
    [{}, { omitToken: true }], [{}, { badPkce: true }],
  ];
  for (const [claims, options] of cases) {
    const f = fixture(), result = await loggedIn(f, claims, options);
    assert.equal(result.response.status, 401, JSON.stringify({ claims, options }));
    assert.deepEqual(await result.response.json(), { authenticated: false, error: "identity_denied" });
    assert.equal(result.response.headers.getSetCookie().some(value => value.startsWith("__Host-asha-owner=") && !value.includes("Max-Age=0")), false);
  }
});

test("missing/wrong/duplicate state, missing browser binding, provider denial and replay never create a session", async () => {
  for (const alter of [url => url.searchParams.delete("state"), url => url.searchParams.set("state", "a".repeat(43)), url => url.searchParams.append("state", "a".repeat(43)), url => url.searchParams.set("error", "access_denied"), url => url.searchParams.delete("code"), url => url.searchParams.set("iss", "https://attacker.invalid")]) {
    const f = fixture(), start = await started(f), url = f.fake.issue(start.authorizationUrl); alter(url);
    assert.equal((await f.gate.callback(request(url, { cookie: start.cookie }))).status, 401);
    assert.equal(f.fake.grants, 0);
  }
  const f = fixture(), result = await loggedIn(f);
  assert.equal((await f.gate.callback(request(result.url, { cookie: result.cookie }))).status, 401);
  assert.equal(f.fake.grants, 1);
  const other = fixture(), start = await started(other), url = other.fake.issue(start.authorizationUrl);
  assert.equal((await other.gate.callback(request(url))).status, 401); assert.equal(other.fake.grants, 0);
});

test("strict origin, path, methods, cookie ambiguity and same-origin POST intent cannot be bypassed by identity/proxy headers", async () => {
  const f = fixture();
  for (const bad of [
    request(OWNER_AUTH_PATHS.begin), request(OWNER_AUTH_PATHS.begin, { method: "POST" }),
    request(OWNER_AUTH_PATHS.begin, { method: "POST", intent: "wrong" }),
    request(OWNER_AUTH_PATHS.begin, { method: "POST", intent: "owner-login", headers: { origin: "https://attacker.invalid" } }),
    request(OWNER_AUTH_PATHS.begin, { method: "POST", intent: "owner-login", headers: { "sec-fetch-site": "cross-site" } }),
    request(OWNER_AUTH_PATHS.begin, { method: "POST", intent: "owner-login", headers: { host: "attacker.invalid" } }),
    request(OWNER_AUTH_PATHS.begin + "?next=https://attacker.invalid", { method: "POST", intent: "owner-login" }),
    request(OWNER_AUTH_PATHS.begin, { method: "POST", intent: "owner-login", body: "{}" }),
  ]) assert.equal((await f.gate.begin(bad)).status, 403);
  for (const cookie of ["__Host-asha-owner=invalid", `__Host-asha-owner=${"a".repeat(43)}; __Host-asha-owner=${"b".repeat(43)}`, "x=" + "x".repeat(4096)]) {
    assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie }))).status, 401);
  }
  assert.equal((await f.gate.requireOwner(request("/private", { headers: { "x-owner-sub": subject, "x-forwarded-host": "portfolio.invalid", "oai-user-id": subject } }), () => { assert.fail("anonymous handler ran"); })).status, 401);
  assert.equal((await f.gate.callback(request(OWNER_AUTH_PATHS.callback, { method: "POST" }))).status, 403);
  assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session + "?ignored=1"))).status, 403);
  assert.equal(f.fake.calls, 0);
});

test("logout is POST-only, revokes opaque session, and suppresses an already waiting protected response", async () => {
  const f = fixture(), result = await loggedIn(f);
  assert.equal((await f.gate.logout(request(OWNER_AUTH_PATHS.logout, { cookie: result.cookie }))).status, 403);
  assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: result.cookie }))).status, 200);
  let finish; const protectedResponse = f.gate.requireOwner(request("/private", { cookie: result.cookie }), () => new Promise(resolve => { finish = () => resolve(Response.json({ secretRecord: "never-published" })); }));
  const logout = await f.gate.logout(request(OWNER_AUTH_PATHS.logout, { cookie: result.cookie, method: "POST", intent: "owner-logout" }));
  assert.equal(logout.status, 200); assert.deepEqual(await logout.json(), { authenticated: false });
  finish(); const response = await protectedResponse; assert.equal(response.status, 401); assert.equal((await response.text()).includes("never-published"), false);
  assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: result.cookie }))).status, 401);
});

test("logout during exchange invalidates claimed transaction; concurrent replay cannot issue a second grant", async () => {
  const f = fixture(), start = await started(f), url = f.fake.issue(start.authorizationUrl);
  let finish; f.fake.beforeToken = () => new Promise(resolve => { finish = resolve; });
  const callback = f.gate.callback(request(url, { cookie: start.cookie }));
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.gate.logout(request(OWNER_AUTH_PATHS.logout, { cookie: start.cookie, method: "POST", intent: "owner-logout" }))).status, 200);
  finish(); assert.equal((await callback).status, 401); assert.equal(f.fake.grants, 1);
  const second = fixture(), pending = await started(second), callbackUrl = second.fake.issue(pending.authorizationUrl);
  const responses = await Promise.all([second.gate.callback(request(callbackUrl, { cookie: pending.cookie })), second.gate.callback(request(callbackUrl, { cookie: pending.cookie }))]);
  assert.ok(responses.every(response => [401, 303].includes(response.status))); assert.ok(responses.filter(response => response.status === 303).length <= 1); assert.equal(second.fake.grants, 1);
});

test("absolute expiry, transaction expiry and process restart fail closed without extending cookies", async () => {
  let now = Date.now(); const f = fixture({ clock: () => now, sessionTtlMs: 1000 }), result = await loggedIn(f);
  now += 999; assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: result.cookie }))).status, 200);
  now++; assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: result.cookie }))).status, 401);
  const pending = fixture({ clock: () => now }), start = await started(pending), url = pending.fake.issue(start.authorizationUrl);
  now += 5 * 60_000; assert.equal((await pending.gate.callback(request(url, { cookie: start.cookie }))).status, 401); assert.equal(pending.fake.calls, 0);
  const restart = fixture(); assert.equal((await restart.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: result.cookie }))).status, 401);
});

test("begin rotates browser login/session, rejects capacity overflow, and acceptance HTTP requires an explicit loopback factory", async () => {
  const f = fixture(), old = await loggedIn(f);
  const fresh = await f.gate.begin(request(OWNER_AUTH_PATHS.begin, { cookie: old.cookie, method: "POST", intent: "owner-login" })); assert.equal(fresh.status, 200);
  assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: old.cookie }))).status, 401);
  const bounded = fixture({ store: createMemoryOwnerIdentityStore(1) }); await started(bounded);
  assert.equal((await bounded.gate.begin(request(OWNER_AUTH_PATHS.begin, { method: "POST", intent: "owner-login" }))).status, 401);
  assert.throws(() => createMemoryOwnerIdentityStore(0));
  assert.throws(() => fixture({ origin: "http://127.0.0.1:4175" }));
  const local = fixture({ origin: "http://127.0.0.1:4175", acceptance: true });
  const start = await started(local, "http://127.0.0.1:4175"); assert.ok(start.cookie.startsWith("asha_acceptance_login="));
  assert.throws(() => fixture({ origin: "http://attacker.invalid:4175", acceptance: true }));
  assert.throws(() => fixture({ origin: origin + "/" }));
  assert.throws(() => fixture({ ownerSubject: "" }));
  assert.throws(() => fixture({ sessionTtlMs: 0 }));
  assert.throws(() => createGoogleIdentityAdapter({ clientId, clientSecret: secret, redirectUri: "http://localhost:4175/auth/google/callback" }));
  const google = createGoogleIdentityAdapter({ clientId, clientSecret: secret, redirectUri: `${origin}/auth/google/callback` });
  assert.equal(google.issuer, "https://accounts.google.com");
  assert.equal(google.authorizationUrl({ state: "state", nonce: "nonce", codeChallenge: "challenge" }).origin, "https://accounts.google.com");
});

test("adapter forbids real endpoints in fake factory, wrong callback, response redirects, oversize and transport errors", async () => {
  const base = { clientId, clientSecret: secret, redirectUri: `${origin}/auth/google/callback`, metadata, fetch: async () => { throw Error("SENSITIVE-CANARY"); } };
  for (const changed of [{ issuer: "http://identity.invalid" }, { token_endpoint: "https://accounts.google.com/token" }, { jwks_uri: undefined }]) assert.throws(() => createAcceptanceOidcAdapter({ ...base, metadata: { ...metadata, ...changed } }));
  assert.throws(() => createAcceptanceOidcAdapter({ ...base, clientSecret: "" }));
  const adapter = createAcceptanceOidcAdapter(base);
  await assert.rejects(adapter.exchange({ callbackUrl: new URL("https://attacker.invalid/auth/google/callback"), state: "state", nonce: "nonce", codeVerifier: "v" }));
  for (const fetch of [base.fetch, async () => new Response("x", { headers: { "content-length": "65537" } }), async () => new Response("x".repeat(65537)), async () => { const response = Response.json({}); Object.defineProperty(response, "redirected", { value: true }); return response; }]) {
    const fake = provider(), f = fixture({ adapter: createAcceptanceOidcAdapter({ ...base, fetch }) }), start = await started(f), url = fake.issue(start.authorizationUrl);
    const response = await f.gate.callback(request(url, { cookie: start.cookie }));
    assert.equal(response.status, 401); assert.equal((await response.text()).includes("SENSITIVE-CANARY"), false);
  }
});

test("Node-style empty streamed POST is accepted; nonempty or stalled streams are bounded and rejected", async () => {
  const f = fixture();
  const streamed = (path, stream, cookie, intent) => new Request(new URL(path, origin), { method: "POST", duplex: "half", body: stream, headers: { origin, "sec-fetch-site": "same-origin", "x-asha-intent": intent, ...(cookie ? { cookie } : {}) } });
  const empty = () => new ReadableStream({ start(controller) { controller.close(); } });
  assert.equal((await f.gate.begin(streamed(OWNER_AUTH_PATHS.begin, empty(), null, "owner-login"))).status, 200);
  const logged = await loggedIn(f);
  assert.equal((await f.gate.logout(streamed(OWNER_AUTH_PATHS.logout, empty(), logged.cookie, "owner-logout"))).status, 200);
  assert.equal((await f.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: logged.cookie }))).status, 401);
  assert.equal((await f.gate.begin(streamed(OWNER_AUTH_PATHS.begin, new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); } }), null, "owner-login"))).status, 403);
  let canceled = false;
  assert.equal((await f.gate.begin(streamed(OWNER_AUTH_PATHS.begin, new ReadableStream({ cancel() { canceled = true; } }), null, "owner-login"))).status, 403);
  assert.equal(canceled, true);
  let emptyReads = 0;
  assert.equal((await f.gate.begin(streamed(OWNER_AUTH_PATHS.begin, new ReadableStream({ pull(controller) { emptyReads++; controller.enqueue(new Uint8Array()); } }), null, "owner-login"))).status, 403);
  assert.ok(emptyReads <= 9);
});

test("protected writes require same-origin intent, and valid body is untouched for the authenticated handler", async () => {
  const f = fixture(), result = await loggedIn(f);
  let writes = 0;
  const write = async req => { writes++; return Response.json({ body: await req.json() }); };
  for (const overrides of [{}, { intent: "wrong" }, { intent: "owner-action", headers: { origin: "https://attacker.invalid" } }, { intent: "owner-action", headers: { "sec-fetch-site": "same-site" } }]) {
    const response = await f.gate.requireOwner(request("/private", { cookie: result.cookie, method: "POST", body: '{"synthetic":true}', ...overrides }), write);
    assert.equal(response.status, 403);
  }
  assert.equal(writes, 0);
  const response = await f.gate.requireOwner(request("/private", { cookie: result.cookie, method: "PUT", intent: "owner-action", body: '{"synthetic":true}' }), write);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { body: { synthetic: true } }); assert.equal(writes, 1);
});

test("in-flight transaction and protected response cannot outlive absolute expiration or clock rollback", async () => {
  let now = Date.now();
  const f = fixture({ clock: () => now }), start = await started(f), url = f.fake.issue(start.authorizationUrl);
  let finish; f.fake.beforeToken = () => new Promise(resolve => { finish = resolve; });
  const callback = f.gate.callback(request(url, { cookie: start.cookie }));
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  now += 5 * 60_000; finish(); assert.equal((await callback).status, 401);
  const owner = fixture({ clock: () => now, sessionTtlMs: 1000 }), logged = await loggedIn(owner);
  let complete; const response = owner.gate.requireOwner(request("/private", { cookie: logged.cookie }), () => new Promise(resolve => { complete = () => resolve(Response.json({ synthetic: true })); }));
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  now += 1000; complete(); assert.equal((await response).status, 401);
  const backwards = fixture({ clock: () => now }), last = await loggedIn(backwards);
  now--; assert.equal((await backwards.gate.session(request(OWNER_AUTH_PATHS.session, { cookie: last.cookie }))).status, 401);
});
