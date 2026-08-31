# Data Dictionary

**Source of truth for:** field-level definitions of every data point the system
exposes or stores.

## Status

`STATUS: PARTIAL`. The Phase 1 normalized quote contract is implemented at
`/api/market`. Durable observation, provenance and evaluation-ledger contracts, nine PostgreSQL
migrations, repositories, and a live owner-local database are active. Historical
backfill, empirical divergence thresholds and production configuration remain pending.

## Durable Observation Contract (schema version 1)

| Field | Type / nullability | Meaning |
|---|---|---|
| `id` | `obs_` + SHA-256, required | Immutable observation identifier derived from the idempotency identity. |
| `idempotencyKey` | SHA-256 hex, required/unique | Prevents a repeated source event from being stored twice. |
| `payloadHash` | SHA-256 hex, required | Fingerprint of the sanitized raw payload using stable key ordering. |
| `instrumentCode` | string, required | Versioned instrument-registry key. |
| `sourceId` | string, required | Stable source-contract key. |
| `sourceContractVersion` | positive integer, required | Exact immutable source-contract version in effect when the observation was accepted. |
| `value` | canonical positive decimal string | Parsed by PostgreSQL as `numeric(38,12)`; never converted through binary floating point in ingestion. |
| `currency` / `unit` | closed enums, required | Must exactly match the instrument contract. |
| `observedAt` | UTC ISO-8601, required | When the underlying value/event occurred. |
| `publishedAt` | UTC ISO-8601 or null | When the provider published it; null is explicit unknown. |
| `collectedAt` | UTC ISO-8601, required | When this system received it. |
| `effectiveFrom` / `effectiveTo` | UTC ISO-8601; end nullable | Point-in-time validity interval. |
| `correctionOf` | observation id or null | Append-only correction link; originals are never overwritten. |
| `correctionReason` | trimmed string (3–500 chars) or null | Required for every correction and forbidden for a non-correction; explains why the revision exists. |
| `rawPayload` | sanitized JSON, required | Source row retained for audit; secret-like keys are redacted before storage. |

Validation results and quarantined rows are separate immutable records. A quarantine
decision is appended to `quarantine_resolutions` instead of mutating the original.

## Provenance Registry Contract

Migration 0005 implements immutable version records for Source contracts and for
Dataset, Assumption, Feature, Model, and Methodology artifacts. Every artifact has a
stable kind/ID, positive version, lifecycle status, plain-language description,
structured JSON content, SHA-256 content fingerprint, validity interval, and creation
time. Kind-specific checks require the minimum metadata defined by the architecture.
Dataset versions additionally bind their exact sorted observation membership and a
point-in-time cutoff inside the immutable fingerprint. Evaluation-only Decision records reference exact Dataset and Methodology
versions, an optional Model version, explicit Assumption and Feature versions, risk
state, input/output fingerprints, timestamp, and structured output. All registry and
decision rows are append-only and runtime-read-only.

## Source Reconciliation Contract

Migration 0006 stores each reconciliation as an immutable record containing the
versioned policy reference, instrument, point-in-time cutoff, exact ordered candidate
observations, selected observation, rank and a closed reason code. Candidates must
already exist, belong to one instrument and have been known by the cutoff. This records
an explainable choice but does not invent or approve price-divergence thresholds.

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
