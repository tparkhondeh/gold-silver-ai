import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACCEPTANCE_ORIGIN, createPrivateLoginAcceptance } from "../scripts/private-login-acceptance.ts";

// Request-handler acceptance only: no listening socket, credentials, DB, real
// portfolio, or actual Google transport. The separate OIDC tests verify tokens.
const paths = { start: "/auth/google/start", session: "/auth/session", logout: "/auth/logout", record: "/api/private-test-record", expire: "/__test/expire" };
const baseTime = Date.parse("2000-01-03T12:00:00.000Z");
function browser(app, initialCookie = "") {
  const jar = new Map(initialCookie.split(";").map(value => value.trim()).filter(Boolean).map(value => [value.slice(0, value.indexOf("=")), value.slice(value.indexOf("=") + 1)]));
  return {
    get cookie() { return [...jar].map(([key, value]) => `${key}=${value}`).join("; "); },
    async send(path, { method = "GET", headers = {}, body, ...other } = {}) {
      const requestHeaders = new Headers({ "sec-fetch-site": "same-origin", ...(method !== "GET" && method !== "HEAD" ? { origin: ACCEPTANCE_ORIGIN } : {}), ...(jar.size ? { cookie: this.cookie } : {}) });
      for (const [name, value] of Object.entries(headers)) {
        if (value === null) requestHeaders.delete(name); else requestHeaders.set(name, value);
      }
      const response = await app.handle(new Request(new URL(path, ACCEPTANCE_ORIGIN), { method, headers: requestHeaders, ...(body === undefined ? {} : { body }), ...other }));
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";"), index = pair.indexOf("="), name = pair.slice(0, index), value = pair.slice(index + 1);
        if (/;\s*Max-Age=0(?:;|$)/i.test(cookie)) jar.delete(name); else jar.set(name, value);
      }
      return response;
    },
  };
}
const intent = value => ({ "x-asha-intent": value });
async function begin(client) {
  const response = await client.send(paths.start, { method: "POST", headers: intent("owner-login") });
  assert.equal(response.status, 200);
  const { authorizationUrl } = await response.json(), url = new URL(authorizationUrl, ACCEPTANCE_ORIGIN);
  assert.equal(url.origin, ACCEPTANCE_ORIGIN); assert.equal(url.pathname, "/__test/provider");
  assert.match(url.searchParams.get("transaction"), /^[\w-]{43}$/);
  return { authorizationUrl, transaction: url.searchParams.get("transaction"), cookie: client.cookie };
}
async function select(client, start, choice = "owner") {
  const response = await client.send("/__test/provider", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ transaction: start.transaction, choice }).toString() });
  assert.equal(response.status, 303); return response.headers.get("location");
}
async function login(client) {
  const start = await begin(client), callback = await select(client, start), response = await client.send(callback);
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/");
  assert.match(client.cookie, /^asha_acceptance_owner=[\w-]{43}$/);
  return { start, callback, response };
}
async function save(client, note, options = {}) {
  return client.send(paths.record, { method: "PUT", headers: { "content-type": "application/json", ...intent("owner-action") }, body: JSON.stringify({ note }), ...options });
}
function isolated(app, reads, writes) {
  assert.deepEqual(app.inspect(), { recordReads: reads, recordWrites: writes, realProviderRequests: 0, portfolioRepositoryCalls: 0 });
}
function noCache(response) {
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

test("synthetic owner login/save/reload/logout/relogin retains only this instance's in-memory record", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Acceptance must not make network calls"));
  const app = createPrivateLoginAcceptance(), client = browser(app), initial = await client.send("/");
  assert.match(await initial.text(), /id="login"/); isolated(app, 0, 0);
  const result = await login(client); noCache(result.response);
  const ownerCookie = client.cookie;
  const session = await client.send(paths.session); assert.equal(session.status, 200);
  assert.deepEqual(Object.keys(await session.json()).sort(), ["authenticated", "expiresAt", "subject"]);
  assert.match(await (await client.send("/")).text(), /id="private" hidden/);
  assert.deepEqual(await (await save(client, "synthetic exact ۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳.۰۰۰۰۰۰۰۰۰۰۰۱")).json(), { note: "synthetic exact ۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳.۰۰۰۰۰۰۰۰۰۰۰۱" });
  const reloaded = browser(app, ownerCookie);
  assert.deepEqual(await (await reloaded.send(paths.record)).json(), { note: "synthetic exact ۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳.۰۰۰۰۰۰۰۰۰۰۰۱" });
  const logout = await client.send(paths.logout, { method: "POST", headers: intent("owner-logout") });
  assert.equal(logout.status, 200); assert.equal(client.cookie, ""); noCache(logout);
  assert.equal((await reloaded.send(paths.record)).status, 401);
  assert.equal((await save(reloaded, "must not overwrite")).status, 401);
  await login(client); assert.notEqual(client.cookie, ownerCookie);
  assert.equal((await (await client.send(paths.record)).json()).note, "synthetic exact ۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳.۰۰۰۰۰۰۰۰۰۰۰۱");
  isolated(app, 2, 1);
});

