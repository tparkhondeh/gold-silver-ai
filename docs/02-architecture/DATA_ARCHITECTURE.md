# Data Architecture

**Source of truth for:** the structural pattern data moves through — layers and
integrity principles. Not the source of truth for *which* sources, fields, or
quality rules are used — that content lives in `docs/05-data/` and is only linked
from here.

## Status

No storage technology, database, or file format has been chosen.
`STATUS: TBD` — `DECISION REQUIRED: YES`, deferred to when Phase 1 data-foundation
work is scoped (see `docs/01-product/ROADMAP.md`).

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

## Integrity Principles

1. **Immutability of history.** Once a historical data point is validated and
   stored, it is not overwritten in place; corrections are recorded as corrections
   (with the original preserved), preserving auditability.
2. **Provenance is mandatory.** Every stored data point carries where it came from
   and when — see `docs/05-data/DATA_SOURCES.md`.
3. **No silent gaps.** Missing data is represented as missing, not interpolated or
   guessed, unless an explicit, documented, and approved methodology says otherwise.
4. **Single canonical store per data type.** Analysis code reads from one
   normalized source per data type, not from ad hoc copies.

## Related Documents

- Source-specific detail (which providers, reliability, update cadence):
  `docs/05-data/DATA_SOURCES.md`
- Field-level definitions: `docs/05-data/DATA_DICTIONARY.md`
- Ingestion mechanics: `docs/05-data/DATA_PIPELINE.md`
- Validation rules: `docs/05-data/DATA_QUALITY.md`
- Historical dataset specifics: `docs/05-data/HISTORICAL_DATA.md`
