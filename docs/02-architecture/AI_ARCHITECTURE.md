# AI Architecture

**Source of truth for:** where the AI/agent layer sits structurally relative to the
deterministic core, and the architectural mechanism that enforces the boundary
between them. For *what AI is and isn't allowed to do* in product terms, see
`docs/06-ai/AI_ROLE.md` (that document is the behavioral source of truth; this one
is the structural source of truth — they must not contradict each other).

## Status

No AI framework, model provider, or orchestration approach has been chosen.
`STATUS: TBD` — `DECISION REQUIRED: YES`.

## Structural Principle

The AI/agent layer sits **above** the deterministic decision engines, never beside
or inside them:

```
User ⇄ AI/Agent Layer ⇄ Deterministic Decision Engines ⇄ Data Layer
              (explains,               (computes numbers)
               interprets,
               converses)
```

- The AI layer may **call** deterministic engines to obtain numbers and may explain
  or reason about the results.
- The AI layer must **never compute, estimate, or fabricate** a number that a
  deterministic engine is responsible for (prices, returns, percentiles, weights,
  risk metrics, backtest results — see `docs/06-ai/AI_ROLE.md`).
- This is an architectural boundary, not just a guideline: outputs that are
  numbers must be traceable to a deterministic function call, not to model
  generation. How this traceability is technically enforced (e.g. structured
  tool-calling, typed outputs, validation layer) is `STATUS: TBD` (Tier B — see
  `docs/10-project-state/OPEN_DECISIONS.md` item B6) and will be decided when the
  AI layer is actually designed — but *that* it must be enforced is fixed by the
  Decision Provenance requirement in `docs/06-ai/DECISION_ENGINE.md`.

## LLM / Deterministic Engine Boundary

**Architecture boundary, established 2026-08-11.** This is the precise call
pattern that implements the Structural Principle above for any single
financial question:

```
LLM → Tool / Function Call → Deterministic Financial Engine → Structured Result → LLM Interpretation / Explanation
```

**The LLM must not:**
- Guess a financial number and use it as if it were valid data.
- Substitute for the Financial Engine on any sensitive financial calculation.
- Perform an important numeric calculation without first obtaining validated data
  through a tool/function call.
- Be the source of truth for any financial figure (see `docs/06-ai/AI_ROLE.md`).

**The Financial Engine must:**
- Perform the actual calculation.
- Return a structured (not free-text) result.
- Be testable — see `docs/07-engineering/TESTING_STRATEGY.md`.
- Be versioned — its Methodology Version and Model Version (if applicable) are
  exactly the fields the Decision Provenance chain in
  `docs/06-ai/DECISION_ENGINE.md` § Decision Provenance records for every decision.

**The LLM should mainly:**
- Reason about structured results.
- Interpret what a result means in context.
- Explain it in plain language (`docs/00-governance/PROJECT_RULES.md` § 2).
- Generate reports/summaries over deterministic output.

This is not new policy — it is the same boundary already fixed in
`docs/06-ai/AI_ROLE.md`, expressed here as the concrete call chain so a future
implementer has an unambiguous mechanical pattern to build against, not just a
principle to interpret.

## Related Documents

- AI role and behavioral boundaries: `docs/06-ai/AI_ROLE.md`
- Decision engine and audit trail: `docs/06-ai/DECISION_ENGINE.md`
- Agent design: `docs/06-ai/AGENT_ARCHITECTURE.md`
- Prompt design principles: `docs/06-ai/PROMPT_ARCHITECTURE.md`
