# Data Quality

**Source of truth for:** how incoming and stored data is validated. Not implemented
in Phase 0.

## Requirement

Every data point entering the system must be checked for:

- **Missing data** — expected data that didn't arrive is detected and flagged, not
  silently treated as zero or ignored.
- **Anomalies** — values statistically inconsistent with recent history (e.g.
  implausible jumps) are flagged for review, not automatically accepted or
  automatically discarded.
- **Source reliability** — validation results are tracked per source over time,
  feeding back into `DATA_SOURCES.md` reliability tracking.
- **Freshness** — every data point's age is knowable, and staleness beyond an
  expected threshold is detectable.
- **Cross-source consistency** — where more than one source covers the same
  instrument, discrepancies are surfaced, not silently averaged away.

## Non-Negotiable Constraints

- Validation logic is deterministic code, not an AI judgment call, for anything
  that determines whether a number is trustworthy. See `docs/06-ai/AI_ROLE.md`.
- Flagged data is not deleted — it's retained with its flag, so provenance and
  history stay intact (`docs/02-architecture/DATA_ARCHITECTURE.md` § Integrity
  Principles).
- No fabricated or interpolated replacement values are inserted for missing data
  unless an explicit, documented, owner-approved methodology says otherwise.

## Status

`STATUS: TBD` for specific thresholds, anomaly-detection methodology, and how
flags are surfaced/resolved. `DECISION REQUIRED: YES` at design time.

## Related Documents

- Pipeline stage this belongs to: `DATA_PIPELINE.md`
- Source tracking: `DATA_SOURCES.md`
- Storage/versioning of corrections: `HISTORICAL_DATA.md`
- Integrity principles: `docs/02-architecture/DATA_ARCHITECTURE.md`
