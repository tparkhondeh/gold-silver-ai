# Product Specification

**Source of truth for:** the inventory of capabilities the product is meant to have,
and their current status. This document lists *what*; the *how* lives in the
domain-specific documents linked from each row. Nothing in this document is
implemented yet — Phase 0 is documentation and governance only.

## How to Read This

- **Status** is one of: `DOCUMENTED` (requirement recorded, not built),
  `PARTIAL`, `IMPLEMENTED`.
- Every capability's detailed requirements live in exactly one domain document.
  This file does not restate them.

## Capability Inventory

### Market Data
| Capability | Status | Detail |
|---|---|---|
| Market data ingestion (manual + automatic) | DOCUMENTED | `docs/05-data/DATA_PIPELINE.md` |
| Historical data storage | DOCUMENTED | `docs/05-data/HISTORICAL_DATA.md` |
| Data validation & anomaly/missing-data detection | DOCUMENTED | `docs/05-data/DATA_QUALITY.md` |
| Source tracking, provenance, freshness, reliability | DOCUMENTED | `docs/05-data/DATA_SOURCES.md` |

### Market Analysis
| Capability | Status | Detail |
|---|---|---|
| Gold-specific analysis | DOCUMENTED | `docs/03-market/GOLD_MODEL.md` |
| Silver-specific analysis | DOCUMENTED | `docs/03-market/SILVER_MODEL.md` |
| Joint gold+silver analysis | DOCUMENTED | `docs/03-market/GOLD_MODEL.md`, `SILVER_MODEL.md` |
| Iran-specific market calibration | DOCUMENTED | `docs/03-market/IRAN_MARKET_MODEL.md` |
| Historical bubble/premium analysis (min, max, median, percentiles, distribution, duration, current rank, forward outcomes) | DOCUMENTED | `docs/03-market/BUBBLE_MODEL.md` |
| Market regime analysis | DOCUMENTED | `docs/03-market/MARKET_REGIME.md` |
| General historical analysis tooling | DOCUMENTED | `docs/03-market/HISTORICAL_ANALYSIS.md` |

### Validation
| Capability | Status | Detail |
|---|---|---|
| Historical backtesting | DOCUMENTED | `docs/03-market/HISTORICAL_ANALYSIS.md`, `docs/00-governance/QUALITY_GATES.md` |
| Walk-forward validation | DOCUMENTED | `docs/03-market/HISTORICAL_ANALYSIS.md`, `docs/00-governance/QUALITY_GATES.md` |
| Failure-case evaluation & documented limitations | DOCUMENTED | `docs/00-governance/QUALITY_GATES.md` |

### Portfolio
| Capability | Status | Detail |
|---|---|---|
| Current portfolio analysis (valuation, relative valuation, risk, liquidity, regime, expected return, conversion costs, constraints) | DOCUMENTED | `docs/04-portfolio/PORTFOLIO_MODEL.md` |
| Alternative-opportunity comparison | DOCUMENTED | `docs/04-portfolio/PORTFOLIO_MODEL.md` |
| Proposed allocation | DOCUMENTED | `docs/04-portfolio/ALLOCATION_ENGINE.md` |
| Proposed rotation (increase/reduce/hold/sell/convert A→B) | DOCUMENTED | `docs/04-portfolio/ROTATION_ENGINE.md` |
| Risk analysis | DOCUMENTED | `docs/04-portfolio/RISK_MODEL.md` |

### AI / Decision Layer
| Capability | Status | Detail |
|---|---|---|
| Deterministic decision engine (financial logic in code) | DOCUMENTED | `docs/06-ai/DECISION_ENGINE.md` |
| Decision history / audit trail | DOCUMENTED | `docs/06-ai/DECISION_ENGINE.md` |
| Natural-language agent interaction | DOCUMENTED | `docs/06-ai/AGENT_ARCHITECTURE.md` |
| AI role boundaries (interpretation vs. calculation) | DOCUMENTED | `docs/06-ai/AI_ROLE.md` |

### Platform
| Capability | Status | Detail |
|---|---|---|
| Automatic and manual data/model updates | DOCUMENTED | `docs/05-data/DATA_PIPELINE.md` |
| Long-term extensibility to additional precious-metal instruments | DOCUMENTED | `docs/03-market/ASSET_UNIVERSE.md` |

## Explicitly Out of Scope for Now

- Any UI.
- Any live/real financial calculation.
- Any connected market-data API.
- Any investment recommendation delivered to the owner.

These remain out of scope until the corresponding phase is designed, approved, and
sequenced — see `ROADMAP.md`.

## Open Product Questions

Tracked centrally in `docs/10-project-state/OPEN_DECISIONS.md`, including
`docs/01-product/USER_REQUIREMENTS.md` for who exactly this serves.
