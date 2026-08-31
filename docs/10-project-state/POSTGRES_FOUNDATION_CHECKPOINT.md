# PostgreSQL Foundation Checkpoint

**Version 0.8.0** · ASHA engineering · ۱۴۰۵/۰۶/۰۹ (2026-08-31) · Work in progress

## AI READING INSTRUCTION

Read `[SPEC]` for verified facts and `[?]` for unverified work. This checkpoint is
not a Data Foundation acceptance report or a financial-readiness claim.

## 1. Scope and actual state

**[SPEC]**

- Branch: `codex/phase-1-data-ui`; reconciliation/correction code checkpoint:
  `0d1c2e9c2b166f89a134ac4f68110a98c017b7bb` (later documentation commits may follow).
- Initial dirty README preserved and corrected; implementation is a development checkpoint.
- Owner subsequently authorized committing/pushing this work for transfer to another computer despite the local database blocker. See the root `CONTINUE_ON_ANOTHER_SYSTEM.md`.
- No merge, public deployment, Phase 2 branch, market ingestion or financial activation is authorized by this handoff.
- Previous CI [33304773397](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33304773397) passed for the published HEAD only.
- Current local gates: typecheck, lint, build, **74 unit/contract tests passed; zero skipped**.
- GitHub [run 33393986374](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33393986374) **PASSED** for checkpoint `0d1c2e9`: quality job (lint/typecheck/build/tests/production audit) and real PostgreSQL migration/integration/restore job.
- Transferred Windows-host PostgreSQL migration/integration/restore: **PASSED**
  (12/12), including versioned portfolio rows, subject isolation, provenance chain,
  point-in-time dataset rejection and immutable restore comparison. Production
  authenticated two-browser persistence remains **NOT IMPLEMENTED**.
- Two independent read-only reviews inspected database safety and readiness/CI. They did not approve financial use or execute real database tests.
- Local evaluation server at `http://localhost:4174/` returned HTTP 200 with
  `evaluation_only`, connected observation persistence, `local_ready` portfolio
  persistence and blocked financial decisions. Four consecutive portfolio reads
  returned the preference-aware snapshot successfully. This is not an authenticated
  production-browser end-to-end test.

## 2. Verified official runtime

**[SPEC]**

| Item | Evidence |
|---|---|
| Source | [Official EnterpriseDB download page](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads) |
| File | `postgresql-17.11-1-windows-x64.exe` in the owner's Downloads directory |
| Bytes | 373033224 |
| Authenticode | Valid; EnterpriseDB Corporation |
| SHA-256 | `F104C552D8495A6F20738C2A03F643164BC64B9985363329E314DEC24559F0B7` |
| Extracted binaries | `.cache/postgres-17.11/runtime/bin` |
| Executed version probes | `postgres --version` and `initdb --version`: 17.11 |
| Installation boundary | Extraction only; no Windows service, firewall change, pgAdmin, StackBuilder or system runtime installation |

**[NOTE]**
Earlier incomplete downloads were not executed and were not deleted. The official
server license remains with the ignored runtime; the installer hash identifies the
locally verified signed file, not an independently published checksum comparison.

## 3. Transferred Windows host

**[SPEC]**

- Fresh cluster: `.cache/postgres-local/data`; initialization completed with UTF-8, checksums and SCRAM authentication.
- Intended network: `127.0.0.1:55432`, UTC, 20 connections and 64 MB shared buffers.
- The old host's sandbox-owned cluster and ACL blocker were not copied or repaired.
- The transferred host initialized a new project-owned cluster directly as its
  interactive Windows owner; no service, firewall rule, public listener or shared
  `Everyone` permission was created.
- PostgreSQL 17.11 is running on `127.0.0.1:55432`. Migrations, least-privilege
  checks, append-only controls, concurrent replay, exact numerics and isolated
  backup/restore all passed locally.
- Activation evidence matches the current source fingerprint. The local web health
  endpoint reports `observation-persistence: connected` when the protected runtime
  environment and `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` are explicitly loaded.
- Existing-data protections remain binding: do not reset, move, delete or broaden
  access to the cluster to work around future failures.

## 4. Implemented controls and verification boundary

**[SPEC]**