test("anonymous users and spoofed identity headers cannot read or write or obtain the protected page", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app);
  for (const headers of [{}, { "oai-authenticated-user-id": "synthetic-owner-v1", "oai-authenticated-user-email": "owner@example.invalid", "x-owner-sub": "synthetic-owner-v1", authorization: "Bearer synthetic-owner-v1" }]) {
    const response = await client.send(paths.record, { headers }); assert.equal(response.status, 401); noCache(response);
    assert.ok([401, 403].includes((await save(client, "not authorized", { headers: { ...headers, "content-type": "application/json", ...intent("owner-action") } })).status));
    assert.doesNotMatch(await (await client.send("/", { headers })).text(), /id="private"|id="note"/);
  }
  isolated(app, 0, 0);
});

test("non-owner and cancelled provider choices never establish a session or disclose a record", async () => {
  for (const choice of ["non-owner", "cancel"]) {
    const app = createPrivateLoginAcceptance(), client = browser(app), start = await begin(client), callback = await select(client, start, choice);
    const denied = await client.send(callback); assert.equal(denied.status, 401); noCache(denied);
    const html = await denied.text(); assert.match(html, /دسترسی داده نشد/); assert.doesNotMatch(html, /id="private"|id="note"/);
    assert.equal(client.cookie, ""); assert.equal((await client.send(paths.session)).status, 401); assert.equal((await client.send(paths.record)).status, 401);
    isolated(app, 0, 0);
  }
});

test("scripted fake-provider JSON response preserves owner/non-owner/cancel outcomes and consumes its transaction once", async () => {
  for (const choice of ["owner", "non-owner", "cancel"]) {
    const app = createPrivateLoginAcceptance(), client = browser(app), start = await begin(client);
    const options = { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...intent("test-provider") }, body: new URLSearchParams({ transaction: start.transaction, choice }).toString() };
    for (const changed of [{ origin: "https://attacker.invalid" }, { "sec-fetch-site": "cross-site" }]) {
      assert.equal((await client.send("/__test/provider", { ...options, headers: { ...options.headers, ...changed } })).status, 403);
    }
    const response = await client.send("/__test/provider", options); assert.equal(response.status, 200); noCache(response);
    assert.equal(response.headers.get("location"), null); assert.deepEqual(response.headers.getSetCookie(), []);
    const data = await response.json(); assert.deepEqual(Object.keys(data), ["callbackUrl"]);
    assert.match(data.callbackUrl, /^\/auth\/google\/callback\?/);
    const callback = new URL(data.callbackUrl, ACCEPTANCE_ORIGIN);
    assert.equal(callback.origin, ACCEPTANCE_ORIGIN); assert.equal(callback.pathname, "/auth/google/callback");
    assert.match(callback.searchParams.get("state"), /^[\w-]{43}$/);
    if (choice === "cancel") { assert.equal(callback.searchParams.get("error"), "access_denied"); assert.equal(callback.searchParams.has("code"), false); }
    else assert.match(callback.searchParams.get("code"), /^[\w-]{43}$/);
    assert.equal((await client.send("/__test/provider", options)).status, 403);
    assert.equal((await browser(app).send(paths.record)).status, 401);
    assert.equal((await client.send(callback)).status, choice === "owner" ? 303 : 401);
    assert.equal((await client.send(paths.session)).status, choice === "owner" ? 200 : 401);
    isolated(app, 0, 0);
  }
});

