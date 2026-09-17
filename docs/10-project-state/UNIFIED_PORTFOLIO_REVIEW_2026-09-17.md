# Unified personal portfolio — September 17, 2026

## Scope and actual status

Owner authority: unified dated purchase entry, matching Excel import, confirmed
storage, automatic latest-only prices, removal of public demos and private existing
domain preparation. Work remains on `codex/phase-2-decision-engine`; initial clean
code baseline was `cb1132cc6eb6a69e4274ad5d696d7adf93cc8856`. Main was not changed.
The owner subsequently allowed Google identity preparation, **not** acceptance of
new terms, private-data/key transfer, payment or unprotected public exposure.

| Deliverable | Verified state | Remaining boundary |
|---|---|---|
| One personal entry/edit/Excel workflow | Implemented and locally exercised | Old incomplete balances retain their identity; no invented purchase details |
| Exact Rial/USD acquisition and current valuation | v2 deterministic contract, independent review/tests | Manual historical FX is unverified; current FX never substitutes for it |
| Confirmed database storage and recovery | Local PostgreSQL; browser save/reload/conflict/failure checked | Not yet hosted or cross-device authenticated storage |
| Automatic last-good price management | Local endpoint/cache/ledger/locking and failure tests | New cache has no actual snapshot yet; actual receipt awaits existing cadence |
| Public demo/laboratory/manual-price controls | Removed from public page/bundle; internal tests retained | Existing recorded rows/drafts were not deleted |
| Backup | Fresh actual full restore of all 25 tables; daily launcher supervisor | No off-host backup or server disaster-recovery claim |
| Private domain | Read-only preflight only; HTTPS503 | Identity, production runtime, supervised restart, server DB and acceptance open |

## Changes and boundaries

`page.tsx` imports only `UnifiedPortfolioWorkspace`. The old workbench is retained
as internal regression implementation, not a public page/route. Main navigation
has portfolio, entry/edit, analysis/readiness and settings/backup. Financial
methods and locks were not changed. A missing price is not zero; insufficient
decision inputs remain explicit, not filled by synthetic factors.

The same purchase book validates manual and XLSX intake, stores exact decimal
strings, requires fresh-purchase dates and same-day FX provenance, computes exact
weighted basis and keeps imported IDs/fingerprints. Old opening balances retain
amount/cost/date/notes without reconstructed fees/FX. Old browser-only records
remain recoverable but are not silently mixed into authoritative database rows.
The three explicitly synthetic purchases already present before this task remain;
new browser tests below never wrote into that owner database.

The template generator reuses the spreadsheet skill/runtime and original schema:
three sheets (guide, purchases, catalog), blank entry rows, unchanged 20-column
contract and validation. The synthetic example sheet is absent from the public
file; internal `--fill-test` fixtures remain ignored. Workbook rendering was
visually checked. Arithmetic and provenance:
[personal valuation v2](../04-portfolio/PERSONAL_MARKET_VALUATION.md).

`POST /api/managed-market` is bodyless, loopback and same-origin/intention gated.
One latest-only private cache lives outside database dumps. PostgreSQL advisory
plus fixed exclusive file locking and durable reservations prevent simultaneous
workers/tabs from multiplying provider calls. Last-good data is not overwritten
by missing symbols, regressing publication or conflicting same-time values;
no history collection or automatic stale-lock eviction was added. Active-page
checks respect server `nextCheckAt`; freshness clock updates do not fetch prices.

Actual Node browser transport exposed a defect: an empty POST arrived as a stream
and was rejected as nonempty. A bounded zero-byte read now accepts it while
rejecting bytes/stalled streams. At `2026-09-17T06:14:25.834Z`, real local endpoint
returned HTTP200, `unavailable/refresh_cooldown`, no snapshot, used10/remaining105,
next eligibility `2026-09-17T10:21:20.834Z` (13:51 Tehran). The restored owner app
also displayed this cooldown. No new provider request or real quote was claimed;
the earlier eight-observation receipt is historical evidence, not a new cache fill.

## Backups and isolation

Before changes: verified `apps/web/.cache/checkpoints/unified-20260917/before.bundle`
and full local dump/restore. Post-change dump
`asha-local-20260917T061644Z-ad1ee1d9.dump` (113439 bytes) SHA256
`080274ca8a168162bc761fb31d0607159da7947b4fb6ceb30bda36c5bea72a8e`
was restored and all25 tables verified. Artifacts stay ignored/private.
`local-postgres.mjs` now exports a read-only repeatable-read snapshot for dump and
expected counts, preventing live writes from causing false restore mismatches.
No original database/table/record/history was deleted or reset.

The launcher verifies backup bytes/checksum and avoids redundant backups younger
than24h, checks daily while alive, and retries a failure after1h. It does not create
an OS/Codex schedule, rotate/delete copies or promise protection after computer
loss. Deadline cancellation is cooperative; stale overlap locks are not silently
removed. See [operations backup runbook](../09-operations/BACKUP.md).

`acceptance-local.mjs` creates a collision-checked new database from template0,
reuses existing restricted roles without role mutation, validates migrations,
seven forced-RLS tables and scoped grants, disables dotenv/provider/history/price
networking and binds only127.0.0.1:4174. Security review and pure check passed before
launch. Actual test database `asha_acceptance_20260917062247_af7c90c3` was retained,
not dropped. Owner app was restored afterward with the unchanged original rows.

## Actual tests and limits

