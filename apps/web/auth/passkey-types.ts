import type { AuthenticatorTransport } from "@simplewebauthn/server";
import type { OwnerIdentityStore, OwnerSession } from "./owner-identity.ts";

/** Browser-safe protocol constants. No credentials, environment, or Node imports. */
export const PASSKEY_PATHS = Object.freeze({
  authenticationOptions: "/auth/passkey/v1/authentication/options",
  authenticationVerify: "/auth/passkey/v1/authentication/verify",
  registrationOptions: "/auth/passkey/v1/registration/options",
  registrationVerify: "/auth/passkey/v1/registration/verify",
});
export const PASSKEY_INTENTS = Object.freeze({ authenticate: "owner-login", register: "owner-register" });
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60_000;
export const PASSKEY_REAUTH_TTL_MS = 5 * 60_000;
export const PASSKEY_MAX_CREDENTIALS = 10;
export class PasskeyDeniedError extends Error { constructor() { super("Passkey authorization denied"); this.name = "PasskeyDeniedError"; } }
export class PasskeyRateLimitError extends Error { constructor() { super("Passkey attempt limit reached"); this.name = "PasskeyRateLimitError"; } }
export class PasskeyUnavailableError extends Error { constructor() { super("Passkey storage unavailable"); this.name = "PasskeyUnavailableError"; } }

export interface PasskeyCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports: AuthenticatorTransport[];
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
}
export type PasskeyPurpose = "authentication" | "registration";
export type PasskeyRegistrationAuthority = { kind: "bootstrap"; grantHash: string } | { kind: "session"; sessionHash: string };
export interface PasskeyChallenge {
  purpose: PasskeyPurpose;
  challenge: string;
  ownerRevision: number;
  createdAt: number;
  expiresAt: number;
  claimed: true;
  credentials: PasskeyCredential[];
}

/** All operations are bound to one configured owner/origin; no caller-supplied owner.
 * Begin/claim/complete/revoke must be atomic across workers, DB-clock bounded and
 * durably throttled. Completion rechecks challenge, authority, active credential
 * and owner revision, then changes credential/session state in ONE transaction.
 */
export interface PasskeyStore extends Pick<OwnerIdentityStore, "getSession" | "revokeBrowser"> {
  beginAuthentication(input: { key: string; challenge: string; now: number }): Promise<{ credentials: PasskeyCredential[] }>;
  beginRegistration(input: { key: string; challenge: string; authority: PasskeyRegistrationAuthority; now: number }): Promise<{ credentials: PasskeyCredential[] }>;
  claimChallenge(key: string, purpose: PasskeyPurpose, now: number): Promise<PasskeyChallenge | null>;
  deleteChallenge(key: string): Promise<void>;
  completeAuthentication(input: {
    challengeKey: string; credentialId: string; expectedCounter: number; newCounter: number;
    sessionKey: string; session: OwnerSession; previousSessionKey: string | null; now: number;
  }): Promise<boolean>;
  completeRegistration(input: { challengeKey: string; credential: PasskeyCredential; now: number }): Promise<boolean>;
}
