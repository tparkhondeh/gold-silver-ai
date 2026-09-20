import type { createOwnerIdentityGate } from "./owner-identity.ts";
import { OWNER_AUTH_PATHS } from "./owner-identity.ts";
import { MANAGED_MARKET_VERSION } from "../app/managed-market-contract.ts";
import { isEmptyPrivateBody } from "./bounded-body.ts";

type Gate = ReturnType<typeof createOwnerIdentityGate>;
type Proof = Parameters<Parameters<Gate["requireOwner"]>[1]>[2];
export interface PrivateApplicationOptions {
  origin: string;
  release: string;
  gate: Gate;
  portfolio: (request: Request, proof: Proof) => Promise<Response>;
  /** Built public UI only: no portfolio, identity, provider or environment values. */
  publicUi: (request: Request) => Promise<Response>;
  clock?: () => number;
}
const headers = { "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });

/** Explicit route allowlist; no forwarding to legacy/local APIs or trust in identity headers. */
export function createPrivateApplication(options: PrivateApplicationOptions) {
  const origin = new URL(options.origin), clock = options.clock ?? Date.now;
  if (origin.protocol !== "https:" || origin.origin !== options.origin || !/^[0-9a-f]{40}$/.test(options.release)) throw new Error("Invalid private application configuration");
  let loginWindow = 0, loginCount = 0;
  const route = async (request: Request): Promise<Response> => {
    const url = new URL(request.url), path = url.pathname;
    if (url.origin !== origin.origin || url.hash || url.username || url.password || request.url.length > 8192
      || (request.headers.has("host") && request.headers.get("host") !== origin.host)) return json({ error: "request_denied" }, 400);
    if (path === OWNER_AUTH_PATHS.begin) {
      // Global cap does not trust client/proxy IP headers. One production worker.
      const now = clock();
      if (now < loginWindow || now - loginWindow >= 60_000) { loginWindow = now; loginCount = 0; }
      if (++loginCount > 10) return json({ error: "login_rate_limited" }, 429);
      return options.gate.begin(request);
    }
    if (path === OWNER_AUTH_PATHS.callback) return options.gate.callback(request);
    if (path === OWNER_AUTH_PATHS.session) return options.gate.session(request);
    if (path === OWNER_AUTH_PATHS.logout) return options.gate.logout(request);
    if (path === "/api/access-mode" && request.method === "GET" && !url.search) return json({ mode: "private" });
    if (path === "/api/health" && request.method === "GET" && !url.search) return json({ mode: "private", release: options.release });
    if (path === "/api/portfolio" || path === "/api/portfolio/export") return options.gate.requireOwner(request, (authorized, _owner, proof) => options.portfolio(authorized, proof));
    if (path === "/api/managed-market") {
      return options.gate.requireOwner(request, async () => {
        if (request.method !== "POST" || url.search || !await isEmptyPrivateBody(request) || request.headers.get("x-asha-managed-market") !== "latest") return json({ error: "request_denied" }, 400);
        const now = clock();
        // Market keys/data have NOT been approved for transfer. No provider/cache fallback.
        return json({ version: MANAGED_MARKET_VERSION, state: "unavailable", snapshot: null, checkedAt: new Date(now).toISOString(), nextCheckAt: new Date(now + 300_000).toISOString(), reason: "missing_key", quota: null });
      });
    }
    // No RSC actions, arbitrary route handlers, image proxy or development endpoints.
    if (request.method === "GET" && !url.search && (path === "/" || path === "/templates/purchase-lots-v1.xlsx" || /^\/(?:_next\/static|assets)\/[A-Za-z0-9_./-]+\.(?:js|css|woff2?|png|svg|ico)$/.test(path))) {
      return options.publicUi(new Request(`${origin.origin}${path}`, { headers: { accept: request.headers.get("accept") ?? "*/*" } }));
    }
    return json({ error: "route_unavailable" }, 404);
  };
  return async (request: Request): Promise<Response> => {
    let response: Response;
    try { response = await route(request); } catch { response = json({ error: "service_unavailable" }, 503); }
    const secured = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) secured.headers.set(key, value);
    secured.headers.set("strict-transport-security", "max-age=31536000");
    secured.headers.delete("access-control-allow-origin");
    secured.headers.delete("access-control-allow-credentials");
    return secured;
  };
}
