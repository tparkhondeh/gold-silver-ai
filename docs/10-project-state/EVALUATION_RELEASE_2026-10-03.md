# October 3 evaluation release

## Scope and fresh baseline

Project-only publication of the existing isolated `/evaluation` route. Owner
activation remains FINAL; no bootstrap, provider call, key/portfolio transfer,
financial-method change, cleanup or other-site change is authorized by this work.

- Clean starting branch: `codex/phase-2-decision-engine` at
  `38fa8df8b177aba02bec688dfdf0d44a6044bcf0`; fresh remote reference matched.
  All three exact-SHA jobs passed in [run36227810095](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/36227810095).
- At2026-10-03T07:50:49Z, actual HTTPS release was
  `51e0791b94416f8c85c0e6d01ab4c1ee2013ffed`; health200, evaluation404.
  Root filesystem had30,335,672KiB available (about28.93GiB),86%used,
  inodes21%. The September26 capacity blocker is no longer current.
- Existing protected backup verified:2026-10-02T23:47:02.496Z,25persistent
  tables. A new release-bound backup and separate restore were still required for
  activation; an old-release receipt is not sufficient.
- Full local Git bundle was created and verified in the ignored October3
  checkpoint. Existing data, releases and unrelated services were preserved.

## Bounded dependency repair and independent review

The fresh full audit found17affected packages (10high/7moderate,0critical).
Production-only audit was0, but is not alone sufficient for this private runtime.
Four compatible locked updates were made before activation:

| Package | Previous | Reviewed patch | License |
| --- | --- | --- | --- |
| brace-expansion |1.1.18 /5.0.9|1.1.21 /5.0.12|MIT|
| fast-uri |3.1.6|3.1.8|BSD-3-Clause|
| miniflare's undici |7.29.0|7.29.1 scoped override|MIT|

No broad upgrade, forced downgrade, new service or financial-library change.
The release-boundary specialist independently checked parent compatibility,
Node engine compatibility and all four official npm integrity hashes.

