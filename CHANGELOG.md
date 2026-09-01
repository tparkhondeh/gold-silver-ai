# Changelog

All notable changes to this project are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Unreleased entries describe
development-branch changes, not a release or merge to `main`. Current operational
state is recorded in `docs/10-project-state/CURRENT_STATE.md`.

## [Unreleased]

### Navasan next-eligible visibility — ۱۴۰۵/۰۶/۱۰

- Added a deterministic next-call calculation from the newest durable reservation
  and the active safe cadence. Health and the Persian Data Trust card now show the
  first exact time another live call is allowed.
- The calculation reads only local PostgreSQL state and makes no provider request.
  Local usage stayed at 4 used / 111 remaining. Local build, lint, 125 unit tests and
  16 real PostgreSQL tests pass with 93.72% line, 79.09% branch and 94.59% function
  coverage.
- Working-branch checkpoint `9a07947` passed both GitHub Actions jobs in run
  [33497221903](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33497221903);
  `main` remained unchanged.

### Durable Navasan restart guard and latest-status monitoring — ۱۴۰۵/۰۶/۱۰

- Added migration 0011 with one mutable operational-status row that keeps only the
  latest Navasan success/failure, duration and quote count. It stores no provider
  payload, credential, price, or long-term market history.
- Moved the free-plan refresh interval into the PostgreSQL reservation transaction.
  Browser refreshes, hot reloads and process restarts now fail closed during the
  6h40m cooldown instead of spending another call. A controlled local replay kept
  usage unchanged at 4 used and 111 remaining.
- A third owner-only backup restored and compared all 25 governed tables. Local
  build, lint, 124 unit tests and 16 real PostgreSQL tests pass with 93.87% line,
  78.81% branch and 94.58% function coverage.
- Working-branch checkpoint `23a8e82` passed both GitHub Actions jobs in run
  [33496090925](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33496090925);
  `main` remained unchanged.

### Navasan free-plan cadence and quota visibility — ۱۴۰۵/۰۶/۱۰

- Raised the free-plan refresh floor from six hours to 6h40m, limiting a continuously
  running 31-day window to at most 112 scheduled calls below the existing 115-call
  hard ceiling and provider's 120-call allowance.
- Added aggregate used/remaining quota health and a loopback-only Persian status card;
  no credential or raw provider response is exposed.
- One authorized live check returned eight approved valid Iranian quotes. No history
  was requested or stored. Local build, lint, 122 unit tests and 14 real PostgreSQL
  tests pass with 94.25% line, 78.49% branch and 94.53% function coverage.
- Working-branch checkpoint `6b64e16` passed both GitHub Actions jobs in run
  [33493075764](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33493075764);
  `main` remained unchanged.

### GoldAPI global-history foundation — ۱۴۰۵/۰۶/۱۰

- Updated the keyed live adapter to GoldAPI's current official price endpoint and
  added exact pair, timestamp and range checks.
- Added strict daily-history normalization, deterministic 90-day request chunking,
  explicit missing-date auditing and a local Persian preview planner. No API request,
  token, purchase or historical write is part of this change.
- Added a dated Persian purchase-readiness checklist. The local build, lint and 115
  unit tests pass with 94.19% line, 77.80% branch and 94.41% function coverage.
- Checkpoint `eab4b16` passed GitHub quality/audit and real PostgreSQL jobs in run
  33489418166; remote `main` remained unchanged.

### Pre-API readiness audit — ۱۴۰۵/۰۶/۱۰

- Added a concise Persian quality-gate audit and progress map for the owner.
- The accepted local/no-paid-API Phase 1 scope is complete; the provisional whole
  real-release coordinate is 55%, with the remainder explicitly assigned to licensed
  real data, independent validation, approved financial methodology and production
  operations. This estimate is not a financial-readiness claim.

### One-step owner-local launch — ۱۴۰۵/۰۶/۱۰

- Added `npm run local:run` for the prepared Windows owner host. It starts project
  PostgreSQL, validates the protected persistence environment, and starts or confirms
  the web application only on `127.0.0.1:4174`.
