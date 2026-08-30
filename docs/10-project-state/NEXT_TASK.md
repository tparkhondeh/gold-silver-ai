# Next Task

**Source of truth for:** what should happen next.

## Immediate Next Step

The owner now requests saving the latest development state for another system.
Transfer instructions are in `CONTINUE_ON_ANOTHER_SYSTEM.md` at repository root.
The checkpoint push is explicitly authorized even though local PostgreSQL tests
remain blocked; it is not release approval. On a new machine, provision independently
instead of applying the old machine's path, SID or ACL repair.
The published code checkpoint `ec3f410` passed both quality and real PostgreSQL CI
jobs in run 33316064205. Do not repeat the resolved Node 22 repair or infer local
Windows/personal-data readiness from the isolated Linux test database.

1. Obtain the requested narrow permission to repair the fresh PostgreSQL cluster's
   Windows ACL for the owner account. Do not reinitialize, move, delete or expose the
   cluster to work around the access failure. See `POSTGRES_FOUNDATION_CHECKPOINT.md`.
2. Run the reviewed local bootstrap as the Windows owner, then execute the real
   PostgreSQL integration/restore suite. Do not enable observation commit from a
   configuration string alone or count unexecuted tests as passed.
3. After local gates pass, commit/push only the development branch and verify both
   GitHub quality and database jobs at the new HEAD. The older Node 22 repair already
   passed run 33304773397; it does not validate the later checkpoint. Preserve
   `main`, backups, tags, credentials and existing personal browser data.
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
