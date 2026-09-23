# Public evaluation — September 23, 2026

## Scope and preserved state

Owner-authorized [ADR0014](../08-decisions/ADR/0014-isolated-public-evaluation-route.md)
defers owner enrollment to final acceptance. No bootstrap grant, login follow-up,
key transfer, owner-data transfer, financial-method change or security bypass.
Work began on clean `codex/phase-2-decision-engine` at
`886a93126fd59be4279a34055e70fe2c95bf96d8`; fresh `git ls-remote` agreed.
Main remained `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
A complete recoverable Git bundle was created and verified at ignored
`.cache/checkpoints/anonymous-review-20260923/repository.bundle` before changes.

## Fresh domain/server evidence and deployment gate

At 2026-09-23 19:05UTC, read-only SSH confirmed the same clean running release:
`51e0791b94416f8c85c0e6d01ab4c1ee2013ffed`. Its private build manifest matches
that branch/SHA. Independently requested valid-TLS public health returns200 and
that SHA; `/evaluation` returns404, portfolio/session remain401. An open tab is
not evidence that the new route has shipped.

The shared server filesystem is99% full: available3,691,716KiB, about3.52GiB.
This is BELOW the existing8GiB project backup safety threshold, not merely a
new dependency-copy inconvenience. No server file, cron, service, proxy, data or
old release has been changed in this stage. Do not delete artifacts, reduce the
threshold, skip backup/restore or use a static/proxy detour to bypass deployment
gates. The hosting administrator must restore at least the normal reserve plus
release/build headroom, preferably by adding capacity. Cleanup, if chosen by the
owner/admin, requires separately identified recoverable targets and authority.

At 19:09UTC the existing retained-backup verifier did not establish a fresh
verified backup. The latest protected receipt is2026-09-21T23:47:03.205Z,
43.38hours old, outside the normal24-hour acceptance window. No backup was
recreated below the reserve and no stale receipt was relabelled current.

## Implementation and evidence

Implemented the isolated `/evaluation` wrapper with the existing purchase panel,
Excel importer, exact ratios and personal valuation function. Only the new
`asha.public-evaluation.v1` sessionStorage entry is read/written; strict version,
size, book, revision and stale-write guards preserve corrupt/failed state. Explicit
memory-only fallback does not change prior storage. Reset needs an explicit
confirmation and touches only this test entry. Export contains registered test
records only, not personal server data or unsaved form input.

The gateway permits exact GET of this route, not queries/subpaths/write methods.
Private portfolio/export/market remain behind the same owner gate. No new market,
identity or private API calls are made by the evaluation component. Neither
default synthetic prices nor existing local/private holdings are loaded.

Architecture/QA implemented the frontend and independently reviewed the gateway.
Security/storage implemented the narrow gateway change and independently reviewed
frontend isolation, raw-error suppression and corrupt/conflicting/failed storage.
Finance/data independently checked the existing two-lot math and missing-FX
oracle; no financial formula or method change was needed. Their14 frontend and23
adjacent gateway/proxy tests passed; full TypeScript, lint and diff checks passed.
Both actual private-build smokes (Google/passkey gates,11 built assets and Excel
template) passed; default build and complete unit/coverage run exited0. Coverage
was96.44% lines,91.15% branches,92.68% functions. A later browser clarity correction
removed unconditional “complete coverage” labels for unknown USD totals; its
affected checks and exact-commit CI are recorded below when complete.

Full dependency audit has no high/critical finding, but retains four moderate
development-chain advisories rooted in old esbuild under drizzle-kit. Its proposed
force-fix is a breaking downgrade and was not blindly applied. No new dependency
was introduced; no development server was exposed on the domain. This is not a
claim of zero vulnerabilities.

### Actual local browser acceptance

The existing loopback launcher runs at `http://127.0.0.1:4174/evaluation`; local
readiness and its own verified backup succeeded. Only nonprivate synthetic
acceptance records were entered into the NEW evaluation session. Existing local
portfolio information was not read into this route or overwritten.

- Manual two purchases:2g at1,000,000toman +100,000fees and3g at1,200,000
  +150,000fees, with explicitly synthetic same-date historical FX50,000/60,000.
  Actual UI:5g, weighted purchase1,120,000/g, weighted landed1,170,000/g,
  total5,850,000toman,104.5USD and20.9USD/g. Same-tab reload retained the values.
- Negative quantity and wrong-date FX were rejected while the form was preserved.
  Clearing the second FX made whole USD basis unknown without changing toman
  totals. Current value/P&L remained unknown, never zero or acquisition-price based.
- A separately opened tab started empty. The pre-existing labelled synthetic
  workbook was previewed without mutation, then atomically imported as2purchases:
  4g and43,100,000toman landed basis. Reimporting the same file was rejected;
  a controlled corrupt XLSX was rejected without losing rows. Reload retained
  the imported book. Display100.3USD/g expanded to exact100.25.
- Short/medium horizons explicitly report missing inputs/decision unavailable,
  no fabricated recommendation. Private login controls are absent from this view.

Storage denial/corruption/quota/conflict and no-private-read/write paths are
controlled automated tests, not production incidents or actual private-session
acceptance. Browser automation currently covers the in-app browser only;
independent Chrome/Edge/Firefox/mobile are not claimed tested. Local availability
is not independent hosted availability. Public domain remains the old release.

Git/CI: pending exact-commit recording after the reviewed source is committed.

## Remaining delivery and final acceptance

- After capacity is restored: fresh capacity/backup checks, exact-SHA clean Linux
  build, actual verified database backup/separate restore, reviewed project-only
  release upgrade and public browser/security checks. Preserve the previous
  release/config/schedule for rollback; never downgrade schema blindly.
- The unauthenticated route stores test records only in its own browser-tab
  session, not the private server DB; no cross-device or durable-save promise.
- Real prices and quote-dependent analysis are unavailable in public evaluation.
  Existing source licenses, quota authority and secret-transfer gates remain.
- FINAL stage, not the next unblock request: owner-bound passkey activation,
  real login/logout/expiry/non-owner denial, authenticated save/reload/re-login,
  independent-device recovery, recovery of authenticators and data, off-host
  disaster recovery, and explicit owner acceptance. Do not call this private-ready.
