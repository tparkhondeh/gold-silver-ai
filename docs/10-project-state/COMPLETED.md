# Completed

**Source of truth for:** what has actually been finished and (where applicable)
merged to `main`. This is a log, not a plan — see `docs/01-product/ROADMAP.md` for
what's ahead.

## Phase 0 — Foundation & Governance

**Status:** Complete on branch `phase-0-foundation`; owner approved continuation
into Phase 1. This local audit does not establish remote `main` merge state.

Delivered:
- Git repository initialized; `main` (empty, stable) and `phase-0-foundation`
  (this work) branches established.
- `CLAUDE.md` — concise operating rules and source-of-truth index.
- `README.md`, `CHANGELOG.md`.
- Full documentation architecture under `docs/` (governance, product,
  architecture, market, portfolio, data, AI, engineering, decisions, operations,
  project state) — see `PHASE_0_AUDIT.md` for the complete file list.
- Governance: development workflow, quality gates, stability policy, change
  management, project rules.
- All known product/technical requirements from the project brief recorded as
  documented requirements (not implemented).
- All unresolved decisions explicitly marked and centralized in
  `OPEN_DECISIONS.md`.

**Pre-stability refinement pass (2026-08-11):**
- Split all open decisions into Tier A (Owner-Critical) / Tier B
  (Implementation/Engineering) per a new decision-tiering framework in
  `docs/00-governance/PROJECT_RULES.md` § 3.
- Fixed a contradiction this introduced in `CLAUDE.md` § 9 (it previously said
  any technology/vendor choice always stops for owner approval).
- Established Decision Provenance and the Assumption Registry as fixed
  architecture requirements in `docs/06-ai/DECISION_ENGINE.md`.
- Established Point-in-Time Data as a fixed architecture requirement in
  `docs/02-architecture/DATA_ARCHITECTURE.md`, with cross-references from
  `docs/03-market/HISTORICAL_ANALYSIS.md`, `docs/05-data/HISTORICAL_DATA.md`, and
  `docs/05-data/DATA_DICTIONARY.md`.
- Sharpened the LLM/Deterministic Engine boundary in
  `docs/02-architecture/AI_ARCHITECTURE.md` into an explicit call chain and
  Financial Engine Contract.
- Full details: `PHASE_0_AUDIT.md` refinement-pass addendum.

**Pre-Stable Foundation audit (2026-08-11):** final general-Foundation audit
across decision governance, architecture governance, data governance, financial
safety, engineering governance, long-term maintainability, Iran-specific
constraints, operational safety, and documentation architecture. Real gaps found
and fixed (all as edits to existing documents, no new files): reversibility
classification tied to decision tiering; a Breaking vs. Non-Breaking Architecture
& Contract Change cycle; a Component/Feature Lifecycle and New Capability
Checklist; Data Lineage and an explicit correction-provenance chain; an explicit
Quarantine state for flagged data; Schema Evolution rules; a No-Single-Point-of-
Failure requirement for data sources; explicit Iran operational constraints
(sanctions, IP/payment/licensing instability); an explicit Analysis →
Recommendation → Approval → Execution boundary; Operational Safety States
(Automation On/Paused, Execution Disabled, Safe Mode); a Dependency Registry
clarification; Environment Separation; and Backup Restore-testing + RPO/RTO
requirements. Full details: `PHASE_0_AUDIT.md` § 15.

## Phase 2 — Completed Units on the Synthetic Laboratory Branch

**Status:** active on `codex/phase-2-decision-engine`, created from owner-accepted
Phase 1 checkpoint `0f90210`; not merged to `main`.

### Synthetic contract and no-decision foundation — ۱۴۰۵/۰۶/۱۰

- ADR 0009 records the owner's synthetic-only, non-operational Phase 2 boundary.
- The isolated Python 3.12 package defines strict versioned JSON contracts, canonical
  fingerprints, a fixed 120-period/four-path synthetic fixture, versioned synthetic
  assumptions, point-in-time availability and a no-decision coverage baseline.
