# Private identity preparation — bounded local acceptance

Reviewed 2026-09-17, Asia/Tehran. Branch: `codex/phase-2-decision-engine`.
Status: **isolated login boundary tested; real Google login and hosted access blocked**.

## Scope and preservation

The owner's last message ended mid-sentence after the replacement-key approval
condition. This unit preserves that gate: no replacement client/key, real account
login, Google credential inspection, server change or private transfer occurred.
Completed terms/branding and deletion were not repeated. The exposed client must
never be restored. The [incident record](GOOGLE_IDENTITY_SETUP_2026-09-17.md) remains
the source for containment, not a credential source.

Before edits, `.cache/checkpoints/private-identity-20260917T165336/` received a
verified complete Git bundle and hash-verified copies of the four previously
uncommitted incident/status documents. Those documents were preserved and reviewed.
The unified purchase UI, its PostgreSQL identity/data, price runtime, financial
methods, financial-use lock, `main` and server configuration were not changed.

## Implemented boundary

- `apps/web/auth/owner-identity.ts`: server-owned opaque, hashed session handles;
  verified issuer plus explicit owner subject, not email or caller-supplied headers;
  state/nonce/PKCE, one-use login transactions, absolute expiry and logout revocation.
  Production factory requires HTTPS and Secure/HttpOnly/SameSite `__Host-` cookies.
  Mutations require exact origin, same-origin request metadata and an intent header.
  Requests, temporary stores and reads are bounded; failures do not expose provider
  errors. Protected responses are rechecked after awaited work.
- `apps/web/auth/google-identity-adapter.ts`: maintained OIDC implementation with
  explicit RS256 signature verification, fixed official Google endpoints and
  `openid email` only. Redirected/unexpected provider destinations, oversized
  responses and invalid identity claims are rejected. It has no credential loader,
  automatic environment activation, userinfo call or token persistence.
- Separate explicit acceptance factories use loopback plus a synthetic provider;
  they cannot be selected by a production environment flag. Existing local-owner
  routes and the public product router do **not** import or activate this boundary.

The memory session store is single-process preparation, not production persistence.
A restart invalidates sessions. `requireOwner` blocks publication of a late private
response; it cannot roll back an already committed write. Future database wiring
must use transaction/version/owner authorization at the actual commit boundary.
The harness rechecks after reading its request body and before its synchronous
memory-only mutation. Durable multi-worker sessions, rate limiting, verified-owner
bootstrap, database authorization/RLS integration and private runtime deployment
remain required before exposing a real portfolio.

## Safe retention gate

The new metadata-only fixed-path checker is documented in
[private credential retention](../09-operations/GOOGLE_CREDENTIAL_STORAGE.md).
Actual Windows check: ignored/untracked destination, private empty leaf and no
reparse path; **blocked** because ancestor mutation permissions are unsuitable.
No credential was read or written, no existing ACL was modified and `--prepare`
was not run. Native restrictive directory creation is code-reviewed but untested.

Permission was requested to prepare only
`C:\Users\pc\.asha-private\google-owner-login` outside the workspace. No approval
was received during this unit, so that path was not created and is not supported
by the current fixed-path helper. A harmless-file direct Save As check must still
prove no staging in Downloads before any replacement is generated. Browser tools
have not demonstrated secure destination selection; use the owner's manual step,
not a clipboard/custom secret-capture workaround. This is a concrete blocker,
not permission to weaken workspace/download permissions.

## Tests and independent review

Three real specialist agents and the coordinator worked with disjoint files:
architecture implemented identity and signed-provider tests; security implemented
retention preflight and independently reviewed identity; data/QA independently
reviewed retention and tested coordinator integration. Findings led to bounded
empty-body/stream handling, protected-write CSRF checks, and correction of malformed
input being incorrectly reported as expired login. The browser form uses a
same-origin single-flight fetch submission after native form navigation did not
complete in the available browser; the ordinary redirect fallback remains tested.

Local evidence:

- Production build passed. Typecheck and lint passed.
- Final web suite: **497 passed**, no failures; line/branch/function coverage
  **95.94% / 90.29% / 95.92%**, above existing gates. Auth is now in coverage scope.
