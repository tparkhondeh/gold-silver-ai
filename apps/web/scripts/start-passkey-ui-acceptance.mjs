// Controlled UI smoke only. No real login, registration, environment/configuration
// loading, database, credentials, provider calls, or production router imports.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const PASSKEY_UI_SMOKE_ORIGIN = "http://127.0.0.1:4177";
const host = "127.0.0.1:4177";
const ceremonies = new Set(["authentication/options", "authentication/verify", "registration/options", "registration/verify"].map(path => `/auth/passkey/v1/${path}`));
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY",
  "permissions-policy": "publickey-credentials-get=(), publickey-credentials-create=()",
  "content-security-policy": "connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'",
  "x-asha-controlled-smoke": "not-real-login" };
const json = (body, status) => Response.json(body, { status, headers });

/** Fixed-origin pure route for checks. The injected UI reader receives GET only,
 * canonical public paths and no browser cookies, grant, body or identity headers. */
export async function passkeyUiSmokeResponse(request, publicUi) {
  const url = new URL(request.url), path = url.pathname;
  if (url.origin !== PASSKEY_UI_SMOKE_ORIGIN || url.search || url.hash || url.username || url.password || request.url.length > 8192
    || (request.headers.has("host") && request.headers.get("host") !== host)) return json({ error: "controlled_request_denied" }, 400);
  if (path === "/api/access-mode" && request.method === "GET") return json({ mode: "private", authMethod: "passkey" }, 200);
  if (path === "/auth/session" || ["/api/portfolio", "/api/portfolio/export", "/api/managed-market"].includes(path)) return json({ error: "controlled_anonymous_only" }, 401);
  if (ceremonies.has(path) && request.method === "POST") return json({ error: "controlled_ceremony_disabled" }, 503);
  if (request.method === "GET" && request.body === null && (path === "/" || path === "/templates/purchase-lots-v1.xlsx"
    || /^\/(?:assets|_next\/static)\/[A-Za-z0-9_./-]+\.(?:js|css|woff2?|png|svg|ico)$/.test(path))) {
    try {
      const response = await publicUi(new Request(`${PASSKEY_UI_SMOKE_ORIGIN}${path}`, { headers: { accept: request.headers.get("accept") ?? "*/*" } }));
      if (response.status !== 200 || response.redirected) throw Error("Built UI unavailable");
      return new Response(response.body, { status: 200, headers: { ...headers, "content-type": response.headers.get("content-type") ?? "application/octet-stream" } });
    } catch { return json({ error: "controlled_ui_unavailable" }, 503); }
  }
  return json({ error: "controlled_route_unavailable" }, 404);
}

async function checkRoutes() {
  const { default: assert } = await import("node:assert/strict"); let reads = 0;
  const publicUi = async request => { reads++; assert.equal(request.method, "GET"); assert.equal(request.headers.get("cookie"), null); assert.equal(request.headers.get("x-owner-sub"), null); return new Response("controlled public UI", { headers: { "content-type": "text/html", "set-cookie": "must-not-forward", "content-encoding": "gzip" } }); };
  const request = (path, method = "GET", extra = {}) => passkeyUiSmokeResponse(new Request(new URL(path, PASSKEY_UI_SMOKE_ORIGIN), { method, headers: { cookie: "synthetic", "x-owner-sub": "synthetic", ...extra } }), publicUi);
  assert.deepEqual(await (await request("/api/access-mode")).json(), { mode: "private", authMethod: "passkey" });
  for (const path of ["/auth/session", "/api/portfolio", "/api/portfolio/export", "/api/managed-market"]) assert.equal((await request(path)).status, 401);
  for (const path of ceremonies) { assert.equal((await request(path, "POST")).status, 503); assert.equal((await request(path)).status, 404); }
  for (const path of ["/auth/google/start", "/auth/passkey/bootstrap", "/auth/logout", "/api/operator/csv", "/api/health", "/.env", "/api/access-mode?local=true", "/assets/config.json"]) assert.ok([400, 404].includes((await request(path)).status));
  assert.equal((await request("https://outside.invalid/")).status, 400); assert.equal((await request("/", "GET", { host: "localhost:4177" })).status, 400);
  assert.equal(reads, 0);
  for (const path of ["/", "/assets/synthetic.js", "/templates/purchase-lots-v1.xlsx"]) { const response = await request(path); assert.equal(response.status, 200); assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("content-encoding"), null); assert.match(response.headers.get("permissions-policy"), /publickey-credentials-create=\(\)/); }
  assert.equal((await request("/", "POST")).status, 404); assert.equal(reads, 3);
  process.stdout.write("Controlled passkey UI route checks passed; no listener, database, credentials or real login.\n");
}

