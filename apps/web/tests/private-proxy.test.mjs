import test from "node:test";
import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { readFile } from "node:fs/promises";
import { createPrivateHttpServer } from "../auth/private-http.ts";
import { createOwnerSessionBoundary } from "../auth/owner-session.ts";
import { createPrivateApplication } from "../auth/private-application.ts";

const origin = "https://goldsilver.wealthos.ir", publicHost = "goldsilver.wealthos.ir";
const transportHost = "127.0.0.1:3012", contract = { proxy: "goldsilver-loopback-v1" };
const forwarded = (chain = publicHost) => [`Host: ${transportHost}`, `X-Forwarded-Host: ${chain}`, "X-Forwarded-Proto: https"];

async function fixture(t, options = contract, handler, remoteAddress) {
  const captured = [];
  const server = createPrivateHttpServer(origin, async request => {
    captured.push(request);
    return handler ? handler(request) : new Response(request.body ? await request.text() : "synthetic bridge accepted");
  }, options === "direct" ? undefined : options);
  if (remoteAddress) server.prependListener("request", incoming => {
    // Synthetic peer metadata only; no remote connection or private service use.
    Object.defineProperty(incoming.socket, "remoteAddress", { value: remoteAddress, configurable: true });
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise(done => { server.closeAllConnections(); server.close(done); }));
  const call = (headers, method = "GET", path = "/", body = "") => new Promise((resolve, reject) => {
    let output = "";
    const socket = createConnection({ host: "127.0.0.1", port: server.address().port });
    socket.setTimeout(3000, () => socket.destroy(Error("Synthetic bridge timeout")));
    socket.on("error", reject); socket.on("data", value => { output += value.toString(); });
    socket.on("end", () => resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(output)?.[1]), output }));
    socket.on("connect", () => socket.end(`${method} ${path} HTTP/1.1\r\n${headers.join("\r\n")}\r\nConnection: close\r\n\r\n${body}`));
  });
  return { captured, call };
}

test("explicit production contract accepts observed one/two-host loopback chain and canonicalizes app host", async t => {
  const f = await fixture(t);
  for (const chain of [publicHost, `${publicHost}, ${publicHost}`, `${publicHost},${publicHost}`]) {
    assert.equal((await f.call(forwarded(chain), "GET", "/api/health")).status, 200);
    const request = f.captured.at(-1);
    assert.equal(request.url, `${origin}/api/health`); assert.equal(request.headers.get("host"), publicHost);
    assert.equal(request.headers.has("x-forwarded-host"), false); assert.equal(request.headers.has("x-forwarded-proto"), false);
  }
});

test("proxy selection rejects duplicate Host/proto, bad first/last hosts and longer or noncanonical chains", async t => {
  const f = await fixture(t);
  const badChains = ["evil.invalid", `evil.invalid, ${publicHost}`, `${publicHost}, evil.invalid`, `${publicHost}, ${publicHost}, ${publicHost}`,
    `${publicHost},`, `,${publicHost}`, "", `${publicHost}:443`, `user@${publicHost}`, `${publicHost}.`, publicHost.toUpperCase(), `https://${publicHost}`,
    `${publicHost};token=x`, `${publicHost}/`, `${publicHost},\t${publicHost}`, `${publicHost},   ${publicHost}`, "a".repeat(1024)];
  for (const chain of badChains) assert.equal((await f.call(forwarded(chain))).status, 400, chain);
  for (const headers of [
    [...forwarded(), `Host: ${transportHost}`], [...forwarded(), "x-forwarded-proto: https"],
    [`Host: ${transportHost}`, "X-Forwarded-Proto: https"], [`Host: ${transportHost}`, `X-Forwarded-Host: ${publicHost}`],
    ...["http", "HTTPS", "https,http", "https, https", "https;token=x", ""].map(proto => [`Host: ${transportHost}`, `X-Forwarded-Host: ${publicHost}`, `X-Forwarded-Proto: ${proto}`]),
    ...["localhost:3012", "127.0.0.1", "127.0.0.1:3013", "[::1]:3012", "evil.invalid"].map(host => [`Host: ${host}`, `X-Forwarded-Host: ${publicHost}`, "X-Forwarded-Proto: https"]),
  ]) assert.equal((await f.call(headers)).status, 400);
  assert.equal(f.captured.length, 0);
});

test("separate canonical forwarded-host fields are equivalent to joined fields with aggregate maximum two", async t => {
  const f = await fixture(t);
  const separate = [...forwarded(), `x-forwarded-host: ${publicHost}`];
  assert.equal((await f.call(separate, "GET", "/api/health")).status, 200);
  assert.equal(f.captured[0].url, `${origin}/api/health`); assert.equal(f.captured[0].headers.get("host"), publicHost);
  assert.equal(f.captured[0].headers.has("x-forwarded-host"), false);
  for (const entries of [
    [publicHost, publicHost, publicHost], [`${publicHost}, ${publicHost}`, publicHost], [publicHost, `${publicHost}, ${publicHost}`],
    [`${publicHost}, ${publicHost}`, `${publicHost}, ${publicHost}`], ["evil.invalid", publicHost], [publicHost, "evil.invalid"],
    ["", publicHost], [publicHost, ""], [" ", publicHost], [publicHost, "\t"], [`${publicHost},`, publicHost],
    [publicHost, `gold\tsilver.wealthos.ir`], [publicHost, `${publicHost}:443`], [publicHost, `user@${publicHost}`],
  ]) {
    const headers = [`Host: ${transportHost}`, ...entries.map(value => `X-Forwarded-Host: ${value}`), "X-Forwarded-Proto: https"];
    assert.equal((await f.call(headers)).status, 400, JSON.stringify(entries));
  }
  assert.equal((await f.call([...separate, "X-Forwarded-Proto: https"])).status, 400);
  assert.equal((await f.call([...separate, `Host: ${transportHost}`])).status, 400);
  assert.equal(f.captured.length, 1);
});

