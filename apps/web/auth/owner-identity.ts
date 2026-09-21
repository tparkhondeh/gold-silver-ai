import { createOwnerSessionBoundary, createOwnerToken as opaque, ownerTokenHash as hash, ownerSessionLive as live, ownerJson as json, ownerDenied as denied, OWNER_SESSION_SAFE_HEADERS as safeHeaders } from "./owner-session.ts";

export const OWNER_AUTH_PATHS = Object.freeze({ begin: "/auth/google/start", callback: "/auth/google/callback", session: "/auth/session", logout: "/auth/logout" });
export interface VerifiedIdentity { issuer: string; subject: string; emailVerified: boolean; expiresAt: number }
export interface IdentityAdapter {
  readonly issuer: string;
  readonly redirectUri: string;
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): URL;
  exchange(input: { callbackUrl: URL; state: string; nonce: string; codeVerifier: string }): Promise<VerifiedIdentity>;
}
export interface VerifiedOwner { issuer: string; subject: string; expiresAt: number }
/** Server-only authorization evidence; never serialize this into an HTTP response. */
export interface OwnerAuthorization { sessionHash: string; issuer: string; subject: string }
export interface LoginTransaction { state: string; nonce: string; codeVerifier: string; createdAt: number; expiresAt: number; claimed: boolean }
export interface OwnerSession extends VerifiedOwner { createdAt: number }
type Awaitable<T> = T | Promise<T>;
/** Claim, completeLogin and revokeBrowser must each be atomic across every worker. */
export interface OwnerIdentityStore {
  putTransaction(key: string, value: LoginTransaction, now: number): Awaitable<void>;
  claimTransaction(key: string, now: number): Awaitable<LoginTransaction | null>;
  completeLogin(transactionKey: string, sessionKey: string, value: OwnerSession, previousSessionKey: string | null, now: number): Awaitable<boolean>;
  deleteTransaction(key: string): Awaitable<void>;
  getSession(key: string, now: number): Awaitable<OwnerSession | null>;
  revokeBrowser(sessionKey: string | null, transactionKey: string | null): Awaitable<void>;
}

