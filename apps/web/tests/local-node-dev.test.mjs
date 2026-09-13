import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { localNodeDev, localNodeDevEnabled } from "../build/local-node-dev.ts";
import { RESPONSE_SECURITY_HEADERS } from "../worker/security-headers.ts";

test("Node compatibility is explicit and development-only; production Worker stays unchanged", () => {
  assert.equal(localNodeDevEnabled("serve", {ASHA_LOCAL_NODE_DEV:"true"}), true);
  for (const value of [undefined, "false", "1", "TRUE"]) assert.equal(localNodeDevEnabled("serve", {ASHA_LOCAL_NODE_DEV:value}), false);
  for (const command of ["build", "preview", "deploy", ""]) assert.equal(localNodeDevEnabled(command, {ASHA_LOCAL_NODE_DEV:"true"}), false);
  assert.equal(localNodeDev().apply, "serve");
});

test("Node development rejects external binding, unexpected ports and automatic port fallback", () => {
  const plugin = localNodeDev();
  const valid = {host:"127.0.0.1",port:4174,strictPort:true};
  plugin.configResolved({server:valid});
  for (const change of [{host:"0.0.0.0"},{host:true},{host:"localhost"},{port:3012},{port:4175},{strictPort:false}]) assert.throws(() => plugin.configResolved({server:{...valid,...change}}));
});

test("Node middleware preserves every existing security header without inspecting bodies or credentials", () => {
  let middleware, nextCalls=0;
  localNodeDev().configureServer({middlewares:{use(callback){middleware=callback;}}});
  const headers={};
  middleware({}, {setHeader(k,v){headers[k]=v;}}, () => {nextCalls++;});
  assert.deepEqual(headers, RESPONSE_SECURITY_HEADERS); assert.equal(nextCalls,1);
});

test("launcher keeps protected local identity, offline market lock and explicit one-shot test gate", async () => {
  const launcher = await readFile(new URL("../scripts/start-local-app.mjs", import.meta.url), "utf8");
  const config = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(launcher, /ASHA_LOCAL_NODE_DEV: "true"/);
  assert.match(launcher, /ASHA_MARKET_NETWORK_ENABLED: "false"/);
  assert.match(launcher, /ASHA_LOCAL_MARKET_TEST_ENABLED: "true"/);
  assert.match(launcher, /NAVASAN_HISTORY_EXECUTION_ENABLED: "false"/);
  assert.match(launcher, /parseProtectedRuntimeEnvironment\(await readFile/);
  assert.match(config, /localNodeDevEnabled\(command, process.env\)/);
  assert.match(config, /cacheDir: nodeDev \? "node_modules\/.vite-asha-node" : undefined/);
  assert.doesNotMatch(config + launcher, /NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized: false|VINEXT_NO_DEV_LOCK/);
});
