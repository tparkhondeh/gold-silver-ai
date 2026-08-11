# Decision Engine

**Source of truth for:** the requirement for a deterministic decision engine and
an auditable decision history. Not implemented in Phase 0.

## Requirement

The deterministic core that produces valuation, allocation, rotation, and risk
outputs (`docs/03-market/BUBBLE_MODEL.md`, `docs/04-portfolio/`) must:

- Be implemented in code, not inferred by an LLM (`AI_ROLE.md`).
- Be deterministic — the same inputs produce the same outputs, every time.
- Be traceable — every output can be explained by the specific inputs and logic
  that produced it.

## Decision History Requirement

Every analysis or recommendation the system produces must be recorded: what was
analyzed, what inputs were used, what the output was, and when. This creates an
auditable trail so that:

- Past recommendations can be reviewed against what actually happened.
- Model or data changes over time are visible, not silently overwritten.
- The owner (or future maintainers) can reconstruct why a given recommendation was
  made.

## Status

`STATUS: TBD` for storage format and retention of decision history, and for the
internal structure of the decision engine itself. Deferred to the implementation
phase that first produces a real deterministic output.

## Related Documents

- AI/LLM boundary: `AI_ROLE.md`
- What gets computed: `docs/03-market/BUBBLE_MODEL.md`, `docs/04-portfolio/`
- Agent layer that will present these decisions conversationally: `AGENT_ARCHITECTURE.md`
