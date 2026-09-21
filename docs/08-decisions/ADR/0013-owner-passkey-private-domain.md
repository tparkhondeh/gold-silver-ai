# 0013. Owner-bound passkey for the private domain

Status: Accepted for technical implementation under explicit owner delegation
Date: 2026-09-21

## Context and authority

The owner explicitly made Google optional and authorized selecting/implementing
a secure independent login without a paid service. Actual sensitive enrollment,
private-key/data transfer and owner acceptance remain separate gates. Official
Google console access was blocked in multiple clients; no bypass is proposed.
This supersedes ADR 0012's mandatory Google-provider choice, not its privacy,
owner-only, least-privilege or activation boundaries. Historical ADRs are retained.

## Options and decision

| Option | Useful properties | Limitation in this task |
|---|---|---|
| Wait for Google OIDC | Existing reviewed adapter | Unresolved external access; not a product requirement |
| Local password plus TOTP | Familiar credentials, no new vendor | Adds password/KDF, shared OTP secret and phishing/reset surface |
| Owner-bound WebAuthn/passkey | RP/origin-bound signatures; private key stays with authenticator; no identity-provider secret on server | Compatible device/user verification and deliberate recovery enrollment required |

Choose the third option with required user verification and user presence, exact
HTTPS origin/RP ID, no attestation tracking and no automatic/conditional enrollment.
Use maintained SimpleWebAuthn, not handwritten WebAuthn signature verification.
Keep existing PostgreSQL, portfolio contract, authorization runner and opaque
server-side sessions. Financial methods and the financial-use lock do not change.

## Required boundaries

- One explicitly configured owner/portfolio binding; no first visitor wins,
  email-only identity, public signup, shared PIN or automatic Google fallback.
- Initial enrollment needs an administrator-approved short-lived one-use grant;
  only its hash reaches storage. Creation/delivery of a real grant is a distinct
  authorized operation, not part of anonymous page loading or migration.
- Registering another passkey requires a fresh verified session, rechecked at
  completion. Keep two independently usable authenticators where practical;
  merely adding a credential does not prove device independence or recovery.
- Verify challenge, signature, exact RP/origin, UV/UP and credential binding.
  Atomically consume ceremonies and recheck owner revision/counter/session under
  transaction locks. Durable admission limits cover restarts/multiple workers.
- Logout/reset must defeat pending-login races. Administrative owner reset
  revokes credentials, ceremonies and sessions, not portfolio information.
- No public email/password recovery endpoint. If all passkeys are lost, recovery
  requires verified owner/admin access and a new explicit grant. A synced passkey
  depends on its authenticator ecosystem; this is not a promise of offline backup.
- Database backup must not resurrect old passkeys, grants or sessions after a
  restore. A restored portfolio remains inaccessible until deliberate reenrollment.

## Dependency and evidence decision

Reviewed September 21: `@simplewebauthn/server` 14.0.2 and
`@simplewebauthn/browser` 14.0.0, both MIT, pinned in manifest/lockfile. Server
requires Node >=20 (project >=22.13). Browser has no runtime dependencies.
Version 14.0.2 is actively maintained and includes a trust-chain security fix;
registration uses `attestation: none`, with no metadata/CRL network dependency.
The library is not a financial calculator. An audit passing is not proof that an
authentication implementation is correct; signed ceremonies, adversarial tests,
independent review and actual owner-device acceptance remain required.

Primary references, all reviewed 2026-09-21:

- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html):
  authenticator, user-verification and recovery considerations; no NIST certification claimed.
- [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html):
  factor replacement and recovery must not bypass the authentication boundary.
- [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server),
  [browser](https://simplewebauthn.dev/docs/packages/browser) and
  [14.0.2 release](https://github.com/MasterKale/SimpleWebAuthn/releases/tag/v14.0.2).

## Consequences

Google configuration/credentials are no longer on the shortest required path.
Passkey compatibility, actual owner enrollment and recovery across intended
devices must still be tested. Implementation or a synthetic signature test is
not a deployed owner account, a completed cross-device test or final acceptance.
Latest execution evidence belongs in CURRENT_STATE's linked checkpoint, not here.
