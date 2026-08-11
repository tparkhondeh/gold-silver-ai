# Historical Data

**Source of truth for:** how the historical dataset is maintained over time. Not
implemented in Phase 0. No historical data has been collected.

## Requirement

The system must maintain a historical dataset per instrument that is:

- **Immutable in the sense that matters** — corrections are appended, not
  overwritten in place, so past analysis remains reproducible and the correction
  itself is auditable. See `docs/02-architecture/DATA_ARCHITECTURE.md` § Integrity
  Principles.
- **Point-in-time aware** — every record carries the temporal distinctions
  (Observed/Published/Collected/Effective From/Effective To) required by
  `docs/02-architecture/DATA_ARCHITECTURE.md` § Point-in-Time Data, so backtests
  never leak future knowledge into a past decision.
- **Long enough to be useful** — sufficient history to support the bubble/premium
  and backtesting requirements in `docs/03-market/BUBBLE_MODEL.md` and
  `docs/03-market/HISTORICAL_ANALYSIS.md`. Minimum required length:
  `STATUS: TBD` — depends on data availability, which is unknown until sourcing
  work happens.
- **Complete about its own gaps** — periods with no data are represented as gaps,
  not silently smoothed over.

## Backfill

Whether/how historical data can be backfilled from external sources once selected
is `STATUS: TBD` — depends entirely on what `DATA_SOURCES.md` sources make
available.

## Status

`STATUS: TBD` for storage format, retention policy, and backfill approach. Tier B
/ Implementation decision (`docs/00-governance/PROJECT_RULES.md` § 3): Claude Code
decides once a data source is chosen and its historical coverage is known,
escalating only if a source's licensing terms restrict backfill (see
`docs/10-project-state/OPEN_DECISIONS.md` item B4).

## Related Documents

- Integrity principles: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Validation before storage: `DATA_QUALITY.md`
- What this data enables: `docs/03-market/BUBBLE_MODEL.md`,
  `docs/03-market/HISTORICAL_ANALYSIS.md`
