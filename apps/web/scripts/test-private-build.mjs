// Actual built Node UI + gateway smoke. Synthetic identity, no DB/config/key reads.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { startProdServer } from "vinext/server/prod-server";
import { createOwnerIdentityGate, createMemoryOwnerIdentityStore } from "../auth/owner-identity.ts";
import { createPrivateApplication } from "../auth/private-application.ts";
import { privateUiResponse } from "../auth/private-ui-response.ts";
import { assertPrivateProcessEnvironment } from "./private-server-config.ts";
let ui;
try {
  assertPrivateProcessEnvironment(process.env);
  ui = await startProdServer({ host: "127.0.0.1", port: 0, outDir: fileURLToPath(new URL("../dist-private", import.meta.url)), noCompression: true, silent: true });
  const origin = "https://goldsilver.wealthos.ir";
  const gate = createOwnerIdentityGate({ origin, ownerSubject: "synthetic-build-only", store: createMemoryOwnerIdentityStore(), adapter: {
    issuer: "https://build.invalid", redirectUri: `${origin}/auth/google/callback`, authorizationUrl() { throw Error("Disabled in build smoke"); }, async exchange() { throw Error("Disabled in build smoke"); },
  } });
  const app = createPrivateApplication({ origin, release: "a".repeat(40), gate, portfolio() { throw Error("Anonymous request reached portfolio"); },
    async publicUi(request) { return privateUiResponse(await fetch(`http://127.0.0.1:${ui.port}${new URL(request.url).pathname}`, { headers: { "accept-encoding": "identity" }, redirect: "error" })); },
  });
  const response = await app(new Request(origin));
  assert.equal(response.status, 200); const html = await response.text();
  assert.match(html, /ورود به سبد شخصی/); assert.doesNotMatch(html, /data-testid="unified-workspace"/);
  const assets = [...html.matchAll(/(?:src|href)="(\/(?:assets|_next\/static)\/[^"?]+\.(?:js|css|woff2?))"/g)].map(match => match[1]);
  assert.ok(assets.length > 0);
  for (const path of new Set([...assets, "/templates/purchase-lots-v1.xlsx"])) {
    const asset = await app(new Request(origin + path));
    assert.equal(asset.status, 200); assert.equal(asset.headers.get("content-encoding"), null); assert.ok((await asset.arrayBuffer()).byteLength > 0);
  }
  assert.equal((await app(new Request(origin + "/api/portfolio"))).status, 401);
  assert.equal((await app(new Request(origin + "/api/operator/csv"))).status, 404);
  process.stdout.write(`Private Node build smoke passed: shell, ${new Set(assets).size} built assets, Excel template, anonymous denial. No real login or deployment.\n`);
} catch { process.stderr.write("Private Node build smoke failed; no secret details logged.\n"); process.exitCode = 1; }
finally { if (ui) { ui.server.closeAllConnections(); await new Promise(done => ui.server.close(done)); } }
