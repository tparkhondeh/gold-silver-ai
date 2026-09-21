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
Its eventual local filename is `credentials.json`; no secret-bearing UI snapshots,
screenshots, logs or chat. Server key transfer and existing-portfolio migration
remain separately gated. Keep the exposed deleted client deleted. See the
[active credential procedure](../09-operations/GOOGLE_CREDENTIAL_STORAGE.md).

### Replacement authorized; official console access blocked

The owner's subsequent explicit instruction authorizes exactly ONE replacement
Google client for the existing project and local-only credential retention. A
missing path separator in that instruction was queried; the owner delegated the
choice, and the coordinator selected the already prepared/tested destination:

`C:\Users\pc\.goldsilver-private\google-owner-login\credentials.json`

No alternative folder was created. A fresh metadata-only preflight returned
`ready_for_direct_save_as`: all path/ancestor/ACL/Git checks passed, the harmless
probe was safe and single-link, and `credentialPresent` was false. The completed
harmless Save As was not repeated. It does not establish that Google's JSON
download automatically uses the same private destination; establish that before
any real secret generation/download, with only the necessary manual handoff if
the tool cannot guarantee it. Never stage the secret elsewhere.

Fresh read-only access evidence on September 21:

- The official Clients page for existing project `stunning-object-508906-t0`
  returned **403 Forbidden**, including after one intentional reload. A separate
  OS HEAD request without the browser session also returned 403.
- After the owner asked the agent to handle the access check, normal navigation
  to `https://console.cloud.google.com/` also returned 403. The page says the client
  lacks permission to retrieve the URL; it does not establish the precise cause.
  No conclusion about IAM, account eligibility or region is justified by this alone.
- Browser inventory exposes only the in-app browser. The supported attempt to
  open that same official Clients URL in Chrome returned `Browser is not available`.
  No Chrome/Edge success or independent-browser acceptance is claimed. No dedicated
  Google Cloud management connector was available.
- No proxy, alternate Google project, unofficial API, permission change, browser
  session extraction or security bypass was attempted. No secret-bearing page,
  credential contents, new agreement, existing data or server was touched.

**Authorized replacements: one. Created replacements: zero. Local credential:
absent. Real hosted login: not activated.** The previous exposed client remains
deleted; the provider's present client inventory could not be inspected. Do not
create another client blindly when access returns: inspect the nonsecret list first.

Security/storage independently reviewed the bounded evidence and confirmed that
creation must stop at this access block. Existing runtime/identity implementation
and its tests remain unchanged; no substitute authentication system or filler
feature was added. Before these documentation-only changes the three affected
state documents were copied to the ignored checkpoint
`.cache/checkpoints/google-client-preparation-20260921/`.
Baseline `29273a5ead72b57efb762757d6f5825ed8717b39` has all three
[GitHub jobs successful](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/35577362148);
the documentation delivery requires its own exact-SHA check.

Next prerequisite is normal authenticated access to the official console in the
same project, through an available supported browser. The owner has asked to
minimize manual involvement; do not repeat the pending request as if it were
completed, or retry unchanged 403 pages. A manual login/access handoff is necessary
only if the available tools cannot resolve it. Once access changes, recheck storage,
inspect the client list and apply the bounded creation/direct-retention procedure.
Separate server-transfer approval and the previously documented deployment gates
remain outstanding. No background polling or scheduled continuation was created.
