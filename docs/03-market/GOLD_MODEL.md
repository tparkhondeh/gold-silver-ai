# Gold Model

**Source of truth for:** the requirement for a dedicated gold analytical engine.
This document records requirements only — no gold-specific logic is implemented in
Phase 0.

## Requirement

Gold must have a dedicated analytical module ("Gold Engine") within the
architecture described in `docs/02-architecture/SYSTEM_ARCHITECTURE.md`. Gold is
not to be modeled as a generic "precious metal" with silver-specific behavior
forced onto it, or vice versa — the two share infrastructure only where genuinely
identical (see `SYSTEM_ARCHITECTURE.md` § Gold / Silver Module Boundary).

## Expected Responsibilities (once implemented)

- Track and validate gold-specific instrument data (see `ASSET_UNIVERSE.md` for
  candidate instruments).
- Support historical bubble/premium analysis specific to gold
  (`BUBBLE_MODEL.md`).
- Support market regime characterization specific to gold (`MARKET_REGIME.md`).
- Feed deterministic, gold-specific outputs into portfolio analysis
  (`docs/04-portfolio/PORTFOLIO_MODEL.md`).
- Respect Iran-specific calibration rules (`IRAN_MARKET_MODEL.md`) — gold's
  behavior in Iran is not assumed from international gold market behavior.

## Status

`STATUS: TBD` for all methodology and calculation specifics. No gold data has been
collected, and no gold-specific calculation exists. This document will be expanded
with real methodology once the relevant phase is designed and approved
(`docs/01-product/ROADMAP.md`).

## Related Documents

- Module boundary and shared infrastructure: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
- Silver's parallel model: `SILVER_MODEL.md`
- Bubble/premium requirement: `BUBBLE_MODEL.md`
