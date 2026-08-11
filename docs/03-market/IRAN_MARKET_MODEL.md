# Iran Market Model

**Source of truth for:** the requirement and approach for calibrating this system
specifically to Iran, rather than assuming foreign-market behavior applies.

## The Core Rule

No relationship, correlation, premium behavior, or statistical pattern observed in
international gold/silver markets may be assumed to hold in Iran. Every such
relationship used by this system must be independently studied and validated
against Iranian data before being relied upon. This rule is non-negotiable — see
`docs/00-governance/PROJECT_RULES.md` § 1.

## Why Iran Is Likely Structurally Different (hypotheses to validate, not facts)

These are commonly cited structural factors for the Iranian precious-metals market
that make foreign-market transplantation risky. They are recorded here as
**hypotheses the research phase must confirm or refute with real data**, not as
verified conclusions:

- Currency and inflation dynamics of the Iranian rial may drive gold/silver
  valuation behavior differently than in low-inflation economies.
- Capital controls and limited access to foreign investment channels may cause
  domestic precious-metals instruments to behave partly as inflation/currency
  hedges rather than pure commodity exposure.
- Sanctions-related trade friction may affect physical supply, premiums, and
  price discovery relative to global spot pricing.
- Local instruments (e.g. gold coins) may carry premiums driven by domestic
  supply/demand and policy factors that don't exist in international bullion
  markets.

None of these are used in any calculation until validated — see
`docs/00-governance/QUALITY_GATES.md` (data/financial correctness gate) and the
Historical Validation Principle in `HISTORICAL_ANALYSIS.md`.

## Requirement

Before any valuation, bubble/premium, regime, or portfolio model is used
operationally, it must be calibrated using Iranian historical data specifically —
not defaulted from, or blended with, foreign-market parameters, unless a documented
and owner-approved methodology explicitly justifies doing so (e.g. as a fallback
when Iranian data is insufficient, clearly labeled as such).

## Status

`STATUS: TBD` for all specifics (which factors matter, how they're measured, what
data is available). This document holds the *requirement*; the *findings* belong in
future research output once the data foundation exists (`docs/05-data/`).

## Related Documents

- Asset scope: `ASSET_UNIVERSE.md`
- Bubble/premium methodology requirement: `BUBBLE_MODEL.md`
- Historical validation process: `HISTORICAL_ANALYSIS.md`
- Data sourcing for Iran: `docs/05-data/DATA_SOURCES.md`
