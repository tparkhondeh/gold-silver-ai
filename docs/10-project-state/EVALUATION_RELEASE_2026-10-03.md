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
  tables. A new release-bound backup and separate restore remain required for
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

The specialist approves this repair conditional on fresh candidate build/import
graph, smoke tests and exact-SHA CI. Literal-import graph analysis is supporting
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
- Patched exact-SHA CI, clean Linux private build/import graph, release-bound
  backup/separate restore,8GiB reserve check and actual publication are pending.
- Keep51e0791 and the protected pre-upgrade crontab for rollback. No migrations
  changed since that baseline. Upgrade only the project supervision block; verify
  the previous process identity before stopping its supervisor. Never remove an
  ambiguous upgrade marker or overwrite existing data to retry.

## Acceptance boundaries

Use the [evaluation guide](../09-operations/PUBLIC_EVALUATION_ACCEPTANCE.md).
Evaluation records are nonprivate and isolated in same-tab sessionStorage, not
account storage or cross-device synchronization. The public view has no actual
market-price adapter, so valuation/analysis missing-data states must remain clear.
Owner login/private-data recovery and provider activation are not prerequisites
for this route, but remain prerequisites for final private-use delivery.

Domain browser acceptance and final deployed identifier will be recorded after
actual activation. Chrome connection was unavailable in this session; the native
launcher also failed with desktop access denied. Do not substitute the connected
in-app browser for an independently tested Chrome/Edge/Firefox/mobile device.
