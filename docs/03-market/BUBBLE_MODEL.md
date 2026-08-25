# Bubble / Premium Model

**Source of truth for:** the requirement to assess whether current valuation is
historically cheap, normal, or expensive. This is a core, eventual product
capability. **Not implemented in Phase 0** — this document records the requirement
only, per the project's explicit instruction to document, not build, this logic now.

Phase 1 now includes a deliberately limited UI diagnostic for **current raw
metal-content premium** on supported gram-based gold and silver holdings. It runs
only when the domestic quote, USD/IRR quote, and global ounce quote are all valid.
This diagnostic is not the historical bubble model described below, excludes coins
until their exact reference specification is approved, and cannot issue a decision.

## Target Question

The system must eventually be able to answer, for a given instrument (gold, silver,
or a specific Iranian instrument within them):

> "Is today's bubble/premium historically attractive, normal, or expensive?"

## Required Analytical Capabilities

Once implemented, this capability must support:

- Historical minimum
- Historical maximum
- Median
- Percentiles / distribution
- Duration analysis (how long comparable conditions have historically persisted)
- Historical regime identification (see `MARKET_REGIME.md`)
- Current value's percentile/rank within historical distribution
- Historical context around the current reading
- Forward outcomes observed historically after comparable conditions (i.e. "what
  tended to happen after readings like this one, historically")

## Non-Negotiable Constraints

- All of the above are deterministic, code-computed statistics over validated
  historical data (`docs/02-architecture/DATA_ARCHITECTURE.md`) — never AI-estimated.
  See `docs/06-ai/AI_ROLE.md`.
- Must be calibrated to Iranian historical data specifically — see
  `IRAN_MARKET_MODEL.md`. A percentile computed on foreign-market history is not a
  valid stand-in.
- Must not be used operationally until backtested and walk-forward validated per
  `HISTORICAL_ANALYSIS.md` and `docs/00-governance/QUALITY_GATES.md`.
- "Forward outcomes after comparable conditions" is a historical-frequency
  statement about the past, not a prediction or investment recommendation — the
  distinction must be preserved in any output (see `docs/06-ai/AI_ROLE.md`).

## Status

`STATUS: PARTIAL UI DIAGNOSTIC / HISTORICAL MODEL TBD` for methodology, exact
statistical definitions (e.g. what counts as
"comparable conditions"), lookback windows, and data requirements. `DECISION
REQUIRED: YES` at design time for this capability, which should be presented to the
owner per `docs/00-governance/PROJECT_RULES.md` § 2 before implementation begins.

## Related Documents

- Historical validation process required before use: `HISTORICAL_ANALYSIS.md`
- Regime identification: `MARKET_REGIME.md`
- Per-metal application: `GOLD_MODEL.md`, `SILVER_MODEL.md`
- AI's role in presenting these results: `docs/06-ai/AI_ROLE.md`
