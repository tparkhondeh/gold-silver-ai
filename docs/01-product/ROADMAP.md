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
| Phase 0 | Foundation, governance, documentation architecture | **Owner-approved**; branch remains separate from `main` |
| Phase 1 | Data foundation plus a visible Persian local interface, scoped by ADR 0001 | **Owner-accepted for progression** on `codex/phase-1-data-ui`; not merged to `main` |
| Phase 2 | Isolated synthetic-only deterministic financial laboratory, scoped by ADR 0009 | **Active** on `codex/phase-2-decision-engine` |
| Phase 3+ | `STATUS: TBD` | Not started |

ADR 0009 scopes Phase 2 only as a synthetic, non-operational laboratory. The later
logical dependency order remains licensed data → historical/bubble analysis →
backtesting and Iran-specific calibration → portfolio/risk methodology → agent
layer. `DECISION REQUIRED: YES` from the owner before any real methodology is selected
or a later dependent phase is scoped.

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
