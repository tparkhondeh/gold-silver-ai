import { createHash, randomBytes } from "node:crypto";

export const OWNER_AUTH_PATHS = Object.freeze({ begin: "/auth/google/start", callback: "/auth/google/callback", session: "/auth/session", logout: "/auth/logout" });
export interface VerifiedIdentity { issuer: string; subject: string; emailVerified: boolean; expiresAt: number }
export interface IdentityAdapter {
  readonly issuer: string;
  readonly redirectUri: string;
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): URL;
  exchange(input: { callbackUrl: URL; state: string; nonce: string; codeVerifier: string }): Promise<VerifiedIdentity>;
}
export interface VerifiedOwner { issuer: string; subject: string; expiresAt: number }
export interface LoginTransaction { state: string; nonce: string; codeVerifier: string; createdAt: number; expiresAt: number; claimed: boolean }
export interface OwnerSession extends VerifiedOwner { createdAt: number }
/** Synchronous claim/finish operations must be atomic. This is not a durable store contract. */
export interface OwnerIdentityStore {
  putTransaction(key: string, value: LoginTransaction, now: number): void;
  claimTransaction(key: string, now: number): LoginTransaction | null;
  finishTransaction(key: string, now: number): boolean;
  deleteTransaction(key: string): void;
  putSession(key: string, value: OwnerSession, now: number): void;
  getSession(key: string, now: number): OwnerSession | null;
  deleteSession(key: string): void;
}

const live = (value: { createdAt: number; expiresAt: number }, now: number) => Number.isSafeInteger(now) && value.createdAt <= now && now < value.expiresAt;
/** Bounded, process-local acceptance storage. Restart revokes everything; never production persistence. */
export function createMemoryOwnerIdentityStore(capacity = 256): OwnerIdentityStore {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error("Invalid identity capacity");
  const transactions = new Map<string, LoginTransaction>(), sessions = new Map<string, OwnerSession>();
  const prune = <T extends { createdAt: number; expiresAt: number }>(map: Map<string, T>, now: number) => {
    for (const [key, value] of map) if (!live(value, now)) map.delete(key);
  };
  return {
    putTransaction(key, value, now) { prune(transactions, now); if (transactions.size >= capacity || transactions.has(key)) throw new Error("Identity capacity reached"); transactions.set(key, { ...value }); },
    claimTransaction(key, now) { prune(transactions, now); const value = transactions.get(key); if (!value || value.claimed) return null; value.claimed = true; return { ...value }; },
    finishTransaction(key, now) { const value = transactions.get(key); transactions.delete(key); return !!value?.claimed && live(value, now); },
    deleteTransaction(key) { transactions.delete(key); },
    putSession(key, value, now) { prune(sessions, now); if (sessions.size >= capacity || sessions.has(key)) throw new Error("Identity capacity reached"); sessions.set(key, { ...value }); },
    getSession(key, now) { const value = sessions.get(key); if (!value) return null; if (!live(value, now)) { sessions.delete(key); return null; } return { ...value }; },
    deleteSession(key) { sessions.delete(key); },
  };
}

export interface OwnerIdentityOptions {
  origin: string;
  ownerSubject: string;
  adapter: IdentityAdapter;
  store?: OwnerIdentityStore;
  clock?: () => number;
  /** Absolute, non-sliding duration; bounded to 1 second–8 hours. Default 30 minutes. */
  sessionTtlMs?: number;
}

