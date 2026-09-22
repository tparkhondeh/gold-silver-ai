# Private owner activation — September 22, 2026

## Authority and scope

The owner explicitly authorized exactly one five-minute, single-use bootstrap
grant and direct delivery to the already approved project-specific profile path:
`C:\Users\pc\.goldsilver-private\passkey-owner-login\bootstrap-grant.txt`.
The missing separator in the pasted path is the previously resolved formatting
error, not authorization to create a different Windows profile directory.
Existing files and shared ACLs must not change. No provider key or personal
portfolio transfer, Google retry, account reset or financial-method change.

The owner must enter the code and complete device confirmation themselves;
registration does not establish a session. An expired or ambiguous attempt is
not permission to issue another grant. Never put the code in tool output, chat,
screenshots, URLs, logs, Git, Downloads or an intermediate file.

## Fresh evidence before handoff

- Working branch and freshly checked remote: `0821dea58e12997cf8b10fde29cdf1a93a1b8946`,
  clean at start. `main` remains `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
- Recoverable full Git bundle verified under ignored
  `.cache/checkpoints/passkey-owner-activation-20260922/repository.bundle`.
- Valid public HTTPS health identifies deployed code
  `51e0791b94416f8c85c0e6d01ab4c1ee2013ffed`; no-store is preserved.
  SSH confirms that exact release, working branch and clean server checkout.
- Private server directories remain owner1056/mode0700. Available space8.45GiB;
  no new full release or deletion was needed for this local handoff preparation.
- Retained backup verification checks the dump hash and matching receipts:
  verified `2026-09-21T23:47:03.205Z`, all25persistent tables, no restored
  authorization data. This is fresh scheduled-backup evidence; off-host recovery
  remains untested, not implied by a same-host copy.
- The actual HTTPS browser displays the private login and expanded first-key
  form with an empty code field. Only the in-app browser is connected to the
  automation tools; Chrome/Edge/mobile and genuine device confirmation are not
  claimed tested.

## Handoff gate

STATUS: pre-issuance preparation; actual owner interaction remains pending.
The separate Windows helper implements fixed-path Check/Prepare and a distinct
one-shot issue/delivery operation. Check/Prepare must not issue a grant. Actual delivery
must be exclusive, directly into the protected final file, pinned to the existing
SSH host and retain a nonsecret one-attempt marker. Failed or ambiguous artifacts
are preserved; never retry blindly or overwrite the destination.

The first real preflight stopped before any network/secret operation because the
existing parent has an extra explicit read/list/execute-only entry. Metadata
showed no foreign write/create/delete/ACL/owner rights. The new handoff-only parent
predicate permits that harmless listing without changing any parent ACL, while
requiring protected current ownership and current/SYSTEM full control. The new
leaf and both files still require protected exact owner/SYSTEM-only ACLs at atomic
creation, with no inherited parent entry. Original Google checks are unchanged.
Fresh real Check reported a safe path and absent leaf/grant/attempt. After review,
actual Prepare created only the protected passkey leaf and rechecked it: ready,
pathSafe=true, directoryPresent=true, attemptPresent=false, grantPresent=false,
networkUsed=false. No shared ACL changed and no secret was issued by preparation.

Security/storage implemented the helper; architecture/QA independently reviewed
both secret isolation and the existing browser/server ceremonies. Review fixed
literal remote-path validation and waiting for the private pipe write before
zeroing its buffer. All31 focused Windows tests passed (11handoff plus20existing
identity-storage regressions), including25 adversarial parent-ACL assertions and
native proof that a protected child does not inherit the parent's read entry.
Architecture/QA independently reran all11handoff tests. Root's complete lint and
typecheck, final changed-file lint and diff checks passed. Exact-commit CI is the
remaining gate before real issuance; no product redeployment is needed for this
local-only operator helper.

Follow [the acceptance guide](../09-operations/PRIVATE_OWNER_ACCEPTANCE.md) after
actual owner login. Authenticated purchases/Excel/save/reload/logout and second
device retention remain untested. Do not advise entering the only copy of real
portfolio information until those acceptance checks and recovery limitations
have been explained. Hosted prices remain unavailable; no price may be invented.

This checkpoint supplements, rather than repeats, the unchanged protocol,
deployment and CI evidence in [September21 delivery](PRIVATE_PASSKEY_DELIVERY_2026-09-21.md).