- Real names/units, financial-use or execution flags, unapproved methodology claims,
  future leakage, tampering and invalid cutoffs fail closed.
- Bounded canonical UTF-8 JSON artifacts reject duplicate keys, invalid encoding,
  alternate formatting and oversized input. Exact replay rejects a resealed false
  result or a result from another model.
- Twenty standard-library laboratory tests pass locally. Fixture/baseline checkpoint
  `fcfbb22` passed web, real PostgreSQL and Python laboratory jobs in GitHub run
  [33509106798](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33509106798).
- Canonical artifact checkpoint `10de1d7` passed all three jobs in GitHub run
  [33509410256](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33509410256).
- Constant synthetic-cash, period-rebalanced synthetic 1/N, and initially equal
  no-trade comparison controls use only then-known levels, count delayed carry-forward, and exactly replay cumulative
  change and maximum drawdown. Twenty-five laboratory tests pass locally; these
  controls are permanently no-decision and are not an approved methodology.
- Cash/1N control checkpoint `a5087d6` passed all three jobs in GitHub run
  [33509893452](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33509893452).
- No-trade checkpoint `804657b` passed all three jobs in GitHub run
  [33510192013](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33510192013).
- A versioned, dataset-bound walk-forward plan generates parameterized rolling or
  anchored folds with purge/embargo separation and point-in-time training membership.
  Thirty tests pass, including exact 54-fold identity, delayed-row exclusion,
  canonical artifact replay, gap/mismatch rejection and resealed-tamper rejection.
- Walk-forward checkpoint `dda4cfa` passed all three jobs in GitHub run
  [33510661448](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33510661448).
- Added bounded Parquet transport with hash-locked Apache-2.0 `pyarrow==25.0.1` after
  official compatibility/license/wheel and OSV review. PyArrow performs serialization
  only; exact schema/metadata/size limits and canonical JSON fingerprint reconstruction
  fail closed. Thirty-four laboratory tests and `pip check` pass locally.
- Parquet checkpoint `cd9d8d3` passed all three jobs, including hash-locked Linux
  installation, in GitHub run
  [33511252725](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33511252725).
- Added the versioned, dataset-bound point-in-time synthetic return matrix. Its pinned
  109-row reference exposes 11 delayed carry-forwards, exact artifact replay, invalid-
  range and resealed-tamper rejection. Thirty-nine laboratory tests pass; no model or
  decision is produced.
- Point-in-time feature checkpoint `d1363c7` passed all three jobs in GitHub run
  [33511686844](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33511686844).
- Added train-only population z-score statistics bound to the exact dataset, matrix,
  walk-forward plan and fold. Hand calculations, unchanged statistics after test-tail
  mutation, explicit zero variance, exact artifact replay, incomplete-range rejection
  and resealed-tamper rejection bring the laboratory to forty-five passing tests.
- Train-only standardizer checkpoint `cf6e362` passed all three jobs in GitHub run
  [33512088284](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33512088284).
- Added the exact train-fitted test transform with explicit zero-variance output,
  complete test-interval enforcement, pinned reference identity, full upstream
  provenance, artifact replay and foreign/tampered-standardizer rejection. Fifty tests
  pass; no prediction, score, allocation or decision is produced.
- Train-fitted transform checkpoint `8ec4b1b` passed all three jobs in GitHub run
  [33512453084](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33512453084).
- Added train-only inverse-volatility comparison weights with exact-sum rounding,
  zero-variance exclusion, all-zero fail-closed behavior, pinned reference identity,
  complete provenance/artifact replay and tamper rejection. Fifty-five tests pass;
  the output remains no-decision and is not an approved allocation.
- Inverse-volatility weight checkpoint `5cca28b` passed all three jobs in GitHub run
  [33512985341](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33512985341).
- Added exact test-fold evaluation of the frozen train-only weights. The versioned
  artifact reports the period path, cumulative change and maximum drawdown, requires
  complete upstream provenance and exact replay, and rejects incomplete or resealed
  false results. Sixty tests pass; no financial decision or execution is enabled.
