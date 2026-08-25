# Data Dictionary

**Source of truth for:** field-level definitions of every data point the system
exposes or stores.

## Status

`STATUS: PARTIAL`. The Phase 1 read-only normalized quote contract is implemented at
`/api/market`. A durable observation/persistence schema is not implemented yet.

## Normalized Quote Contract (schema version 1)

| Field | Type / nullability | Meaning and unit |
|---|---|---|
| `instrumentCode` | string, required | Canonical instrument identifier defined by the application registry. |
| `value` | positive number, required | Value in `currency` per `unit`; plausible-range validated before exposure. |
| `currency` | `USD` or `TOMAN`, required | Display currency. IRR source values are divided by exactly 10 before becoming `TOMAN`. |
| `unit` | `troy_ounce`, `gram`, `unit`, or `usd`, required | Denominator/basis of the value. |
| `publishedAt` | UTC ISO-8601 string or null | Provider publication time. Null means the source page did not expose a row-level publication time. |
| `collectedAt` | UTC ISO-8601 string, required | Time the project collected or manually captured the observation. This is the fallback freshness basis when `publishedAt` is null. |
| `sourceId` | string, required | Stable ID matching `DATA_SOURCES.md`. |
| `sourceName` | string, required | Human-readable provider name. |
| `sourceUrl` | HTTPS URL, required | Exact source/product page used for provenance. |
| `quality` | `primary`, `informational`, or `manual_snapshot` | Permitted use class; manual/informational observations cannot unlock recommendations or execution. |
| `status` | `valid` or `stale` | Deterministic freshness result. Current UI threshold is 60 minutes. |

## Required Format (once fields exist)

Each field entry must specify:

| Attribute | Meaning |
|---|---|
| Field name | Canonical name used in code and storage |
| Description | Plain-language meaning |
| Unit | e.g. currency, weight basis |
| Source | Which entry in `DATA_SOURCES.md` provides it |
| Type | Data type |
| Nullable? | Whether missing values are valid, and what they mean |
| Historical availability | How far back this field is expected to be available |

Any field carrying a historical value must additionally define its point-in-time
attributes (Observed At, Published At, Collected At, Effective From, Effective To)
per `docs/02-architecture/DATA_ARCHITECTURE.md` § Point-in-Time Data — this is not
optional per-field; it's how the field stays usable for backtesting without
look-ahead bias.

## Rule

A field is added here at the same time it is added to the data model — not
retroactively, and not before it's actually implemented. This keeps the dictionary
authoritative rather than aspirational.

## Schema Evolution

The schema this dictionary describes is a **contract** in the sense defined by
`docs/00-governance/CHANGE_MANAGEMENT.md` § 5: adding an optional field is
non-breaking; removing a field, changing its meaning, or changing its unit is
breaking and follows that section's Breaking Change cycle. Historical data written
under an earlier schema version is never silently reinterpreted under a newer
one — old records keep the meaning they were written with, which is exactly what
the immutability and lineage principles in
`docs/02-architecture/DATA_ARCHITECTURE.md` § Integrity Principles already require.

## Related Documents

- Source-level metadata: `DATA_SOURCES.md`
- Data flow and integrity principles: `docs/02-architecture/DATA_ARCHITECTURE.md`