test("actual provider-page submit script is single-flight and rejects foreign or wrong-path response navigation", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app), start = await begin(client), response = await client.send(start.authorizationUrl), html = await response.text();
  const script = html.match(/<script nonce="[\w-]+">([\s\S]*?)<\/script>/)[1];
  assert.match(html, /<form method="post" action="\/__test\/provider">/);
  for (const callbackUrl of ["https://attacker.invalid/auth/google/callback", "//attacker.invalid/auth/google/callback", "/api/portfolio", null, "/auth/google/callback?state=synthetic&code=synthetic"]) {
    let submit, finish, fetches = 0, prevented = 0; const assigned = [], buttons = [{ disabled: false }, { disabled: false }], status = { textContent: "" };
    const form = { elements: { transaction: { value: start.transaction } }, querySelectorAll: () => buttons, addEventListener(name, fn) { assert.equal(name, "submit"); submit = fn; } };
    const document = { querySelector(selector) { return selector === "form" ? form : status; } };
    const fetch = async (url, options) => {
      fetches++; assert.equal(url, "/__test/provider"); assert.equal(options.method, "POST"); assert.equal(options.credentials, "same-origin");
      assert.equal(options.headers["X-ASHA-Intent"], "test-provider"); assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
      assert.deepEqual([...new URLSearchParams(options.body)], [["transaction", start.transaction], ["choice", "owner"]]);
      return new Promise(resolve => { finish = () => resolve(Response.json({ callbackUrl })); });
    };
    new Function("document", "fetch", "location", "URLSearchParams", "URL", script)(document, fetch, { origin: ACCEPTANCE_ORIGIN, assign: value => assigned.push(value) }, URLSearchParams, URL);
    const event = { preventDefault() { prevented++; }, submitter: { value: "owner" } };
    const first = submit(event); await submit(event); assert.equal(fetches, 1); assert.equal(prevented, 2); assert.ok(buttons.every(button => button.disabled));
    finish(); await first;
    if (typeof callbackUrl === "string" && callbackUrl.startsWith("/auth/google/callback?")) assert.deepEqual(assigned, [new URL(callbackUrl, ACCEPTANCE_ORIGIN).href]);
    else { assert.deepEqual(assigned, []); assert.match(status.textContent, /ادامهٔ ورود تأیید نشد/); assert.ok(buttons.every(button => !button.disabled)); }
  }
  isolated(app, 0, 0);
});

test("owner POST intents require exact same-origin headers, no request body and allowed methods", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app);
  for (const path of [paths.start, paths.logout]) {
    const expected = path === paths.start ? "owner-login" : "owner-logout";
    for (const options of [{}, { method: "POST" }, { method: "POST", headers: intent("wrong") },
      { method: "POST", headers: { ...intent(expected), origin: null } }, { method: "POST", headers: { ...intent(expected), origin: "https://attacker.invalid" } },
      { method: "POST", headers: { ...intent(expected), "sec-fetch-site": "cross-site" } }, { method: "POST", headers: { ...intent(expected), "sec-fetch-site": null } },
      { method: "POST", headers: intent(expected), body: "{}" }]) assert.equal((await client.send(path, options)).status, 403);
  }
  isolated(app, 0, 0);
});

test("CSRF or malformed save cannot modify a valid owner's record or revoke a still-valid session", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app); await login(client); await save(client, "retained");
  for (const changed of [{ origin: null }, { origin: "https://attacker.invalid" }, { "sec-fetch-site": null }, { "sec-fetch-site": "same-site" }, { "x-asha-intent": null }, { "x-asha-intent": "owner-login" }, { "content-type": "text/plain" }]) {
    const response = await save(client, "replacement", { headers: { "content-type": "application/json", ...intent("owner-action"), ...changed } });
    assert.equal(response.status, 403); noCache(response);
  }
  assert.equal((await client.send(paths.logout)).status, 403); assert.equal((await client.send(paths.session)).status, 200);
  assert.deepEqual(await (await client.send(paths.record)).json(), { note: "retained" }); isolated(app, 1, 1);
});

test("wrong origins, proxy/Host overrides, queries, fragments and oversized request URLs fail before record access", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app); await login(client);
  const cookie = client.cookie;
  const requests = [new Request(`https://attacker.invalid${paths.record}`, { headers: { cookie } }),
    new Request(`${ACCEPTANCE_ORIGIN}${paths.record}#fragment`, { headers: { cookie } }), new Request(`${ACCEPTANCE_ORIGIN}${paths.record}?ignored=1`, { headers: { cookie } }),
    new Request(`${ACCEPTANCE_ORIGIN}/${"x".repeat(8192)}`, { headers: { cookie } })];
  for (const [name, value] of Object.entries({ host: "localhost:4175", forwarded: "for=127.0.0.1;host=127.0.0.1:4175", "x-forwarded-host": "127.0.0.1:4175", "x-forwarded-proto": "http", "x-forwarded-for": "127.0.0.1" })) requests.push(new Request(`${ACCEPTANCE_ORIGIN}${paths.record}`, { headers: { cookie, [name]: value } }));
  for (const request of requests) { const response = await app.handle(request); assert.equal(response.status, 403); noCache(response); }
  isolated(app, 0, 0);
});

