# Market Regime

**Source of truth for:** the requirement to characterize the current market
environment as part of analysis. Not implemented in Phase 0.

## Requirement

The system must eventually be able to characterize the prevailing market regime
(e.g. the general environment gold/silver are trading in) as context for both
bubble/premium analysis (`BUBBLE_MODEL.md`) and portfolio analysis
(`docs/04-portfolio/PORTFOLIO_MODEL.md`). A valuation percentile alone is
insufficient — the same percentile can mean different things in different regimes.

## Why This Matters

Historical "forward outcomes after comparable conditions"
(`BUBBLE_MODEL.md`) are more meaningful when grouped by regime rather than
treated as one undifferentiated history — e.g. behavior during high-inflation
periods vs. low-inflation periods may differ meaningfully in Iran specifically
(see `IRAN_MARKET_MODEL.md`).

## Status

`STATUS: TBD` for: what regimes are defined, how they're detected, what data they
require, and how confidently they can be identified in real time vs. only in
hindsight. `DECISION REQUIRED: YES` at design time — regime definition is a
methodology decision, not a default to assume, and should be presented to the
owner per `docs/00-governance/PROJECT_RULES.md` § 2.

## Related Documents

- Bubble/premium analysis this feeds: `BUBBLE_MODEL.md`
- Iran-specific calibration: `IRAN_MARKET_MODEL.md`
- Historical validation requirement: `HISTORICAL_ANALYSIS.md`
- Portfolio use of regime context: `docs/04-portfolio/PORTFOLIO_MODEL.md`
