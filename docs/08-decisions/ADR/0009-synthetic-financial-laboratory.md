# ADR 0009: Synthetic-Only Independent Financial Laboratory

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decision owner:** Project owner

## Context

The owner accepted the Phase 1 Data Foundation for progression while keeping real
financial use locked. Persistence, provenance, quota controls, local readiness, and
their automated tests pass on the verified Phase 1 working-branch checkpoint.
Licensed historical data, an independent Iranian source, and approved financial
methodologies are not yet available.

## Problem

The project needs to develop and verify deterministic financial-engine mechanics
without turning synthetic exercises into real market claims, recommendations, or
operational code, and without making paid APIs a prerequisite for engineering work.

## Options Considered

1. Wait for licensed real history before building any financial-engine mechanics.
2. Build an isolated, synthetic-only laboratory with permanent operational locks.
3. Reuse the Phase 1 UI simulation engine as the future real engine.

## Decision

Use option 2. Phase 2 begins on `codex/phase-2-decision-engine`, created from the
verified Phase 1 HEAD rather than `main`.

The laboratory is an isolated Python package. Its fixtures must be explicitly and
machine-verifiably synthetic, its inputs and outputs versioned, and every calculation
deterministic and tested. It may implement evaluation benchmarks and validation
mechanics, but it must not select or imply an approved real financial methodology.

Every laboratory result remains `evaluation_only`, `financial_use_allowed: false`,
and `execution_allowed: false`. It must not call paid APIs, ingest real market or
portfolio data, write to production registries, generate real recommendations, or
connect to runtime execution. The existing Phase 1 simulation engine is kept
separate and cannot be promoted into this laboratory or a future real engine.

## Rationale

This permits measurable engineering progress while preserving the project's most
important safety boundary: synthetic evidence cannot silently become real financial
evidence. Isolation also lets calculation and validation code be reviewed without
changing the local web runtime.

## Trade-offs

- Synthetic results can prove code correctness, not usefulness in the Iranian market.
- Real calibration, methodology selection, and performance claims remain blocked.
- A separate package and CI job add maintenance, but make the safety boundary visible
  and independently testable.

## Consequences

- Phase 1 acceptance here authorizes progression only; it is not approval to merge
  either branch into `main`.
- Financial-methodology decisions in `OPEN_DECISIONS.md` remain owner-critical.
- Any future real-data adapter must enter through a separately approved, versioned
  contract after licensing and data-quality gates pass.
- Promotion from evaluation to real decision support requires a later ADR, licensed
  point-in-time data, Iran-specific calibration, backtesting, walk-forward evidence,
  shadow mode, and explicit owner approval.
