// Synthetic authenticators only. No platform credential, account or external service.
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { createOwnerPasskeyGate } from "../../auth/passkey-identity.ts";
import { PASSKEY_PATHS as paths, PASSKEY_INTENTS as intents, PasskeyDeniedError } from "../../auth/passkey-types.ts";

export { paths, intents };
export const origin = "https://portfolio.invalid", subject = "synthetic-passkey-owner";
export const hash = value => createHash("sha256").update(value).digest("base64url");
export const ownerHandle = createHash("sha256").update(JSON.stringify(["asha.passkey.owner.v1", origin, subject])).digest("base64url");
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const live = (value, now) => value && value.createdAt <= now && now < value.expiresAt;
const cloneCredential = value => ({ ...value, publicKey: new Uint8Array(value.publicKey), transports: [...value.transports] });
export function authenticator() {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = keys.publicKey.export({ format: "jwk" }), id = randomBytes(32).toString("base64url");
  const publicKey = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, "base64url"))], [-3, new Uint8Array(Buffer.from(jwk.y, "base64url"))]]));
  const authData = (flags, count, rpID = "portfolio.invalid") => { const counter = Buffer.alloc(4); counter.writeUInt32BE(count); return Buffer.concat([createHash("sha256").update(rpID).digest(), Buffer.from([flags]), counter]); };
  return {
    id, keys, credential: { id, publicKey, counter: 0, transports: ["internal"], deviceType: "singleDevice", backedUp: false },
    registration(challenge, changes = {}) {
      const clientDataJSON = encode({ type: "webauthn.create", challenge, origin, crossOrigin: false, ...changes.clientData });
      const credentialId = Buffer.from(id, "base64url"), length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
      const data = Buffer.concat([authData(changes.flags ?? 0x45, 0, changes.rpID), Buffer.alloc(16), length, credentialId, Buffer.from(publicKey)]);
      const attestationObject = Buffer.from(isoCBOR.encode(new Map([["fmt", changes.fmt ?? "none"], ["attStmt", changes.attStmt ?? new Map()], ["authData", new Uint8Array(data)]]))).toString("base64url");
      return { id, rawId: id, type: "public-key", response: { clientDataJSON, attestationObject, transports: ["internal"] }, clientExtensionResults: { credProps: { rk: true } } };
    },
    assertion(challenge, changes = {}) {
      const clientDataJSON = encode({ type: "webauthn.get", challenge, origin, crossOrigin: false, ...changes.clientData });
      const data = authData(changes.flags ?? 0x05, changes.counter ?? 1, changes.rpID);
      const signature = sign("sha256", Buffer.concat([data, createHash("sha256").update(Buffer.from(clientDataJSON, "base64url")).digest()]), changes.privateKey ?? keys.privateKey).toString("base64url");
      return { id, rawId: id, type: "public-key", response: { clientDataJSON, authenticatorData: data.toString("base64url"), signature, userHandle: changes.userHandle === undefined ? ownerHandle : changes.userHandle }, clientExtensionResults: {} };
    },
  };
}