test("cookies are opaque, HttpOnly and scoped to isolated harness; tampered, duplicate or oversized cookies fail closed", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app), result = await login(client);
  const set = result.response.headers.getSetCookie().find(value => value.startsWith("asha_acceptance_owner=") && !value.includes("Max-Age=0"));
  for (const value of ["Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=300"]) assert.ok(set.includes(value));
  assert.doesNotMatch(set, /Domain=|synthetic-owner|email|credential|__Host-/);
  const cookies = ["asha_acceptance_owner=bad", `asha_acceptance_owner=${"a".repeat(43)}`, `${client.cookie}; ${client.cookie}`, "unrelated=" + "a".repeat(4096)];
  for (const cookie of cookies) assert.equal((await app.handle(new Request(`${ACCEPTANCE_ORIGIN}${paths.record}`, { headers: { cookie } }))).status, 401);
  isolated(app, 0, 0);
});

test("session expires at exact absolute boundary, not extended by reads, and synthetic expiry disables every existing tab", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: baseTime });
  const app = createPrivateLoginAcceptance(), client = browser(app); await login(client); const tab = browser(app, client.cookie);
  const first = await (await client.send(paths.session)).json(); assert.equal(first.expiresAt, baseTime + 300_000);
  t.mock.timers.tick(299_999); const before = await client.send(paths.session); assert.equal(before.status, 200); assert.equal((await before.json()).expiresAt, first.expiresAt);
  assert.deepEqual(before.headers.getSetCookie(), []);
  t.mock.timers.tick(1); assert.equal((await client.send(paths.record)).status, 401); assert.equal((await tab.send(paths.session)).status, 401);
  await login(client); const liveTab = browser(app, client.cookie);
  assert.equal((await client.send(paths.expire, { method: "POST", headers: intent("test-expire") })).status, 200);
  assert.equal((await liveTab.send(paths.record)).status, 401); assert.equal((await save(client, "expired")).status, 401); isolated(app, 0, 0);
});

test("expiry control itself requires an active owner and strict same-origin bodyless intent", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app);
  assert.equal((await client.send(paths.expire, { method: "POST", headers: intent("test-expire") })).status, 401);
  await login(client);
  for (const options of [{}, { method: "POST" }, { method: "POST", headers: { ...intent("test-expire"), origin: "https://attacker.invalid" } }, { method: "POST", headers: intent("test-expire"), body: "{}" }]) assert.equal((await client.send(paths.expire, options)).status, 403);
  assert.equal((await client.send(paths.session)).status, 200); isolated(app, 0, 0);
});

test("unstarted, expired, malformed and repeated fake provider transactions cannot mint sessions", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: baseTime });
  const app = createPrivateLoginAcceptance(), client = browser(app), unknown = "a".repeat(43);
  for (const path of ["/__test/provider", `/__test/provider?transaction=${unknown}`, `/__test/provider?transaction=${unknown}&transaction=${unknown}`]) assert.equal((await client.send(path)).status, 403);
  const start = await begin(client); assert.equal((await client.send(start.authorizationUrl)).status, 200);
  for (const body of [`transaction=${start.transaction}&choice=owner&choice=owner`, `transaction=${start.transaction}&choice=admin`, `transaction=${start.transaction}`, `transaction=${start.transaction}&choice=owner&extra=ignored`]) assert.equal((await client.send("/__test/provider", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body })).status, 403);
  t.mock.timers.tick(300_000); assert.equal((await client.send(start.authorizationUrl)).status, 403);
  const pending = await begin(client), callback = await select(client, pending);
  assert.equal((await client.send("/__test/provider", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ transaction: pending.transaction, choice: "owner" }).toString() })).status, 403);
  const result = await client.send(callback); assert.equal(result.status, 303); isolated(app, 0, 0);
});

