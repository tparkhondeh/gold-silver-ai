# Current State

**Source of truth for:** where the project stands right now.

_Last updated in the product calendar: ۱۴۰۵/۰۶/۰۹ (Phase 1 active)_

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
seeded and no financial methodology is selected. A plain-language production identity
proposal is documented, but audience/provider approval remains owner-required.

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
  A historical live check on ۱۴۰۵/۰۶/۰۷ returned eight valid observations. That is
  not the current readiness state: the pasted key is considered compromised and
  Navasan requests are now paused until revocation/replacement is confirmed in
  server-side local configuration. The setup script does not revoke provider keys.
  Its string values
  and Unix timestamps are normalized deterministically. The official public table
  establishes a toman contract; direct-toman 18k/USD values and fixed thousand-toman
  mesghal/coin scales are encoded per symbol, while wrong scale/unit ranges fail closed.
  A later provider connection timeout was reported explicitly; stale Rahavard values
  remain visible only as provenance and are never presented or used as a current rate.
  The six-hour process-local cache is best-effort only: restarts and concurrent
  workers can exceed the quota. A durable quota ledger and historical endpoints
  are still required. GoldAPI.io remains a
  keyed global adapter. XAUS and Gold-API.com are now fetched independently on each
  uncached refresh: XAUS supplies the displayed informational XAU/XAG feed when valid,
  while Gold-API.com is an independent public cross-check and becomes the display
  fallback only if XAUS fails. Their status remains informational and cannot unlock a
  decision. A hidden-input PowerShell setup command writes provider keys only
  to Git-ignored `.env.local`. An owner-approved Rahavard browser capture supplies a local-only manual
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
  plain-language reason on every correction. Migrations 0007–0009 add exact transaction and
  evaluation-only valuation lineage; 77 unit and 13 real PostgreSQL tests pass locally.
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
  database job uses a real PostgreSQL service and matching in-container
  backup/restore clients; it passed for the code checkpoint described above.
  Health exposes `provenance-registry: registry_ready` separately from the still
  blocked financial-decision engine.
- **Open-source review:** high-star same-concept projects were license-screened.
  AGPL product code was not copied; compatible patterns were independently implemented
  and recorded in `docs/07-engineering/OPEN_SOURCE_ADOPTION.md`.

## Immediate Next Step

See `NEXT_TASK.md`.
