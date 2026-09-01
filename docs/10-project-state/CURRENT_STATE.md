# Current State

**Source of truth for:** where the project stands right now.

_Last updated in the product calendar: ۱۴۰۵/۰۶/۱۰ (Phase 1 active)_

## Current Execution Gate

The owner authorized staged Data Foundation and deterministic-baseline development,
with each stage dependent on the previous quality gate. Private GitHub authentication
is working: Phase 1 HEAD `2823864138ef1ee7eb722b7a6c54d3a028a55403` was published and
verified with upstream configured; remote `main` stayed at
`5c03fabb1c8090497c0b03c9059a6e51fdb91d03`, with no tags or backup branch published.
The Node 22 TypeScript test-command repair passed GitHub run 33304773397.
The owner requested a development checkpoint for transfer to another computer;
the code checkpoint `ec3f410` subsequently passed GitHub quality and real PostgreSQL
integration/restore in run 33316064205. This handoff is
not a phase acceptance or authorization to repair the old host's ACL. Follow
[`CONTINUE_ON_ANOTHER_SYSTEM.md`](../../CONTINUE_ON_ANOTHER_SYSTEM.md).
On the transferred Windows host, the official PostgreSQL 17.11 runtime was verified,
the project-owned cluster was initialized as the interactive Windows owner, and the
real local integration/restore suite passed (13/13). The protected runtime environment
passed activation checks; with explicit process-environment forwarding,
`/api/health` reports observation persistence as connected. See
[`POSTGRES_FOUNDATION_CHECKPOINT.md`](POSTGRES_FOUNDATION_CHECKPOINT.md). No Phase 2
branch has been created. Local owner-scoped portfolio, constraint and horizon save/restore is implemented;
production account authentication, historical backfill, and the real baseline remain pending. See
[`PHASE_1_STABILIZATION_AUDIT.md`](../../PHASE_1_STABILIZATION_AUDIT.md).
Preference-persistence checkpoint `c5a5d16` passed both GitHub quality and real
PostgreSQL jobs in run 33389444502.
Migration 0005 now adds the immutable provenance registry and exact dataset/decision
lineage foundation. Provenance checkpoint `61ab33c` passed both GitHub quality and
real PostgreSQL jobs in run 33392420564; verification details are tracked in
`POSTGRES_FOUNDATION_CHECKPOINT.md`.
Migration 0006 now requires a reason for every append-only correction and stores exact
point-in-time source-reconciliation candidates, ranks, selections and reason codes.
Checkpoint `0d1c2e9` passed both GitHub jobs in run 33393986374. It does not define
empirical price-divergence thresholds or activate financial use.
Migrations 0007–0009 add an owner-isolated, append-only transaction and valuation storage
foundation. It is runtime-read-only and `evaluation_only`; no real event/value is
seeded and no financial methodology is selected. A plain-language Persian production
identity proposal now includes a dated official pricing/terms snapshot. Iran account
eligibility is still unverified. The owner accepted an owner-only next real release in
ADR 0006 and accepted an external identity service limited to minimum login data in
ADR 0007; the exact provider, terms, cost and Iran eligibility remain owner-required.
ADR 0008 keeps the current local/demo experience without new production login and
makes strong owner-only identity a fail-closed gate before hosted real financial data.
The read-only owner-server preflight found an existing local override for Cloudflare's
API hostname; no remote setting was changed and that candidate is not host-ready. See
`docs/09-operations/DEPLOYMENT.md`.
Checkpoint `d0ea16f` passed both GitHub jobs in run 33396556534.
Migration 0010 adds the immutable Navasan request-reservation ledger. The replacement
credential, durable quota health, eight-quote live normalization, historical endpoint
contracts and backup/restore path pass locally; no historical backfill was requested.
The local Persian readiness planner validates proposed Jalali ranges, approved
symbols and exact request counts without network or storage, while execution remains
locked. That readiness checkpoint covered 90 unit and 14 real PostgreSQL tests.
Code checkpoint `b0bb80a` passed both GitHub quality and real PostgreSQL jobs in
run 33417744818.
Backfill-readiness checkpoint `8a21a97` passed both GitHub quality and real
PostgreSQL jobs in run 33421273488.
The safe parallel history-quality checkpoint adds an offline deterministic OHLC
continuity audit. Synthetic fixtures prove detection of unobserved Jalali dates,
duplicates, rows outside the requested range, mixed instruments and Tehran
timestamp/date mismatches; zero values are interpolated and the audit cannot permit
storage or financial use.
The public Navasan and TGJU material has now been reviewed and a plain-language
licensed-backfill proposal plus ready-to-send Persian inquiries are recorded in
`docs/05-data/HISTORICAL_BACKFILL_PROPOSAL.md`. On 2026-08-31 the owner authorized
and sent the no-secret Navasan permission inquiry through the official contact bot;
Telegram displayed it as read, but no written vendor answer has been received or
treated as permission. No purchase was authorized and no historical request was made.
The owner later deferred further vendor contact and subscription purchase until the
final API-integration stage. No active monitor, purchase, provider call, or historical
request is part of the current autonomous work.

