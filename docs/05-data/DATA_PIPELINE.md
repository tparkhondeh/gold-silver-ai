# Data Pipeline

**Source of truth for:** how data moves from source into the system.

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

## Implemented Phase 1 Slice

- Strict manual CSV parsing with a versioned required-header contract.
- The same deterministic validation boundary used for every row; manual input has
  no trusted bypass.
- Batch and row idempotency, duplicate reporting, sanitized raw-payload retention,
  and append-only quarantine records.
- Transactional, parameterized PostgreSQL repository statements. No market values
  are loaded by the migration or by tests.
- A loopback-only, same-origin operator API and Persian Data Trust UI for CSV
  preview. Requests are size/type limited, use the versioned Phase 1 registry, and
  return counts plus sanitized row outcomes without exposing raw payloads.
- The commit path now revalidates the submitted batch and delegates to the same
  parameterized transactional repository. It requires both an explicit enable flag
  and a loopback-only PostgreSQL URL; request intent must exactly match preview or
  commit. Connection, migration application, and live integration tests remain
  pending, so commit still fails closed on the current host.

`STATUS: PARTIAL` for a live database connection, migration verification, scheduling,
and alerting. Future scheduling must use Tehran time and the Iranian market calendar;
see `docs/02-architecture/INTEGRATION_ARCHITECTURE.md`.

## Related Documents

- Source metadata: `DATA_SOURCES.md`
- Validation rules: `DATA_QUALITY.md`
- Storage/versioning: `HISTORICAL_DATA.md`
- Integration abstraction principle: `docs/02-architecture/INTEGRATION_ARCHITECTURE.md`
