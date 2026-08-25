# 0004. Temporary Rahavard Manual Snapshot

Status: Accepted
Date: 2026-08-25

## Context

The owner explicitly approved using the already signed-in Rahavard 365 browser tab to
move the local Phase 1 preview forward before an official API subscription is selected.
ADR 0003 prohibits webpage scraping and requires auditable, fail-closed source handling.

## Problem

The UI needs truthful Iranian-market values for local inspection without turning the
owner's browser session into an unofficial automated feed or weakening freshness,
provenance, licensing, and no-fabrication controls.

## Options Considered

1. Keep Iranian values empty until an API token is acquired.
2. Capture one read-only, owner-approved snapshot and make its limitations explicit.
3. Automate the signed-in tab or reuse its cookies as a data feed.

## Decision

Accept option 2 for the local Phase 1 preview only:

- Record the captured values, exact Rahavard product URLs, raw currency/unit, and a UTC
  collection timestamp in a versioned repository snapshot.
- Store a provider publication timestamp only when the page exposes one; otherwise use
  `publishedAt=null` and `collectedAt` as the freshness basis.
- Convert IRR to toman deterministically by division by 10 and apply plausible-range
  validation before exposing a quote.
- Mark every observation stale after 60 minutes. Stale quotes remain visibly auditable
  but cannot value portfolio holdings or unlock analysis/recommendations.
- Do not automate Rahavard, persist cookies/credentials, refresh in the background,
  redistribute the data publicly, or use the snapshot for trading, recommendation,
  execution, backtesting, or model training.
- Replace this snapshot through the same normalized quote boundary once an official API
  or licensed export contract is configured.

## Rationale

This gives the owner an honest local preview while preserving ADR 0003's source and
security boundary. The snapshot is explicit data rather than an implicit live feed, and
its usefulness expires deterministically.

## Trade-offs

The data does not update automatically and quickly becomes unsuitable for valuation.
The UI must distinguish a manual snapshot from connected and informational API feeds.

## Consequences

An official keyed Iranian provider and an independent cross-check remain required before
operational analysis. Any future automation of Rahavard requires a new accepted decision
and documented provider authorization; this ADR does not grant it.