test("callback browser binding, state integrity and duplicate parameters prevent login", async () => {
  for (const alter of [url => url.searchParams.delete("state"), url => url.searchParams.set("state", "a".repeat(43)), url => url.searchParams.append("state", "a".repeat(43)), url => url.searchParams.append("code", "extra"), url => url.searchParams.delete("code"), url => url.searchParams.set("error", "access_denied")]) {
    const app = createPrivateLoginAcceptance(), client = browser(app), start = await begin(client), callback = new URL(await select(client, start), ACCEPTANCE_ORIGIN); alter(callback);
    assert.equal((await client.send(callback)).status, 401); assert.equal((await client.send(paths.session)).status, 401); isolated(app, 0, 0);
  }
  const app = createPrivateLoginAcceptance(), client = browser(app), start = await begin(client), callback = await select(client, start);
  assert.equal((await browser(app).send(callback)).status, 401); isolated(app, 0, 0);
});

test("callback replay and concurrent callbacks create at most one session; second login invalidates old session", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app), start = await begin(client), callback = await select(client, start);
  const responses = await Promise.all([app.handle(new Request(new URL(callback, ACCEPTANCE_ORIGIN), { headers: { cookie: start.cookie } })), app.handle(new Request(new URL(callback, ACCEPTANCE_ORIGIN), { headers: { cookie: start.cookie } }))]);
  assert.ok(responses.every(response => [303, 401].includes(response.status))); assert.ok(responses.filter(response => response.status === 303).length <= 1);
  assert.equal((await browser(app, start.cookie).send(callback)).status, 401);
  await login(client); const oldCookie = client.cookie; await begin(client);
  assert.equal((await browser(app, oldCookie).send(paths.record)).status, 401); isolated(app, 0, 0);
});

test("new factory instance revokes previous cookies and never shares stored synthetic records", async () => {
  const first = createPrivateLoginAcceptance(), client = browser(first); await login(client); await save(client, "instance one");
  const second = createPrivateLoginAcceptance(), restarted = browser(second, client.cookie);
  assert.equal((await restarted.send(paths.record)).status, 401); await login(restarted);
  assert.deepEqual(await (await restarted.send(paths.record)).json(), { note: "" }); isolated(first, 0, 1); isolated(second, 1, 0);
});

test("malformed JSON, oversized bytes, invalid UTF-8, unexpected keys, controls and overlong notes never partially write", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app); await login(client); await save(client, "before invalid input");
  const validCookie = client.cookie;
  const bodies = ["{", "null", "[]", "true", JSON.stringify({ note: 5 }), JSON.stringify({ note: "new", extra: "sensitive-canary" }), JSON.stringify({ note: "\u0000" }), JSON.stringify({ note: "a".repeat(121) }), " ".repeat(2049), new Uint8Array([0xc3, 0x28])];
  for (const body of bodies) {
    const response = await client.send(paths.record, { method: "PUT", headers: { "content-type": "application/json", ...intent("owner-action") }, body });
    assert.equal(response.status, 400); noCache(response); assert.doesNotMatch(await response.text(), /sensitive-canary|SyntaxError|stack|SELECT|postgres/i);
    assert.equal(client.cookie, validCookie); assert.deepEqual(response.headers.getSetCookie(), []);
    assert.equal((await client.send(paths.session)).status, 200);
  }
  assert.deepEqual(await (await client.send(paths.record)).json(), { note: "before invalid input" }); isolated(app, 1, 1);
});

test("stalled body stops at its deadline without awaiting cancellation or revoking valid authentication", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: baseTime });
  const app = createPrivateLoginAcceptance(), client = browser(app); await login(client);
  const cookie = client.cookie; let cancellations = 0, settled = false;
  const body = new ReadableStream({ cancel() { cancellations++; return new Promise(() => {}); } });
  const pending = client.send(paths.record, { method: "PUT", headers: { "content-type": "application/json", ...intent("owner-action") }, body, duplex: "half" });
  pending.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(999); await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  t.mock.timers.tick(1); const response = await pending;
  assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "acceptance_request_denied" });
  assert.equal(cancellations, 1); assert.equal(client.cookie, cookie); assert.equal((await client.send(paths.session)).status, 200);
  isolated(app, 0, 0);
});

