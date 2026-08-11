# Product Vision

**Source of truth for:** why this project exists and what it is ultimately trying to
become. For the concrete capability list, see `PRODUCT_SPECIFICATION.md`.

## Mission

Gold/Silver AI will become an **Iran-first** intelligent financial analysis and
portfolio decision system focused on gold, silver, and investable instruments
related to them. It should eventually help understand the Iranian precious-metals
market, maintain trustworthy historical data, analyze valuation and market regime,
and support (not replace) decisions about a portfolio — with every number behind
that support traceable to deterministic, testable code.

## Who It's For

Primary owner/user: the project owner, whose background is financial decision-making
rather than programming. Whether the system will ever serve additional users:
`STATUS: TBD` — `DECISION REQUIRED: YES` (see `docs/01-product/USER_REQUIREMENTS.md`).

## Core Beliefs

1. **Correctness over speed.** This system may inform real financial decisions
   eventually. A wrong number is worse than a late feature.
2. **Iran is not a smaller copy of a foreign market.** Relationships, premiums, and
   behaviors seen in international gold/silver markets are not assumed to transfer.
   They must be independently studied and calibrated using Iranian data. See
   `docs/03-market/IRAN_MARKET_MODEL.md`.
3. **AI explains; code calculates.** Language models are for interpretation,
   synthesis, and conversation. They are never the source of a price, return,
   percentage, statistic, or recommendation weight. See `docs/06-ai/AI_ROLE.md`.
4. **Nothing goes operational untested.** A model is only used for real decisions
   after historical validation, calibration, and backtesting. See
   `docs/00-governance/QUALITY_GATES.md`.
5. **Documentation and governance are part of the product**, not overhead — this is
   a long-lived system and future work (human or AI) depends on accurate records.

## Long-Term Capability Areas

Each area is documented in detail elsewhere; this is the map, not the content.

| Area | What it eventually does | Detail |
|---|---|---|
| Market data | Ingest, validate, store, and track provenance of gold/silver market data | `docs/05-data/` |
| Gold & Silver engines | Analyze each metal on its own terms, and jointly | `docs/03-market/GOLD_MODEL.md`, `SILVER_MODEL.md` |
| Bubble/premium analysis | Judge whether current valuation is historically cheap, normal, or expensive | `docs/03-market/BUBBLE_MODEL.md` |
| Market regime analysis | Characterize the current market environment | `docs/03-market/MARKET_REGIME.md` |
| Historical backtesting | Validate any decision logic against history before real use | `docs/01-product/PRODUCT_SPECIFICATION.md` § Backtesting |
| Portfolio analysis | Evaluate a user's holdings against valuation, risk, and alternatives | `docs/04-portfolio/PORTFOLIO_MODEL.md` |
| Rotation guidance | Suggest increase / reduce / hold / sell / convert, with reasoning | `docs/04-portfolio/ROTATION_ENGINE.md` |
| Risk analysis | Characterize downside and concentration risk | `docs/04-portfolio/RISK_MODEL.md` |
| Decision history | Keep an auditable record of past analyses and decisions | `docs/06-ai/DECISION_ENGINE.md` |
| Agent layer | Natural-language interaction over the deterministic core | `docs/06-ai/AGENT_ARCHITECTURE.md` |

## What This Is Not

- Not a generic global-markets clone re-skinned for Iran.
- Not a system that treats an LLM's output as a financial fact.
- Not an investment advisory service producing personalized financial advice without
  the owner's informed review — see `docs/06-ai/AI_ROLE.md` for the boundary between
  analysis support and advice.
- Not something to be tested live on the owner's real portfolio before it has been
  validated historically (see `docs/00-governance/QUALITY_GATES.md`).

## Current Phase

The project is in **Phase 0 — Foundation & Governance**. No product functionality
exists yet. See `docs/10-project-state/CURRENT_STATE.md`.
