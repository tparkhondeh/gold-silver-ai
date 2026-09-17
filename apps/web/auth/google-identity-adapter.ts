import * as oidc from "openid-client";
import type { IdentityAdapter } from "./owner-identity.ts";

const GOOGLE_METADATA: oidc.ServerMetadata = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
  response_types_supported: ["code"],
  id_token_signing_alg_values_supported: ["RS256"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
  code_challenge_methods_supported: ["S256"],
  authorization_response_iss_parameter_supported: true,
};
interface AdapterOptions { clientId: string; clientSecret: string; redirectUri: string }
export interface AcceptanceOidcOptions extends AdapterOptions { metadata: oidc.ServerMetadata; fetch: typeof globalThis.fetch }

function makeAdapter(options: AdapterOptions, metadata: oidc.ServerMetadata, transport: typeof globalThis.fetch): IdentityAdapter {
  if (!options.clientId.trim() || options.clientId.length > 512 || !options.clientSecret || options.clientSecret.length > 4096) throw new Error("Invalid OIDC configuration");
  const config = new oidc.Configuration(metadata, options.clientId, { client_secret: options.clientSecret, id_token_signed_response_alg: "RS256", [oidc.clockTolerance]: 0 });
  config.timeout = 10;
  // Token endpoint TLS alone is not enough for this app's explicit signed-ID-token contract.
  oidc.enableNonRepudiationChecks(config);
  config[oidc.customFetch] = async (input, init) => {
    const target = String(input), method = init?.method?.toUpperCase() ?? "GET";
    if (!((target === metadata.token_endpoint && method === "POST") || (target === metadata.jwks_uri && method === "GET"))) throw new Error("Identity transport denied");
    const requestBody = init.body instanceof Uint8Array ? new Uint8Array(init.body) : init.body;
    const response = await transport(input, { ...init, body: requestBody, redirect: "error" });
    if (response.redirected || (response.url && response.url !== target)) { void response.body?.cancel().catch(() => {}); throw new Error("Identity redirect denied"); }
    const limit = 64 * 1024;
    if (Number(response.headers.get("content-length")) > limit) { void response.body?.cancel().catch(() => {}); throw new Error("Identity response too large"); }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        for (let count = 0;; count++) {
          if (count > 1024) throw new Error("Identity response too fragmented");
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) throw new Error("Identity response too large");
          chunks.push(chunk.value);
        }
      } catch (error) { void reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    return new Response(size ? body : null, { status: response.status, headers: response.headers });
  };
  const adapter: IdentityAdapter = {
    issuer: metadata.issuer,
    redirectUri: options.redirectUri,
    authorizationUrl({ state, nonce, codeChallenge }) {
      return oidc.buildAuthorizationUrl(config, { redirect_uri: options.redirectUri, scope: "openid email", response_type: "code", state, nonce, code_challenge: codeChallenge, code_challenge_method: "S256" });
    },
    async exchange({ callbackUrl, state, nonce, codeVerifier }) {
      if (`${callbackUrl.origin}${callbackUrl.pathname}` !== options.redirectUri || callbackUrl.hash || callbackUrl.username || callbackUrl.password) throw new Error("Identity callback denied");
      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, { expectedState: state, expectedNonce: nonce, pkceCodeVerifier: codeVerifier, idTokenExpected: true });
      const claims = tokens.claims();
      // OIDC validates issuer/audience/expiry/nonce/signature. Reject future issued-at and unverified email too.
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255 || !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.iat) || claims.iat > nowSeconds || claims.exp <= nowSeconds || claims.email_verified !== true || typeof claims.email !== "string" || !claims.email.includes("@")) throw new Error("Identity claims denied");
      return { issuer: claims.iss, subject: claims.sub, emailVerified: true, expiresAt: claims.exp * 1000 };
    },
  };
  return Object.freeze(adapter);
}

/** Construction performs no network requests. No credential loading or environment activation exists here. */
export function createGoogleIdentityAdapter(options: AdapterOptions): IdentityAdapter {
  const redirect = new URL(options.redirectUri);
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.search || redirect.hash || redirect.pathname !== "/auth/google/callback") throw new Error("Invalid Google redirect");
  return makeAdapter({ ...options }, GOOGLE_METADATA, globalThis.fetch);
}

/** Fake HTTPS .invalid provider only; injected transport cannot enable HTTP provider exceptions. */
export function createAcceptanceOidcAdapter(options: AcceptanceOidcOptions): IdentityAdapter {
  const redirect = new URL(options.redirectUri);
  if (redirect.username || redirect.password || redirect.search || redirect.hash || redirect.pathname !== "/auth/google/callback" || !(redirect.protocol === "https:" || (redirect.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(redirect.hostname) && redirect.port))) throw new Error("Invalid acceptance redirect");
  for (const raw of [options.metadata.issuer, options.metadata.authorization_endpoint, options.metadata.token_endpoint, options.metadata.jwks_uri]) {
    if (!raw) throw new Error("Missing acceptance endpoint");
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".invalid") || url.username || url.password || url.search || url.hash) throw new Error("Invalid acceptance endpoint");
  }
  return makeAdapter({ ...options }, structuredClone(options.metadata), options.fetch);
}
