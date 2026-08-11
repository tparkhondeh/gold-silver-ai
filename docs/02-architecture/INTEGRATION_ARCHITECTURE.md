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

## Iran-Specific Operational Constraints

**Requirement, established 2026-08-11.** This is distinct from
`docs/03-market/IRAN_MARKET_MODEL.md`, which covers Iran's *market behavior*; this
section covers Iran's *operational/infrastructure* constraints on integrations:

- Sanctions can block or disrupt access to foreign services or payment methods
  without notice — a source or vendor that works today may not tomorrow.
- IP-based restrictions may affect API/service availability.
- Paying for a foreign vendor's service may not be possible through normal means.
- Licensing terms for a given source may be unclear or unstable in this context.
- Domestic sources can also be unstable (availability, format changes) — this is
  not only a foreign-vendor risk.

**The resulting rule:** the system must not depend on any single provider —
foreign or domestic — such that losing access to it stops analysis entirely. This
is why `§ Principle: Provider Abstraction` above exists structurally, and why
`docs/05-data/DATA_SOURCES.md` § Source Failure / No Single Point of Failure
requires single-source risk to be recorded explicitly when it can't be avoided.
When a real provider is evaluated (Tier A, `docs/10-project-state/OPEN_DECISIONS.md`
item A2), this risk is part of what makes it Tier A rather than routine.

## Out of Scope for Phase 0

Choosing or connecting to any market data API, news source, brokerage, or exchange
integration. See `docs/01-product/PRODUCT_SPECIFICATION.md` § Explicitly Out of
Scope for Now.

## Related Documents

- Data source selection and provenance: `docs/05-data/DATA_SOURCES.md`
- Data validation on ingest: `docs/05-data/DATA_QUALITY.md`
- Security handling of external input: `docs/02-architecture/SECURITY_ARCHITECTURE.md`
- Iran market *behavior* (as opposed to operational constraints above): `docs/03-market/IRAN_MARKET_MODEL.md`