| Check | Actual evidence |
|---|---|
| Web automated suite | 449/449 pass; lines96.08%, branches89.95%, functions96.36% |
| PostgreSQL integration | 20/20 pass on actual isolated local PostgreSQL17.11 |
| Python laboratory regression | 260 pass, locked dependency/version/license/compile checks pass; local3.12.14 differs from CI pinned3.12.13 |
| Build, typecheck, lint | Passed; final build/coverage includes the CSS correction and HTTP export route |
| Production dependency audit |0 vulnerabilities; package manifests/lock unchanged |
| Local readiness |15 pass, violations empty, evaluation only, no external API calls |
| Numerical independence | Specialist checked new USD provenance/coverage and prior evaluator results over80 generated portfolios/480 lots; old fields unchanged |
| Manual browser purchase | Missing date rejected; wrong-day FX rejected; same-day FX saved; exact0.012345678901 quantity preserved after reload |
| Navigation and Excel | Unsaved form survives tabs;2-row XLSX preview/save; same-file duplicate and corrupt-file rejection preserve3 saved test lots |
| Recovery/concurrency | Fresh tab sees same database version; two-tab409 protects new save; old draft remains but cannot overwrite after reload |
| Controlled connection failure | Stopped isolated app; attempted save remains unconfirmed, exact draft preserved and repeat submission blocked |
| Visual review | Narrow available browser view checked; multiline compact-count CSS defect corrected and rechecked |
| Personal backup download | Blob attempt exposed failure; replaced by fixed same-origin HTTP attachment. Available browser downloaded418-byte `asha-portfolio-backup.json` from a fresh isolated empty database; format/version/empty fields checked.9 new handler tests verify exact nonempty export, denial, privacy and size limits |
| Independent Chrome/Edge/Firefox/mobile | Not tested this checkpoint; Chrome control unavailable, no claimed device acceptance |
| Domain authenticated workflow | Blocked, not tested; no deployed SHA |

Specialists actually used: `finance_data_review` (USD/data, numerical preservation,
isolated launcher), `security_storage_review` (managed cache/quota/backup plus
independent launcher/panel review), `architecture_qa_review` (unified editor,
load/draft recovery, independent arithmetic/cache/backup review, Python gates and
read-only server preflight). Coordinator integrated and exercised the browser.
Sensitive areas received separate specialist review, not merely specialist names.

The HTTP download check used a second new retained database,
`asha_acceptance_20260917064203_437628df`, with all acquisition flags off. No owner
holdings were exported for that test. The fixed endpoint reads only the latest
confirmed database snapshot, uses a fixed filename/no-store/nosniff, blocks
cross-site requests and strips no data silently: unknown fields/oversized output
fail rather than creating an unrestorable or leaking backup. A separate security
agent reviewed it. Owner-local app was restored afterward.

Ignored evidence resides in `.cache/checkpoints/unified-20260917/` (web/build,
PostgreSQL, Python, security gates, template render and acceptance manifests).
Hydrated browser checks were performed through the available browser controls;
they are not an unattended cross-browser CI lane. No market file/key/private
portfolio/dump is a Git artifact.

## Domain and Google handoff

Fresh read-only SSH checked the approved account/key/port. Project document root
is writable, with existing proxy to127.0.0.1:3012; no listener exists there. Public
HTTPS returns503 via MizbanCloud. Node22.23.2 exists; user systemd manager is active
but `Linger=no`. No deployment, service/configuration write or private-data transfer
was performed. Do not start an unauthenticated local server behind that proxy.

The owner approved investigating/preparing Google owner login. The initial Google
Cloud welcome terms dialog later ceased to appear; who dismissed/accepted it was
not verified, and the agent did not click acceptance. The empty **Gold Silver AI**
project was created without billing/free-trial activation. App-name/owner-account
contact fields were prepared, with external **testing** audience (the account has
no organization; this is not permission to admit other users).

The form is now stopped at **Finish**, unchecked **I agree to the Google API
Services: User Data Policy**. A direct prepared-form link and visible tab were
provided for owner review/acceptance followed by Continue/Create. Do not repeat
the earlier missing “Agree and continue” instruction. No terms accepted by the
agent, billing enabled, OAuth credential created or login provider promised
legally available. Completing that handoff is a prerequisite, not the
whole remaining deployment work. Server-verified identity with stable subject,
owner allowlist, secure expiring sessions/logout, RLS and independent deny tests
must replace the local-owner boundary before public release. See
[deployment runbook](../09-operations/DEPLOYMENT.md).

## Owner test and next step

Local URL: `http://127.0.0.1:4174/` while the launcher/computer runs. In **ثبت و ویرایش**
use **افزودن خرید** or the same blank Excel template; successful registration means
the database confirmed it. Reload to verify recovery. Price processing is automatic
and missing/cooldown data remains explicit. This is not a promise of access from
another device or a durable published site.

Do not bulk-enter irreplaceable holdings on the assumption that hosted sync is
ready. Preserve personal backup copies safely; current local backups share this
computer. Next authority/action is the Google terms handoff and, at the actual
credential/transfer step, explicit scope confirmation. Source permissions,
historical FX and sufficient analytical inputs remain independent limitations.
Owner acceptance and whole-project completion are not asserted.

## Git delivery

Implementation commit `9d8537c6c85180690b96f04ae7cb4b05b9d898e6` was pushed only to
the working branch. [GitHub run35191323042](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/35191323042)
completed successfully for that exact SHA: web quality/audit, real PostgreSQL
integration, and Python financial-regression jobs all passed. Remote branch/main
were freshly checked rather than inferred from local origin refs.

This evidence-only documentation follow-up does not modify tested product code;
its own exact-SHA three-job result must also be verified at final handoff. A CI pass
does not imply domain deployment: deployed SHA remains unavailable.