The safe non-API hardening lane now enforces source-only test coverage floors of 85%
lines, 65% branches, and 80% functions. Four direct repository tests cover empty
restore, exact holding/preference restore, atomic versioned save, and stale-version
failure before holdings are replaced. Generated build output cannot inflate coverage.
Coverage checkpoint `01095cb` passed both GitHub jobs in run 33477121188; remote
`main` remained at `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
The project-owned database now also has a manual verified-backup command. It creates
a unique custom-format file in the restricted Git-ignored cache, restores it into a
temporary database, compares all 24 governed table counts and the migration journal,
then removes the temporary database. Two real local backups passed this flow. It is
not encrypted or offsite, so production backup policy remains open. Backup checkpoint
`5fd67d0` passed both GitHub jobs in run 33478298802; remote `main` remained unchanged.
The local operations command now checks only `localhost:4174/api/health`, requires all
database-backed Phase 1 surfaces, and fails unless real financial use remains locked.
The real running application passed this check without a provider request. Readiness
checkpoint `d3da848` passed both GitHub jobs in run 33479256145; remote `main`
remained unchanged.
The prepared Windows owner host now has a one-step local launcher. It validates the
exact protected persistence environment, starts project PostgreSQL, and starts or
confirms the loopback web app without logging credentials. The real host correctly
recognized its already-healthy application. Launcher checkpoint `38fba17` passed
both GitHub jobs in run 33480065419; remote `main` remained unchanged.
The consolidated Persian pre-API audit is in `PRE_API_READINESS_AUDIT_FA.md`. It marks
the accepted Phase 1 no-paid-API/local scope complete and gives a provisional 55%
whole-real-release coordinate, with the remaining weight explicitly assigned to
licensed real data, validation, financial methodology and production operations.

## Snapshot

- **Phase:** Phase 0 is owner-approved. Phase 1 — Data Foundation — is active.
- **Branch:** Phase 1 work is isolated on `codex/phase-1-data-ui`; `main` remains
  untouched pending a separate owner-approved merge.
- **Application:** a Persian RTL personal-wealth dashboard exists in `apps/web` with
  category-first portfolio session entry, filtered asset types, asset-specific units,
  and an optional no-typing Persian calendar purchase-date picker, market watch,
  deterministic per-holding and total profit/loss calculation, market watch,
  sortable holdings and market tables (numeric columns default descending), a compact
  asset workflow split into List, Asset Center, Analysis, and Decisions, risk/data readiness surfaces, and
  explicit source/freshness labels. The analysis workspace now separates summary,
  geopolitical, political/policy, macroeconomic, industry/supply-demand, technical,
  bubble/valuation, and portfolio/risk lenses across short- and long-term horizons.
  A deterministic, version-labelled multi-driver what-if engine reports per-holding
  and portfolio impacts, but its disclosed UI sensitivities are not calibrated or
  approved as forecasts. A clearly labelled ten-position, cross-asset demo portfolio
  is the default for a fresh browser session so every browser can evaluate the full
  product immediately; an explicit switch returns to the browser's personal portfolio.
  The demo spans precious metals, currency, cash/deposit,
  equities, ETF, crypto, property, and private business. It supports realistic UI
  evaluation without presenting synthetic holdings or cost basis as user or market data.
  In demo mode, a versioned full-experience laboratory supplies 14 explicitly
  synthetic market quotes and activates scenario, multi-lens analysis, premium,
  portfolio weights, concentration, return, stress, and per-asset decision views.
  All eight analysis lenses now use `ASHA_SYNTHETIC_INTELLIGENCE_V1` to calculate
  short/long-horizon momentum, 20-observation volatility, maximum drawdown, premium
  distance/range where applicable, best/worst scenario impact, score breakdown,
  decision amount/reason, and invalidation condition from a versioned 90-observation
  synthetic history. The same engine ranks same-class and cross-class routes, enforces
  drawdown tolerance, liquidity target, concentration cap, and rotation limits, and
  produces the overall demonstration action. It does not invent VaR, Sharpe, or
  statistical confidence from the synthetic series. Supported metal examples also
  expose a versioned synthetic premium-history fixture. `ASHA_SANDBOX_DECISION_V1`
  remains the lower-level constraint calculation feeding this engine; every surface is
  labelled synthetic, execution remains disabled, and the prior personal portfolio
  is restored when the laboratory is closed. These are product-experience fixtures,
  not market claims or financial recommendations. Personal mode now offers explicit
  local PostgreSQL save/restore; browser data is never uploaded or overwritten
  automatically, and demo holdings are never persisted. The UI
  uses Asha's matte-white and pastel-violet token layer,
  organic radii, accessible contrast, a custom inline SVG mark, and a matching favicon.
  Persian typography now bundles the variable Vazirmatn font and uses a readable
  13px minimum supporting-text size with a consistent heading/body scale. The Asset
  Center explicitly overrides the legacy compact theme so facts, values, signals,
  and card titles keep the same hierarchy at desktop and responsive widths.
  The oversized overview slogan has been replaced by a compact command bar; card,
  table, panel, and guardrail spacing is tightened to reduce scrolling without hiding
  provenance or safety state. Every monetary UI output is paired as toman and USD. The
  conversion rate comes from the labelled `USD_IRR` observation; demo portfolio values
  use an explicit synthetic rate, and a missing rate yields an unknown counterpart
  instead of a fabricated conversion.
- **Dashboard priority:** the first page now prioritizes the owner's portfolio and
  a high-importance opportunity surface. Market watch is removed from the overview
  and remains available through its own tab. Portfolio positions are grouped into
  compact, keyboard-accessible asset-category accordions; opening a category reveals
  its holdings and provides a direct route to each Asset Center. Opportunity absence is explicit; only
  already-labelled demo opportunity notifications can appear as synthetic examples.
  Decorative geometric glyphs have been removed from navigation, analysis, risk,
  review, and overview cards so labels and financial state carry the hierarchy
  directly.
- **Portfolio operations:** holdings can now be created and edited through the same
  category-first, unit-aware form, including preservation of an optional Jalali
  purchase date. Deletion requires a separate confirmation dialog. Wide portfolio,
  premium, and market tables keep horizontal scrolling inside the table surface
  instead of expanding the entire page.
- **Information architecture:** selecting a holding carries its context into a
  three-column Asset Center (information, analysis readiness, decision readiness),
  the multi-lens analysis tab, and the dedicated per-asset decision tab. The overview
  retains only a compact decision brief so the daily dashboard stays scannable. In
  the labelled laboratory, Asset Center now exposes the selected holding's calculated
  homogeneous and heterogeneous actions plus the best overall portfolio action,
  each with its score-derived explanation, horizon, method ID, and disabled
  execution state; readiness-gate detail remains in the dedicated Decisions tab.
- **Assistant identity:** the owner-facing decision assistant is named **Asha / اشا**;
  Gold/Silver AI remains the repository and product identity.
- **Decision taxonomy:** the owner-approved UI separates homogeneous comparisons
  within an asset class, heterogeneous conversion comparisons across classes, and
  a best overall portfolio action. `DECISION_FRAMEWORK_UI_V1` deterministically
  reports readiness gates and currently fails closed; it does not rank targets or
  produce financial actions while methodology, owner constraints, Iranian history,
  backtesting, and walk-forward validation remain unresolved.
  The separately labelled sandbox decision engine can render a complete interaction
  flow, but its six passing gates are synthetic UI fixtures and do not unlock or alter
  this real readiness state.
  The Decisions tab captures the owner's five explicit constraints (liquidity
  reserve, concentration cap, tolerated drawdown, and short/long horizons). They
  remain session-local until the owner explicitly saves the personal portfolio;
  that action persists and versions them atomically with holdings. Completing them
  opens only that single gate.
- **Bubble boundary:** for supported gram-based gold and silver holdings, the UI can
  compute a raw current metal-content premium only when the domestic quote, global
  ounce quote, and USD/IRR quote are all present and valid. Historical minimum,
  average, and maximum remain explicitly unavailable until Iranian point-in-time
  history and an owner-approved, backtested methodology exist. Coins are excluded
  from this interim calculation because their exact reference specification is not
  yet approved. The clearly labelled laboratory separately supplies
  deterministic synthetic current/minimum/average/maximum figures for UI evaluation;
  those fixtures never enter the real premium path.
- **Calendar boundary:** all user-facing dates use the Persian calendar and Tehran
  time. New purchase dates are entered as Jalali `YYYY/MM/DD`. Provider timestamps and
  audit storage remain ISO-8601 UTC so ingestion, ordering, and provenance stay
  interoperable; they are converted only at the presentation boundary.
- **Notifications:** a session-local notification center detects severe moves only by
  comparing two newer, valid, same-unit observations within 24 hours. Instrument-specific
  thresholds are deterministic. Stale-data alerts fail closed. Opportunity alerts are
  available as clearly synthetic demo content only; real opportunity claims remain
  disabled until an approved, backtested, walk-forward-validated methodology exists.
- **Live data:** the normalized `/api/market` boundary supports an eight-symbol keyed
  Navasan adapter for 18k gold, mesghal, five coin products, and free-market USD.
  On ۱۴۰۵/۰۶/۰۹ the owner obtained a replacement key from the official bot; it was
  transferred directly into Git-ignored local configuration and a fresh live check
  returned all eight normalized observations. The setup script itself does not revoke
  provider keys. Provider `dailyCurrency` and `ohlcSearch` contracts are now
  implemented behind a loopback/same-origin route, but no historical request or
  backfill has been made. Its string values
  and Unix timestamps are normalized deterministically. The official public table
  establishes a toman contract; direct-toman 18k/USD values and fixed thousand-toman
  mesghal/coin scales are encoded per symbol, while wrong scale/unit ranges fail closed.
  A local Persian plan-only surface now validates proposed Jalali ranges and approved
  symbols, reports one planned OHLC call per selected symbol, and keeps execution
  disabled without consuming quota or storing data.
  A later provider connection timeout was reported explicitly; stale Rahavard values
  remain visible only as provenance and are never presented or used as a current rate.
  The free-plan cache now enforces at least 24,000 seconds (6h40m), which schedules
  at most 112 calls in any continuously running 31-day window. Before
  every uncached Navasan call, PostgreSQL now serializes workers and appends an
  immutable reservation; a conservative 115-call rolling 31-day limit preserves five
  calls of safety headroom below the provider's 120-call plan. Missing quota storage
  or exhausted allowance fails closed before network access. The loopback Data Trust
  card and `/api/health` show only aggregate usage and remaining calls. An explicitly
  authorized live verification on ۱۴۰۵/۰۶/۱۰ returned all eight approved valid quotes;
  the durable counter then showed 3 used and 112 remaining, with no historical request
  or write. GoldAPI.io now uses its
  current official `/api/price/{metal}/{currency}` route and rejects a response unless
  the metal, USD currency, Unix time and plausible range match the request. Its
  documented ordered daily-history range is normalized separately, split into
  inclusive chunks of at most 90 days, and audited for gaps without interpolation.
  A local Persian plan-only surface calculates the exact future request count for
  XAU and XAG while purchase, network access and storage stay locked. XAUS and
  Gold-API.com are now fetched independently on each
  uncached refresh: XAUS supplies the displayed informational XAU/XAG feed when valid,
  while Gold-API.com is an independent public cross-check and becomes the display
  fallback only if XAUS fails. Their status remains informational and cannot unlock a
  decision. A hidden-input PowerShell setup command writes provider keys only
  to Git-ignored `.env.local`; its owner-facing prompts are now Persian and keep the
  revoked-key confirmation mandatory. An owner-approved Rahavard browser capture supplies a local-only manual
  snapshot for 13 instruments; raw IRR provenance is retained, display values use an
  exact IRR/10 conversion, and every observation becomes stale after 60 minutes. It is
  not an automated feed and stale values are excluded from portfolio valuation. No
  fabricated market value enters the real-data path; synthetic values exist only in
  the clearly labelled laboratory and carry the `asha-sandbox` provenance on every record.
  The official TGJU web-service/order path is exposed as a pending licensed source;
  no page scraping, credential reuse, hidden endpoint abuse, or third-party script
  injection is used.
  The market-watch page is independent of the demo portfolio and always renders the
  validated online feed. Duplicate instruments are selected by explicit status,
  quality, source-priority, and observation-time rules, so a valid keyed Navasan rate
  outranks a valid manual Rahavard duplicate without depending on insertion order.
- **Repository:** Phase 1 branch publication and upstream tracking are verified. The
  repository was made public for transfer; access policy should be reviewed before
  licensed data, operational configuration, or sensitive functionality is added.
  The initial remote CI failure is resolved at the
  published repair HEAD; current database work is a development handoff, not a release. The
  active canonical directory is the current checkout on this Windows host. Its
  development history supersedes older copies, which remain preserved.
  The published branch tracks `origin/codex/phase-1-data-ui`; `main` is not modified.
- **Decision record:** Phase 1 scope, wealth UI scope, live-source boundary, and the
  temporary Rahavard manual-snapshot boundary are in ADR 0001 through ADR 0004.
- **Data Foundation:** schema version 1 now defines instrument, source, observation,
  validation, quarantine, duplicate, and ingestion-batch contracts. Manual CSV rows
  pass through deterministic registry/unit/decimal/UTC/point-in-time validation;
  invalid rows are retained in quarantine and repeated source events are idempotent.
  A PostgreSQL migration and parameterized transactional repository are implemented
  without loading market values. The Data Trust tab now exposes a loopback-only,
  same-origin CSV operator preview for the six instruments accepted in ADR 0001. It
  reports accepted, duplicate, and quarantined rows without returning raw payloads;
  the revalidation-and-commit path is wired to the transactional repository behind
  an explicit enable flag and loopback-only PostgreSQL URL. Runtime PostgreSQL,
  applied migrations and current-source integration evidence are connected on the
  transferred host; no real market observations have been committed yet. The
  development checkpoint adds migration
  checksums/rollback, database probes, immutable batch/truncate protection, correction
  constraints, exact decimal limits and server-controlled collection time; real
  PostgreSQL integration and fixture restore passed both isolated GitHub CI and the
  transferred Windows owner host. Local observation persistence is connected.
  Migrations 0003 and 0004 add versioned portfolio, holding and preference tables
  with forced row-level security, least-privilege grants and conflict detection.
  Owner constraints and analysis/decision horizons save and restore in the same
  transaction as holdings, with no assumed financial defaults. The API remains loopback-only;
  production identity and public multi-user persistence are not implemented.
  Migration 0005 attaches observations to immutable Source contract versions and
  adds versioned Dataset, Assumption, Feature, Model, Methodology, and evaluation-only
  Decision records. Dataset membership is exact and cutoff-bounded; registry rows
  cannot be updated, deleted, or truncated. Runtime access is read-only, and no real
  financial decision has been created or enabled.
  Migration 0006 adds immutable source-reconciliation records and requires a bounded
  plain-language reason on every correction. Migrations 0007–0010 add exact transaction and
  evaluation-only valuation lineage plus immutable provider-call reservations;
  122 unit and 14 real PostgreSQL tests pass locally; source coverage is 94.25%
  lines, 78.49% branches and 94.53% functions.
  GoldAPI global-history checkpoint `eab4b16` passed GitHub quality/audit and real
  PostgreSQL jobs in run 33489418166; remote `main` remained unchanged.
  Navasan free-plan safety checkpoint `6b64e16` also passed both GitHub jobs in run
  33493075764; remote `main` remained unchanged.
  In the fresh-session laboratory, a fixed
  five-row CSV sample exercises preview plus a memory-only commit result (three
  accepted, one duplicate, one quarantined) without reaching the server or implying
  persistence.
- **Public review:** Asha is available through a public Sites URL for UI review. It
  has no shared portfolio backend: each visitor's holdings remain in that browser
  session and are not visible to the owner or other visitors. The public operator
  import surface is explicitly disabled because its hostname is not loopback.
- **Operational visibility:** `GET /api/health` and the Data Trust engine panel expose
  web, market, persistence, scenario, and financial-decision readiness without secrets.
  The response remains `evaluation_only`. A read-only GitHub Actions workflow now
  encodes install, lint, typecheck, build, test, and production-audit gates; the first
  remote run exposed the now-resolved Node 22 TypeScript test-command issue. The
  default quality command also enforces source-only coverage regression floors. The
  database job uses a real PostgreSQL service and matching in-container
  backup/restore clients; it passed for the code checkpoint described above.
  Health exposes `provenance-registry: registry_ready` separately from the still
  blocked financial-decision engine.
- **Open-source review:** high-star same-concept projects were license-screened.
  AGPL product code was not copied; compatible patterns were independently implemented
  and recorded in `docs/07-engineering/OPEN_SOURCE_ADOPTION.md`.

## Immediate Next Step

See `NEXT_TASK.md`.
