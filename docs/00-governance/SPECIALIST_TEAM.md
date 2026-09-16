# Coordinated specialist development team

Owner authorization: September 16, 2026. This is a development/review workflow,
not a product agent, trading authority, new vendor, or financial methodology.

## Roles and bounded ownership

| Role | Expected evidence |
|---|---|
| Architecture and requirements | Registered requirement mapped to code, integration gap and acceptance test |
| Financial calculation review | Deterministic reproduction, units, exact amounts/costs/cash, single-budget invariants |
| Data quality and provenance | Contract/version/source/unit/time validation and explicit missing-data/licensing limits |
| Security and persistence | Threat/reproduction, isolation, failure handling, preservation and replay evidence |
| Persian UX, accessibility and performance | Actual browser behavior, clear decisions/errors, reachable controls and numeric detail |
| Test/CI/release review | Meaningful regression coverage, exact-SHA checks and explicit untested release gates |

The coordinating agent owns scope, integration, conflicts and final verification.
Combine roles or run them in waves within the actual available concurrency. Role
names are responsibilities, not certifications or evidence of a global ranking.
Use available capabilities appropriate to each task; do not install unknown agents,
buy services or change global configuration to satisfy a superlative.

## Execution protocol

1. Read `CLAUDE.md`, current checkpoints and changes since them. Assign only
   concrete, independent work alongside useful coordinator work. Give each agent
   its objective, allowed paths, read/write scope and acceptance criteria.
2. Audit broadly once against registered needs. Then review changed/risky areas;
   avoid repeated full-history reads or duplicate full-suite executions.
3. Start reviews read-only. Each finding includes severity, file/line, observed
   evidence or reproducible synthetic case, impact and a bounded remedy. Existing
   owner/data/method gates are dependencies, not bugs to bypass. Unreviewed areas
   remain explicit; a clean sample review does not prove absence of all defects.
4. Before implementation, take a recoverable backup. Allocate disjoint edit
   ownership; do not have multiple agents edit the same file concurrently. Only
   the coordinator commits/pushes after inspecting integrated changes.
5. Financial, security and persistence corrections require another agent's
   independent review plus relevant deterministic tests. Resolve disagreement by
   reproduction and tests, not voting. Retain the approved financial method.
6. Run the relevant browser paths and required regression/security checks. Record
   exact outcomes, limitations and CI evidence for the delivered commit. Preserve
   owner data and all pre-existing changes; existing governance gates still apply.

## Continuity and token efficiency

Keep compact role assignments/findings/evidence and the next concrete action in a
dated review linked from `CURRENT_STATE.md` and `NEXT_TASK.md`. Subsequent sessions
that read this guide reconstruct only the roles needed for their current tasks.
Use real delegation where available and useful, reporting actual roles used and
any unavailable capability. Do not claim cross-chat permanent memory, immortal
subagents, scheduled continuation or work after an active session ends.

Do not retain idle workers or manufacture features to keep a team busy. Pass only
relevant context and concise evidence-backed summaries; avoid redundant reviews,
but never economize by skipping necessary validation. When independent work is
exhausted, state the exact authorization/data dependency. Owner acceptance,
production deployment and financial readiness remain separate gates.
