# Silver Model

**Source of truth for:** the requirement for a dedicated silver analytical engine.
This document records requirements only — no silver-specific logic is implemented
in Phase 0.

## Requirement

Silver must have a dedicated analytical module ("Silver Engine"), parallel to but
independent from the Gold Engine (see
`docs/02-architecture/SYSTEM_ARCHITECTURE.md` § Gold / Silver Module Boundary).
Silver's market dynamics (e.g. typically higher volatility, different industrial
demand drivers, different liquidity characteristics than gold) must not be assumed
identical to gold's — each metal is modeled on its own terms, sharing
infrastructure only where genuinely common logic exists.

## Expected Responsibilities (once implemented)

- Track and validate silver-specific instrument data (see `ASSET_UNIVERSE.md`).
- Support historical bubble/premium analysis specific to silver
  (`BUBBLE_MODEL.md`).
- Support market regime characterization specific to silver (`MARKET_REGIME.md`).
- Feed deterministic, silver-specific outputs into portfolio analysis
  (`docs/04-portfolio/PORTFOLIO_MODEL.md`), including gold-silver joint analysis
  where relevant (e.g. gold/silver ratio) — methodology `STATUS: TBD`.
- Respect Iran-specific calibration rules (`IRAN_MARKET_MODEL.md`).

## Status

`STATUS: TBD` for all methodology and calculation specifics. No silver data has
been collected, and no silver-specific calculation exists.

## Related Documents

- Module boundary and shared infrastructure: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
- Gold's parallel model: `GOLD_MODEL.md`
- Bubble/premium requirement: `BUBBLE_MODEL.md`
