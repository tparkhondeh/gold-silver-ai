# System Architecture

**Source of truth for:** the overall shape of the system — its layers, module
boundaries, and non-functional requirements. Not the source of truth for data
specifics (`docs/05-data/`), AI behavior (`docs/06-ai/`), or market/portfolio logic
(`docs/03-market/`, `docs/04-portfolio/`) — those own their own content.

## Status

`STATUS: ACTIVE FOR PHASE 1`. ADR 0001 establishes a TypeScript/React,
server-rendered web boundary and PostgreSQL behind repository interfaces for the
approved Phase 1 vertical slice. Deployment topology beyond the local web application
remains `STATUS: TBD`; the accepted stack decision is not permission to deploy or
merge to `main`.

## Layered Shape (Target)

The system is intended to separate concerns into layers with one-directional
dependency (each layer may depend on layers below it, not above):

```
┌─────────────────────────────────────────────┐
│ Interface Layer (TBD: web / desktop / chat / reports) │
├─────────────────────────────────────────────┤
│ AI / Agent Layer — interpretation, explanation, NL interaction │
│   (docs/06-ai/) — never the source of a number  │
├─────────────────────────────────────────────┤
│ Decision Engines — allocation, rotation, risk, bubble/valuation │
│   (docs/04-portfolio/, docs/03-market/) — deterministic         │
├─────────────────────────────────────────────┤
│ Shared Precious-Metals Infrastructure                          │
│   + Gold Engine + Silver Engine (docs/03-market/)               │
├─────────────────────────────────────────────┤
│ Data Layer — ingestion, validation, storage, provenance         │
│   (docs/05-data/, docs/02-architecture/DATA_ARCHITECTURE.md)    │
└─────────────────────────────────────────────┘
```

This diagram describes intended dependency direction, not a commitment to specific
services, processes, or deployment topology — those are implementation decisions
for later phases.

## Gold / Silver Module Boundary

- **Gold Engine** and **Silver Engine** are separate modules — each metal's
  behavior, valuation history, and premium dynamics are modeled on their own terms,
  not forced into one shared model. See `docs/03-market/GOLD_MODEL.md`,
  `docs/03-market/SILVER_MODEL.md`.
- **Shared Precious-Metals Infrastructure** holds only genuinely common logic
  (e.g. common statistical/percentile utilities, common data-quality checks) —
  logic goes here only when it is actually identical across metals, not by default.
- The architecture must remain extensible to additional precious-metal instruments
  beyond gold and silver — see `docs/03-market/ASSET_UNIVERSE.md`.

## Component / Feature Lifecycle

**Architecture requirement, established 2026-08-11.** Every component (an
Engine, a pipeline stage, an interface, an integration) moves through:

```
Proposed → Active → Deprecated → Retired
```

A component in **Deprecated** state still runs but must not gain new dependents;
its replacement (if any) and removal plan are stated at the moment it's
deprecated, not left implicit. **Retired** means removed — which, for anything
touching a data or decision contract, follows the Breaking Change cycle in
`docs/00-governance/CHANGE_MANAGEMENT.md` § 5 rather than being deleted outright.

## New Capability Checklist

Before any future feature is added to the system (not just Phase 0 documentation
— an actual implementation), it must be answerable in these terms:

- Which layer does it belong to (per the diagram above)?
- What is its Source of Truth document?
- What are its inputs and outputs?
- What does it depend on, and what would depend on it?
- Which quality gates apply (`docs/00-governance/QUALITY_GATES.md`)?
- Does it change an existing architecture or contract? If yes, it follows the
  Breaking Change cycle in `docs/00-governance/CHANGE_MANAGEMENT.md` § 5, not a
  routine change.

A feature is never added to the shared core "because it's convenient" without
this being answered — that's exactly how architecture drift accumulates
unnoticed over a multi-year project.

## Non-Functional Requirements

The system must remain, throughout its life: modular, maintainable, testable,
observable, secure, extensible, documented, versioned, and recoverable. These are
requirements to design toward, not a license to build speculative infrastructure
now — see `docs/00-governance/PROJECT_RULES.md` § 7 (no premature complexity).

## Related Documents

- Data flow and storage principles: `DATA_ARCHITECTURE.md`
- AI layer placement and boundaries: `AI_ARCHITECTURE.md`
- Security posture: `SECURITY_ARCHITECTURE.md`
- External system integration pattern: `INTEGRATION_ARCHITECTURE.md`
