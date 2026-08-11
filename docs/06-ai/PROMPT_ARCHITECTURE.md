# Prompt Architecture

**Source of truth for:** principles for how prompts to the future agent layer are
designed. Not implemented in Phase 0 — no prompts exist yet.

## Principles (to apply once the agent layer is built)

1. **Separate data from instructions.** Content pulled from external or
   user-supplied sources is passed to the model clearly marked as data, never
   concatenated in a way that lets it masquerade as an instruction — same
   principle as `docs/06-ai/AI_ROLE.md` § Untrusted Input Rule.
2. **Numbers come from tool calls, not generation.** Wherever a prompt needs a
   financial number, it is obtained via a call to the deterministic layer
   (`docs/02-architecture/AI_ARCHITECTURE.md`), not asked of the model directly.
3. **Minimize context.** Only the documentation and data relevant to the current
   query is included — mirrors `CLAUDE.md` § 8's token-efficiency rules, applied
   to the product itself.
4. **Explanations are traceable.** A prompt asking the model to explain a result
   includes the actual deterministic inputs/outputs, so the explanation can be
   checked against them.

## Status

`STATUS: TBD` for concrete prompt templates, since no agent implementation exists
to write prompts for yet.

## Related Documents

- Behavioral boundaries: `AI_ROLE.md`
- Agent design: `AGENT_ARCHITECTURE.md`