const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
const opaque = () => randomBytes(32).toString("base64url");
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const safeHeaders = { "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const json = (body: object, status = 200) => Response.json(body, { status, headers: safeHeaders });
const denied = (status = 401) => json({ authenticated: false, error: "identity_denied" }, status);

async function emptyBody(request: Request): Promise<boolean> {
  if (request.body === null) return true;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Identity body deadline")), 1000); });
  try {
    for (let chunks = 0; chunks < 8; chunks++) {
      const item = await Promise.race([reader.read(), deadline]);
      if (item.done) return true;
      if (item.value.byteLength) return false;
    }
    return false;
  } catch { return false; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function createGate(options: OwnerIdentityOptions, acceptance: boolean) {
  const adapter = options.adapter, ownerSubject = options.ownerSubject, expectedIssuer = adapter.issuer;
  const origin = new URL(options.origin);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if (origin.origin !== options.origin || origin.username || origin.password || (acceptance ? origin.protocol !== "http:" || !loopback || !origin.port : origin.protocol !== "https:")) throw new Error("Invalid identity origin");
  if (!/^[\x21-\x7E]{1,255}$/.test(options.ownerSubject) || options.adapter.redirectUri !== `${origin.origin}${OWNER_AUTH_PATHS.callback}`) throw new Error("Invalid identity binding");
  const issuer = new URL(options.adapter.issuer);
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error("Invalid identity issuer");
  const ttl = options.sessionTtlMs ?? 30 * 60_000;
  if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 8 * 60 * 60_000) throw new Error("Invalid session duration");
  const store = options.store ?? createMemoryOwnerIdentityStore(), clock = options.clock ?? Date.now;
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
    if (!tokenPattern.test(value)) throw new Error("Invalid cookie");
    return hash(value);
  }
  function validRequest(request: Request, path?: string, method?: string) {
    if (request.url.length > 8192) return false;
    const url = new URL(request.url);
    if (url.origin !== origin.origin || url.username || url.password || url.hash || (path && url.pathname !== path) || (method && request.method !== method)) return false;
    const host = request.headers.get("host");
    return !host || host.toLowerCase() === origin.host;
  }
  async function validPost(request: Request, path: string, intent: string) {
    return validRequest(request, path, "POST") && !new URL(request.url).search && request.headers.get("origin") === origin.origin && request.headers.get("sec-fetch-site") === "same-origin" && request.headers.get("x-asha-intent") === intent && await emptyBody(request);
  }
  function revokeBrowser(request: Request) {
    const session = readCookie(request, sessionName), transaction = readCookie(request, transactionName);
    if (session) store.deleteSession(session);
    if (transaction) store.deleteTransaction(transaction);
  }
  function ownerSession(request: Request) {
    if (!validRequest(request)) return null;
    const key = readCookie(request, sessionName), value = key ? store.getSession(key, now()) : null;
    return value && value.issuer === expectedIssuer && value.subject === ownerSubject ? { key: key!, value } : null;
  }
  return {
    async begin(request: Request): Promise<Response> {
      try {
        if (!await validPost(request, OWNER_AUTH_PATHS.begin, "owner-login")) return denied(403);
        revokeBrowser(request);
        const createdAt = now(), id = opaque(), state = opaque(), nonce = opaque(), codeVerifier = opaque();
        const authorizationUrl = adapter.authorizationUrl({ state, nonce, codeChallenge: hash(codeVerifier) });
        if (authorizationUrl.protocol !== "https:" || authorizationUrl.username || authorizationUrl.password) return denied();
        store.putTransaction(hash(id), { state, nonce, codeVerifier, createdAt, expiresAt: createdAt + 5 * 60_000, claimed: false }, createdAt);
        const response = clear(json({ authorizationUrl: authorizationUrl.href }));
        response.headers.append("set-cookie", cookie(transactionName, id, 300));
        return response;
      } catch { return clear(denied()); }
    },
    async callback(request: Request): Promise<Response> {
      let transactionKey: string | null = null;
      try {
        if (!validRequest(request, OWNER_AUTH_PATHS.callback, "GET")) return denied(403);
        const callbackUrl = new URL(request.url);
        const params = callbackUrl.searchParams;
        if ([...params].length > 16 || [...new Set(params.keys())].some(key => params.getAll(key).length !== 1) || !params.get("code") || !tokenPattern.test(params.get("state") ?? "") || params.has("error")) return clear(denied());
        transactionKey = readCookie(request, transactionName);
        if (!transactionKey) return clear(denied());
        const transaction = store.claimTransaction(transactionKey, now());
        if (!transaction || transaction.state !== params.get("state")) return clear(denied());
        const identity = await adapter.exchange({ callbackUrl, state: transaction.state, nonce: transaction.nonce, codeVerifier: transaction.codeVerifier });
        const current = now();
        // Logout, a second login, or expiry can invalidate a claimed transaction while exchange awaits.
        if (!store.finishTransaction(transactionKey, current) || identity.issuer !== expectedIssuer || identity.subject !== ownerSubject || identity.emailVerified !== true || !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= current) return clear(denied());
        const previous = readCookie(request, sessionName);
        if (previous) store.deleteSession(previous);
        const id = opaque(), expiresAt = Math.min(current + ttl, identity.expiresAt);
        store.putSession(hash(id), { issuer: identity.issuer, subject: identity.subject, createdAt: current, expiresAt }, current);
        const response = clear(new Response(null, { status: 303, headers: { ...safeHeaders, location: "/" } }));
        response.headers.append("set-cookie", cookie(sessionName, id, Math.max(1, Math.floor((expiresAt - current) / 1000))));
        return response;
      } catch { return clear(denied()); }
      finally { if (transactionKey) store.deleteTransaction(transactionKey); }
    },
    async session(request: Request): Promise<Response> {
      try {
        if (!validRequest(request, OWNER_AUTH_PATHS.session, "GET") || new URL(request.url).search) return denied(403);
        const owner = ownerSession(request);
        return owner ? json({ authenticated: true, subject: owner.value.subject, expiresAt: owner.value.expiresAt }) : clear(json({ authenticated: false }, 401));
      } catch { return clear(denied()); }
    },
    async logout(request: Request): Promise<Response> {
      try {
        if (!await validPost(request, OWNER_AUTH_PATHS.logout, "owner-logout")) return denied(403);
        revokeBrowser(request);
        return clear(json({ authenticated: false }));
      } catch { return clear(denied()); }
    },
    async requireOwner(request: Request, next: (request: Request, owner: VerifiedOwner) => Response | Promise<Response>): Promise<Response> {
      try {
        if (!["GET", "HEAD"].includes(request.method) && (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method) || request.headers.get("origin") !== origin.origin || request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("x-asha-intent") !== "owner-action")) return denied(403);
        const owner = ownerSession(request);
        if (!owner) return clear(denied());
        const response = await next(request, { issuer: owner.value.issuer, subject: owner.value.subject, expiresAt: owner.value.expiresAt });
        const current = ownerSession(request);
        if (!current || current.key !== owner.key) return clear(denied());
        // Buffer-free response gate: no protected response body is returned after revocation/expiry.
        const secured = new Response(response.body, response);
        for (const [key, value] of Object.entries(safeHeaders)) secured.headers.set(key, value);
        return secured;
      } catch { return clear(denied()); }
    },
  };
}

/** HTTPS-only reusable boundary; not connected to the app or local-owner-v1 persistence. */
export const createOwnerIdentityGate = (options: OwnerIdentityOptions) => createGate(options, false);
/** Explicit loopback-only synthetic harness factory. Never selected from runtime environment flags. */
export const createAcceptanceOwnerIdentityGate = (options: OwnerIdentityOptions) => createGate(options, true);