Checked October3: [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[fast-uri](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj),
[Undici maintainer advisory](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3).

Residual full audit:11entries,7high propagated from one
[unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
plus4moderate entries in the already recorded Drizzle-kit/esbuild tooling chain.
**The full audit is not clean and exits nonzero.** Braces patterns in the reviewed
Vite plugins come from source imports/aliases; Next ESLint patterns come from
configured source roots. Untrusted public input must never reach those build/lint
interfaces. The production entry uses `vinext/server/prod-server`, not the build
entry; private build excludes Cloudflare, and no development server is exposed.
This is a bounded build-input residual, not a claim that installed packages are
universally safe. Reassess when an official patch or these input boundaries change.

The specialist approved this repair conditional on fresh candidate build/import
graph, smoke tests and exact-SHA CI; those conditions were subsequently satisfied
by the candidate evidence below. Literal-import graph analysis is supporting
evidence only: external-package boundaries and computed imports need review.
Reviewed computed imports are the fixed Vinext build entry, React implementation
and zip.js codecs (native ZIP reader, workers disabled, methods0/8 only, no custom
codec registration). No security control or audit policy was lowered.

## Tests and publication gates

- Local lint, typecheck and full Worker build/coverage suite passed after the
  dependency patch:800tests,798pass,0fail,2environment-specific skips;
  coverage96.67%lines/91.68%branches/92.60%functions.
- Unmodified baseline38fa8df was staged in its own Linux release directory;
  locked install, private build, both identity-mode route/security smoke tests and
  production audit passed. It was NOT activated; publish the patched source only.
- Published code: `50a9c3a8435a79bfb99cf22295363846b2bb98bb`. All three
  exact-SHA jobs passed in [run37108764219](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/37108764219):
  web/build/security, actual PostgreSQL integration/restore, synthetic Python lab.
  Clean Linux locked install, private build and both identity-mode smoke suites
  passed. Production audit:0. Static candidate import graph:150files, no blocked
  tooling/import errors, six expected externals and the same three independently
  reviewed computed imports described above. This is exact-candidate evidence.
- Candidate-bound backup and separate restore passed before activation. Preflight
  at08:12:29Z confirmed30,722,273,280bytes available versus8,589,934,592required.
  Post-activation at08:21:22Z still passed with30,708,072,448bytes and valid backup.
- Keep51e0791 and the protected pre-upgrade crontab for rollback. No migrations
  changed since that baseline. Only the project supervision block was upgraded;
  the previous process identity was verified before stopping its supervisor. Never remove an
  ambiguous upgrade marker or overwrite existing data to retry.

## Actual activation and domain acceptance

The reviewed installer replaced only the old project cron block, with exact
before/after comparison preserving unrelated bytes. Protected rollback snapshot:
`PRIVATE_DATA_ROOT/crontab-before-1791015150093.txt`. The old supervisor's UID and
exact command line were verified before SIGTERM; PostgreSQL was not stopped.
The installed minute recovery started the new release without an attached SSH
session. A brief503 was observed during turnover; subsequent checks and the whole
browser workflow succeeded. New supervisor/runtime PIDs3498024/3498070 were
observed on the later read-only check. Boot recovery is configured; actual shared
server reboot was NOT performed. Old releases, records and backups were retained.

Fresh HTTPS health identifies50a9c3a, not the later documentation-only commit.
`/evaluation`200 and ten referenced JS/CSS assets200; private portfolio/export,
session and managed-market endpoints401; local market/operator routes404.
All sampled page/API responses retain `Cache-Control: no-store`. No proxy,
other-site, owner-access, API-key or market-data configuration changed.

Actual browser acceptance used a new isolated Codex in-app tab on the HTTPS
domain, not localhost; all entered records were explicitly synthetic/nonprivate.

| Path | Executed evidence |
| --- | --- |
| Empty workspace | Fresh tab starts with0purchases; no copied private/sample data |
| Validation/correction | Negative quantity rejected; correcting it allows one purchase |
| Multiple purchases |2.5g at10m +1.5g at12m gives4g,10.75m weighted unit cost;100kfees produce43.1m total and10.775m landed average |
| Edit precision | Existing second purchase fee changed to10.12345; same ID/count, exact amount preserved |
| Small amount |0.04g silver shows “less than0.1”, exact disclosure0.04; unit price1000.12345 retained |
| Sorting | Ascending cost puts silver first; descending puts gold first, without changing records |
| XLSX | Existing two-row explicitly synthetic fixture previewed then imported; count3→5 |
| Blank template | HTTPS template200; browser download bytes match the committed template SHA256 |
| Duplicate/corrupt XLSX | Same file rejected as already imported; corrupt file rejected; count remains5 |
| Export | Click generated2469-byte `asha.public_evaluation.v1` JSON; exact5lots, fee10.12345 and quantity0.04 verified from downloaded file |
| Reload/isolation | Same tab restores5lots; separately opened tab remains empty after hydration |
| Missing prices/FX/analysis | Market value/profit unavailable; partial historical USD not presented as whole portfolio; both horizons decision-unavailable with explicit missing inputs |

The download-event automation timed out, but the generated file was actually
present and separately parsed/checked; do not confuse that tool event with an
application export failure. Same-tab reload is the supported recovery here; there
is no claim of JSON re-import, persistent account backup or cross-device recovery.
Storage-denial/write-conflict and export preparation failure paths passed in the
actual-component automated suite, not through browser fault injection on the
live domain. Real-price valuation is deliberately unavailable in this public route.
Screenshot and raw test/audit evidence remain in the ignored October3 checkpoint;
no uploaded/exported data file or secret entered Git.

## Acceptance boundaries

Use the [evaluation guide](../09-operations/PUBLIC_EVALUATION_ACCEPTANCE.md).
Evaluation records are nonprivate and isolated in same-tab sessionStorage, not
account storage or cross-device synchronization. The public view has no actual
market-price adapter, so valuation/analysis missing-data states must remain clear.
Owner login/private-data recovery and provider activation are not prerequisites
for this route, but remain prerequisites for final private-use delivery.

Chrome connection was unavailable in this session; the native
launcher also failed with desktop access denied. Do not substitute the connected
in-app browser for an independently tested Chrome/Edge/Firefox/mobile device.

## Remaining final-delivery gates

1. Hosted real prices: existing inactive adapter must pass licensed-data coverage,
   protected-key transfer approval and single-authority quota/cooldown handoff.
   Public evaluation is not a way around private authorization or data licenses.
2. Real analysis: licensed history, costs/liquidity and registered-method evidence;
   no fabricated inputs, methodology changes or financial unlock.
3. FINAL owner stage: explicitly approved enrollment when requested, real owner
   login/denial/logout/expiry, safe account recovery and independent-device save/
   restore. Existing personal holdings require separate migration approval.
4. Operational acceptance: independent normal browser/mobile and actual reboot
   remain untested. Same-host backups are not off-host disaster recovery; an
   approved destination/transfer plan is still needed for host-loss protection.
5. Owner acceptance remains separate from publication, automated tests and finance
   validation. No new independent product feature is required for this release.

Gate self-review: requirements/regression covered by reused existing behavior and
browser evidence; financial methods/data untouched; dependency/security residual
review explicit; backup/restore/release identity verified; documentation updated.
No main merge or assertion of whole-project/private-use completion.
