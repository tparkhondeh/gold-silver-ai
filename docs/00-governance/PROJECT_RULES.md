# Project Rules

**Source of truth for:** the non-negotiable rules governing how this project is
built. `CLAUDE.md` contains a condensed operating summary for Claude Code; this
document is the full version. If the two ever disagree, this document wins and
`CLAUDE.md` should be corrected.

## 1. Non-Negotiables

1. **No fabricated data.** Never invent prices, historical values, statistics, or
   analytical results. Missing information is marked `STATUS: TBD`, never guessed.
2. **Deterministic finance.** All financial calculations (prices, returns,
   percentages, valuation percentiles, portfolio weights, risk metrics, backtest
   results) are produced by code, never by an LLM. See `docs/06-ai/AI_ROLE.md`.
3. **Iran-specific calibration.** No behavior, correlation, or rule observed in a
   foreign market may be assumed to hold for Iran without explicit validation
   against Iranian data. See `docs/03-market/IRAN_MARKET_MODEL.md`.
4. **No premature operational use.** A decision model (valuation, allocation,
   rotation, risk) is not used operationally until it has gone through data
   validation, historical study, calibration, backtesting, and walk-forward
   validation. See `docs/00-governance/QUALITY_GATES.md`.
5. **`main` is stable.** No direct pushes, no merges without passing all quality
   gates and receiving explicit owner approval. See `STABILITY_POLICY.md`.
6. **Documentation is a first-class deliverable**, not an afterthought. A change
   that isn't documented isn't finished. See `docs/00-governance/CHANGE_MANAGEMENT.md`.
7. **No premature complexity.** Don't choose a technology, add a dependency, or
   build an abstraction unless the current, approved task genuinely requires it.
8. **No silent major decisions.** Product, architecture, methodology, and vendor
   decisions are surfaced to the owner, not made unilaterally. See § 3.

## 2. Owner Communication

The owner does not have a programming background. When a technical or product
decision is required, present it in this shape:

1. **What** is being decided
2. **Why** it matters
3. **Options** available
4. **Advantages** of each
5. **Disadvantages** of each
6. **Recommendation**, with reasoning
7. **What happens if this is chosen incorrectly** (cost of a wrong call, and how
   reversible it is)

Avoid unexplained jargon. When a technical term is necessary, define it briefly
inline the first time it's used in a document.

## 3. Decision Authority

| Decision type | Who decides |
|---|---|
| Wording/formatting inside an already-approved document | Claude Code, no approval needed |
| New technology, framework, or dependency | Owner approval required (present per § 2) |
| Data source / vendor selection | Owner approval required (present per § 2) |
| Product scope, features, or priorities | Owner approval required |
| Architecture decisions with long-term consequences | Owner approval required, recorded as an ADR |
| Financial methodology (valuation, allocation, risk models) | Owner approval required, recorded as an ADR |
| Merge to `main` | Owner approval required, every time |

## 4. Relationship to Other Governance Documents

- **How we work day to day:** `DEVELOPMENT_WORKFLOW.md`
- **What "done" means:** `QUALITY_GATES.md`
- **What "stable" means and how `main` is protected:** `STABILITY_POLICY.md`
- **How decisions and changes are proposed, tracked, and recorded:**
  `CHANGE_MANAGEMENT.md`
