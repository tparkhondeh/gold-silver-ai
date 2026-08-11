# Roadmap

**Source of truth for:** phase sequencing. This document tracks *order and status*
of phases, not their detailed content — each phase's real scope is defined and
approved at its own DESIGN step (`docs/00-governance/DEVELOPMENT_WORKFLOW.md`), not
pre-committed here.

## Principle

Phases proceed sequentially and are not started early
(`docs/00-governance/STABILITY_POLICY.md`). This roadmap shows the logical
dependency order implied by the project mission — later phases depend on earlier
ones being validated, not just built.

## Phases

| Phase | Focus | Status |
|---|---|---|
| Phase 0 | Foundation, governance, documentation architecture | **In progress** (this phase) |
| Phase 1 | `STATUS: TBD` — expected candidate: data foundation (sourcing, ingestion, validation) since every later phase depends on trustworthy data | Not started — requires owner approval to begin |
| Phase 2+ | `STATUS: TBD` | Not started |

Everything past Phase 0 is intentionally unscoped here. Per the project mission,
the logical dependency order is roughly: data foundation → historical/bubble
analysis → backtesting & calibration → portfolio & risk modeling → agent layer —
but this ordering is a *starting hypothesis for discussion*, not a committed plan.
`DECISION REQUIRED: YES` from the owner before Phase 1 is scoped and started.

## What Phase 0 Deliberately Does Not Do

- Choose a technology stack (see `docs/02-architecture/SYSTEM_ARCHITECTURE.md`).
- Choose data sources/vendors (see `docs/05-data/DATA_SOURCES.md`).
- Build any application code, UI, or financial calculation.
- Commit to a Phase 1 scope or timeline.

## Updating This Document

Update this file when a phase's status changes (started, blocked, completed) or
when the owner approves scope for the next phase. Detailed current status lives in
`docs/10-project-state/CURRENT_STATE.md` — keep the two consistent; this file is
the ordered list, that file is the live snapshot.
