# Data Architecture

**Source of truth for:** the structural pattern data moves through — layers and
integrity principles. Not the source of truth for *which* sources, fields, or
quality rules are used — that content lives in `docs/05-data/` and is only linked
from here.

## Status

`STATUS: PARTIAL`. ADR 0001 selects PostgreSQL behind repository interfaces for
Phase 1. The append-only point-in-time observation contract, validation/quarantine,
manual CSV boundary, parameterized repositories, live local database, exact source
contract version, versioned provenance artifacts, dataset membership,
evaluation-only decision lineage, append-only source-reconciliation records and
mandatory correction reasons are implemented. Production configuration,
retention, off-host backup, empirical divergence policy, and historical backfill remain
`STATUS: TBD`.

## Data Flow Principle

```
Raw ingested data → Validation → Normalized/validated data → Derived/analytical data
```

- **Raw data** is stored as received, with source and timestamp attached, and is
  never silently modified.
- **Validation** (see `docs/05-data/DATA_QUALITY.md`) checks raw data before it is
  trusted; validation failures are recorded, not discarded silently.
- **Normalized data** is the validated, canonical form used by analysis.
- **Derived data** (statistics, percentiles, regime labels, etc.) is always
  computed from normalized data by deterministic code and is reproducible — it is
  never a second, independent source of truth.

## Point-in-Time Data

**Architecture requirement, established 2026-08-11. Not implemented in Phase 0; no
data pipeline or database is being built by this requirement being recorded.**

Every historical data point must be able to distinguish, once implemented:

| Concept | Meaning |
|---|---|
| Observed At | When the underlying market event/value actually occurred |
| Published At | When the source made that value public |
| Collected At | When this system actually ingested it |
| Effective From | When this value should be considered valid from, for analysis |
| Effective To | When this value stopped being valid (e.g. superseded by a correction) |

**Why this is required — the anti-look-ahead-bias rule:** a backtest or historical
analysis must only use data that was *actually available* at the simulated
decision time (i.e. `Published At` / `Collected At`, not `Observed At` or a later
correction). Data that was not yet known at a given historical moment must never
be fed into a backtest of a decision made at that moment — doing so silently
inflates backtested performance and produces a validation result that cannot be
trusted. This is the mechanism that makes the Historical Validation Principle in
`docs/03-market/HISTORICAL_ANALYSIS.md` actually trustworthy rather than
theoretical.

This requirement applies regardless of which specific backtesting methodology is
eventually chosen (`docs/10-project-state/OPEN_DECISIONS.md` item A12) — capturing
these distinctions is a data-architecture prerequisite, not a methodology choice,
so it does not block Phase 1 on that methodology being decided first.

## Integrity Principles

1. **Immutability of history.** Once a historical data point is validated and
   stored, it is not overwritten in place; a correction is recorded as its own
   entry, preserving this exact chain:

   ```
   Original Observation → Correction → Correction Reason → Corrected Version → Timestamp
   ```

   The original is never deleted; the correction and its reason are both stored
   and both attributable, so a past analysis that used the original value stays
   explainable rather than silently "wrong" after a correction lands.
2. **Provenance is mandatory.** Every stored data point carries where it came from
   and when — see `docs/05-data/DATA_SOURCES.md`.
3. **No silent gaps.** Missing data is represented as missing, not interpolated or
   guessed, unless an explicit, documented, and approved methodology says otherwise.
4. **Single canonical store per data type.** Analysis code reads from one
   normalized source per data type, not from ad hoc copies.
5. **Data lineage is mandatory for derived data.** Reproducibility (Data Flow
   Principle above) means a derived value is *computable* from its inputs; lineage
   means it also *records* which specific raw/normalized records and which
   transformation (and transformation version) actually produced it. A derived
   number without a recorded lineage is not trustworthy for audit even if it
   happens to be reproducible — the two are related but not the same guarantee.
   The dataset snapshot a lineage record points to is exactly the "Input Dataset"
   node in `docs/06-ai/DECISION_ENGINE.md` § Decision Provenance, so a snapshot
   must be identifiable (versioned), not just "the data as of some vague date."

## Related Documents

- Source-specific detail (which providers, reliability, update cadence):
  `docs/05-data/DATA_SOURCES.md`
- Field-level definitions: `docs/05-data/DATA_DICTIONARY.md`
- Ingestion mechanics: `docs/05-data/DATA_PIPELINE.md`
- Validation rules: `docs/05-data/DATA_QUALITY.md`
- Historical dataset specifics: `docs/05-data/HISTORICAL_DATA.md`
