# Agent Architecture

**Source of truth for:** the design requirement for the natural-language agent
layer. Not implemented in Phase 0.

## Requirement

The system must eventually support a conversational agent layer that lets the
owner interact with the deterministic core in natural language — asking questions,
requesting explanations, and exploring analysis — without that layer ever becoming
the source of financial numbers (`AI_ROLE.md`).

## Expected Shape (once designed)

- The agent calls into deterministic engines (via defined interfaces, not by
  regenerating their logic) to get numbers, then explains them.
- The agent has access only to the deterministic outputs and documentation it
  needs for the current query — not an unbounded dump of the whole system
  (mirrors the token-efficiency principle in `CLAUDE.md` § 8, applied to the
  product's own AI layer, not just to Claude Code's use of this repo).
- The agent respects the untrusted-input rule in `AI_ROLE.md` for any external
  content it processes.

## Status

`STATUS: TBD` for the orchestration approach, tool-calling mechanism, and model
provider. `DECISION REQUIRED: YES` — deferred until the deterministic core exists
to build the agent on top of (agent layer depends on decision engine, per
`docs/02-architecture/SYSTEM_ARCHITECTURE.md`).

## Related Documents

- Behavioral boundaries: `AI_ROLE.md`
- Structural placement: `docs/02-architecture/AI_ARCHITECTURE.md`
- What it calls into: `DECISION_ENGINE.md`
- Prompt design: `PROMPT_ARCHITECTURE.md`
