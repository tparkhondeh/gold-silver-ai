# Backup

**Source of truth for:** how data and code are protected against loss.

## Owner-local PostgreSQL mechanism

Current rollout and verification evidence:
[September 17 unified-portfolio checkpoint](../10-project-state/UNIFIED_PORTFOLIO_REVIEW_2026-09-17.md).
The mechanism below is local protection, not hosted disaster recovery.

`npm run db:backup` creates a PostgreSQL 17.11 custom-format backup of `asha_local`
inside the project-owned `.cache/postgres-local/backups` directory. This directory
inherits the Windows owner's restricted access rules and is ignored by Git.

The command never overwrites the main database. Before it reports success, it:

1. acquires an exclusive backup lock, exports a read-only repeatable-read snapshot,
   and passes that snapshot to `pg_dump` writing a unique temporary file;
2. restores that file into a uniquely named temporary local database;
3. compares the migration journal and row counts for all 25 governed tables
   against that same source snapshot, not later live data;
4. publishes the dump and its SHA-256 manifest through individual atomic renames;
5. cleans up the temporary verification database/files before reporting success.

Concurrent application writes need not stop: dump and comparison use one database
snapshot. Overlapping backup commands fail closed on the exclusive lock. Graceful
cancellation is checked at safe stages; it does not force-kill a backup during
publication. A leftover lock or unknown staging file needs reviewed recovery,
not guessed deletion. Existing retained backups and the source database are not
replaced by verification.

No old backup is deleted automatically. The output can contain sensitive portfolio
data. It is protected by the local Windows account boundary but is **not encrypted**
and is **not an offsite copy**; it must not be emailed, uploaded, committed, or moved
to shared storage. A complete restore is verified on creation, while the separate CI
suite also exercises an independent fixture restore.

## Launcher-managed daily checks

When `npm run local:run` starts its own application and local readiness succeeds,
it starts backup supervision for that launcher's lifetime:

- A retained, verified backup **less than 24 hours old** is reused; the next check
  is due at its 24-hour boundary.
- Missing, invalid or older evidence triggers one backup attempt. Success requires
  a verified retained dump, not merely a zero process exit code.
- Failure is reported as overdue and retried after one hour while the launcher
  remains running. Prior backups are retained; there is no automatic deletion.
- Retained evidence is checked against the manifest and a streamed SHA-256 of the
  current dump bytes, so same-size corruption cannot count as verified. A new
  backup still receives the full temporary-database restore/count verification.
- Safe status is reported in the launcher's output and in protected
  `.cache/postgres-local/backup-status.json`; this file contains state/times, not
  portfolio contents. Stopping the launcher stops scheduling and requests safe
  cleanup of an in-flight backup.

This is **not an operating-system scheduler or an always-on service**. An already
healthy app detected by a second launcher is reused without attaching another
supervisor; activating this mechanism for an older running instance requires a
controlled fresh launch. Readiness failure leaves supervision off with a warning.
Closing the program, shutdown, sleep or failure can delay a backup; the daily
interval is not a promised 24-hour recovery-point objective.

The managed latest-price cache is a separate disposable file under
`.cache/postgres-local/managed-market`, outside the database backup payload. It
is excluded from these PostgreSQL dumps; daily backups must not become an archive
of latest market prices. Portfolio data and governed quota/runtime metadata
remain in the database backup. Do not substitute an unreviewed copy of the whole
private directory, which also contains credentials and runtime/cache files.

Implementation: [supervisor](../../apps/web/scripts/local-backup-supervisor.ts),
[retained-file verification and child runner](../../apps/web/scripts/local-backup-runtime.ts),
and [local launcher](../../apps/web/scripts/start-local-app.mjs).

## Long-term requirement

The historical dataset (`docs/05-data/HISTORICAL_DATA.md`) is expected to become
one of the project's most valuable and hardest-to-reconstruct assets — it must be
backed up, not just stored once. Code itself is protected via git history and the
`main` branch policy (`docs/00-governance/STABILITY_POLICY.md`); it does not need a
separate backup mechanism beyond normal git remotes.

## Restore Must Be Tested, Not Assumed

A backup that has never been restored is not a verified backup — it's an
unverified assumption. Restoring from it must be tested periodically, not only
relied upon at the moment of an actual incident. The local creation check exercises
a full temporary restore; it is not evidence that off-device loss or a hosted
recovery has been tested.

## Recovery Objectives

Production recovery acceptance must define and measure:

- **RPO (Recovery Point Objective)** — the maximum data loss acceptable if a
  failure happens right now (e.g. "at most the last successful backup").
- **RTO (Recovery Time Objective)** — the maximum acceptable time to be back up
  and running after a failure.

Both are `STATUS: TBD` pending owner-approved targets and measured recovery
evidence. The local daily check does not establish either target or guarantee.

## Status

`STATUS: PARTIAL`. Verified owner-local backups and launcher-managed daily checks
are implemented. The earlier manual-only mechanism remains available through
`npm run db:backup`. Independent OS/host scheduling, encryption, offsite destination,
production retention and RPO/RTO remain `STATUS: TBD`; current retention is manual
with no automatic deletion. These local checks must not be described as complete
disaster-recovery protection. Actual activation/acceptance evidence lives in the
linked checkpoint rather than being inferred from implementation alone.

## Related Documents

- Historical data requirements: `docs/05-data/HISTORICAL_DATA.md`
- Data architecture: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Recovery process: `INCIDENT_RESPONSE.md`, `docs/00-governance/STABILITY_POLICY.md`
