# October 3 hosted-market preparation

## Scope and verified starting point

Continue from [the evaluation release](EVALUATION_RELEASE_2026-10-03.md).
Starting clean working branch and fresh remote reference: `ff8cb262448cfce225587b27b21229dbeb4f8b19`.
Live code remains `50a9c3a8435a79bfb99cf22295363846b2bb98bb`.
This work does not activate owner login, transfer private holdings, alter financial
methods or enable a provider on the public evaluation route.

Fresh read-only server inspection found:

- Protected provider configuration absent; latest-cache directory absent.
- Private quota-table readiness blocked by missing privileges; no grants applied.
- Both private parent directories owned by `wealthos_dev`, mode0700.
- At12:11:10Z, capacity/retained-backup preflight passed:36,003,049,472bytes free
  against8,589,934,592required. This is not a new release-bound deployment backup.

A full Git bundle was verified in the ignored `hosted-market-20261003` checkpoint
before edits. The local database backup at12:22:11Z was separately restored and
all25persistent tables verified; it remains private on this computer, not off-host.

## Actual source and valuation evidence

Existing local configuration declares free Navasan, TOMAN and24,000-second
minimum acquisition spacing. Key presence and a configuration flag are not alone
proof of current account access. At12:11:30.734Z, **one** counted HTTPS latest
request through the existing reservation/validation path actually succeeded.

- Eight approved observations:18ayar, abshodeh, sekkeh, bahar, nim, rob, gerami,
  usd_sell. Gold/coin publication12:10:12Z; dollar12:08:08Z on October3.
- Local inclusive31-day reservations increased8→9; local application allowance
  remaining106 of115. This is **local accounting, not the provider's account-wide
  remaining balance**. Failed requests must remain counted.
- Two explicitly fictional gold purchases, totaling4g, were valued with the
  received fresh quote. Purchase input was unchanged; exact canonical encode/
  decode replay reproduced the same valuation. No historical FX was invented.
- The real snapshot was processed only in memory; no price file, history or
  portfolio was saved/transferred by that smoke test. It was not a browser or
  hosted-owner acceptance test. The unsupported physical-silver/mesghal bridge
  limitations remain unchanged.

