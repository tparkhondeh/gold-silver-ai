import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const NETWORK_FIXTURE_HEADER = "x-asha-test-market-network";

/** Execute the actual Worker build, including cloudflare: imports and its headers.
 * Only synthetic bindings enter the isolate; every outbound request is intercepted.
 */
export async function createRenderedWorker() {
  const root = fileURLToPath(new URL("../../dist/server/", import.meta.url));
  const configuration = JSON.parse(await readFile(resolve(root, "wrangler.json"), "utf8"));
  const modules = (await readdir(root, { recursive: true }))
    .filter(path => path.endsWith(".js"))
    .map(path => ({ type: "ESModule", path: resolve(root, path) }));
  const outboundRequests = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    host: "127.0.0.1",
    port: 0,
    cf: false,
    telemetry: { enabled: false },
    unsafeRegisterWorker: false,
    modulesRoot: root,
    modules: [{
      type: "ESModule",
      path: resolve(root, "rendered-test-entry.mjs"),
      // Change only the environment fixture between requests. Reloading the
      // isolate here would erase the populated cache and weaken that regression.
      contents: `import process from "node:process";
import worker from "./index.js";
export default {
  fetch(request, env, ctx) {
    const enabled = request.headers.get("${NETWORK_FIXTURE_HEADER}");
    if (enabled !== "true" && enabled !== "false") throw Error("Missing network fixture");
    process.env.ASHA_MARKET_NETWORK_ENABLED = enabled;
    const headers = new Headers(request.headers);
    headers.delete("${NETWORK_FIXTURE_HEADER}");
    return worker.fetch(new Request(request, { headers }), env, ctx);
  }
};`,
    }, ...modules],
    compatibilityDate: configuration.compatibility_date,
    compatibilityFlags: configuration.compatibility_flags,
    bindings: {
      ASHA_MARKET_NETWORK_ENABLED: "false",
      NAVASAN_API_KEY: "synthetic-test-credential",
      NAVASAN_VALUE_UNIT: "TOMAN",
      NAVASAN_KEY_ROTATION_CONFIRMED: "false",
    },
    assets: {
      directory: resolve(root, "../client"), binding: "ASSETS", run_worker_first: true,
      routerConfig: { has_user_worker: true },
    },
    outboundService(request) {
      outboundRequests.push(request.url);
      return new Response("Controlled offline fixture", { status: 503 });
    },
  }));
  return {
    outboundRequests,
    request(path = "/", headers = { accept: "text/html" }, networkEnabled = false) {
      const requestHeaders = new Headers(headers);
      requestHeaders.set(NETWORK_FIXTURE_HEADER, String(networkEnabled));
      return runtime.dispatchFetch(`http://localhost${path}`, { headers: requestHeaders });
    },
    dispose: () => runtime.dispose(),
  };
}
