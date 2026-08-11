# Integration Architecture

**Source of truth for:** how the system will structurally connect to external
systems (data providers, APIs, and any other outside services). Not the source of
truth for *which* providers — that's `docs/05-data/DATA_SOURCES.md`, and none are
chosen yet.

## Status

No external integrations exist. No data providers, APIs, or vendors have been
selected. `STATUS: TBD` — `DECISION REQUIRED: YES` for each integration, evaluated
individually when needed.

## Principle: Provider Abstraction

Whenever an external integration is added, the rest of the system depends on an
internal abstraction/interface, not directly on a specific vendor's API shape.
This keeps the system able to add, replace, or run multiple data providers without
changing analysis or decision logic. Concrete interface design is deferred until a
real provider is being integrated — no speculative abstraction is built now (see
`docs/00-governance/PROJECT_RULES.md` § 7).

## Principle: Fail Safe, Not Silent

An integration failure (unreachable source, malformed response, rate limit) must be
detected and surfaced — via the data-quality mechanisms in
`docs/05-data/DATA_QUALITY.md` — not silently ignored or backfilled with guessed
values.

## Out of Scope for Phase 0

Choosing or connecting to any market data API, news source, brokerage, or exchange
integration. See `docs/01-product/PRODUCT_SPECIFICATION.md` § Explicitly Out of
Scope for Now.

## Related Documents

- Data source selection and provenance: `docs/05-data/DATA_SOURCES.md`
- Data validation on ingest: `docs/05-data/DATA_QUALITY.md`
- Security handling of external input: `docs/02-architecture/SECURITY_ARCHITECTURE.md`