export function fixture(options = {}) {
  const state = { now: Date.parse("2026-09-21T10:00:00Z"), revision: 0, hook: null, ...options.state };
  const credentials = new Map(), challenges = new Map(), sessions = new Map(), grants = new Map();
  const validChallenge = key => { const value = challenges.get(key); return live(value, state.now) && value.ownerRevision === state.revision ? value : null; };
  const validSession = key => { const value = sessions.get(key); return live(value, state.now) ? value : null; };
  const freshSession = key => { const value = validSession(key); return value && state.now - value.createdAt <= 300_000; };
  const put = (input, purpose, extra = {}) => {
    if (challenges.has(input.key)) throw Error("Duplicate synthetic challenge");
    challenges.set(input.key, { purpose, challenge: input.challenge, ownerRevision: state.revision, createdAt: input.now, expiresAt: input.now + 300_000, claimed: false, ...extra });
    return { credentials: [...credentials.values()].map(cloneCredential) };
  };
  const store = {
    async beginAuthentication(input) { if (!credentials.size) throw new PasskeyDeniedError(); return put(input, "authentication"); },
    async beginRegistration(input) {
      if (input.authority.kind === "bootstrap") {
        const grant = grants.get(input.authority.grantHash);
        if (!grant || state.now >= grant.expiresAt || grant.revision !== state.revision || credentials.size) throw new PasskeyDeniedError();
        grants.delete(input.authority.grantHash);
        return put(input, "registration", { authority: input.authority, grantExpiresAt: grant.expiresAt });
      }
      if (!freshSession(input.authority.sessionHash)) throw new PasskeyDeniedError();
      return put(input, "registration", { authority: input.authority });
    },
    async claimChallenge(key, purpose) {
      const value = validChallenge(key);
      if (!value || value.claimed || value.purpose !== purpose) return null;
      value.claimed = true;
      return { ...value, credentials: [...credentials.values()].map(cloneCredential) };
    },
    async deleteChallenge(key) { challenges.delete(key); },
    async getSession(key) { const value = validSession(key); return value ? { issuer: value.issuer, subject: value.subject, createdAt: value.createdAt, expiresAt: value.expiresAt } : null; },
    async revokeBrowser(sessionKey, challengeKey) {
      if (challengeKey) challenges.delete(challengeKey);
      for (const [key, value] of sessions) if (key === sessionKey || value.loginTransactionHash === challengeKey) sessions.delete(key);
    },
    async completeAuthentication(input) {
      if (state.hook) await state.hook("authentication");
      const challenge = validChallenge(input.challengeKey), credential = credentials.get(input.credentialId);
      if (!challenge?.claimed || challenge.purpose !== "authentication" || !credential || credential.counter !== input.expectedCounter || !live(input.session, state.now)) return false;
      credential.counter = input.newCounter;
      if (input.previousSessionKey) sessions.delete(input.previousSessionKey);
      sessions.set(input.sessionKey, { ...input.session, loginTransactionHash: input.challengeKey });
      challenges.delete(input.challengeKey); return true;
    },
    async completeRegistration(input) {
      if (state.hook) await state.hook("registration");
      const challenge = validChallenge(input.challengeKey);
      if (!challenge?.claimed || challenge.purpose !== "registration" || credentials.has(input.credential.id) || credentials.size >= 10) return false;
      if (challenge.authority.kind === "session" ? !freshSession(challenge.authority.sessionHash) : state.now >= challenge.grantExpiresAt) return false;
      credentials.set(input.credential.id, cloneCredential(input.credential)); challenges.delete(input.challengeKey); return true;
    },
  };
  const gate = createOwnerPasskeyGate({ origin, ownerSubject: subject, store, clock: () => state.now, ...options.gate });
  return { gate, store, state, credentials, challenges, sessions, grants,
    grant() { const token = randomBytes(32).toString("base64url"); grants.set(hash(token), { revision: state.revision, expiresAt: state.now + 300_000 }); return token; },
    reset() { state.revision++; credentials.clear(); challenges.clear(); sessions.clear(); grants.clear(); },
  };
}
export function request(path, { cookie, json, method = "POST", intent, base = origin, headers = {}, body } = {}) {
  const usedIntent = intent ?? (path.includes("registration") ? intents.register : path === "/auth/logout" ? "owner-logout" : intents.authenticate);
  return new Request(base + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(method === "POST" ? { origin: base, "sec-fetch-site": "same-origin", "x-asha-intent": usedIntent } : {}), ...(json === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(json === undefined ? body === undefined ? {} : { body, duplex: "half" } : { body: JSON.stringify(json) }) });
}
export function cookieFrom(response, name = "__Host-asha-login") { return response.headers.getSetCookie().find(value => value.startsWith(name + "=") && !value.includes("Max-Age=0"))?.split(";")[0]; }
export async function beginAuthentication(f, cookie) {
  const response = await f.gate.authenticationOptions(request(paths.authenticationOptions, { cookie }));
  return { response, cookie: cookieFrom(response), options: (await response.json()).options };
}
export async function authenticate(f, key, changes = {}, cookie) {
  const start = await beginAuthentication(f, cookie);
  if (!start.options) return start;
  const value = key.assertion(start.options.challenge, changes);
  const response = await f.gate.verifyAuthentication(request(paths.authenticationVerify, { cookie: start.cookie, json: value }));
  return { response, cookie: cookieFrom(response, "__Host-asha-owner"), start, value };
}