- Added strict rejection tests for unsafe runtime keys and database targets. The
  command passed against the real running host without revealing a credential.
- Typecheck, lint, production build, 103 unit tests and 14 real PostgreSQL tests pass;
  source coverage is 93.77% lines, 76.31% branches and 93.96% functions.
- Checkpoint `38fba17` passed both GitHub quality jobs in run 33480065419; remote
  `main` remained unchanged.

### Fail-closed local readiness — ۱۴۰۵/۰۶/۱۰

- Added `npm run ops:check-local`, restricted to the exact loopback health endpoint
  on port 4174; it cannot contact a provider or arbitrary URL.
- The command requires all local database-backed Phase 1 surfaces and treats the
  financial-use lock as mandatory. It exits with failure for a broken contract.
- The running local application passed. Typecheck, lint, production build, 100 unit
  tests and 14 real PostgreSQL tests pass locally; total source coverage is 93.68%
  lines, 75.64% branches and 93.92% functions.
- Checkpoint `d3da848` passed both GitHub quality jobs in run 33479256145; remote
  `main` remained unchanged.

### Verified local backup — ۱۴۰۵/۰۶/۰۹

- Added `npm run db:backup` for unique PostgreSQL custom-format backups in the
  protected, Git-ignored local project directory.
- Every backup is restored into a temporary database and checked against the source
  migration journal and row counts for all 24 governed tables before success is
  reported; the temporary database is then removed.
- Added a SHA-256 manifest, atomic temporary-file publication, path/name validation,
  and two deterministic safety tests. The local suite now passes 96 tests with
  93.49% line, 74.73% branch, and 93.84% function coverage.
- Created and fully restored two real local backups without replacing or modifying the
  primary database. It is owner-only and Git-ignored, but deliberately documented as
  unencrypted and not offsite.
- Backup checkpoint `5fd67d0` passed both GitHub quality jobs in run 33478298802;
  remote `main` remained unchanged.

### Test-coverage and portfolio-persistence hardening — ۱۴۰۵/۰۶/۰۹

- Added an enforced source-only coverage gate using Node's built-in runner: minimum
  85% lines, 65% branches, and 80% functions. Generated build output cannot inflate
  the result.
- Added direct repository tests for empty restore, exact holding/preference restore,
  atomic versioned save, and fail-before-replace behavior on stale versions.
- The local suite now passes 94 tests with 93.44% lines, 74.54% branches, and 93.77%
  functions on the current host; the separate real PostgreSQL suite still passes
  14 tests including independent restore.
- Replaced stale starter/runtime documentation with the actual Asha local boundaries.
- Checkpoint `01095cb` passed the GitHub quality and real PostgreSQL jobs in run
  33477121188; remote `main` remained unchanged.

### Navasan quota and history foundation — ۱۴۰۵/۰۶/۰۹

- Replaced the exposed Navasan credential through the official bot and transferred
  it directly into Git-ignored local configuration; a live check normalized all
  eight approved Iranian quotes without exposing the key.
- Added migration 0010 and an immutable PostgreSQL request-reservation ledger. All
  application workers share a conservative 115-call rolling 31-day ceiling, leaving
  five calls below the provider's free-plan limit as safety headroom.
- Added strict shared normalization for Navasan `dailyCurrency` and `ohlcSearch`
  responses behind a loopback/same-origin route. No historical request or backfill
  was made.
- Added a Persian, local-only backfill readiness planner that validates Jalali dates
  and approved symbols, calculates the exact request count, and keeps execution
  disabled while licensing and independent-source gates remain open. Planning sends
  no provider request and stores no market data.
- Added an offline deterministic OHLC continuity audit that records unobserved Jalali
  dates and marks duplicates, range/instrument violations and Tehran
  timestamp/date mismatches. Synthetic fixtures only; zero interpolation, provider
  calls and historical writes; flagged rows are reported as quarantine-required.
- Local typecheck, lint, production build, 90 unit tests, and 14 real PostgreSQL
  migration/concurrency/restore tests pass.