async function isolatedServer() {
  if (typeof process.send !== "function" || !process.connected) throw Error("Isolated child required");
  const { startProdServer } = await import("vinext/server/prod-server");
  let ui, gateway;
  const stop = async () => {
    gateway?.closeAllConnections(); ui?.server.closeAllConnections();
    await Promise.all([gateway?.listening && new Promise(done => gateway.close(done)), ui && new Promise(done => ui.server.close(done))]);
    if (process.connected) process.disconnect();
  };
  try {
    ui = await startProdServer({ host: "127.0.0.1", port: 0, outDir: fileURLToPath(new URL("../dist-private", import.meta.url)), noCompression: true, silent: true });
    const publicUi = request => fetch(`http://127.0.0.1:${ui.port}${new URL(request.url).pathname}`, { headers: { "accept-encoding": "identity" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
    gateway = createServer({ maxHeaderSize: 8192 }, (incoming, outgoing) => {
      outgoing.setHeader("connection", "close");
      const fail = status => { outgoing.writeHead(status, { ...headers, "content-type": "text/plain; charset=utf-8" }); outgoing.end("Controlled UI request unavailable"); };
      const hostCount = incoming.rawHeaders.filter((_, index) => index % 2 === 0 && incoming.rawHeaders[index].toLowerCase() === "host").length;
      if (incoming.socket.remoteAddress !== "127.0.0.1" || hostCount !== 1 || incoming.headers.host !== host || !incoming.url?.startsWith("/") || incoming.url.startsWith("//")
        || incoming.url.length > 4096 || [...incoming.url].some(char => char === "\\" || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || !["GET", "POST", "PUT", "DELETE"].includes(incoming.method ?? "")) { fail(400); return; }
      const size = incoming.headers["content-length"];
      if (incoming.headers["transfer-encoding"] !== undefined || (size !== undefined && (!/^\d+$/.test(size) || Number(size) > 65_536 || (incoming.method === "GET" && Number(size) > 0)))) { fail(400); return; }
      // Never read/forward a body, grant, cookie or identity hint: ceremonies are
      // intentionally rejected before any authenticator or private route can run.
      void passkeyUiSmokeResponse(new Request(`${PASSKEY_UI_SMOKE_ORIGIN}${incoming.url}`, { method: incoming.method }), publicUi).then(async response => {
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      }).catch(() => { if (!outgoing.headersSent) fail(503); else outgoing.destroy(); });
    });
    gateway.headersTimeout = 5000; gateway.requestTimeout = 5000; gateway.keepAliveTimeout = 1000; gateway.maxRequestsPerSocket = 1;
    gateway.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
    await new Promise((done, reject) => { gateway.once("error", reject); gateway.listen(4177, "127.0.0.1", done); });
    process.stdout.write("Controlled passkey UI smoke: http://127.0.0.1:4177/ — NOT real login. All ceremonies disabled; no portfolio or provider access.\n");
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(); });
    process.once("disconnect", () => { void stop(); });
  } catch { await stop(); throw Error("Controlled UI start failed"); }
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 1 && arguments_[0] === "--check") return checkRoutes();
  if (arguments_.length === 1 && arguments_[0] === "--isolated") return isolatedServer();
  if (arguments_.length) throw Error("Unsupported smoke arguments");
  // Literal environment: do not inspect or copy the parent's runtime/private
  // values, and never load .env. Even the ephemeral built upstream is isolated.
  const child = spawn(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url), "--isolated"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), env: { NODE_ENV: "production" }, windowsHide: true, stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  child.once("error", () => { process.stderr.write("Controlled UI child unavailable; no private configuration read.\n"); process.exitCode = 1; });
  child.once("exit", code => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { child.kill("SIGTERM"); });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch { process.stderr.write("Controlled passkey UI smoke did not start. No real login or private configuration change.\n"); process.exitCode = 1; }
}
