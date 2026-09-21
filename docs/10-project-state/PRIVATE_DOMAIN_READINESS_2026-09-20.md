# Private-domain readiness — 2026-09-20

**Scope:** completed code and verification in this checkpoint, not a deployed or
accepted private service. This supersedes the September 17 implementation/status
claims where they conflict. Financial methods and the financial-use lock are unchanged.

## Starting point and preservation

- Worktree: `C:\Users\pc\Desktop\project\gold silver`, branch
  `codex/phase-2-decision-engine`; initially clean at
  `44c7f094d15890eea2ea0d830daae09a56c1175d`.
- Before edits, a verified recoverable Git bundle was created at
  `.cache/checkpoints/private-domain-20260920T141049/repository.bundle`.
- Existing local portfolio database, three explicitly synthetic purchase lots,
  version 4, browser recovery records and old incident evidence were preserved.
  No owner portfolio was copied to the server. New database migrations were
  exercised in the disposable integration database, not applied to the owner DB.
- Local launcher also completed its existing verified backup/restore check.
  That is not a server backup or off-device disaster-recovery guarantee.
- `main`, server files/services, Google credentials and market-provider access
  were not changed. Google terms/branding are not repeated; the exposed deleted
  client is not restored. New-client creation and key/data transfer retain their
  explicit action-time approval gates.

## Implemented and independently reviewed

1. **Durable owner identity:** PostgreSQL-backed, origin/issuer/owner/portfolio-bound
   login attempts and sessions, atomic callback consumption/revocation, hashed
   browser/session identifiers, forced RLS and a session-authorized portfolio
   transaction. Expiry or revocation cannot be bypassed by a late portfolio write.
2. **Same purchase book, new private boundary:** existing exact validators and
   repository are reused. Private portfolio read/write/export require the owner;
   the browser cannot choose its database subject. Stale-version writes conflict
   instead of overwriting; duplicate purchase validation remains intact.
3. **Browser access shell:** no portfolio workspace before access confirmation;
   logout, 401 and expiry conceal/remove private UI and invalidate late responses.
   Transient offline/visibility checks conceal but retain the mounted draft.
   Unsaved edits are NOT promised across logout, expiry or page reload.
4. **Fail-closed Node runtime:** fixed HTTPS origin and loopback gateway 3012,
   committed-build identity, strict route allowlist, production UI assets/template,
   bounded requests/responses, sanitized errors, no permissive CORS, no local
   operator/history routes. Legacy/provider environment settings are rejected.
   The hosted market route deliberately returns unavailable until separately
   authorized provider configuration exists; local keys are never inherited.
5. **Database readiness and backup:** checks exact migration checksums, columns,
   forced RLS/policies, grants and runtime-role isolation before startup. Backup
   excludes ephemeral login/session DATA; restore verifies those tables are empty.
6. **Private key destination:** the reviewed Windows helper created ONLY the
   approved external directories with restrictive permissions at creation, then
   passed metadata/ancestor/Git-boundary checks. It read no credential contents.

Specialists actually used: architecture/QA (durable identity and real-DB tests),
finance/data (private portfolio contract/readiness), security/storage (private
directory helper, UI race tests and independent integration review). Sensitive
changes received another review; coordinator integrated/runtime-tested the result.

## Evidence and limits

| Check | Actual result | What it does not establish |
|---|---|---|
| Web regression and coverage | 552 tests passed; 96.12% lines, 90.62% branches, 92.09% functions | Real Google login or every browser/device |
| Final focused private API/UI regression | 22 passed, including logout/poll races, expiry and transient draft curtain | User acceptance |
| Real PostgreSQL integration | 29 passed; fresh migrations/RLS, restart/new process, race/expiry rollback, save/conflict/export, dump/restore | Production server DB or off-host backup |
| Private Node build smoke | Actual built root, eight JS/CSS assets and blank XLSX template served; anonymous/legacy routes rejected | Google authentication; this smoke uses a fake identity adapter |
| Lint and TypeScript | Passed | Runtime availability |
| Browser | Available in-app browser: purchase, analysis, backup view, reload/read of same version 4; no portfolio write | Independent Chrome/Firefox/mobile or real cross-device login |
| Chrome tool | Connection unavailable | Must be recorded as untested, not passed |
| Dependency security | Production-only audit zero advisories; full installed graph has 11 existing advisories (5 high, 6 moderate) | Private runtime imports Vinext from devDependencies, so omit-dev audit alone is insufficient |

The full audit includes Cloudflare tooling/sharp, browserslist, fflate and
drizzle-kit/esbuild chains. No dependency versions changed in this checkpoint.
Independent static import tracing covered 97 Vinext production-server modules
and 50 built-server modules: no confirmed startup/request path to those findings
in the current private build. Cloudflare integration is excluded; browserslist is
build/lint tooling; unused OG rendering supplies fflate (XLSX uses zip.js);
drizzle-kit/esbuild is migration tooling, not a served development endpoint.
This is bounded reachability evidence, not a blanket absence-of-vulnerabilities
claim. Freeze and review the actual deployment installation: `npm ci --omit=dev`
would omit required Vinext, while the locked full install retains tooling that
must never be served. Recheck after dependency, feature or build changes.
Do not call the deployment safe solely because the production-only audit passed.
Exact delivery commit and its three GitHub job results must be checked against
GitHub for that SHA; earlier successful runs are not evidence for this delivery.

