# Isolated Google credential destination — September 21, 2026

This bounded follow-up supersedes credential-path status in the
[September 20 private-domain checkpoint](PRIVATE_DOMAIN_READINESS_2026-09-20.md).
It does not activate login, transfer a key/portfolio, change server state or certify
domain readiness. The prior documented server/runtime gates remain unchanged.

## Owner authority and preservation

The initial September 21 check found no expected harmless probe at the former
destination and a third read-only grant on its shared parent. The protected leaf
remained restricted; no exposure, actor or cause was inferred. Details remain in
the [historical recheck](PRIVATE_DOMAIN_READINESS_2026-09-20.md#september-21-follow-up--supersedes-the-earlier-destination-readiness).

The owner then explicitly approved only creating/securing the NEW destination
`C:\Users\pc\.goldsilver-private\google-owner-login`, without changing the old
folder, creating Google credentials or transferring information. Baseline was
clean working-branch commit `2f50a97bc593ecb24de8cef49182c485f94eed2a`; its three
[GitHub jobs passed](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/35575747428).
Before code edits a complete verified Git bundle was preserved at
`.cache/checkpoints/isolated-google-storage-20260921/repository.bundle`.

## Implemented and executed

- Both fixed-path helpers now select only `.goldsilver-private\google-owner-login`.
  No arbitrary path/CLI/environment override or old-path fallback is allowed.
  The security policy, exact ACL requirements, ancestor/Git/reparse/hardlink checks,
  bounded metadata-only output and native private-at-creation behavior are unchanged.
- Fresh `--check` confirmed safe ancestors and permission to create missing folders;
  absence correctly reported not-ready. After independent review, `--prepare`
  created the two expressly approved directories with owner/SYSTEM-only permissions
  at creation. A separate `--check` returned `ready_for_direct_save_as`.
- All directory, ancestor-mutation and Git-boundary checks passed. At the post-create
  check, both `credentialPresent` and `probePresent` were false. No credential/file
  contents were read, and no existing ACL was rewritten. Old directories and all
  portfolio data remain untouched.
- The harmless loopback attachment at `http://127.0.0.1:4176/save-as-probe.txt`
  was restarted and returned HTTP 200, attachment disposition and 54 bytes.
  It serves fixed invented text, reads no files and accepts no credential uploads.
  It is temporary local support, not a deployed or scheduled service.

## Verification scope

Security/storage implemented the bounded change and 20 targeted tests passed.
Architecture/QA independently reviewed the diff and repeated those 20 tests,
including execution of the shipped PowerShell predicates with synthetic ACLs.
Tests cover both fixed constants, rejected old/new CLI overrides, rejection of a
third read-only grant and existing fail-closed/metadata/creation protections.
The coordinator reviewed the diff and ran the actual metadata/create/recheck
sequence. No financial, UI, database or server code changed; their unchanged
evidence is reused rather than repeating unrelated local acceptance work.
Exact final delivery-SHA GitHub checks are required separately from baseline CI.

## Remaining handoff

### Direct Save As confirmed by owner and checked locally

After the repeated instruction to save directly, the owner reported completion.
A fresh fixed-path `--check` confirmed `probePresent`, `probeMetadataSafe` and
`probeSingleLink` all true; all parent/leaf/ancestor/Git checks also passed.
`credentialPresent` remained false and the checker returned
`ready_for_direct_save_as`. The existing test file was not opened or rewritten.

This closes the harmless direct-save handoff through the owner's confirmation
plus filesystem metadata evidence, NOT through an agent-observed Save As dialog
or a claim that the helper can reconstruct the download route. An attempted
Windows UI action earlier stopped because the tool could not confidently resolve
the browser URL; no file was saved by that attempted automation. No Downloads,
unrelated files, credential contents or secret-bearing UI were inspected.

The exact successfully checked harmless path is:

`C:\Users\pc\.goldsilver-private\google-owner-login\save-as-probe.txt`

Do not ask the owner to repeat this completed harmless test without new failure
evidence. Before any real credential handling, recheck the destination metadata.
Action-time consent for ONE replacement Google login client and local-only
credential retention has now been requested; no approval or creation is inferred
from the harmless-file completion message.
Its eventual local filename is `credentials.json`; no secret-bearing UI snapshots,
screenshots, logs or chat. Server key transfer and existing-portfolio migration
remain separately gated. Keep the exposed deleted client deleted. See the
[active credential procedure](../09-operations/GOOGLE_CREDENTIAL_STORAGE.md).