- Migration runner: normalized SQL checksums, ordering, advisory transaction lock, journal, one transaction and rollback on pre-commit failure.
- Append-only protection: batch mutation and audit-table truncate rejection; correction source/instrument/time consistency.
- Decimal validation matches `numeric(38,12)` without nonzero precision truncation; impossible calendar dates fail closed.
- CSV system receipt time is assigned at ingestion; supplied timestamps remain raw provenance, not trusted system availability.
- Explicit correction revisions have distinct identities; original observation IDs remain compatible.
- Database URLs reject query/fragment options that could override the loopback host.
- Health performs actual queries. Local portfolio readiness verifies all three
  portfolio tables, forced row-level security and least-privilege mutation grants.
- Local portfolio writes require loopback, same-origin browser metadata and an
  explicit intent header. Optimistic versions reject stale-browser overwrites.
- Browser holdings move only after an explicit owner click; demo holdings never enter
  the persistence API.
- Owner constraints and selected analysis/decision horizons share the same optimistic
  version and database transaction as holdings. Empty inputs remain empty; no risk
  tolerance or financial preference is guessed.
- Migration 0005 adds immutable Source contract versions; typed, fingerprinted
  Dataset/Assumption/Feature/Model/Methodology artifacts; exact dataset observation
  membership; and evaluation-only Decision records with complete version references,
  risk state and input/output hashes. Runtime can read but cannot create or mutate
  these records. Health reports the registry separately from financial readiness.
- Preview/commit await the database probe. Failed or uncertain commit responses do not falsely assert either success or absence.
- Local setup separates owner/runtime roles, protects generated secrets, seeds registries only and never replaces the owner's `.env.local`.
- Activation requires migration checksums, required triggers, restricted runtime grants and recent successful integration evidence matching current source files.

**[SPEC]**

- Applied SQL, restricted test-role access, concurrent replay, immutable triggers, numeric round trips and fixture backup/restore passed the real PostgreSQL CI job.
- CI uses the PostgreSQL service container's own client binaries through [GitHub's job service context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context).

**[?]**

- Production authentication and authenticated two-browser deployment remain
  unimplemented. Local subject isolation is exercised against real PostgreSQL; the
  fixed local-owner subject is valid only on the loopback owner host.
- Restore test is fixture-schema recovery plus explicit runtime re-granting, not a complete personal-data disaster-recovery certification.
- Inline availability-cutoff tests do not establish complete point-in-time dataset selection, effective-interval or revision policy correctness.

## 5. Remaining gates

**[SPEC]**

1. Repeat applicable gates for future changes, push only the development branch and
   verify each new CI/remote HEAD. Remote main remains unchanged at
   `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
2. Secure user/session isolation and durable portfolios/transactions/preferences;
   non-destructive migration of existing browser data.
3. Complete provenance/registries, cross-batch duplicate lineage/count semantics and correction reasons; do not claim full provenance v2.
4. Owner revocation/replacement of the disclosed Navasan credential through a secure local input path; no key in chat or Git.
5. Durable quotas/cache/concurrency, permitted history and independent Iranian cross-check coverage.
6. Only after Data Foundation passes: independent deterministic baseline, real-data evaluation and separate owner-approved financial-readiness gate.

## 6. Changelog

**[SPEC]**

- 0.8.0: added migration 0006, mandatory append-only correction reasons and exact
  source-reconciliation candidates/ranks/cutoffs/reason codes; 74 unit and 12 real
  PostgreSQL tests pass locally and both GitHub jobs pass in run 33393986374.
  Empirical divergence thresholds remain unchosen.
- 0.7.0: added migration 0005, source-versioned observations, exact point-in-time
  datasets and immutable evaluation-only decision lineage; 71 unit and 11 real
  PostgreSQL tests pass locally and both GitHub jobs pass in run 33392420564.
- 0.6.0: added migration 0004 and atomic save/restore of owner constraints and
  analysis/decision horizons; 66 unit and 10 real PostgreSQL tests pass locally.
- 0.5.0: added local owner-scoped portfolio tables, forced RLS, version conflicts,
  explicit browser save/restore and 10/10 real database tests.
- 0.4.0: recorded successful transferred-Windows-host bootstrap, 9/9 real
  integration/restore tests and connected local observation-persistence health.
- 0.3.0: recorded successful GitHub quality and real PostgreSQL integration/restore at `ec3f410`; kept Windows/personal-data gates explicit.
- 0.2.0: added owner-authorized development handoff; no ACL repair or phase acceptance implied.
- 0.1.0: recorded verified download, local-account ACL blocker, code/test work, independent review findings and explicit unexecuted gates.