test("endless zero-byte body chunks are bounded and do not consume an uncompleted fake-provider transaction", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app), start = await begin(client);
  const cookie = client.cookie; let pulls = 0, cancellations = 0;
  const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array()); }, cancel() { cancellations++; return new Promise(() => {}); } });
  const response = await client.send("/__test/provider", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, duplex: "half" });
  assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "acceptance_request_denied" });
  assert.ok(pulls <= 35); assert.equal(cancellations, 1); assert.equal(client.cookie, cookie);
  assert.equal((await client.send(await select(client, start))).status, 303);
  assert.equal((await client.send(paths.session)).status, 200); isolated(app, 0, 0);
});

test("logout or expiry during an unfinished save body is rechecked before any mutation", async () => {
  for (const expire of [false, true]) {
    const app = createPrivateLoginAcceptance(), client = browser(app); await login(client);
    const cookie = client.cookie; let controller;
    const body = new ReadableStream({ start(value) { controller = value; } });
    const pending = app.handle(new Request(`${ACCEPTANCE_ORIGIN}${paths.record}`, { method: "PUT", headers: { cookie, origin: ACCEPTANCE_ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", ...intent("owner-action") }, body, duplex: "half" }));
    const response = await client.send(expire ? paths.expire : paths.logout, { method: "POST", headers: intent(expire ? "test-expire" : "owner-logout") }); assert.equal(response.status, 200);
    controller.enqueue(new TextEncoder().encode(JSON.stringify({ note: "must never commit" }))); controller.close();
    assert.equal((await pending).status, 401); isolated(app, 0, 0);
  }
});

test("HTML-like note is exact data, never reflected into HTML or executed; CSP has a per-response script nonce", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app); await login(client);
  const payload = "</script><img src=x onerror=alert(1)>&\"'";
  assert.deepEqual(await (await save(client, payload)).json(), { note: payload }); assert.deepEqual(await (await client.send(paths.record)).json(), { note: payload });
  const first = await client.send("/"), second = await client.send("/"), html = await first.text();
  assert.doesNotMatch(html, /<img src=x|onerror=alert/); assert.match(html, /note\.value=result\.note/); assert.doesNotMatch(html, /innerHTML|document\.write|eval\(/);
  const nonce = html.match(/<script nonce="([\w-]+)">/)[1]; assert.ok(first.headers.get("content-security-policy").includes(`script-src 'nonce-${nonce}'`));
  assert.notEqual(first.headers.get("content-security-policy"), second.headers.get("content-security-policy"));
  assert.match(first.headers.get("content-security-policy"), /default-src 'none'.*connect-src 'self'.*form-action 'self'.*frame-ancestors 'none'/);
  assert.equal(first.headers.get("x-frame-options"), "DENY"); noCache(first); isolated(app, 1, 1);
});

test("real app, portfolio export, market, operator and health paths are absent even for authenticated owner", async () => {
  const app = createPrivateLoginAcceptance(), client = browser(app); await login(client);
  for (const path of ["/api/portfolio", "/api/portfolio/export", "/api/managed-market", "/api/market", "/api/market-test", "/api/health", "/api/operator/csv", "/api/operator/navasan-history", "/.env", "/auth/google/callback/", "/__test/provider/"]) {
    const response = await client.send(path); assert.equal(response.status, 404); noCache(response);
    assert.deepEqual(await response.json(), { error: "acceptance_request_denied" }); assert.equal(response.headers.get("content-disposition"), null);
  }
  isolated(app, 0, 0);
});

test("test-only source boundary is explicit: no dotenv/runtime/provider/repository imports or product activation", () => {
  const source = readFileSync(new URL("../scripts/private-login-acceptance.ts", import.meta.url), "utf8");
  const pages = readFileSync(new URL("../scripts/private-login-pages.ts", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|dotenv|DATABASE_URL|credentials\.json|postgres-runtime|google-identity-adapter|createPortfolio|fetch\s*\(|from ["'](?:pg|node:fs)/);
  assert.match(source, /server\.listen\(4175, "127\.0\.0\.1"/); assert.match(source, /const issuer = "https:\/\/identity\.invalid"/);
  assert.doesNotMatch(entry, /private-login|owner-identity|chatgpt-auth/);
  assert.match(pages, /بدون اتصال به گوگل یا اطلاعات سبد شخصی/); assert.doesNotMatch(pages, /localStorage|sessionStorage|api\/portfolio|api\/managed-market/);
  assert.match(pages, /function hide\(message\).*controller\.abort\(\).*box\.hidden=true;note\.value=''/);
  assert.match(pages, /response\.status===401/); assert.match(pages, /current!==generation/); assert.match(pages, /pageshow/);
});
