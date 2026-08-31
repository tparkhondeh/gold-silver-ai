# Historical Data

**Source of truth for:** how the historical dataset is maintained over time. No
decision-grade historical market data has been collected.

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

Navasan's documented `dailyCurrency` and `ohlcSearch` response contracts are now
implemented for the eight Phase 1 symbols behind a loopback/same-origin operator
route. Every call requires an immutable durable quota reservation. No historical
call or row has been committed: permitted date range, retention, provider license
scope, gap policy, and independent Iranian cross-check remain `STATUS: TBD` before
the first backfill. The Persian local readiness planner can validate a proposed range
and calculate one OHLC request per selected approved symbol, but it cannot execute,
consume quota, or store data.

The researched recommendation, reviewed public-provider evidence, rejected unsafe
option, exact acceptance gate, and Persian messages ready for the owner to send are
in `HISTORICAL_BACKFILL_PROPOSAL.md`. That file is explicitly a proposal, not a
decision or permission to call either provider.

## Status

`STATUS: PARTIAL`. PostgreSQL append-only observations now encode the complete
point-in-time fields, correction links, raw payload fingerprint, source, and
instrument contract. Immutability triggers prevent update/delete of observations,
validation results, quarantine records, resolution events, and provider quota
reservations. The historical provider adapter is implemented and tested, but
licensed backfill, retention, gap reporting, and historical restore evidence remain
`STATUS: TBD`.

## Related Documents

- Integrity principles: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Validation before storage: `DATA_QUALITY.md`
- Pending owner/vendor package: `HISTORICAL_BACKFILL_PROPOSAL.md`
- What this data enables: `docs/03-market/BUBBLE_MODEL.md`,
  `docs/03-market/HISTORICAL_ANALYSIS.md`
