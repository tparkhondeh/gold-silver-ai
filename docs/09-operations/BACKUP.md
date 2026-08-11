# Backup

**Source of truth for:** how data and code are protected against loss. No data or
deployed code exists yet.

## Requirement (once data exists)

The historical dataset (`docs/05-data/HISTORICAL_DATA.md`) is expected to become
one of the project's most valuable and hardest-to-reconstruct assets — it must be
backed up, not just stored once. Code itself is protected via git history and the
`main` branch policy (`docs/00-governance/STABILITY_POLICY.md`); it does not need a
separate backup mechanism beyond normal git remotes.

## Status

`STATUS: TBD` for backup mechanism, frequency, and retention — depends on where
data ends up being stored (`docs/02-architecture/DATA_ARCHITECTURE.md`), which is
not yet decided.

## Related Documents

- Historical data requirements: `docs/05-data/HISTORICAL_DATA.md`
- Data architecture: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Recovery process: `INCIDENT_RESPONSE.md`, `docs/00-governance/STABILITY_POLICY.md`
