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
  tool-calling, typed outputs, validation layer) is `STATUS: TBD` and will be
  decided when the AI layer is actually designed.

## Related Documents

- AI role and behavioral boundaries: `docs/06-ai/AI_ROLE.md`
- Decision engine and audit trail: `docs/06-ai/DECISION_ENGINE.md`
- Agent design: `docs/06-ai/AGENT_ARCHITECTURE.md`
- Prompt design principles: `docs/06-ai/PROMPT_ARCHITECTURE.md`
