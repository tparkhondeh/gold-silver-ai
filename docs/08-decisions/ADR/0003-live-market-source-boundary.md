# ADR 0003: Live Market Source Boundary

- **Status:** Accepted for Phase 1 integration
- **Date:** 2026-08-25
- **Decision owner:** Project owner

## Context

The owner explicitly requested online prices from reputable Iranian and foreign
sources. The product must provide visible progress without treating an unlicensed,
ambiguous, or single-source quote as decision-grade data.

## Decision

- Implement Navasan as the first keyed Iranian adapter because its official guide
  provides JSON schemas, Unix timestamps, current values, history, OHLC endpoints,
  status codes, and documented symbol identifiers.
- Require the contract's IRR/toman unit to be declared in configuration. The adapter
  fails closed when that declaration is absent.
- Implement GoldAPI.io as the preferred keyed global-metals adapter.
- Allow XAUS and Gold-API.com only as clearly labelled informational fallbacks. Their
  values may populate market-watch UI but cannot unlock recommendations, portfolio
  valuation, backtests, or operational decisions.
- Do not scrape TGJU or other public webpages. A future TGJU integration requires a
  licensed API contract.
- Keep all credentials server-side and expose only normalized, validated quotes.

## Consequences

The UI can show real global reference prices immediately when the public feed is
reachable. Iranian prices require the owner's provider key and explicit contract-unit
confirmation. This is a deliberate safety boundary, not a placeholder.
