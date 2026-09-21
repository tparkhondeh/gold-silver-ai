import type { createOwnerIdentityGate } from "./owner-identity.ts";
import { OWNER_AUTH_PATHS } from "./owner-identity.ts";
import { MANAGED_MARKET_VERSION, validateManagedMarketResponse } from "../app/managed-market-contract.ts";
import { isEmptyPrivateBody } from "./bounded-body.ts";
import type { createOwnerPasskeyGate } from "./passkey-identity.ts";
import { PASSKEY_PATHS } from "./passkey-types.ts";

type Gate = ReturnType<typeof createOwnerIdentityGate> | ReturnType<typeof createOwnerPasskeyGate>;
type Proof = Parameters<Parameters<Gate["requireOwner"]>[1]>[2];
export interface PrivateApplicationOptions {
  origin: string;
  release: string;
  gate: Gate;
  portfolio: (request: Request, proof: Proof) => Promise<Response>;
  /** Built public UI only: no portfolio, identity, provider or environment values. */
  publicUi: (request: Request) => Promise<Response>;
  /** Optional trusted server composition only. No key/config/network activation
   * is implied. Adapter must authorize quota use and bound its own work (the
   * existing managed service has an 8s provider deadline; HTTP bridge has 15s). */
  market?: { latest(proof: Proof): Promise<unknown> };
  clock?: () => number;
}
const headers = { "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });

/** Explicit route allowlist; no forwarding to legacy/local APIs or trust in identity headers. */
export function createPrivateApplication(options: PrivateApplicationOptions) {
  const origin = new URL(options.origin), clock = options.clock ?? Date.now;
  if (origin.protocol !== "https:" || origin.origin !== options.origin || !/^[0-9a-f]{40}$/.test(options.release)) throw new Error("Invalid private application configuration");
  if (options.market !== undefined && (!options.market || typeof options.market.latest !== "function")) throw new Error("Invalid private market dependency");
  const latest = options.market?.latest.bind(options.market);
  let loginWindow = 0, loginCount = 0;
  const route = async (request: Request): Promise<Response> => {
    const url = new URL(request.url), path = url.pathname;
    if (url.origin !== origin.origin || url.hash || url.username || url.password || request.url.length > 8192
      || (request.headers.has("host") && request.headers.get("host") !== origin.host)) return json({ error: "request_denied" }, 400);
    const passkey = "authenticationOptions" in options.gate;
    if (passkey) {
      const gate = options.gate as ReturnType<typeof createOwnerPasskeyGate>;
      if (path === PASSKEY_PATHS.authenticationOptions) return gate.authenticationOptions(request);
      if (path === PASSKEY_PATHS.authenticationVerify) return gate.verifyAuthentication(request);
      if (path === PASSKEY_PATHS.registrationOptions) return gate.registrationOptions(request);
      if (path === PASSKEY_PATHS.registrationVerify) return gate.verifyRegistration(request);
    }
    if (!passkey && path === OWNER_AUTH_PATHS.begin && "begin" in options.gate) {
      // Global cap does not trust client/proxy IP headers. One production worker.
      const now = clock();
      if (now < loginWindow || now - loginWindow >= 60_000) { loginWindow = now; loginCount = 0; }
      if (++loginCount > 10) return json({ error: "login_rate_limited" }, 429);
      return options.gate.begin(request);
    }
    if (!passkey && path === OWNER_AUTH_PATHS.callback && "callback" in options.gate) return options.gate.callback(request);
    if (path === OWNER_AUTH_PATHS.session) return options.gate.session(request);
    if (path === OWNER_AUTH_PATHS.logout) return options.gate.logout(request);
    if (path === "/api/access-mode" && request.method === "GET" && !url.search) return json(passkey ? { mode: "private", authMethod: "passkey" } : { mode: "private" });
    if (path === "/api/health" && request.method === "GET" && !url.search) return json({ mode: "private", release: options.release });
    if (path === "/api/portfolio" || path === "/api/portfolio/export") return options.gate.requireOwner(request, (authorized, _owner, proof) => options.portfolio(authorized, proof));
    if (path === "/api/managed-market") {
      return options.gate.requireOwner(request, async (_authorized, _owner, proof) => {
        if (request.method !== "POST" || url.search || !await isEmptyPrivateBody(request) || request.headers.get("x-asha-managed-market") !== "latest") return json({ error: "request_denied" }, 400);
        if (latest) {
          try {
            const value = await latest(Object.freeze({ ...proof }));
            validateManagedMarketResponse(value, clock());
            const serialized = JSON.stringify(value);
            if (Buffer.byteLength(serialized, "utf8") > 65_536) throw Error();
            // Validate the actual emitted representation too: a server object
            // with custom serialization must not smuggle unknown fields/keys.
            validateManagedMarketResponse(JSON.parse(serialized), clock());
            return new Response(serialized, { headers: { ...headers, "content-type": "application/json" } });
          } catch { return json({ error: "service_unavailable" }, 503); }
        }
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
