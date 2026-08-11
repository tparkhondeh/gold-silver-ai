# System Architecture

**Source of truth for:** the overall shape of the system — its layers, module
boundaries, and non-functional requirements. Not the source of truth for data
specifics (`docs/05-data/`), AI behavior (`docs/06-ai/`), or market/portfolio logic
(`docs/03-market/`, `docs/04-portfolio/`) — those own their own content.

## Status

No technology stack has been chosen. Per `docs/00-governance/PROJECT_RULES.md` § 7,
a stack is chosen when a real, approved implementation task requires it — not
speculatively in Phase 0. `STATUS: TBD` — `DECISION REQUIRED: YES`, to be presented
per the decision format in `docs/00-governance/PROJECT_RULES.md` § 2 when Phase 1
is scoped.

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
