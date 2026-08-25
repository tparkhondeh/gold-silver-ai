# ADR 0002: Personal Wealth Scope

- **Status:** Accepted for product design; implementation remains phased
- **Date:** 2026-08-25
- **Decision owner:** Project owner

## Context

The owner's related project conversations describe the intended product as a
private Family Office / Personal Wealth Intelligence system, not only a precious
metals price screen. Gold and silver remain the first analytical domain, while the
owner also needs one place to register and eventually analyze all capital assets.

## Decision

The interface may represent these owner-entered asset classes:

- Cash, bank deposits, and foreign currencies
- Gold, silver, copper, zinc, coins, and commodity certificates
- Stocks, funds/ETFs, cryptoassets, and receivables
- Real estate, businesses/private equity, vehicles/equipment
- Digital assets and intellectual property

The product navigation will reserve modules for wealth overview, assets, metals
and markets, risk/allocation, scenarios, macro intelligence, businesses, data
quality, and the agent review board.

## Guardrails

- Broad UI scope does not authorize unvalidated financial models.
- Owner holdings are never inferred from chat examples or market discussions.
- Portfolio totals, returns, risk, valuation, and recommendations stay unavailable
  until owner data and validated deterministic engines exist.
- Gold/silver/strategic-metals data foundation remains the first implementation
  vertical slice; other modules are progressive product surfaces.
