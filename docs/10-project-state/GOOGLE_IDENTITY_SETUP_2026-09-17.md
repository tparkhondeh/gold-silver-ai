# Google identity preparation and credential incident

Recorded: 2026-09-17, Asia/Tehran; incident recorded at 16:34 local time.
Status: **exposed unused OAuth client deleted; real replacement/login absent**.
Subsequent local-only preparation is recorded separately in the
[private identity review](PRIVATE_IDENTITY_REVIEW_2026-09-17.md); it does not reverse
this incident or establish a safe replacement credential.

## Verified preparation

- The owner personally completed the Google terms/branding step. The original
  **Gold Silver AI** project displayed `OAuth configuration created!`.
- After a specific action-time request, the owner authorized creation of one web
  OAuth client and secure local-only credential retention. This did not authorize
  private-key/portfolio transfer to the server, billing, Gmail/Drive access or
  production login activation.
- Google displayed `OAuth client created` for **Gold Silver AI owner login**.
  Its sole registered redirect is
  `https://goldsilver.wealthos.ir/auth/google/callback`, with no JavaScript origins.
  This is a future hosted callback contract, **not an implemented endpoint**.
  No localhost redirect was added; development/production credentials must remain
  separate. Intended future sign-in scope is `openid email`, not API data access.

## Incident and containment

During UI inspection, the coordinator emitted a copy-button accessibility label
that contained the newly-created client secret. Removing only `Value:` fields was
insufficient: accessible names can themselves contain credentials. The owner was
notified immediately. Treat the credential as compromised; do not reuse, test,
download, store or transfer it. No secret value or client identifier is recorded
in this document.

The official JSON download was **not** clicked. No credential file exists in the
prepared private local directory; no portfolio/key was sent to a server or Git.
No Google account authorization-code exchange, application login, production
configuration, billing or financial operation occurred. The exposure observed is
the task's tool output, not proof of account or portfolio compromise. Do not claim
that absence of observed misuse makes the credential safe.

The client details page exposed `Delete`; no reversible disable control was found
in the inspected page. The owner then explicitly authorized deletion of only this
new unused client. On 2026-09-17, before the 16:39 local checkpoint, the coordinator
confirmed `Delete credential` and the final Delete action. The returned Clients
page showed an empty active-client list and no target client. This is provider-UI
deletion evidence; no token exchange or attempt to reuse the exposed secret was
made. The dialog indicated a 30-day recovery window: **never restore this exposed
client**. No Google project, Google account or portfolio was deleted; no replacement
client was created. Closing a dialog, adding a new secret or removing a log would
not by itself establish revocation of the old secret.

## Local-storage verification and process correction

The empty ignored directory `.cache/identity/google-owner-login` was prepared and
independently checked by the security/storage specialist: no reparse path,
protected DACL, exactly owner and SYSTEM with FullControl, no inherited or other
allow rules. The intended `credentials.json` does not exist. No existing file,
directory ACL outside this new target, portfolio row or browser draft was changed.

The normal Downloads directory grants an additional local group read access;
therefore staging a credential there and moving it later is not accepted as
private-only storage. Direct private Save As (or a separately reviewed equivalent)
must be verified **before** generating a replacement. Do not alter broad folder
permissions or treat a same-volume move as a DACL reset.

Never emit a whole secret-bearing DOM/accessibility snapshot, screenshot, copied
value or downloadable payload. Use fixed-label boolean/control checks; credential
labels are not safe metadata. Avoid retaining raw snapshots after inspection.
The security specialist independently reviewed containment and folder permissions.
No product-code change or new runtime/CI acceptance claim is implied by this
credential-only checkpoint. Non-secret local documents are updated; publication
and new exact-SHA CI have not been performed for this documentation-only follow-up.

Reference: [Google's official OpenID Connect server-flow guide](https://developers.google.com/identity/openid-connect/openid-connect),
reviewed 2026-09-17. The provider guide is implementation guidance, not proof of
regional eligibility, owner-only authorization or successful hosted deployment.

## Next exact action

1. Containment is complete at the provider UI level: the unused client is deleted
   and the active-client list is empty. Do not repeat deletion or restore it.
2. Verify a safe direct local retention method before any replacement creation,
   with the required specific action-time credential authorization.
   Subsequent full-path inspection found unsafe ancestor permissions despite the
   private leaf. Follow the [retention gate](../09-operations/GOOGLE_CREDENTIAL_STORAGE.md),
   not the leaf-only check above, for current readiness.
3. Continue server-verified identity/session, owner allowlist and anonymous/non-owner
   denial with synthetic tests. Real secrets/rows remain off the server until
   separately authorized. Preserve the financial lock and existing local identity.
4. Update this evidence and linked status; publish only reviewed non-secret docs
   and verify exact-SHA CI as required. Do not repeat the completed terms handoff.
