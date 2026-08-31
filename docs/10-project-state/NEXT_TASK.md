# Next Task

**Source of truth for:** what should happen next.

## Immediate Next Step

Migrations 0003–0009 now cover the owner snapshot, immutable provenance,
exact point-in-time dataset/decision lineage, source-reconciliation records and
mandatory correction reasons, plus the read-only transaction/evaluation-valuation
ledger foundation. Local build, 77 unit tests, 13 real PostgreSQL tests,
restore, activation, and health checks pass. Production account authentication,
empirical divergence thresholds, historical backfill, and the real
financial engine remain separate gates.

1. **OWNER DECISION REQUIRED:** confirm whether the next real release is owner-only,
   invited trusted users, or public customer accounts. Then approve third-party versus
   self-hosted identity and a provider after terms/cost/Iran-access review. Use
   `docs/02-architecture/IDENTITY_RECOMMENDATION.md`; do not trust production identity
   or migrate browser holdings before approval and two authenticated-session tests.
2. After the owner revokes and replaces the exposed Navasan key, implement the
   documented historical endpoints and durable quota accounting. Backfill only
   licensed data within quota; acquire an independent Iranian cross-check if needed.
   Never silently fill missing history or pass stale/invalid data into real analysis.

No remaining implementation item in this immediate list is independent of an
owner-critical access/provider/source decision.

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
