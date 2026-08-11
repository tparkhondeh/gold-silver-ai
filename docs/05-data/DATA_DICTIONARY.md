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

## Rule

A field is added here at the same time it is added to the data model — not
retroactively, and not before it's actually implemented. This keeps the dictionary
authoritative rather than aspirational.

## Related Documents

- Source-level metadata: `DATA_SOURCES.md`
- Data flow and integrity principles: `docs/02-architecture/DATA_ARCHITECTURE.md`
