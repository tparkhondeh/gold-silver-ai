# ADR 0001: Phase 1 Foundation and Local Interface

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision owner:** Project owner

## Context

The owner approved Phase 0 and authorized Phase 1 design and implementation without
additional confirmation, with two immediate goals: a trustworthy data foundation
and a visible local interface.

## Decision

- Phase 1 is a narrow vertical slice: asset registry, ingestion contracts,
  validation/quarantine/provenance design, read-only system status, and a Persian
  RTL local web interface.
- The initial user is the owner; the interface is Persian-first, responsive, and
  browser-based. Refresh is on-demand until an approved source contract defines a
  safe cadence.
- Initial instruments are 18k gold gram, mesghal, Emami coin, 999 silver gram,
  USD/IRR, and XAU/USD. XAG/USD remains the next reference instrument.
- The application architecture is TypeScript/React with a server-rendered web
  boundary. Persistent storage will use PostgreSQL behind repository interfaces;
  local interface work must not invent browser-only canonical data.
- No external market source is approved yet. Until source licensing, timestamp
  semantics, revision behavior, and reliability are verified, the canonical store
  stays empty and the UI displays explicit empty states.
- No recommendation, trading, portfolio, bubble, or AI-generated financial number
  is in Phase 1.

## Consequences

The owner can inspect the product direction immediately without weakening the
financial-data rules. Automated ingestion remains blocked on an explicit source
contract, but schema and validation work can proceed independently.
