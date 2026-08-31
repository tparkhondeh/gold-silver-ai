# Changelog

All notable changes to this project are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Unreleased entries describe
development-branch changes, not a release or merge to `main`. Current operational
state is recorded in `docs/10-project-state/CURRENT_STATE.md`.

## [Unreleased]

### Identity proposal and evaluation ledger foundation — ۱۴۰۵/۰۶/۰۹

- Added a Tier-A production identity proposal without selecting or enabling a vendor;
  real identity and portfolio migration remain owner-gated.
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