- Code checkpoint `b0bb80a` passed both GitHub quality and real PostgreSQL jobs in
  run 33417744818.
- Backfill-readiness checkpoint `8a21a97` passed both GitHub jobs in run
  33421273488.
- Added a plain-language licensed-backfill proposal using reviewed official Navasan
  and TGJU material, with safe/rejected options, an exact acceptance gate and Persian
  vendor messages ready for owner authorization. It makes no provider request,
  purchase, source decision or market-data write.
- With explicit owner authorization, sent the proposal's no-secret storage/licensing
  inquiry through Navasan's official contact bot. Telegram marked the outgoing message
  read; a written vendor response is still pending and no permission is inferred.
- Vendor follow-up and subscription purchase were later deferred by the owner until
  the final integration stage. No active monitor, purchase, or historical request is
  part of the current development slice.

### Identity proposal and evaluation ledger foundation — ۱۴۰۵/۰۶/۰۹

- Simplified the local hidden-input market-key setup for the nontechnical owner with
  Persian guidance, safe defaults and Persian plan names; secret values remain local
  and Git-ignored, and the revoked-key confirmation remains mandatory.
- Accepted the staged identity timing in ADR 0008: current local/demo work stays
  simple, while production owner authentication is a fail-closed prerequisite before
  any real personal financial data is hosted or synchronized. Existing controls are
  not weakened and no provider was selected.
- Accepted the third-party identity boundary in ADR 0007: an external service may
  handle only minimum login identifiers/session evidence and must never receive
  portfolio or financial data. No provider was selected or activated.
- Accepted the owner-only audience for the next real release in ADR 0006. This does
  not select a provider or enable production identity, public registration or holding
  migration.
- Added a plain-language Persian Tier-A production identity proposal and a dated
  official pricing/terms snapshot without selecting or enabling a vendor; Iran access,
  real identity and portfolio migration remain owner-gated.
- Recorded a read-only owner-server access preflight: general provider documentation
  is reachable, but an existing local Cloudflare API hostname override blocks that
  candidate's host-readiness; no server configuration was changed.
- Added migrations 0007–0009 and an append-only, forced-RLS transaction and evaluation-only
  valuation ledger with exact Dataset, Methodology, observation and event lineage.
- The normal runtime is read-only for the new ledger. No real transaction/value or
  financial methodology was created; 77 unit and 13 real PostgreSQL tests pass locally.

### Private publication and CI repair — ۱۴۰۵/۰۶/۰۸

- Published only `codex/phase-1-data-ui` at `b58f393` and verified matching remote
  HEAD/upstream, unchanged `main`, and no remote tags or backup branch.
- Diagnosed the first GitHub quality-run failure: Node 22.13.1 could not load `.ts`
  tests without explicit type stripping. Shared test scripts now enable it.
- Added a runtime-command regression test; local typecheck, lint, and 51 tests pass.
  Remote verification of the repaired command follows this commit.

### Phase 1 local stabilization — ۱۴۰۵/۰۶/۰۸

- Preserved and reviewed the accumulated market-adapter, synthetic-intelligence,
  portfolio-interaction, and UI changes in the active Phase 1 checkout.
- Paused Navasan requests until the exposed credential is revoked and replaced;
  API health and setup now make that requirement explicit without returning keys.
- Made the market contract test offline and checked that an unrotated credential
  never reaches the provider.
- Corrected legacy typography overrides; inspected all nine UI workspaces for
  visible text below the 13px supporting-text minimum.
- Local typecheck, lint, production build, and 50 tests passed. PostgreSQL
  integration, remote CI, and remote publication are not verified.
- Reconciled documentation with the real staged-development gates. No Phase 2
  branch or real baseline engine was created; no `main` operation was performed.

### Phase 0 — Foundation & Governance (owner-approved)

- Established repository governance, documentation architecture, and development
  workflow. No application functionality in that phase. Owner approval to continue
  into Phase 1 is recorded; a merge to remote `main` is not claimed by this log.
  See `PHASE_0_AUDIT.md`.
