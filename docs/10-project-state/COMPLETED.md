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

## Phase 1 — Completed Units on the Working Branch

**Status:** completed units below are on `codex/phase-1-data-ui`, not merged to
`main`. The stabilization commits are now confirmed on the private remote;
subsequent changes still require their own push and CI verification.

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
