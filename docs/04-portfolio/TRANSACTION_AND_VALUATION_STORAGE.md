# Transaction and Valuation Storage Contract

**Source of truth for:** how factual portfolio events and computed valuation snapshots
are stored. This document does not define investment or valuation methodology.

`STATUS: FOUNDATION IMPLEMENTED`. Migrations 0007–0009 and a repository implement the
append-only, owner-isolated storage boundary. No production route writes these tables,
no real transaction/value is seeded, and every valuation remains `evaluation_only`.

## Transaction event

A transaction event records a factual portfolio change: a stable ID and owner subject,
event kind, asset key, optional signed quantity/cash deltas, fee, occurrence time,
sanitized evidence fingerprint and payload fingerprint. At least one non-zero quantity
or cash delta is required. A correction is a new event with an exact link and bounded
reason; the original is never changed.

The closed event kinds are `trade`, `transfer`, `income`, `fee`, and `adjustment`.
They describe what happened, not whether it was a good decision. Taxes, spreads and
conversion rules are not inferred.

## Valuation snapshot

A snapshot freezes the exact portfolio version, reporting time/currency, Dataset and
Methodology artifact versions, ordered position inputs, price-observation IDs, optional
transaction-event lineage, and input/output SHA-256 fingerprints. Position values must
sum exactly to the stored total at currency precision before persistence.
Database triggers also require every price observation to belong to that exact Dataset
and cutoff, and every linked transaction to belong to the same owner.
An exact replay remains idempotent even after the live portfolio advances to a newer
version; a changed fingerprint is rejected.

The snapshot stores a deterministic calculation result but does not choose the formula.
The referenced Methodology artifact must define it later through the owner-approved
financial-methodology process. Database status is restricted to `evaluation_only` and
cannot authorize recommendations or execution.

## Security and lifecycle

- Forced PostgreSQL row-level security uses the server-verified opaque subject ID.
- Records cannot be updated, deleted or truncated, even by the table owner.
- The normal local runtime has read-only access; only isolated tests exercise writes.
- Production writes require the identity decision in
  [`IDENTITY_RECOMMENDATION.md`](../02-architecture/IDENTITY_RECOMMENDATION.md), an
  authenticated API contract and a separate migration plan for existing browser data.