- Frozen-weight evaluation checkpoint `a41e931` passed all three jobs in GitHub run
  [33513624194](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33513624194).
- Added a versioned multi-fold comparison report that recomputes every synthetic
  walk-forward fold, preserves its exact training/test and artifact provenance, and
  rejects incomplete coverage or omitted/resealed folds. An explicit no-aggregation
  policy prevents a headline performance claim. Sixty-five tests pass.
- Multi-fold comparison-report checkpoint `486fb6b` passed all three jobs in GitHub
  run [33514166000](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33514166000).
- Added versioned train-only population covariance with an exact symmetric synthetic
  matrix, zero-variance disclosure, full upstream provenance and canonical replay.
  Future test changes cannot alter fitted values and resealed false entries fail
  closed. Seventy tests pass; it makes no risk or allocation decision.
- Train-only covariance checkpoint `39e29dd` passed all three jobs in GitHub run
  [33514636287](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33514636287).
- Added versioned train-only Pearson correlation derived from the reviewed covariance
  artifact. Zero-variance paths are excluded/disclosed, an insufficient active set
  fails closed, future test changes cannot alter fitted values, and exact replay is
  required. Seventy-five tests pass without selecting a portfolio methodology.

## Phase 1 — Completed Units on the Working Branch

**Status:** completed units below are on `codex/phase-1-data-ui`, not merged to
`main`. The stabilization commits are now confirmed on the private remote;
subsequent changes still require their own push and CI verification.

### Fail-closed Navasan history authorization — ۱۴۰۵/۰۶/۱۰

- A configured live key can no longer enable `dailyCurrency` or `ohlcSearch` by
  itself. Real history now requires both an explicit execution switch and a bounded
  reference to an approved written-license record.
- A controlled request to the running local app returned HTTP 423 before quota or
  network access; usage remained 4 used / 111 remaining.
- `/api/health` exposes the history boundary separately, and the no-provider local
  readiness command now requires its exact `locked` state. An accidental enablement
  therefore blocks Phase 1 readiness instead of remaining silent.
- The local Persian history planner reads the same health contract. It shows a safe
  lock label only for the exact `locked` state and otherwise shows a fail-closed
  warning; its execution control remains disabled in every state.
- Local typecheck, lint, build, 129 unit tests and 16 real PostgreSQL tests pass with
  93.78% line, 79.51% branch and 94.67% function coverage.
- Working-branch checkpoint `12728ee` passed both GitHub Actions jobs in run
  [33500322761](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33500322761);
  remote `main` remained unchanged.
- Monitoring checkpoint `58c3325` passed both GitHub Actions jobs in run
  [33500854728](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33500854728);
  remote `main` remained unchanged.
- Owner-local visibility checkpoint `2908564` passed both GitHub Actions jobs in run
  [33501750783](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33501750783);
  remote `main` remained unchanged.

### Dependency security re-audit — ۱۴۰۵/۰۶/۱۰

- The live-registry production audit is clean. The exact full development tree now
  reports one moderate advisory, narrowed from the older four-finding record, only
  through drizzle-kit's deprecated esbuild loader.
- No unsafe stable upgrade is available. The generator remains local/trusted-input
  only and is not part of production installs; the upstream beta replacement is
  tracked in `KNOWN_ISSUES.md` item 8.

### Navasan next-eligible visibility — ۱۴۰۵/۰۶/۱۰

- Added a deterministic next-call boundary from the newest durable reservation and
  active safe cadence. `/api/health` and the local Persian Data Trust card show the
  first exact time a new live request can be reserved.
- The card also updates its Persian time-remaining label locally every 30 seconds,
  without another health read or provider request.
- The calculation is local-only and consumed no provider allowance; usage remained
  4 used / 111 remaining.
- Local typecheck, lint, build, 126 unit tests and 16 real PostgreSQL tests pass with
  93.75% line, 79.18% branch and 94.63% function coverage.
