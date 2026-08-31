# Portfolio Model

**Source of truth for:** what "analyzing a portfolio" means in this system — the
dimensions a current portfolio must eventually be evaluated on. Not implemented in
Phase 0. Allocation and rotation *recommendations* built on top of this analysis
are specified separately in `ALLOCATION_ENGINE.md` and `ROTATION_ENGINE.md`; risk
specifically in `RISK_MODEL.md`.

## Requirement

Portfolio analysis must go beyond stating whether a single asset looks attractive.
Given a current portfolio, the system must eventually be able to analyze it across
all of the following dimensions:

- **Valuation** — how each held instrument is priced relative to its own history
  (`docs/03-market/BUBBLE_MODEL.md`).
- **Relative valuation** — how held instruments compare to each other and to
  alternatives (see "Alternative opportunities" below).
- **Risk** — see `RISK_MODEL.md`.
- **Liquidity** — how easily a position could realistically be converted, given
  Iranian market conditions.
- **Market regime** — the environment each holding is currently in
  (`docs/03-market/MARKET_REGIME.md`).
- **Expected return** — deterministically derived, not AI-guessed (see
  `docs/06-ai/AI_ROLE.md`); methodology `STATUS: TBD`.
- **Transaction/conversion costs** — the real-world cost of acting on a
  recommendation (fees, spreads, taxes if applicable), so recommendations aren't
  made in a frictionless vacuum.
- **Portfolio constraints** — any limits the owner sets (e.g. minimum holding,
  risk tolerance, liquidity needs) — see `docs/01-product/USER_REQUIREMENTS.md`.
- **Alternative opportunities** — what else could reasonably be held instead,
  drawn from `docs/03-market/ASSET_UNIVERSE.md`.

Output of this analysis feeds `ALLOCATION_ENGINE.md` and `ROTATION_ENGINE.md`.

## Non-Negotiable Constraints

- All quantitative outputs (valuations, weights, expected returns, cost estimates)
  are deterministic, code-computed — never AI-estimated.
- Not used on the owner's real portfolio operationally until the Historical
  Validation Principle (`docs/03-market/HISTORICAL_ANALYSIS.md`) has been completed
  for every model this analysis depends on.
- Constraints and risk tolerance come from the owner, not assumed defaults.

## Status

`STATUS: TBD` for all methodology. `DECISION REQUIRED: YES` at design time,
including confirming the owner's actual portfolio structure and constraints
(`docs/01-product/USER_REQUIREMENTS.md`) — not assumed now.

## Related Documents

- Storage-only transaction and valuation contract: `TRANSACTION_AND_VALUATION_STORAGE.md`
- Allocation proposals: `ALLOCATION_ENGINE.md`
- Rotation proposals: `ROTATION_ENGINE.md`
- Risk analysis: `RISK_MODEL.md`
- Asset universe: `docs/03-market/ASSET_UNIVERSE.md`
