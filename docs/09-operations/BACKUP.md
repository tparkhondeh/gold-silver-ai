# Backup

**Source of truth for:** how data and code are protected against loss.

## Local Phase 1 mechanism

`npm run db:backup` creates a PostgreSQL 17.11 custom-format backup of `asha_local`
inside the project-owned `.cache/postgres-local/backups` directory. This directory
inherits the Windows owner's restricted access rules and is ignored by Git.

The command never overwrites the main database. Before it reports success, it:

1. writes to a unique temporary backup file;
2. restores that file into a uniquely named temporary local database;
3. compares the migration journal and row counts for all 24 governed tables;
4. removes the temporary verification database;
5. atomically publishes the backup plus a JSON manifest containing its SHA-256 hash.

No old backup is deleted automatically. The output can contain sensitive portfolio
data. It is protected by the local Windows account boundary but is **not encrypted**
and is **not an offsite copy**; it must not be emailed, uploaded, committed, or moved
to shared storage. A complete restore is verified on creation, while the separate CI
suite also exercises an independent fixture restore.

## Long-term requirement

The historical dataset (`docs/05-data/HISTORICAL_DATA.md`) is expected to become
one of the project's most valuable and hardest-to-reconstruct assets — it must be
backed up, not just stored once. Code itself is protected via git history and the
`main` branch policy (`docs/00-governance/STABILITY_POLICY.md`); it does not need a
separate backup mechanism beyond normal git remotes.

## Restore Must Be Tested, Not Assumed

A backup that has never been restored is not a verified backup — it's an
unverified assumption. Once a real backup mechanism exists, restoring from it
must be tested periodically, not only relied upon at the moment of an actual
incident. This is required regardless of which specific mechanism is chosen.

## Recovery Objectives

Once real infrastructure exists, this document should state:

- **RPO (Recovery Point Objective)** — the maximum data loss acceptable if a
  failure happens right now (e.g. "at most the last successful backup").
- **RTO (Recovery Time Objective)** — the maximum acceptable time to be back up
  and running after a failure.

Both are `STATUS: TBD` — meaningless to set numerically before there's real
infrastructure to measure against, but the requirement to define them, once there
is, is fixed now so it isn't forgotten later.

## Status

`STATUS: PARTIAL`. A verified, owner-only local backup command exists. Encryption,
offsite destination, automatic schedule, retention, and RPO/RTO values remain
`STATUS: TBD` until the production storage boundary is selected. Those later choices
must be completed before the backup can be treated as disaster-recovery protection.

## Related Documents

- Historical data requirements: `docs/05-data/HISTORICAL_DATA.md`
- Data architecture: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Recovery process: `INCIDENT_RESPONSE.md`, `docs/00-governance/STABILITY_POLICY.md`