test("socket must be loopback; no forwarding header or identity token can override a remote peer", async t => {
  for (const peer of ["192.0.2.10", "::ffff:192.0.2.10", "", "127.0.0.2"]) {
    const f = await fixture(t, contract, undefined, peer || "unknown");
    assert.equal((await f.call([...forwarded(), "X-Forwarded-For: 127.0.0.1", "X-OAI-Subject: synthetic-owner", "Authorization: Bearer synthetic"])).status, 400);
    assert.equal(f.captured.length, 0);
  }
});

test("default direct-host behavior is unchanged and proxy opt-in cannot mutate into broader trust", async t => {
  const direct = await fixture(t, "direct");
  assert.equal((await direct.call(forwarded())).status, 400);
  assert.equal((await direct.call([`Host: ${publicHost}`, "X-Forwarded-Host: evil.invalid", "X-Forwarded-Proto: http"])).status, 200);
  assert.equal(direct.captured[0].headers.has("x-forwarded-host"), false);
  const opted = await fixture(t);
  assert.equal((await opted.call([`Host: ${publicHost}`, "X-Forwarded-Host: evil.invalid"])).status, 200);
  const mutable = { ...contract }, fixed = await fixture(t, mutable);
  mutable.proxy = "arbitrary-trust";
  assert.equal((await fixed.call(forwarded())).status, 200);
  assert.equal((await fixed.call(["Host: evil.invalid", `X-Forwarded-Host: ${publicHost}`, "X-Forwarded-Proto: https"])).status, 400);
  for (const options of [true, null, {}, { proxy: true }, { proxy: "all" }, { ...contract, host: "evil.invalid" }]) assert.throws(() => createPrivateHttpServer(origin, async () => new Response(), options));
  assert.throws(() => createPrivateHttpServer("https://other.invalid", async () => new Response(), contract));
});

test("forwarding and identity headers are stripped while exact Origin and browser request metadata remain unchanged", async t => {
  const f = await fixture(t);
  const headers = [...forwarded(`${publicHost}, ${publicHost}`), "Forwarded: for=evil;host=evil.invalid;proto=http", "X-Forwarded-For: 127.0.0.1", "X-Forwarded-Port: 443", "X-Real-IP: 127.0.0.1",
    "X-OAI-Subject: synthetic-owner", "X-Owner-Subject: synthetic-owner", "Authorization: Bearer synthetic", "Cookie: synthetic=1", `Origin: ${origin}`,
    "Sec-Fetch-Site: same-origin", "X-ASHA-Intent: owner-action", "X-ASHA-Portfolio-Request: save", "Content-Type: application/json", "Content-Length: 2"];
  assert.equal((await f.call(headers, "PUT", "/api/portfolio", "{}")).status, 200);
  const request = f.captured[0];
  for (const name of ["forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for", "x-forwarded-port", "x-real-ip", "x-oai-subject", "x-owner-subject", "authorization"]) assert.equal(request.headers.has(name), false, name);
  assert.equal(request.headers.get("origin"), origin); assert.equal(request.headers.get("sec-fetch-site"), "same-origin");
  assert.equal(request.headers.get("x-asha-intent"), "owner-action"); assert.equal(request.headers.get("cookie"), "synthetic=1");
  assert.equal(request.headers.get("x-asha-portfolio-request"), "save");
});

test("accepted proxy envelope neither creates an owner session nor bypasses exact Origin CSRF", async t => {
  let portfolioCalls = 0;
  const gate = createOwnerSessionBoundary({ origin, issuer: origin, ownerSubject: "synthetic-owner", store: { async getSession() { return null; }, async revokeBrowser() {} } });
  const app = createPrivateApplication({ origin, release: "a".repeat(40), gate, portfolio: async () => { portfolioCalls++; return new Response("private"); }, publicUi: async () => new Response("Synthetic public shell") });
  const f = await fixture(t, contract, app);
  for (const envelope of [forwarded(), [...forwarded(), `X-Forwarded-Host: ${publicHost}`]]) {
    assert.equal((await f.call([...envelope, "X-OAI-Subject: synthetic-owner"], "GET", "/api/portfolio")).status, 401);
    assert.equal((await f.call([...envelope, "Origin: https://evil.invalid", "Sec-Fetch-Site: same-origin", "X-ASHA-Intent: owner-action", "Content-Length: 0"], "PUT", "/api/portfolio")).status, 403);
  }
  assert.equal(portfolioCalls, 0);
});

test("only reviewed production startup explicitly enables the fixed proxy contract", async () => {
  const source = await readFile(new URL("../scripts/start-private-server.mjs", import.meta.url), "utf8");
  assert.match(source, /createPrivateHttpServer\(configuration\.origin, application, \{ proxy: "goldsilver-loopback-v1" \}\)/);
  assert.match(source, /gateway\.listen\(3012, "127\.0\.0\.1"/);
});
