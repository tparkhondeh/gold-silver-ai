# Next Task

**Source of truth for:** what should happen next.

## Immediate Next Step

Migrations 0003–0009 now cover the owner snapshot, immutable provenance,
exact point-in-time dataset/decision lineage, source-reconciliation records and
mandatory correction reasons, plus the read-only transaction/evaluation-valuation
ledger foundation. Local build, 96 unit tests, 14 real PostgreSQL tests,
restore, activation, and health checks pass. Production account authentication,
empirical divergence thresholds, historical backfill, and the real
financial engine remain separate gates.

1. **OWNER DECISION RECORDED:** the next real release is owner-only; no invited users
   or public registration. See ADR 0006.
2. **OWNER DECISION RECORDED:** an external identity service may process only minimum
   login identifiers and session evidence. Portfolio holdings, transactions,
   valuations, calculations and analyses must not be sent to it. See ADR 0007.
3. **OWNER DECISION RECORDED:** keep the current local/demo stage simple without a new
   production login. Before any real personal financial data is hosted, synchronized
   or enabled in production persistence, strong owner-only identity must pass the
   fail-closed gate in ADR 0008.
4. **DEFERRED OWNER DECISION:** at that pre-real-data gate, select the exact provider
   only after written
   Iran-access and cost/terms confirmation. Do not trust production identity or
   migrate browser holdings before approval and two authenticated-session tests.
   A read-only preflight found the current server's Cloudflare API hostname locally
   overridden; if Cloudflare is later approved, obtain hosting-administrator
   authorization and clear `docs/09-operations/DEPLOYMENT.md` first.
5. **IMPLEMENTATION COMPLETE:** the owner replaced the exposed Navasan key; the
   application now reserves every call in an immutable PostgreSQL ledger with a
   conservative rolling limit. The documented `dailyCurrency` and `ohlcSearch`
   contracts are normalized behind a local-only route. A Persian plan-only surface
   validates a proposed range and exact request count without network or storage;
   real execution remains disabled and no historical call was made.
6. **OWNER DECISION REQUIRED BEFORE BACKFILL:** confirm the licensed date scope,
   retention/gap policy and an independent Iranian cross-check. Backfill only data
   explicitly permitted within quota. Never silently fill missing history or pass
   stale/invalid data into real analysis. The recommended option, rejected unsafe
   alternative, evidence, exact gate and ready-to-send Persian vendor messages are
   prepared in `docs/05-data/HISTORICAL_BACKFILL_PROPOSAL.md`. The owner authorized
   and sent the no-secret Navasan inquiry on 2026-08-31; a written response is pending.
   The inquiry does not authorize a purchase or API call.
7. **SAFE PARALLEL IMPLEMENTATION COMPLETE:** the deterministic offline OHLC
   continuity audit now reports unobserved dates, duplicates, range/instrument
   violations and Tehran timestamp mismatches using synthetic fixtures. It never
   interpolates values, calls the provider, writes history or unlocks execution.
8. **SAFE NON-API HARDENING COMPLETE:** the default quality command now measures only
   project source and fails below 85% line, 65% branch, or 80% function coverage.
   Direct portfolio-repository tests prove exact restore, atomic versioned save, and
   stale-version rejection before replacement.
9. **VERIFIED LOCAL BACKUP COMPLETE:** the owner-only backup command creates a unique
   Git-ignored PostgreSQL backup, restores it into a temporary database, compares the
   migration journal and all 24 governed table counts, then removes the temporary
   database. Two real backups passed. Encryption, offsite storage, scheduling,
   retention, and production RPO/RTO remain deferred to the production storage gate.

The API-dependent implementation slice is complete and remains paused at item 6 for
a Tier-A owner decision. The owner explicitly authorized continued independent local
hardening, so testing, backup, documentation and other non-provider work may proceed;
Phase 2 and real financial logic remain blocked until the Data Foundation gate is
accepted.

Vendor contact, subscription purchase and response monitoring are deferred until the
owner's final API-integration stage. The prior Telegram delivery/read state is not
permission. Do not accept terms, commit a cost, or request history before a written
answer is reviewed with the owner.

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