- New tests: 12 signed-OIDC/session tests with adversarial subcases, 14 storage
  policy/preflight tests, 22 isolated route/script regressions. Signature, issuer,
  audience, nonce/state/PKCE, expiry, replay, wrong owner, unverified email, spoofed
  headers, CSRF, concurrency, logout during awaited work, malformed/oversized/stalled
  input, restart, XSS-as-data and no-access-to-real-routes are covered.
- Actual browser at `http://127.0.0.1:4175/`: owner allowed; non-owner/cancel denied;
  synthetic note save and reload; logout across two tabs; re-login returns that
  note in the same server run; forced expiry returns to login; stopping this test
  server hides private content on failed session check. Restart gives a new,
  empty test store and requires fresh login.
- Browser acceptance used the available in-app browser. Chrome/Edge/Firefox,
  mobile, actual Google login, real account data, HTTPS deployment, device sync
  and real owner-RLS wiring are **not tested by this harness**.
- No new actual market request, server probe/change or owner-database operation
  was performed. Existing database and Python regression suites are also checked
  by the three GitHub jobs on the delivery commit; their exact result must be
  read from that commit's checks, not inferred from earlier successful runs.

Non-sensitive local evidence: `.cache/private-login-full-test.log` (build and first
493-test pass), `.cache/private-login-final-coverage.log` (final 497-test pass).
Publication authority remains the working branch only. The delivery commit's
GitHub checks are the exact-SHA CI record; local pass is not a substitute for CI.

## Dependency rationale and evidence

`openid-client` **6.8.8**, MIT, is pinned with integrity in the npm lockfile for
this approved OIDC preparation. Reimplementing JWT/OIDC cryptography was rejected.
Transitives are locked `jose` 6.2.12 and `oauth4webapi` 3.8.8 (MIT). No unrelated
locked version or platform metadata was intentionally changed. Reviewed 2026-09-17:

- [Official npm package](https://www.npmjs.com/package/openid-client) and
  [tagged manifest](https://raw.githubusercontent.com/panva/openid-client/v6.8.8/package.json):
  release 2026-09-05, Node 20+ / ESM / Fetch / WebCrypto; compatible with CI Node22.
- [Maintainer security policy](https://github.com/panva/openid-client/security):
  v6 supported; absence of published advisories is not a security guarantee.
- [Explicit signature-check documentation](https://raw.githubusercontent.com/panva/openid-client/v6.8.8/docs/functions/enableNonRepudiationChecks.md):
  `enableNonRepudiationChecks` is explicitly enabled and bad-signature rejection
  is tested, rather than relying solely on token-endpoint TLS.
- [Google public OIDC metadata](https://accounts.google.com/.well-known/openid-configuration)
  and [official server flow](https://developers.google.com/identity/openid-connect/openid-connect)
  support the fixed endpoints, RS256, S256 and issuer response validation.

Fresh production audit: **0 vulnerabilities**. Full tree remains **11 development
findings (5 high, 6 moderate)**, matching the registered existing findings; none is
in the added OIDC dependency chain. See [KNOWN_ISSUES item 8](KNOWN_ISSUES.md).
Registry provenance metadata was observed, not independently cryptographically
verified. The broader project-license decision remains owner-critical.

## Owner test and next step

From `apps/web`, `npm run identity:acceptance` starts only the synthetic login
test at `http://127.0.0.1:4175/`. Choose **آزمایش ورود**, then **مالک آزمایشی**;
save an invented note, reload, exit and try **کاربر غیرمجاز**. Do not enter personal
data: the note is deliberately memory-only and disappears on test-server restart.
This URL is not the portfolio, Google sign-in or an independent public domain.

Next: obtain the exact private-folder approval, verify its complete path and safe
direct download handling, then obtain replacement-client action-time authorization.
Never reuse the exposed client. Only after separate credential/account/server
authority and the remaining private-runtime controls can actual Google, owner data
and cross-device acceptance be connected. This unit is not project completion or
owner acceptance.