- Working-branch checkpoint `9a07947` passed both GitHub Actions jobs in run
  [33497221903](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33497221903);
  remote `main` remained unchanged.
- Countdown checkpoint `6ce6d9b` passed both GitHub Actions jobs in run
  [33497834262](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33497834262);
  remote `main` remained unchanged.

### Durable Navasan restart guard and latest status — ۱۴۰۵/۰۶/۱۰

- Enforced the 6h40m live cooldown inside the serialized PostgreSQL reservation
  transaction. Process restarts, hot reloads and browser refreshes can no longer
  bypass the in-memory cache and spend another call early.
- Added migration 0011 with exactly one latest operational-status row. It stores only
  success/failure, duration and normalized quote count—never credentials, payloads,
  prices or long-term market history. The local Persian card explains the result.
- A controlled local replay kept usage unchanged at 4 used / 111 remaining. The extra
  fourth reservation exposed the pre-fix restart gap and is retained honestly.
- Local typecheck, lint, production build, 124 unit tests and 16 real PostgreSQL tests
  pass with 93.87% line, 78.81% branch and 94.58% function coverage. A third verified
  local backup restored and compared all 25 governed tables.
- Working-branch checkpoint `23a8e82` passed both GitHub Actions jobs in run
  [33496090925](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33496090925);
  remote `main` remained unchanged.

### Navasan free-plan cadence and quota visibility — ۱۴۰۵/۰۶/۱۰

- Replaced the former six-hour free cadence with a deterministic 6h40m minimum. A
  continuously running 31-day window schedules at most 112 calls, below the 115-call
  application ceiling and the provider's 120-call allowance.
- Added non-secret used/remaining quota details to local health and a Persian
  loopback-only Data Trust card. Invalid or faster free settings fall back safely.
- One owner-authorized live request returned all eight approved valid Iranian quotes;
  the counter then showed 3 used and 112 safe calls remaining. No historical request
  or storage occurred.
- Local typecheck, lint, production build, 122 unit tests and 14 real PostgreSQL tests
  pass with 94.25% line, 78.49% branch and 94.53% function coverage. Working-branch
  checkpoint `6b64e16` passed both GitHub Actions jobs in run
  [33493075764](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33493075764);
  remote `main` remained unchanged.

### GoldAPI global-history foundation — ۱۴۰۵/۰۶/۱۰

- Corrected the keyed live adapter to GoldAPI's current official price route and
  required exact XAU/XAG, USD, Unix-time and plausible-range agreement.
- Added the documented ordered daily-history contract, inclusive 90-day chunking,
  missing-date audit and a Persian local-only request-count planner. Duplicate,
  unordered, out-of-range, wrong-pair or undocumented responses fail closed.
- No provider request, token, purchase or historical write occurred. The local suite
  passes 115 unit tests with 94.19% line, 77.80% branch and 94.41% function coverage.
- Checkpoint `eab4b16` passed GitHub quality/audit and real PostgreSQL jobs in run
  33489418166; remote `main` remained unchanged.
- Added a Persian final-stage API purchase checklist using dated official public
  terms. It recommends no purchase now and leaves payment/vendor acceptance to the
  owner gate.

### One-step owner-local launcher — ۱۴۰۵/۰۶/۱۰

- Added a Windows-local command that starts project PostgreSQL, validates the exact
  protected three-key persistence file and starts the web app only on loopback.
- It rejects missing, disabled, duplicate, unexpected or malformed entries and
  remote, privileged, credential-free or option-bearing database URLs.
- The command recognized the real running application as healthy without printing a
  credential. Typecheck, lint, build, 103 unit tests and 14 real PostgreSQL tests pass.
- Checkpoint `38fba17` passed both GitHub jobs in run 33480065419; remote `main`
  remained unchanged.

### Fail-closed local readiness command — ۱۴۰۵/۰۶/۱۰

- Added a no-provider command that accepts only the exact loopback health endpoint
  on port 4174 and reports a simple local-evaluation result.
- It requires web, persistence, quota, provenance and ledger readiness, while also
  requiring scenario/demo and financial-decision locks to remain in place.
