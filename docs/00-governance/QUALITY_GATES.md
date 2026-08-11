# Quality Gates

**Source of truth for:** what "done" means before a phase can be considered stable
and merged to `main`.

Every meaningful development phase must pass all gates that apply to it. A gate
that doesn't apply to a given phase (e.g. "data/financial correctness" for a
documentation-only phase) is marked not-applicable in the phase's audit, not
silently skipped without comment.

## The Gates

1. **Functional completeness** — the phase delivers what it committed to, fully,
   not partially.
2. **Automated tests** — testable logic has tests; tests pass.
3. **Data/financial correctness** — where the phase touches data or calculations,
   values are verified deterministic and correct, per `docs/07-engineering/TESTING_STRATEGY.md`
   and the financial-correctness rules in `CLAUDE.md` § 6.
4. **Security review** — where the phase touches data handling, secrets, external
   input, or integrations, it's checked against `docs/02-architecture/SECURITY_ARCHITECTURE.md`.
5. **Architecture review** — the phase's design is checked for consistency with
   `docs/02-architecture/` and doesn't introduce undocumented structural change.
6. **Documentation review** — relevant `docs/` files and `docs/10-project-state/`
   files are updated and internally consistent.
7. **Regression check** — existing functionality/tests are confirmed unaffected.
8. **Claude Code self-review** — an explicit self-audit against this checklist,
   written down (e.g. as a `*_AUDIT.md` for the phase).
9. **Owner approval** — explicit, in writing, before merge to `main`.

## Blocking Rule

A dependent phase must not begin while the phase it depends on has unresolved
**critical** issues. "Critical" means: incorrect financial logic, fabricated or
unvalidated data presented as real, a broken quality gate with no documented
justification, or a security gap. Non-critical polish items may be logged in
`docs/10-project-state/KNOWN_ISSUES.md` and carried forward.

## Phase Audit Requirement

Each phase produces a written audit (e.g. `PHASE_0_AUDIT.md`) covering: prior state,
what changed, decisions made vs. left `TBD`, assumptions, risks, contradictions
found and resolved, and what the next phase needs (and doesn't need) to read. The
audit is how gate 8 (self-review) is evidenced.
