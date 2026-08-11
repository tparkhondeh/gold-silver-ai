# Coding Standards

**Source of truth for:** how code in this repository is written, once code exists.
No code exists yet; no language/framework-specific style guide has been chosen
(depends on the stack decision in `docs/02-architecture/SYSTEM_ARCHITECTURE.md`).

## Stack-Agnostic Principles (apply regardless of eventual language choice)

1. **Modularity.** Gold/silver logic, data handling, decision engines, and the AI
   layer stay in clearly separated modules, matching
   `docs/02-architecture/SYSTEM_ARCHITECTURE.md`.
2. **No premature abstraction.** Build the concrete thing the current task needs;
   generalize only when a second real use case demands it
   (`docs/00-governance/PROJECT_RULES.md` § 1, non-negotiable #7).
3. **Determinism where it matters.** Financial calculation code has no hidden
   randomness or reliance on model output (`docs/06-ai/AI_ROLE.md`).
4. **Readable over clever.** This is a long-lived project maintained by an
   AI-assisted, non-programmer owner — code must be understandable by whoever
   (human or AI) picks it up next, favoring clarity over terse tricks.
5. **Comments explain why, not what.** Reserve comments for non-obvious
   reasoning (a constraint, a workaround, an Iran-specific assumption); don't
   narrate what the code already says.

## Status

Language/framework-specific conventions (formatting, linting rules, naming
conventions) are `STATUS: TBD` until the technology stack is chosen. This document
will be filled in at that point rather than guessed now.

## Related Documents

- Stack decision: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
- Testing expectations: `TESTING_STRATEGY.md`
- Dependency rules: `DEPENDENCY_POLICY.md`
