import { createHash } from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { decodeAttestationObject } from "@simplewebauthn/server/helpers";
import { OwnerAuthorizationError } from "./postgres-owner-identity-store.ts";
import { createOwnerSessionBoundary, createOwnerToken, ownerTokenHash, ownerSessionLive, ownerJson, ownerDenied } from "./owner-session.ts";
import { PASSKEY_PATHS, PASSKEY_INTENTS, PASSKEY_CHALLENGE_TTL_MS, PASSKEY_REAUTH_TTL_MS, PASSKEY_MAX_CREDENTIALS, PasskeyDeniedError, PasskeyRateLimitError, PasskeyUnavailableError, type PasskeyStore, type PasskeyCredential, type PasskeyChallenge, type PasskeyRegistrationAuthority } from "./passkey-types.ts";

const algorithms = [-7, -257];
const transports = new Set(["usb", "nfc", "ble", "internal", "hybrid"]);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
async function storage<T>(work: () => T | Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof PasskeyDeniedError || error instanceof PasskeyRateLimitError || error instanceof PasskeyUnavailableError) throw error;
    if (error instanceof OwnerAuthorizationError) throw new PasskeyDeniedError();
    throw new PasskeyUnavailableError();
  }
}
function failure(error: unknown) {
  if (error instanceof PasskeyRateLimitError) return ownerJson({ authenticated: false, error: "identity_rate_limited" }, 429);
  if (error instanceof PasskeyUnavailableError) return ownerJson({ authenticated: false, error: "identity_unavailable" }, 503);
  return ownerDenied();
}
function bytes(value: unknown, maximum: number): Buffer {
  if (typeof value !== "string" || value.length < 1 || value.length > Math.ceil(maximum * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid passkey data");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength > maximum || decoded.toString("base64url") !== value) throw new Error("Invalid passkey encoding");
  return decoded;
}
function credentialList(input: PasskeyCredential[]): PasskeyCredential[] {
  if (!Array.isArray(input) || input.length > PASSKEY_MAX_CREDENTIALS) throw new Error("Invalid credential set");
  const seen = new Set<string>();
  return input.map(value => {
    bytes(value.id, 1024);
    if (seen.has(value.id) || !(value.publicKey instanceof Uint8Array) || value.publicKey.length < 1 || value.publicKey.length > 4096
      || !Number.isInteger(value.counter) || value.counter < 0 || value.counter > 0xffffffff
      || !Array.isArray(value.transports) || value.transports.length > transports.size || value.transports.some(item => !transports.has(item)) || new Set(value.transports).size !== value.transports.length
      || !["singleDevice", "multiDevice"].includes(value.deviceType) || typeof value.backedUp !== "boolean" || (value.deviceType === "singleDevice" && value.backedUp)) throw new Error("Invalid credential");
    seen.add(value.id);
    return { ...value, publicKey: new Uint8Array(value.publicKey), transports: [...value.transports] };
  });
}
async function body(request: Request, maximum = 65_536): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "") || !request.body) throw new Error("Invalid passkey body");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new Error("Passkey body too large");
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let timer: ReturnType<typeof setTimeout> | undefined, size = 0, text = "";
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Passkey body deadline")), 5000); });
  try {
    for (let count = 0; count < 256; count++) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) { const value: unknown = JSON.parse(text + decoder.decode()); if (!record(value)) throw new Error("Invalid passkey body"); return value; }
      size += chunk.value.byteLength;
      if (size > maximum) throw new Error("Passkey body too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    throw new Error("Fragmented passkey body");
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function responseShape(value: Record<string, unknown>) {
  if (Object.keys(value).some(key => !["id", "rawId", "type", "response", "clientExtensionResults", "authenticatorAttachment"].includes(key))
    || value.type !== "public-key" || value.rawId !== value.id || !record(value.response) || !record(value.clientExtensionResults)) throw new Error("Invalid passkey response");
  bytes(value.id, 1024);
  const clientData: unknown = JSON.parse(bytes(value.response.clientDataJSON, 8192).toString("utf8"));
  // No cross-origin/embed or related-origin opt-in. Only the configured exact site.
  if (!record(clientData) || (clientData.crossOrigin !== undefined && clientData.crossOrigin !== false) || "topOrigin" in clientData) throw new Error("Cross-origin passkey denied");
}

/** Self-contained owner authentication. No OAuth adapter, password, remote metadata
 * service, first-visitor enrollment, automatic account creation, or recovery route.
 * The caller must supply the durable owner-bound store; no production memory fallback.
 */
export function createOwnerPasskeyGate(options: { origin: string; ownerSubject: string; store: PasskeyStore; clock?: () => number; sessionTtlMs?: number }) {
  const origin = options.origin, ownerSubject = options.ownerSubject, store = options.store;
  const sessions = createOwnerSessionBoundary({ origin, issuer: origin, ownerSubject, store, clock: options.clock });
  if (ownerSubject === "local-owner-v1" || [store.beginAuthentication, store.beginRegistration, store.claimChallenge, store.deleteChallenge, store.completeAuthentication, store.completeRegistration].some(method => typeof method !== "function")) throw new Error("Invalid passkey store binding");
  const rpID = new URL(origin).hostname;
  const ttl = options.sessionTtlMs ?? 30 * 60_000;
  if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 8 * 60 * 60_000) throw new Error("Invalid session duration");
  const userID = createHash("sha256").update(JSON.stringify(["asha.passkey.owner.v1", origin, ownerSubject])).digest();
  const { now, clear, cookie, sessionName, transactionName, readCookie } = sessions;
  const clearPending = (response: Response) => { response.headers.append("set-cookie", cookie(transactionName, "", 0)); return response; };
  const pendingResponse = (value: object, id: string, clearSession = false) => { const response = clearSession ? clear(ownerJson(value)) : ownerJson(value); response.headers.append("set-cookie", cookie(transactionName, id, PASSKEY_CHALLENGE_TTL_MS / 1000)); return response; };
  function validateClaim(value: PasskeyChallenge | null, purpose: PasskeyChallenge["purpose"]): PasskeyChallenge {
    if (!value || value.purpose !== purpose || value.claimed !== true || !Number.isSafeInteger(value.ownerRevision) || value.ownerRevision < 0
      || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.expiresAt) || !ownerSessionLive(value, now()) || value.expiresAt - value.createdAt > PASSKEY_CHALLENGE_TTL_MS) throw new Error("Passkey challenge unavailable");
    if (bytes(value.challenge, 32).byteLength !== 32) throw new Error("Invalid passkey challenge");
    return { ...value, credentials: credentialList(value.credentials) };
  }
  async function cleanPending(key: string | null) { if (key) { try { await store.deleteChallenge(key); } catch { /* Database expiry bounds cleanup; never log credentials. */ } } }
  return {
    session: sessions.session,
    logout: sessions.logout,
    requireOwner: sessions.requireOwner,
    async authenticationOptions(request: Request): Promise<Response> {
      try {
        if (!await sessions.validPost(request, PASSKEY_PATHS.authenticationOptions, PASSKEY_INTENTS.authenticate)) return ownerDenied(403);
        await storage(() => sessions.revokeBrowser(request));
        const id = createOwnerToken();
        const generated = await generateAuthenticationOptions({ rpID, userVerification: "required", timeout: 60_000 });
        const begun = await storage(() => store.beginAuthentication({ key: ownerTokenHash(id), challenge: generated.challenge, now: now() }));
        const credentials = credentialList(begun.credentials);
        if (!credentials.length) { await cleanPending(ownerTokenHash(id)); return clear(ownerDenied()); }
        generated.allowCredentials = credentials.map(value => ({ id: value.id, type: "public-key", transports: value.transports }));
        return pendingResponse({ options: generated }, id, true);
      } catch (error) { return clear(failure(error)); }
    },
    async verifyAuthentication(request: Request): Promise<Response> {
      let key: string | null = null, ownsCleanup = false;
      try {
        if (!sessions.validMutation(request, PASSKEY_PATHS.authenticationVerify, PASSKEY_INTENTS.authenticate)) return ownerDenied(403);
        key = readCookie(request, transactionName);
        if (!key) return clear(ownerDenied());
        ownsCleanup = true;
        const value = await body(request); responseShape(value);
        ownsCleanup = false;
        const claimedValue = await storage(() => store.claimChallenge(key!, "authentication", now()));
        ownsCleanup = claimedValue !== null;
        const claimed = validateClaim(claimedValue, "authentication");
        const credential = claimed.credentials.find(item => item.id === value.id);
        if (!credential) return clear(ownerDenied());
        const response = value as unknown as AuthenticationResponseJSON;
        if (response.response.userHandle !== undefined && response.response.userHandle !== null && response.response.userHandle !== userID.toString("base64url")) return clear(ownerDenied());
        const verified = await verifyAuthenticationResponse({ response, expectedChallenge: claimed.challenge, expectedOrigin: origin, expectedRPID: rpID, credential: { ...credential, publicKey: new Uint8Array(credential.publicKey) }, requireUserVerification: true });
        if (!verified.verified || !verified.authenticationInfo.userVerified || verified.authenticationInfo.credentialID !== credential.id || verified.authenticationInfo.origin !== origin || verified.authenticationInfo.rpID !== rpID) return clear(ownerDenied());
        const current = now(), id = createOwnerToken(), expiresAt = current + ttl;
        if (!await storage(() => store.completeAuthentication({ challengeKey: key!, credentialId: credential.id, expectedCounter: credential.counter, newCounter: verified.authenticationInfo.newCounter, sessionKey: ownerTokenHash(id), session: { issuer: origin, subject: ownerSubject, createdAt: current, expiresAt }, previousSessionKey: readCookie(request, sessionName), now: current }))) return clear(ownerDenied());
        const result = clear(ownerJson({ authenticated: true, subject: ownerSubject, expiresAt }));
        result.headers.append("set-cookie", cookie(sessionName, id, Math.max(1, Math.floor(ttl / 1000))));
        return result;
      } catch (error) { return clear(failure(error)); }
      finally { if (ownsCleanup) await cleanPending(key); }
    },
    async registrationOptions(request: Request): Promise<Response> {
      try {
        if (!sessions.validMutation(request, PASSKEY_PATHS.registrationOptions, PASSKEY_INTENTS.register)) return ownerDenied(403);
        const value = await body(request, 1024);
        if (Object.keys(value).some(key => key !== "bootstrapToken")) return ownerDenied(403);
        let authority: PasskeyRegistrationAuthority;
        if ("bootstrapToken" in value) {
          if (bytes(value.bootstrapToken, 32).byteLength !== 32) return ownerDenied(403);
          authority = { kind: "bootstrap", grantHash: ownerTokenHash(value.bootstrapToken as string) };
        } else {
          const owner = await sessions.ownerSession(request);
          if (!owner || now() - owner.value.createdAt > PASSKEY_REAUTH_TTL_MS) return ownerDenied();
          authority = { kind: "session", sessionHash: owner.key };
        }
        await storage(() => store.revokeBrowser(null, readCookie(request, transactionName)));
        const id = createOwnerToken();
        const generated = await generateRegistrationOptions({ rpName: "Gold Silver", rpID, userName: "owner", userDisplayName: "مالک", userID, timeout: 60_000, attestationType: "none", supportedAlgorithmIDs: algorithms, authenticatorSelection: { residentKey: "required", userVerification: "required" } });
        const begun = await storage(() => store.beginRegistration({ key: ownerTokenHash(id), challenge: generated.challenge, authority, now: now() }));
        generated.excludeCredentials = credentialList(begun.credentials).map(value => ({ id: value.id, type: "public-key", transports: value.transports }));
        return pendingResponse({ options: generated }, id);
      } catch (error) { return clearPending(failure(error)); }
    },
    async verifyRegistration(request: Request): Promise<Response> {
      let key: string | null = null, ownsCleanup = false;
      try {
        if (!sessions.validMutation(request, PASSKEY_PATHS.registrationVerify, PASSKEY_INTENTS.register)) return ownerDenied(403);
        key = readCookie(request, transactionName);
        if (!key) return clearPending(ownerDenied());
        ownsCleanup = true;
        const value = await body(request); responseShape(value);
        ownsCleanup = false;
        const claimedValue = await storage(() => store.claimChallenge(key!, "registration", now()));
        ownsCleanup = claimedValue !== null;
        const claimed = validateClaim(claimedValue, "registration");
        const response = value as unknown as RegistrationResponseJSON;
        // Honor our none-only request. No certificates, trust metadata, CRLs or
        // network-capable attestation formats enter the library verifier.
        const attestation = decodeAttestationObject(new Uint8Array(bytes(response.response.attestationObject, 32_768)));
        if (attestation.get("fmt") !== "none" || attestation.get("attStmt").size !== 0) return clearPending(ownerDenied());
        const verified = await verifyRegistrationResponse({ response, expectedChallenge: claimed.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserPresence: true, requireUserVerification: true, supportedAlgorithmIDs: algorithms });
        if (!verified.verified || !verified.registrationInfo.userVerified || verified.registrationInfo.origin !== origin || verified.registrationInfo.rpID !== rpID) return clearPending(ownerDenied());
        const info = verified.registrationInfo;
        // The raw attested ID, not merely the browser's id/rawId pair, must agree.
        if (info.credential.id !== response.id) return clearPending(ownerDenied());
        // Library transports are strings; credentialList validates our finite set.
        const credential = credentialList([{ ...info.credential, publicKey: new Uint8Array(info.credential.publicKey), transports: (info.credential.transports ?? []) as PasskeyCredential["transports"], deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp }])[0];
        if (!await storage(() => store.completeRegistration({ challengeKey: key!, credential, now: now() }))) return clearPending(ownerDenied());
        return clearPending(ownerJson({ registered: true }));
      } catch (error) { return clearPending(failure(error)); }
      finally { if (ownsCleanup) await cleanPending(key); }
    },
  };
}
