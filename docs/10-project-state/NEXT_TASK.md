# Next Task

**Source of truth for:** what should happen next.

## Immediate Next Step

1. Complete local thematic stabilization commits on `codex/phase-1-data-ui`. The
   local build, lint, typecheck, and 50-test suite pass; preserve every reviewed
   existing change. Do not include `.env.local` or backup branches.
2. Have the owner sign in securely to GitHub on this host. Fetch and inspect remote
   refs, record remote `main`, push only the development branch without force, and
   verify remote branch HEAD, unchanged `main`, upstream, and remote CI. Authentication
   currently blocks this stage; do not claim remote publication or bypass the gate.
3. After stabilization is verified, continue the Phase 1 Data Foundation: provision
   an isolated PostgreSQL runtime, apply versioned migrations, and test transactions,
   rollback, idempotent replay, corrections, quarantine, and point-in-time cutoffs.
4. Add secure user-scoped server-side holding/transaction/valuation persistence.
   Preserve browser data during explicit migration, keep sandbox separate, and test
   refresh plus two independent browser sessions under the same authenticated scope.
5. Complete observation provenance/version fields, source reconciliation, and the
   Source, Dataset, Assumption, Feature, Model, Methodology, and Decision registries.
6. After the owner revokes and replaces the exposed Navasan key, implement the
   documented historical endpoints and durable quota accounting. Backfill only
   licensed data within quota; acquire an independent Iranian cross-check if needed.
   Never silently fill missing history or pass stale/invalid data into real analysis.

## Next Gate: Independent Financial Laboratory

Only after Data Foundation, persistence, provenance, and integration tests pass:

- Create `codex/phase-2-decision-engine` from the verified Phase 1 HEAD, not `main`.
- Build an isolated Python package with audited, pinned permitted dependencies and
  versioned JSON/Parquet contracts; no notebook or automatic execution in runtime.
- Implement `ASHA_DETERMINISTIC_BASELINE_V1`, separate from synthetic engines, with
  train-only normalization, costs/constraints, no-decision rules, traceable outputs,
  short/long horizons, and same-class/cross-class/portfolio alternatives.
- Validate no-trade, cash, 1/N, inverse-volatility, HRP, and minimum-CVaR benchmarks;
  nested point-in-time walk-forward, purge/embargo, crisis tests, and deterministic
  replay precede a manually governed Champion–Challenger registry.
- Expose verified outputs and unresolved inputs honestly in the Persian UI. No
  real-use readiness claim before adequate history, shadow mode, and owner approval.

The owner's staged-development request authorizes these in-scope technical steps;
it does not waive preceding gates, source licenses, secrets protection, or approval
for purchases, destructive changes, public publication, or `main` operations.

## Explicitly Out of Scope

- Automatic trading or order execution; real financial recommendations before the
  required data, methodology, evaluation, and owner-approval gates.
- Any real market value without an approved, auditable source contract.
- Automated Rahavard scraping, reuse of the owner's browser session/cookies, or public
  redistribution of the manual snapshot.
- Merge to `main` without separate owner approval.