Official [free-plan information](https://www.navasan.tech/api/) checked October3
states120monthly requests, two-hour source updates and three-month validity.
Do not call these quotes continuously real-time or assume renewal/expiry dates.
The [official API guide](https://www.navasan.tech/webserviceguide/) exposes a usage
endpoint, but its documented response includes credentials/account metadata and
its accounting is not implemented by the current ledger. It was **not called**;
do not casually spend the five-call reserve or print its response to reconcile
account-wide usage.

## Independent implementation and review

The fixed Linux runtime latest-cache backend now reuses the existing canonical
document format, validation and receipt/publication selection. Directory
descriptors stay pinned throughout operations; metadata and file identity are
checked, input/read sizes bounded, and only positively identified artifacts of
the current operation may be cleaned up. Unknown/preexisting lock or staging
files are preserved and block reads as well as writes pending reviewed recovery.
It does not create directories, load keys, grant privileges or attach startup.

The existing generic backend uses the extracted unchanged selection function.
No new financial formula, price format, UI, dependency or migration was introduced.
Filesystem checks cannot isolate the service from a malicious process running
under the same OS identity; final rename/unlink are not inode-conditional.

The implementation specialist and independent security/storage reviewer checked
ancestor/file replacement, interrupted writes, lost database locking, replay and
exact synthetic multi-purchase valuation. Native Linux descriptor tests must be
verified on Linux; Windows synthetic tests are not a substitute.

The quota review found and corrected two lifecycle gaps: explicit local
initialization could regrant reservation INSERT after a cutover, and the backup
checker required that permission even for a retired source. Initialization now
holds the provider lock across migration transactions and grants INSERT only for
the newly applied quota migration; existing tables keep their admission state.
Backup permits read-only quota inspection without relaxing immutability or normal
activation checks. Interrupted fresh initialization after migration but before
grant deliberately needs reviewed recovery, not automatic reactivation.

Native PostgreSQL capture/import preserves exact microsecond timestamps, inclusive
usage and prior cooldown, rejects conflicting target state and makes identical
replay idempotent. Independent review found two further issues in the new importer:
missing independently expected target/digest binding, and a self-revoked table
owner still having power to re-enable admission. Both were corrected and covered
by actual PostgreSQL cases before delivery. These are administrative functions,
not an executed cutover. Three specialist agents covered implementation,
quota/lifecycle correctness and independent security/storage review; the final
review found no remaining blocker in these bounded changes.

## Key-transfer boundary

Only the existing local credential file's permissions were narrowed to the owner.
Its original ACL was backed up, contents verified unchanged, and no shared parent
permissions changed. The source file must still be revalidated at transfer time.
No key was displayed, copied into this checkpoint or transferred to the server.

Proposed fixed destination:
`/home/wealthos_dev/.asha-private/goldsilver/market-provider.json`.
Require owner-held0600single-link regular file within the validated0700private
parents. Transfer, if explicitly approved, must use verified-host SSH with secret
bytes on the encrypted stdin stream directly into an exclusive protected file;
never command arguments, displayed output, logs, Downloads or an intermediate
public file. Preserve any unexpected existing destination and fail closed.
Approval for this specific transfer was requested; none is recorded yet.

## Acceptance and remaining gates

Browser inspection on the HTTPS domain showed the owner-login boundary at `/`
and the separate empty `/evaluation` workspace with explicit temporary same-tab
storage and no day-price connection. No enrollment or private session was created.
The browser tool blocked direct API navigation; that attempt is not a successful
API authorization test. Earlier exact-live-release acceptance remains linked above.
The attempted local UI launch was rejected by the tool policy and was not retried
through a workaround; this turn does not claim a running localhost UI.

Before hosted prices can activate, complete actual account-usage reconciliation,
source process retirement and effective-permission fencing, protected accounting
capture/import verification, approved key delivery, reviewed narrow target grants
and guarded production composition. An already-reserved request may pause before
network I/O: waiting eight seconds is not proof that all old callers were drained.
Do not automatically restore source admission after target acquisition; reverse
handoff would first have to preserve the target's later usage/cooldown.

Authenticated live acquisition and the private portfolio/browser/device test still
require FINAL owner enrollment. Public evaluation is not a workaround. This
stage is not complete hosted activation, private-use readiness or owner acceptance.

## Validation and self-audit

- Final local unit/coverage run:820tests,817pass,0fail,3platform skips;
  line96.71%, branch91.72%, function92.69%. Typecheck and lint passed.
- After the review corrections, the full disposable PostgreSQL run passed66tests
  with no skips, including actual migrations, fences, independent target binding,
  self-revoked owner rejection, replay, owner isolation and dump/restore.
- Local private production build and built Google/passkey smoke tests passed:
  evaluation/login shells, eleven assets, Excel template and anonymous denial.
  These use nonprivate acceptance fixtures, not real login or deployment.
- No UI/financial rules, dependencies, schema migrations or production startup
  changed. Existing live-release browser workflow evidence is reused only for
  unchanged code; it does not validate new hosted activation.
- Functional acceptance is partial: local live-source access/valuation and the
  independent preparation are evidenced; cutover, hosted-owner acquisition,
  private cross-device use and owner approval are not complete.
- Security review is independent of implementation. Existing build-tool audit
  limitations remain in the linked release report; no claim of a clean full
  dependency audit is made. Production audit/build/Linux-native execution are
  delivery gates of the exact-commit GitHub workflow, not preclaimed here.
- This checkpoint is introduced with the implementation commit on the working
  branch. Consult its `Project Quality Gates` run for all three exact-SHA jobs;
  the delivered commit/run are reported separately from the unchanged live SHA.

Raw non-secret local test receipts remain in the ignored
`.cache/checkpoints/hosted-market-20261003` checkpoint. No price payload or key
is included in committed evidence.
