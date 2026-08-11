# Data Pipeline

**Source of truth for:** how data moves from source into the system. Not
implemented in Phase 0.

## Requirement

The pipeline must support both:

- **Manual updates** — the owner or an operator can input/trigger a data update
  directly, for cases where automation isn't available or needs a human check.
- **Automatic updates** — scheduled/triggered ingestion from configured sources,
  once sources exist (`DATA_SOURCES.md`).

Both paths feed the same validation step (`DATA_QUALITY.md`) — there is no
"trusted" shortcut for manual entry that skips validation.

## Pipeline Stages (requirement, mirrors `docs/02-architecture/DATA_ARCHITECTURE.md`)

1. Ingest raw data (manual or automatic), tagged with source and timestamp.
2. Validate (`DATA_QUALITY.md`).
3. Normalize into canonical form.
4. Store in the historical dataset (`HISTORICAL_DATA.md`), preserving prior values.
5. Make available to analysis layers.

## Failure Handling Requirement

- A failed or suspicious ingestion must be surfaced (logged/flagged), not silently
  dropped or silently accepted.
- The system must be able to detect when expected data hasn't arrived (staleness),
  not just when it arrived and looks wrong.

## Status

`STATUS: TBD` for scheduling mechanism, operator tooling for manual updates, and
alerting approach. Deferred until an implementation phase requires it.

## Related Documents

- Source metadata: `DATA_SOURCES.md`
- Validation rules: `DATA_QUALITY.md`
- Storage/versioning: `HISTORICAL_DATA.md`
- Integration abstraction principle: `docs/02-architecture/INTEGRATION_ARCHITECTURE.md`
