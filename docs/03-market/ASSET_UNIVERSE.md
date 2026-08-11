# Asset Universe

**Source of truth for:** which instruments the system is meant to eventually cover.
This document records candidate categories and the requirement to be extensible —
it does not assert verified facts about any specific instrument, and no data
collection has happened yet.

## Requirement

The system must be extensible to precious-metal-related instruments beyond a single
gold and silver spot price, and to additional precious metals in the future beyond
gold and silver — see `docs/02-architecture/SYSTEM_ARCHITECTURE.md` § Gold / Silver
Module Boundary.

## Candidate Instrument Categories (unverified — for scoping discussion only)

These are commonly known categories in precious-metals markets generally and in the
Iranian context specifically. They are listed to scope the *shape* of the asset
universe, not confirmed as the final list, and no market data for any of them has
been collected or validated:

- Physical gold coin instruments (e.g. Iranian gold coin denominations)
- Gold by weight (gram-based pricing)
- Gold jewelry (which typically trades at a premium/discount to raw gold value)
- Silver by weight
- Any exchange-traded or fund-based "paper" gold/silver instruments available in
  Iran, if they exist
- Global gold/silver spot/futures as a reference point (not as an assumed proxy for
  the Iranian market — see `IRAN_MARKET_MODEL.md`)

## Status

`STATUS: TBD` — `DECISION REQUIRED: YES`. The confirmed, final asset universe
requires owner input and/or dedicated market research before any data work begins.
This document should be updated (not duplicated) once that research happens.

## Related Documents

- Gold-specific modeling: `GOLD_MODEL.md`
- Silver-specific modeling: `SILVER_MODEL.md`
- Iran-specific calibration requirement: `IRAN_MARKET_MODEL.md`
- Data source selection per instrument: `docs/05-data/DATA_SOURCES.md`