- The running application passed the command. Typecheck, lint, production build,
  100 unit/contract/API tests and 14 real PostgreSQL tests pass locally.
- Checkpoint `d3da848` passed both GitHub jobs in run 33479256145; remote `main`
  remained unchanged.

### Verified owner-only local backup — ۱۴۰۵/۰۶/۰۹

- Added a manual command that writes a unique custom-format backup only under the
  protected Git-ignored project cache and publishes a SHA-256 manifest.
- The command performs a full restore into a temporary database, matches the migration
  journal and row counts for all 24 governed tables, and removes the temporary database
  before reporting success. It never replaces or resets `asha_local`.
- Two real local backups passed; 96 unit/contract/API tests and 14 real PostgreSQL tests
  pass. Encryption/offsite/scheduling/retention remain production-gated.
- Checkpoint `5fd67d0` passed both GitHub jobs in run 33478298802; remote `main`
  remained unchanged.

### Test coverage and portfolio repository hardening — ۱۴۰۵/۰۶/۰۹

- Added source-only regression floors of 85% lines, 65% branches and 80% functions
  to the default quality command; generated build output is not counted.
- Added direct unit coverage for empty/exact portfolio restore, atomic versioned save,
  and stale-version failure before replacing holdings.
- Passed 94 unit/contract/API tests and 14 real PostgreSQL tests locally. Checkpoint
  `01095cb` passed both GitHub jobs in run 33477121188; `main` stayed unchanged.

### Navasan quota and history foundation — ۱۴۰۵/۰۶/۰۹

- Replaced the exposed key through the official bot and stored it only in local,
  Git-ignored configuration; eight approved live quotes passed normalization.
- Added migration 0010 with immutable request reservations, one cross-worker advisory
  lock, a 115-call rolling 31-day ceiling and five-call safety reserve.
- Implemented and tested the official daily-update and OHLC history contracts behind
  a local-only same-origin route. No historical request or row was loaded.
- Added a local Persian plan-only surface that validates a proposed Jalali range,
  deduplicates the eight approved symbols, calculates one OHLC request per symbol,
  and visibly keeps real execution locked without consuming provider quota.
- Added a deterministic offline OHLC continuity audit for unobserved provider dates,
  duplicates, range/instrument violations and Tehran timestamp/date mismatches. It
  uses synthetic fixtures, inserts no values and cannot authorize storage.
- Passed typecheck, lint, production build, 90 unit tests and 14 real PostgreSQL
  migration/isolation/concurrency/backup-restore tests.
- Checkpoint `8a21a97` passed both GitHub quality jobs in run 33421273488.
- Prepared the researched licensed-backfill proposal, explicit no-interpolation gap
  policy, acceptance evidence checklist and no-secret Persian vendor inquiries. This
  documentation checkpoint does not record an owner decision, contact a vendor,
  authorize a purchase or load historical data.
- After explicit owner authorization, sent the no-secret licensing/storage inquiry
  through Navasan's official contact bot. The Telegram client showed the outgoing
  message as read; this is not recorded as vendor permission, purchase authorization,
  or backfill approval.

### Private publication and runtime-command repair — ۱۴۰۵/۰۶/۰۸

- Verified the initial Phase 1 push at `b58f393`, its upstream, and unchanged remote
  main `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`; no backup or tag was pushed.
- Repaired the `.ts` test loader command exposed by the first Linux/Node 22 CI run.
- Local typecheck/lint and 51 tests pass; the repair's remote CI is not yet claimed.


### Local stabilization — ۱۴۰۵/۰۶/۰۸

- Compared the active linked worktree with both older OneDrive checkouts without
  deletion or reset; selected the owner-named active Phase 1 checkout as canonical.
- Added a fail-closed Navasan credential-rotation gate, a hidden-input setup
  acknowledgement, health messaging, and offline API-contract coverage.
- Fixed remaining legacy small-font overrides and inspected all nine UI workspaces;
  the inspected visible text met the 13px minimum and no browser console errors
  were observed.