## Fresh server read-only facts

Observed on September 20, approximately 14:12 Asia/Tehran:

- Certificate-verified public HTTPS returns **503**, also when checked from the
  server. No backend listens on project proxy port 3012.
- SSH works with existing host-key verification. The project directory
  `/home/wealthos/goldsilver.wealthos.ir` is writable. Node 22.23.2 is available.
- Google public OIDC discovery returns 200 from the server; this proves neither
  token exchange nor owner login/account eligibility.
- No PostgreSQL server/client/backup executables were found for this account.
  Docker is not usable by the account. Another PostgreSQL listener exists; its
  ownership/purpose was not established and it was NOT reused or modified.
- User service manager is available but `Linger=no`; logout/reboot survival is
  not proven. No usable administrative grant was established.
- Disk was about 93% used, with about 15 GiB free; reserve/capacity must be checked
  before building, backing up and provisioning storage.
- **No new deployment. Actual deployed commit: unverified.** A writable directory,
  a health check or a tested local build is not a deployed private application.

## Credential gate: precise current state

### September 21 follow-up — supersedes the earlier destination readiness

This subsection records the initial failed recheck. The owner subsequently
approved and completed preparation of an isolated destination; use the
[new active checkpoint](PRIVATE_CREDENTIAL_DESTINATION_2026-09-21.md) for continuation.

The owner reported completing the harmless Save As. A fresh metadata-only check
found neither `save-as-probe.txt` nor `credentials.json` at the exact destination.
Do not infer where the file was saved or that the owner merely opened the link.
No Downloads, account contents or credential contents were inspected.

The protected `google-owner-login` leaf still has exactly owner/SYSTEM access.
The `.asha-private` parent now has one additional explicit read/execute/synchronize
grant, inherited by unprotected descendants. Owner, protected status and the two
original owner/SYSTEM grants remain. Its exact cause/time/actor is unknown; no
claim of compromise or protected-leaf exposure follows from read/list access alone.
All path/ancestor-mutation/Git-boundary checks passed, but the strict private-parent
check failed. The helper correctly reports **blocked**, not safe credential storage.

Security specialist independently reviewed these bounded facts. No ACL, guard,
credential, server setting or portfolio was changed. Do not remove the parent's
grant under existing authority: it may serve another application and inherited
permissions on other children may be affected. Proposed non-mutating alternative:
request permission for a NEW project-only destination
`C:\Users\pc\.goldsilver-private\google-owner-login`, with a reviewed fixed-path
helper update and fresh ancestor/creation checks. At the initial recheck it had
not yet been approved, created or used. After that gate, repeat harmless direct Save As; new-client
creation and key transfer still require their separate approvals.

### September 20 evidence (historical)

`C:\Users\pc\.asha-private\google-owner-login` exists with reviewed owner/SYSTEM
protection and safe checked ancestors; metadata preflight passed. No replacement
credential exists. No old workspace credential path or Downloads was read.

`readyForDirectSaveAs` certifies the destination metadata only, NOT browser download
behavior. The owner was asked to save one harmless text attachment directly as
`save-as-probe.txt` using Chrome/Edge Save As, without passing through Downloads.
The temporary loopback probe serves only that fixed harmless text, reads no files,
and must never be repurposed as a credential receiver. Manual proof is pending.
Current tools do not establish a safe native Save As for the credential-bearing
provider interface. Do not capture that page's DOM, screenshots or accessibility
tree; even a button label can contain a secret.

After that proof and a fresh metadata check, request specific replacement-client
creation consent. Keep the hosted callback fixed to
`https://goldsilver.wealthos.ir/auth/google/callback`; no localhost callback or
extra data scopes. Independently verify/bind the owner's stable Google issuer/sub
through a reviewed enrollment handoff; never use first-login-wins or email alone.

The **proposed, not created or approved for transfer**, server secret destination is
`/home/wealthos_dev/.asha-private/goldsilver/runtime.json`. The runtime requires
private directories 0700, regular single-link owner-only file 0600, safe ancestors
and no symlinks. It contains the minimum private identity/database configuration,
not portfolio rows. Verify actual destination and obtain separate transfer consent
before creating/transferring any key there. See the operational plan in
[Deployment](../09-operations/DEPLOYMENT.md#private-node-activation-plan).

## Owner handoff

Local test: `http://127.0.0.1:4174/`, while the local launcher is running on this
computer. Open purchase records, analysis, backup and reload; existing saved local
rows are still local, not available on another device. The domain is not ready for
owner data entry. Do not delete browser storage or reinstall as a workaround.

Next work is gated by safe Save As/replacement identity, verified owner binding,
dedicated server PostgreSQL and stable service supervision, separate key transfer
approval, server backup/restore/rollback, and actual owner/non-owner/browser/device
acceptance. This code checkpoint is neither full project completion nor financial
method approval. It makes no promise of background continuation.
