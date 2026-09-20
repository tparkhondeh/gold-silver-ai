import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createPrivateApplication } from "../auth/private-application.ts";
import { createPrivateHttpServer } from "../auth/private-http.ts";
import { isEmptyPrivateBody } from "../auth/bounded-body.ts";
import { createOwnerIdentityGate, createMemoryOwnerIdentityStore } from "../auth/owner-identity.ts";
import { parsePrivateServerConfig, readPrivateServerConfig, assertPrivateProcessEnvironment } from "../scripts/private-server-config.ts";
import { createLocalAccessMode } from "../app/api/access-mode/route.ts";
import { identityBackupExclusions } from "../scripts/private-backup-policy.ts";
import { privateUiResponse } from "../auth/private-ui-response.ts";
import { readAccessMode, readOwnerSession, ownerAction, notifyOwnerAccessLost } from "../app/access-client.ts";

const origin = "https://goldsilver.wealthos.ir", release = "a".repeat(40);
function setup() {
  let time = Date.now(), portfolioCalls = 0, uiCalls = 0, authorization;
  const adapter = { issuer: "https://identity.invalid", redirectUri: `${origin}/auth/google/callback`, authorizationUrl(input) { authorization = input; return new URL("https://identity.invalid/authorize"); }, async exchange() { return { issuer: this.issuer, subject: "synthetic-owner", emailVerified: true, expiresAt: time + 60_000 }; } };
  const store = createMemoryOwnerIdentityStore();
  const gate = createOwnerIdentityGate({ origin, ownerSubject: "synthetic-owner", adapter, store, clock: () => time });
  const app = createPrivateApplication({ origin, release, gate, clock: () => time, portfolio: async (_req, proof) => { portfolioCalls++; assert.equal(proof.subject, "synthetic-owner"); return Response.json({ synthetic: true }); }, publicUi: async (req) => { uiCalls++; assert.equal(req.headers.has("cookie"), false); assert.equal(req.headers.has("x-oai-subject"), false); return new Response("Synthetic public UI shell"); } });
  const call = (path, method = "GET", extra = {}) => app(new Request(`${origin}${path}`, { method, ...extra }));
  async function login() {
    const start = await call("/auth/google/start", "POST", { headers: { origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-login" } });
    const transaction = start.headers.getSetCookie().find(value => value.startsWith("__Host-asha-login=") && !value.startsWith("__Host-asha-login=;" )).split(";")[0];
    const callback = await call(`/auth/google/callback?code=synthetic&state=${authorization.state}`, "GET", { headers: { cookie: transaction } });
    assert.equal(callback.status, 303);
    return callback.headers.getSetCookie().find(value => value.startsWith("__Host-asha-owner=") && !value.startsWith("__Host-asha-owner=;")).split(";")[0];
  }
  return { app, call, login, get calls() { return { portfolioCalls, uiCalls }; }, advance(ms) { time += ms; } };
}
test("private allowlist denies anonymous portfolio/export/market and all old testing/operator routes", async () => {
  const app = setup();
  for (const path of ["/api/portfolio", "/api/portfolio/export"]) assert.equal((await app.call(path)).status, 401);
  assert.equal((await app.call("/api/managed-market", "POST", { headers: { origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-action" } })).status, 401);
  for (const path of ["/api/operator/csv", "/api/market-test", "/api/market", "/.env", "/auth/test-expire", "/api/access-mode?local=true", "/api/health?detail=1", "/?__rsc=1", "/assets/config.json", "/_next/image?url=http://secret.invalid"]) assert.equal((await app.call(path)).status, 404);
  assert.deepEqual(app.calls, { portfolioCalls: 0, uiCalls: 0 });
});
test("public shell is stripped of identity headers; release is health not proof of login", async () => {
  const app = setup();
  assert.deepEqual(await (await app.call("/api/access-mode")).json(), { mode: "private" });
  assert.deepEqual(await (await app.call("/api/health")).json(), { mode: "private", release });
  for (const path of ["/", "/assets/a-b.js", "/_next/static/a.woff2", "/templates/purchase-lots-v1.xlsx"]) {
    const result = await app.call(path, "GET", { headers: { cookie: "secret-test", "x-oai-subject": "fake" } });
    assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(result.headers.get("x-frame-options"), "DENY");
  }
  assert.equal((await app.app(new Request("https://elsewhere.invalid/"))).status, 400);
  assert.equal((await app.call("/", "GET", { headers: { host: "wrong.invalid" } })).status, 400);
});
test("actual identity gate protects private handler, expiry and logout; market remains unavailable without transfer", async () => {
  const app = setup(), cookie = await app.login();
  assert.equal((await app.call("/api/portfolio", "GET", { headers: { cookie } })).status, 200);
  const headers = { cookie, origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-action", "x-asha-managed-market": "latest" };
  const market = await app.call("/api/managed-market", "POST", { headers });
  assert.equal(market.status, 200); assert.equal((await market.json()).reason, "missing_key");
  assert.equal((await app.call("/api/managed-market", "POST", { headers, body: "x" })).status, 400);
  assert.equal((await app.call("/api/managed-market", "POST", { headers, body: new ReadableStream({ start(c) { c.close(); } }), duplex: "half" })).status, 200);
  assert.equal((await app.call("/auth/logout", "POST", { headers: { ...headers, "x-asha-intent": "owner-logout" } })).status, 200);
  assert.equal((await app.call("/api/portfolio", "GET", { headers: { cookie } })).status, 401);
  const another = await app.login(); app.advance(60_001);
  assert.equal((await app.call("/auth/session", "GET", { headers: { cookie: another } })).status, 401);
});
test("login rate limit is bounded without trusting forwarded IP; construction fails closed", async () => {
  const app = setup();
  for (let i = 0; i < 10; i++) assert.equal((await app.call("/auth/google/start")).status, 403);
  assert.equal((await app.call("/auth/google/start")).status, 429); app.advance(60_001);
  assert.equal((await app.call("/auth/google/start")).status, 403);
  for (const config of [{ origin: "http://unsafe.invalid", release }, { origin, release: "bad" }]) assert.throws(() => createPrivateApplication(config));
});
test("application failures are sanitized; no raw error body or permissive CORS", async () => {
  const gate = { session() { throw Error("synthetic sensitive detail"); } };
  const app = createPrivateApplication({ origin, release, gate, publicUi: async () => new Response("public", { headers: { "access-control-allow-origin": "*" } }) });
  assert.deepEqual(await (await app(new Request(`${origin}/auth/session`))).json(), { error: "service_unavailable" });
  assert.equal((await app(new Request(origin))).headers.get("access-control-allow-origin"), null);
});
test("empty body guard rejects bytes, errors, excess fragmentation and stalls", async () => {
  const request = body => new Request(`${origin}/api/managed-market`, { method: "POST", body, duplex: "half" });
  assert.equal(await isEmptyPrivateBody(request(null)), true);
  assert.equal(await isEmptyPrivateBody(request("x")), false);
  assert.equal(await isEmptyPrivateBody(request(new ReadableStream({ start(c) { c.error(Error("test")); } }))), false);
  assert.equal(await isEmptyPrivateBody(request(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array()); } }))), false);
  assert.equal(await isEmptyPrivateBody(request(new ReadableStream({ pull() {} }))), false);
});
test("real Node bridge uses canonical host, strips forwarding, preserves separate cookies and null empty POST", async t => {
  let captured;
  const server = createPrivateHttpServer(origin, async request => {
    captured = request;
    const response = new Response(request.body ? await request.text() : "empty");
    response.headers.append("set-cookie", "synthetic-a=1; HttpOnly"); response.headers.append("set-cookie", "synthetic-b=2; HttpOnly");
    return response;
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise(done => { server.closeAllConnections(); server.close(done); }));
  const call = (path = "/", method = "GET", headers = {}, body) => new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: server.address().port, path, method, headers: { host: new URL(origin).host, ...headers } }, res => {
      let text = ""; res.on("data", chunk => { text += chunk; }); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    }); req.on("error", reject); req.end(body);
  });
  const empty = await call("/auth/logout", "POST", { "content-length": "0", "x-forwarded-host": "evil.invalid", "x-oai-subject": "fake" });
  assert.equal(empty.status, 200); assert.equal(empty.text, "empty"); assert.equal(empty.headers["set-cookie"].length, 2);
  assert.equal(captured.url, `${origin}/auth/logout`); assert.equal(captured.headers.has("x-oai-subject"), false); assert.equal(captured.headers.has("x-forwarded-host"), false);
  assert.equal((await call("/api/portfolio", "PUT", { "content-type": "application/json", "content-length": "2" }, "{}")).text, "{}");
  for (const args of [["/", "GET", { host: "evil.invalid" }], ["//evil.invalid/"], ["/", "OPTIONS"], ["/", "PUT", { "content-length": "2097153" }], ["/", "GET", { "content-length": "1" }, "x"]]) assert.equal((await call(...args)).status, 400);
  assert.throws(() => createPrivateHttpServer("http://example.invalid", async () => new Response()));
});
test("private configuration is exact, owner-bound, least-privilege local DB and never prints input", async () => {
  assertPrivateProcessEnvironment({ NODE_ENV: "production", ASHA_MARKET_NETWORK_ENABLED: "false" });
  for (const key of ["ASHA_LOCAL_PORTFOLIO_ENABLED", "ASHA_OPERATOR_COMMIT_ENABLED", "ASHA_MANAGED_MARKET_ENABLED", "NAVASAN_HISTORY_EXECUTION_ENABLED", "NAVASAN_API_KEY", "DATABASE_URL"]) assert.throws(() => assertPrivateProcessEnvironment({ [key]: "synthetic-unwanted" }), /values withheld/);
  const valid = { version: 1, origin, ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-private-owner", googleClientId: "synthetic.apps.googleusercontent.com", googleClientSecret: "synthetic-not-a-key", databaseUrl: "postgresql://asha_private_runtime:synthetic@127.0.0.1:55433/asha_private" };
  assert.deepEqual(parsePrivateServerConfig(JSON.stringify(valid)), valid);
  for (const changes of [{ version: 2 }, { origin: "https://other.invalid" }, { portfolioSubject: "local-owner-v1" }, { ownerSubject: "" }, { googleClientId: "wrong" }, { googleClientSecret: "" }, { extra: true }, { databaseUrl: "postgresql://postgres:synthetic@127.0.0.1:55433/asha_private" }, { databaseUrl: valid.databaseUrl + "?host=elsewhere.invalid" }, { databaseUrl: valid.databaseUrl.replace("127.0.0.1", "db.example.invalid") }]) assert.throws(() => parsePrivateServerConfig(JSON.stringify({ ...valid, ...changes })), /^Error: Private configuration invalid; contents withheld$/);
  for (const raw of ["x", "[]", "null", " ".repeat(16_385)]) assert.throws(() => parsePrivateServerConfig(raw));
  await assert.rejects(readPrivateServerConfig(), /^Error: Private configuration unavailable or unsafe; contents withheld$/);
  assert.deepEqual(identityBackupExclusions, ["--exclude-table-data=*.private_owner_login_transactions", "--exclude-table-data=*.private_owner_sessions"]);
});
test("local access disclosure needs explicit flag and loopback; no hosted fallback", async () => {
  for (const [url, env, status] of [["http://127.0.0.1:4174/api/access-mode", { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" }, 200], [origin + "/api/access-mode", { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" }, 503], ["http://localhost:4174/api/access-mode", {}, 503]]) assert.equal((await createLocalAccessMode(env)(new Request(url))).status, status);
});
test("decoded public UI strips stale compression, length, cookies and hop-by-hop metadata", async () => {
  const response = privateUiResponse(new Response("decoded body", { headers: { "content-type": "text/html", "content-encoding": "gzip", "content-length": "999", "set-cookie": "synthetic-only=1", connection: "keep-alive" } }));
  assert.equal(await response.text(), "decoded body");
  assert.deepEqual([...response.headers], [["cache-control", "no-store"], ["content-type", "text/html"]]);
  assert.throws(() => privateUiResponse(new Response(null, { status: 302 })));
});
test("browser auth transport validates mode/session/action, denial and bounded payloads", async () => {
  const reply = (body, status = 200) => async () => Response.json(body, { status });
  assert.equal(await readAccessMode(reply({ mode: "private" })), "private"); assert.equal(await readAccessMode(reply({ mode: "local" })), "local");
  await assert.rejects(readAccessMode(reply({ mode: "local", extra: true }))); await assert.rejects(readAccessMode(reply({ mode: "unknown" })));
  assert.equal(await readOwnerSession(reply({}, 401)), null);
  const expiresAt = Date.now() + 60_000;
  assert.equal(await readOwnerSession(reply({ authenticated: true, expiresAt, subject: "synthetic" })), expiresAt);
  await assert.rejects(readOwnerSession(reply({ authenticated: true, expiresAt: 1, subject: "synthetic" })));
  assert.equal(await ownerAction("logout", reply({ authenticated: false })), null);
  assert.match(await ownerAction("login", reply({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic" })), /^https:/);
  for (const body of [{ authorizationUrl: "https://evil.invalid/" }, { authorizationUrl: "https://accounts.google.com/wrong" }, { authorizationUrl: 42 }, { authorizationUrl: "http://accounts.google.com/o/oauth2/v2/auth" }]) await assert.rejects(ownerAction("login", reply(body)));
  await assert.rejects(ownerAction("logout", reply({ authenticated: false, extra: true }))); await assert.rejects(ownerAction("logout", reply({}, 503)));
  for (const response of [new Response("html"), Response.json([]), Response.json(null), Response.json({ mode: "a".repeat(17_000) }), new Response("bad", { headers: { "content-type": "application/json" } })]) await assert.rejects(readAccessMode(async () => response));
  notifyOwnerAccessLost(new Response(null, { status: 401 })); notifyOwnerAccessLost(new Response());
});