- Passed local typecheck, lint, production build, and 50 tests. These are not
  PostgreSQL integration, live-provider, remote-CI, or financial-validation results.
- Updated project state to identify GitHub authentication, PostgreSQL, persistence,
  source rotation/history, and real-model validation as unresolved gates.

### Accumulated Phase 1 implementation

- Accepted Phase 1 stack/scope, portfolio UI, source boundary, manual snapshot, and
  notification-safety decisions in ADR 0001–0005.
- Persian local application, portfolio/asset/analysis/decision workspaces, explicit
  demo mode, normalized read-only market boundary, and deterministic UI calculations.
- Data Foundation schema version 1 contracts, strict manual CSV ingestion,
  deterministic validation, idempotency, append-only quarantine design, PostgreSQL
  migration/repository, and isolated tests without loading market values.
- Loopback/same-origin CSV operator preview in the Persian Data Trust workspace,
  including accepted/duplicate/quarantine counts and an explicit persistence lock.
- Asha pastel-violet/matte-white visual token layer plus custom SVG mark and favicon.
- Category-first asset registration that narrows the asset-type selector while
  preserving all twenty supported portfolio asset types and their unit mappings.
- Asset Center decision summary now shows all three owner-approved decision layers
  (homogeneous, heterogeneous, and overall) with deterministic sandbox triggers and
  an explicit non-operational boundary instead of only readiness badges.
- Replaced the eight static sandbox analysis narratives and threshold-only decision
  cards with `ASHA_SYNTHETIC_INTELLIGENCE_V1`: a deterministic 90-observation history,
  momentum/volatility/drawdown calculations, premium range, scenario stress, disclosed
  score weights, per-asset same-class/cross-class routes, amounts, reasons, invalidation
  rules, and a constraint-aware overall portfolio route. Automated tests verify
  repeatability, score arithmetic, rotation caps, drawdown overrides, and lens output.
- Expandable asset-category groups on the overview, with per-category valuation
  state and direct access to each holding's focused workspace.
- Optional Persian purchase-date calendar with month/year navigation, future-date
  blocking, today/clear actions, and no required typing.
- Full create/edit/delete portfolio interaction: editing reuses the category-first
  unit-aware form and preserves the optional Jalali date; deletion has an explicit
  confirmation step.
- Responsive table containment prevents portfolio and market tables from causing
  page-level horizontal overflow, and residual decorative geometry was removed from
  the analysis, risk, and review surfaces.
- Fresh browser sessions now start in the labelled full-experience laboratory, so
  the deterministic synthetic engines are immediately testable across browsers;
  choosing personal mode remains an explicit per-browser preference.
- Bundled Vazirmatn variable font, raised the Persian supporting-text floor to 13px,
  and removed the remaining 8–11px legacy typography from Asset Center facts,
  values, signals, and card headings.
- Guarded PostgreSQL runtime adapter and preview-to-commit operator path with exact
  request-intent matching, loopback-only database configuration, atomic rollback,
  and idempotent repository delegation. A live database remains pending.
- Independent keyless XAUS and Gold-API.com retrieval on every uncached market refresh,
  with XAUS as the informational display feed and Gold-API.com as an explicit
  non-decision cross-check/display fallback, plus hidden local setup for future keyed
  Navasan and GoldAPI.io credentials.
- Navasan's official `latest` response contract is implemented for eight approved
  Iranian instruments with exact toman and per-symbol thousand-toman normalization,
  Unix-time/future-time and plausible-range validation, free-plan quota-aware caching,
  and deterministic tests. The owner-provided local key was live-verified on
  ۱۴۰۵/۰۶/۰۷ without entering Git or a browser response; all eight observations passed.
- Owner-facing money output now uses toman plus USD, with one normalized USD/toman
  rate and no display-only tenfold IRR conversion. Market watch always uses live
  validated quotes even while the separate demo portfolio is active, and deterministic
  source precedence prevents a manual snapshot from replacing a valid keyed feed.