/** Bounded, process-local acceptance storage. Restart revokes everything; never production persistence. */
export function createMemoryOwnerIdentityStore(capacity = 256): OwnerIdentityStore {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error("Invalid identity capacity");
  const transactions = new Map<string, LoginTransaction>(), sessions = new Map<string, OwnerSession & { loginTransactionHash: string }>();
  const prune = <T extends { createdAt: number; expiresAt: number }>(map: Map<string, T>, now: number) => {
    for (const [key, value] of map) if (!live(value, now)) map.delete(key);
  };
  return {
    putTransaction(key, value, now) { prune(transactions, now); if (transactions.size >= capacity || transactions.has(key)) throw new Error("Identity capacity reached"); transactions.set(key, { ...value }); },
    claimTransaction(key, now) { prune(transactions, now); const value = transactions.get(key); if (!value || value.claimed) return null; value.claimed = true; return { ...value }; },
    completeLogin(transactionKey, sessionKey, value, previousSessionKey, now) {
      const pending = transactions.get(transactionKey);
      if (!pending?.claimed || !live(pending, now) || !live(value, now)) return false;
      prune(sessions, now);
      if (sessions.has(sessionKey) || sessions.size - (previousSessionKey && sessions.has(previousSessionKey) ? 1 : 0) >= capacity) throw new Error("Identity capacity reached");
      transactions.delete(transactionKey);
      if (previousSessionKey) sessions.delete(previousSessionKey);
      sessions.set(sessionKey, { ...value, loginTransactionHash: transactionKey });
      return true;
    },
    deleteTransaction(key) { transactions.delete(key); },
    getSession(key, now) { const value = sessions.get(key); if (!value) return null; if (!live(value, now)) { sessions.delete(key); return null; } return { issuer: value.issuer, subject: value.subject, createdAt: value.createdAt, expiresAt: value.expiresAt }; },
    revokeBrowser(sessionKey, transactionKey) {
      if (transactionKey) transactions.delete(transactionKey);
      for (const [key, value] of sessions) if (key === sessionKey || value.loginTransactionHash === transactionKey) sessions.delete(key);
    },
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

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function createGate(options: OwnerIdentityOptions, acceptance: boolean) {
  const adapter = options.adapter, ownerSubject = options.ownerSubject, expectedIssuer = adapter.issuer;
  const origin = new URL(options.origin);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if (origin.origin !== options.origin || origin.username || origin.password || (acceptance ? origin.protocol !== "http:" || !loopback || !origin.port : origin.protocol !== "https:")) throw new Error("Invalid identity origin");
  if (typeof options.ownerSubject !== "string" || !/^[\x21-\x7E]{1,255}$/.test(options.ownerSubject) || options.adapter.redirectUri !== `${origin.origin}${OWNER_AUTH_PATHS.callback}`) throw new Error("Invalid identity binding");
  const issuer = new URL(options.adapter.issuer);
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error("Invalid identity issuer");
  const ttl = options.sessionTtlMs ?? 30 * 60_000;
  if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 8 * 60 * 60_000) throw new Error("Invalid session duration");
  if (!acceptance && !options.store) throw new Error("Explicit identity store required");
  const store = options.store ?? createMemoryOwnerIdentityStore();
  const sessions = createOwnerSessionBoundary({ origin: options.origin, issuer: expectedIssuer, ownerSubject, store, clock: options.clock }, acceptance);
  const { now, cookie, clear, readCookie, validRequest, validPost, revokeBrowser, sessionName, transactionName } = sessions;
  return {
    async begin(request: Request): Promise<Response> {
      try {
        if (!await validPost(request, OWNER_AUTH_PATHS.begin, "owner-login")) return denied(403);
        await revokeBrowser(request);
        const createdAt = now(), id = opaque(), state = opaque(), nonce = opaque(), codeVerifier = opaque();
        const authorizationUrl = adapter.authorizationUrl({ state, nonce, codeChallenge: hash(codeVerifier) });
        if (authorizationUrl.protocol !== "https:" || authorizationUrl.username || authorizationUrl.password) return denied();
        await store.putTransaction(hash(id), { state, nonce, codeVerifier, createdAt, expiresAt: createdAt + 5 * 60_000, claimed: false }, createdAt);
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
        const transaction = await store.claimTransaction(transactionKey, now());
        if (!transaction || !live(transaction, now()) || transaction.state !== params.get("state")) return clear(denied());
        const identity = await adapter.exchange({ callbackUrl, state: transaction.state, nonce: transaction.nonce, codeVerifier: transaction.codeVerifier });
        const current = now();
        // Logout, a second login, or expiry can invalidate a claimed transaction while exchange awaits.
        if (identity.issuer !== expectedIssuer || identity.subject !== ownerSubject || identity.emailVerified !== true || !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= current) return clear(denied());
        const previous = readCookie(request, sessionName);
        const id = opaque(), expiresAt = Math.min(current + ttl, identity.expiresAt);
        if (!await store.completeLogin(transactionKey, hash(id), { issuer: identity.issuer, subject: identity.subject, createdAt: current, expiresAt }, previous, current)) return clear(denied());
        const response = clear(new Response(null, { status: 303, headers: { ...safeHeaders, location: "/" } }));
        response.headers.append("set-cookie", cookie(sessionName, id, Math.max(1, Math.floor((expiresAt - current) / 1000))));
        return response;
      } catch { return clear(denied()); }
      finally { if (transactionKey) { try { await store.deleteTransaction(transactionKey); } catch { /* Expiry bounds cleanup when storage is unavailable. */ } } }
    },
    session: sessions.session,
    logout: sessions.logout,
    requireOwner: sessions.requireOwner,
  };
}

/** HTTPS-only boundary; explicit storage is mandatory. Never maps local-owner-v1. */
export const createOwnerIdentityGate = (options: OwnerIdentityOptions) => createGate(options, false);
/** Explicit loopback-only synthetic harness factory. Never selected from runtime environment flags. */
export const createAcceptanceOwnerIdentityGate = (options: OwnerIdentityOptions) => createGate(options, true);
