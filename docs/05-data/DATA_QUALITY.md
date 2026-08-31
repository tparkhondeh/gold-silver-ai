# Data Quality

**Source of truth for:** how incoming and stored data is validated.

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
- Flagged data enters **quarantine**, not deletion and not silent acceptance:
  it's retained (so provenance and history stay intact — see
  `docs/02-architecture/DATA_ARCHITECTURE.md` § Integrity Principles) but excluded
  from normal analysis until a human or a documented rule resolves the flag. This
  is the concrete meaning of "flagged, not discarded" throughout this document.
- No fabricated or interpolated replacement values are inserted for missing data
  unless an explicit, documented, owner-approved methodology says otherwise.

## Status

`STATUS: PARTIAL`. Schema version 1 now deterministically validates registry
membership, active-source state, positive canonical decimal syntax, currency/unit
agreement, UTC timestamp syntax, future-time tolerance, point-in-time ordering, and
correction references and mandatory correction reasons. Invalid CSV rows enter immutable quarantine; duplicate source
events are identified through SHA-256 idempotency keys. Secret-like raw-payload keys
are redacted before persistence. Exact ordered source-reconciliation candidates,
cutoffs, selections and deterministic reason codes are stored append-only.

The offline OHLC continuity audit now validates provider Jalali dates against Tehran
timestamps, detects duplicate dates, mixed instruments and rows outside the requested
range, and records every unobserved calendar date. It explicitly reports that the
Iranian market calendar is still unknown, inserts zero interpolated points, and
cannot authorize storage or financial use. All checks run on synthetic fixtures only;
no provider request or historical market row was created.

`STATUS: TBD` remains for empirical anomaly/divergence thresholds,
source-reliability scoring, and operator resolution UI. These are Tier B decisions
(`docs/00-governance/PROJECT_RULES.md` § 3): Claude Code proposes standard
statistical practice at design time, escalating only if a threshold choice would
materially change what counts as valid financial data (see
`docs/10-project-state/OPEN_DECISIONS.md` item B3).

## Related Documents

- Pipeline stage this belongs to: `DATA_PIPELINE.md`
- Source tracking: `DATA_SOURCES.md`
- Storage/versioning of corrections: `HISTORICAL_DATA.md`
- Integrity principles: `docs/02-architecture/DATA_ARCHITECTURE.md`
