# Data Dictionary

**Source of truth for:** field-level definitions of every data point the system
stores. No schema exists yet — this document currently holds the requirement and
the template it must follow, not actual field definitions.

## Status

`STATUS: TBD`. No data model has been designed. This file is created empty of real
fields deliberately, so it does not imply a schema decision that hasn't been made.

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
