# Changelog

All notable changes to this project are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Unreleased entries describe
development-branch changes, not a release or merge to `main`. Current operational
state is recorded in `docs/10-project-state/CURRENT_STATE.md`.

## [Unreleased]

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
- Local typecheck, lint, production build, 94 unit tests, and 14 real PostgreSQL
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
