# PostgreSQL Foundation Checkpoint

**Version 0.3.0** · ASHA engineering · ۱۴۰۵/۰۶/۰۸ (2026-08-30) · Work in progress

## AI READING INSTRUCTION

Read `[SPEC]` for verified facts and `[?]` for unverified work. This checkpoint is
not a Data Foundation acceptance report or a financial-readiness claim.

## 1. Scope and actual state

**[SPEC]**

- Branch: `codex/phase-1-data-ui`; code checkpoint: `ec3f41029549918965f2b74fa27222a32af28679` (later documentation commits may follow).
- Initial dirty README preserved and corrected; implementation is a development checkpoint.
- Owner subsequently authorized committing/pushing this work for transfer to another computer despite the local database blocker. See the root `CONTINUE_ON_ANOTHER_SYSTEM.md`.
- No merge, public deployment, Phase 2 branch, market ingestion or financial activation is authorized by this handoff.
- Previous CI [33304773397](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33304773397) passed for the published HEAD only.
- Current local gates: typecheck, lint, build, **60 unit/contract tests passed; zero skipped**.
- GitHub [run 33316064205](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33316064205) **PASSED** for code checkpoint `ec3f410`: quality job (lint/typecheck/build/tests/production audit) and real PostgreSQL migration/integration/restore job.
- Owner-machine PostgreSQL integration/restore and authenticated two-browser persistence: **NOT EXECUTED**. CI's disposable Linux database does not certify the Windows host or real personal data.
- Two independent read-only reviews inspected database safety and readiness/CI. They did not approve financial use or execute real database tests.
- Local evaluation server restarted at `http://localhost:4174/` (IPv6 loopback); `/api/health` returned HTTP 200 with `evaluation_only`, blocked observation/portfolio storage and blocked financial decisions. This is not an authenticated-browser end-to-end test.

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

## 3. Permission blocker: do not bypass

**[SPEC]**

- Fresh cluster: `.cache/postgres-local/data`; initialization completed with UTF-8, checksums and SCRAM authentication.
- Intended network: `127.0.0.1:55432`, UTC, 20 connections and 64 MB shared buffers.
- The initial bootstrap ran as `TAHA\CodexSandboxOffline` and made its new private directory accessible only to that account.
- Owner-context startup runs as `TAHA\Saraytell` and `pg_ctl` returns **Permission denied** for this directory.
- PostgreSQL is not running on the owner machine. Local application databases/migrations and integration tests have not executed there; isolated CI execution is recorded separately above.
- Explicit owner permission was requested to repair **only this new project directory's ACL** for Saraytell. No repair was attempted without approval.
- Do not reset, move or delete the cluster, open permissions to Everyone, use another account, or initialize a replacement to avoid this stop.
- Bootstrap now refuses temporary sandbox accounts and treats access errors as errors, not nonexistent files.

## 4. Implemented controls and verification boundary

**[SPEC]**

- Migration runner: normalized SQL checksums, ordering, advisory transaction lock, journal, one transaction and rollback on pre-commit failure.
- Append-only protection: batch mutation and audit-table truncate rejection; correction source/instrument/time consistency.
- Decimal validation matches `numeric(38,12)` without nonzero precision truncation; impossible calendar dates fail closed.
- CSV system receipt time is assigned at ingestion; supplied timestamps remain raw provenance, not trusted system availability.
- Explicit correction revisions have distinct identities; original observation IDs remain compatible.
- Database URLs reject query/fragment options that could override the loopback host.
- Health performs an actual query; observation storage is distinct from still-unimplemented portfolio persistence.
- Preview/commit await the database probe. Failed or uncertain commit responses do not falsely assert either success or absence.
- Local setup separates owner/runtime roles, protects generated secrets, seeds registries only and never replaces the owner's `.env.local`.
- Activation requires migration checksums, required triggers, restricted runtime grants and recent successful integration evidence matching current source files.

**[SPEC]**

- Applied SQL, restricted test-role access, concurrent replay, immutable triggers, numeric round trips and fixture backup/restore passed the real PostgreSQL CI job.
- CI uses the PostgreSQL service container's own client binaries through [GitHub's job service context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context).

**[?]**

- Windows bootstrap, owner/runtime login provisioning and local activation evidence remain unverified on the owner's host.
- Restore test is fixture-schema recovery plus explicit runtime re-granting, not a complete personal-data disaster-recovery certification.
- Inline availability-cutoff tests do not establish complete point-in-time dataset selection, effective-interval or revision policy correctness.

## 5. Remaining gates

**[SPEC]**

1. Approved ACL repair, owner-context startup, actual migrations and real integration/restore tests.
2. Repeat applicable gates for future changes, push only development branch and verify each new CI/remote HEAD. This handoff's code checkpoint passed CI; remote main remained unchanged at `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
3. Secure user/session isolation and durable portfolios/transactions/preferences; non-destructive migration of existing browser data.
4. Complete provenance/registries, cross-batch duplicate lineage/count semantics and correction reasons; do not claim full provenance v2.
5. Owner revocation/replacement of the disclosed Navasan credential through a secure local input path; no key in chat or Git.
6. Durable quotas/cache/concurrency, permitted history and independent Iranian cross-check coverage.
7. Only after Data Foundation passes: independent deterministic baseline, real-data evaluation and separate owner-approved financial-readiness gate.

## 6. Changelog

**[SPEC]**

- 0.3.0: recorded successful GitHub quality and real PostgreSQL integration/restore at `ec3f410`; kept Windows/personal-data gates explicit.
- 0.2.0: added owner-authorized development handoff; no ACL repair or phase acceptance implied.
- 0.1.0: recorded verified download, local-account ACL blocker, code/test work, independent review findings and explicit unexecuted gates.
