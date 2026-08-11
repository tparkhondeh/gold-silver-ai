# Backup

**Source of truth for:** how data and code are protected against loss. No data or
deployed code exists yet.

## Requirement (once data exists)

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

`STATUS: TBD` for backup mechanism, frequency, retention, and the RPO/RTO values
above — depends on where data ends up being stored
(`docs/02-architecture/DATA_ARCHITECTURE.md`), which is not yet decided. Tier B
(`docs/10-project-state/OPEN_DECISIONS.md` item B12) once a mechanism is chosen.

## Related Documents

- Historical data requirements: `docs/05-data/HISTORICAL_DATA.md`
- Data architecture: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Recovery process: `INCIDENT_RESPONSE.md`, `docs/00-governance/STABILITY_POLICY.md`
