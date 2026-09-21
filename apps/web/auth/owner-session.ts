import { createHash, randomBytes } from "node:crypto";
import type { OwnerAuthorization, OwnerIdentityStore, VerifiedOwner } from "./owner-identity.ts";
import { isEmptyPrivateBody } from "./bounded-body.ts";

export const OWNER_SESSION_PATHS = Object.freeze({ session: "/auth/session", logout: "/auth/logout" });
export const OWNER_SESSION_SAFE_HEADERS = Object.freeze({ "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
export const ownerTokenHash = (value: string) => createHash("sha256").update(value).digest("base64url");
export const createOwnerToken = () => randomBytes(32).toString("base64url");
export const ownerSessionLive = (value: { createdAt: number; expiresAt: number }, now: number) => Number.isSafeInteger(now) && value.createdAt <= now && now < value.expiresAt;
export const ownerJson = (body: object, status = 200) => Response.json(body, { status, headers: OWNER_SESSION_SAFE_HEADERS });
export const ownerDenied = (status = 401) => ownerJson({ authenticated: false, error: "identity_denied" }, status);

/** Shared session/cookie/CSRF boundary, independent of how identity was verified.
 * Production requires an explicitly injected durable store. Acceptance HTTP is
 * an explicit factory argument, never selected by environment or request input.
 */
export function createOwnerSessionBoundary(options: {
  origin: string; issuer: string; ownerSubject: string;
  store: Pick<OwnerIdentityStore, "getSession" | "revokeBrowser">;
  clock?: () => number;
}, acceptance = false) {
  const origin = new URL(options.origin), issuer = new URL(options.issuer);
  const expectedIssuer = options.issuer, ownerSubject = options.ownerSubject;
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if (origin.origin !== options.origin || origin.username || origin.password || (acceptance ? origin.protocol !== "http:" || !loopback || !origin.port : origin.protocol !== "https:")) throw new Error("Invalid identity origin");
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash || typeof ownerSubject !== "string" || !/^[\x21-\x7E]{1,255}$/.test(ownerSubject)) throw new Error("Invalid identity binding");
  if (!options.store || typeof options.store.getSession !== "function" || typeof options.store.revokeBrowser !== "function") throw new Error("Explicit identity store required");
  const store = options.store, clock = options.clock ?? Date.now;
  const sessionName = acceptance ? "asha_acceptance_owner" : "__Host-asha-owner";
  const transactionName = acceptance ? "asha_acceptance_login" : "__Host-asha-login";
  const cookie = (name: string, value: string, maxAge: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${acceptance ? "" : "; Secure"}`;
  const clear = (response: Response) => { response.headers.append("set-cookie", cookie(sessionName, "", 0)); response.headers.append("set-cookie", cookie(transactionName, "", 0)); return response; };
  const now = () => { const value = clock(); if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid identity clock"); return value; };
  function readCookie(request: Request, name: string): string | null {
    const raw = request.headers.get("cookie") ?? "";
    if (raw.length > 4096) throw new Error("Invalid cookie");
    const values = raw.split(";").map(part => part.trim()).filter(part => part.slice(0, part.indexOf("=")) === name);
    if (values.length > 1) throw new Error("Ambiguous cookie");
    const value = values[0]?.slice(name.length + 1);
    if (value === undefined || value === "") return null;
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("Invalid cookie");
    return ownerTokenHash(value);
  }
  function validRequest(request: Request, path?: string, method?: string) {
    if (request.url.length > 8192) return false;
    const url = new URL(request.url);
    if (url.origin !== origin.origin || url.username || url.password || url.hash || (path && url.pathname !== path) || (method && request.method !== method)) return false;
    const host = request.headers.get("host");
    return !host || host.toLowerCase() === origin.host;
  }
  function validMutation(request: Request, path: string, intent: string) {
    return validRequest(request, path, "POST") && !new URL(request.url).search && request.headers.get("origin") === origin.origin && request.headers.get("sec-fetch-site") === "same-origin" && request.headers.get("x-asha-intent") === intent;
  }
  async function validPost(request: Request, path: string, intent: string) {
    return validMutation(request, path, intent) && await isEmptyPrivateBody(request);
  }
  async function revokeBrowser(request: Request) {
    await store.revokeBrowser(readCookie(request, sessionName), readCookie(request, transactionName));
  }
  async function ownerSession(request: Request) {
    if (!validRequest(request)) return null;
    const key = readCookie(request, sessionName), value = key ? await store.getSession(key, now()) : null;
    return value && ownerSessionLive(value, now()) && value.issuer === expectedIssuer && value.subject === ownerSubject ? { key: key!, value } : null;
  }
  return {
    now, cookie, clear, readCookie, validRequest, validMutation, validPost, revokeBrowser, ownerSession, sessionName, transactionName,
    async session(request: Request): Promise<Response> {
      try {
        if (!validRequest(request, OWNER_SESSION_PATHS.session, "GET") || new URL(request.url).search) return ownerDenied(403);
        const owner = await ownerSession(request);
        return owner ? ownerJson({ authenticated: true, subject: owner.value.subject, expiresAt: owner.value.expiresAt }) : clear(ownerJson({ authenticated: false }, 401));
      } catch { return clear(ownerDenied()); }
    },
    async logout(request: Request): Promise<Response> {
      try {
        if (!await validPost(request, OWNER_SESSION_PATHS.logout, "owner-logout")) return ownerDenied(403);
        await revokeBrowser(request);
        return clear(ownerJson({ authenticated: false }));
      } catch { return clear(ownerDenied()); }
    },
    async requireOwner(request: Request, next: (request: Request, owner: VerifiedOwner, authorization: OwnerAuthorization) => Response | Promise<Response>): Promise<Response> {
      try {
        if (!["GET", "HEAD"].includes(request.method) && (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method) || request.headers.get("origin") !== origin.origin || request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("x-asha-intent") !== "owner-action")) return ownerDenied(403);
        const owner = await ownerSession(request);
        if (!owner) return clear(ownerDenied());
        const response = await next(request, { issuer: owner.value.issuer, subject: owner.value.subject, expiresAt: owner.value.expiresAt }, { sessionHash: owner.key, issuer: owner.value.issuer, subject: owner.value.subject });
        const current = await ownerSession(request);
        if (!current || current.key !== owner.key) return clear(ownerDenied());
        // Database writes retain the separate transaction-scoped authorization lock.
        const secured = new Response(response.body, response);
        for (const [key, value] of Object.entries(OWNER_SESSION_SAFE_HEADERS)) secured.headers.set(key, value);
        return secured;
      } catch { return clear(ownerDenied()); }
    },
  };
}
