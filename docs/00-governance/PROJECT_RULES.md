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

Every decision falls into exactly one of two tiers. This tiering is itself an
owner-approved rule (established 2026-08-11) and is the classification scheme
`docs/10-project-state/OPEN_DECISIONS.md` must follow — that document does not
define its own criteria, it applies these.

**Tier A — Owner-Critical.** Requires the owner's explicit approval, presented
per § 2, before proceeding. Used for anything foundational, hard to reverse, or
carrying real product, financial, legal, or cost consequence.

**Tier B — Implementation/Engineering.** Claude Code decides and proceeds
directly, backed by a documented rationale drawing on: prevailing engineering
standards, performance, maintainability, security, cost, Iran-specific
constraints, token efficiency, and long-term scalability. A Tier B decision is
escalated to Tier A only if it turns out to carry a serious architectural or
risk impact not apparent when it was first classified.

| Decision type | Tier |
|---|---|
| Wording/formatting inside an already-approved document | B |
| Foundational technology stack (primary language/runtime, overall architecture pattern) | A |
| Data storage technology/paradigm (e.g. relational vs. document vs. time-series) | A |
| A specific library/tool within an already-approved stack, with no material lock-in or added cost (e.g. a testing framework, a linter, a scheduling mechanism) | B — escalate if it introduces new lock-in, recurring cost, or a security exposure |
| Data source / vendor selection | A |
| Data schema, retention, and pipeline mechanics once sources/stack are set | B |
| Product scope, features, or priorities | A |
| Architecture decisions with long-term consequences | A, recorded as an ADR |
| Financial methodology (valuation, allocation, risk models) | A, recorded as an ADR |
| Project license | A |
| Hosting, monitoring, backup, and incident-response tooling | B — escalate if it involves recurring cost or handling real user data |
| Merge to `main` | A, every time |

When a decision's tier is genuinely ambiguous, default to Tier A — the cost of
asking unnecessarily is lower than the cost of a unilateral call on something
that mattered.

### Reversibility

Independent of tier, every decision — especially Tier B ones — should be checked
against how hard it would be to undo:

- **Reversible** — changed later at negligible cost (e.g. a linter config).
- **Partially Reversible** — changeable, but with real rework cost (e.g. swapping
  a library once several components depend on it).
- **Expensive to Reverse** — technically possible but costly (e.g. a storage
  format once significant historical data has accumulated in it).
- **Irreversible** — cannot be meaningfully undone (e.g. an executed financial
  transaction, a deleted historical record, data sent to a third party).

**Rule: a decision that is Expensive to Reverse or Irreversible is treated as
Tier A regardless of how technical it looks**, even if the row above would
otherwise classify it as Tier B. This is what makes the escalation clause above
concrete rather than a vague "use judgment" — reversibility is the test. A future
automated-execution capability (see `docs/06-ai/AI_ROLE.md` § Analysis →
Recommendation → Approval → Execution) is Irreversible by definition and is
always Tier A, requiring a new ADR, never introduced as a byproduct of an
unrelated Tier B change.

## 4. Relationship to Other Governance Documents

- **How we work day to day:** `DEVELOPMENT_WORKFLOW.md`
- **What "done" means:** `QUALITY_GATES.md`
- **What "stable" means and how `main` is protected:** `STABILITY_POLICY.md`
- **How decisions and changes are proposed, tracked, and recorded:**
  `CHANGE_MANAGEMENT.md`
