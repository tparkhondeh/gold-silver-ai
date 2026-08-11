# Development Workflow

**Source of truth for:** how work moves from idea to stable code.

## 1. Phase Sequence

Work proceeds through a fixed sequence per unit of work (a "phase"). A phase is not
necessarily a calendar period — it's a bounded piece of work with a clear deliverable.

```
DISCOVER → DESIGN → IMPLEMENT → TEST → AUDIT → DOCUMENT → OWNER APPROVAL → STABLE → NEXT PHASE
```

- **DISCOVER** — understand the problem, constraints, and existing state. No code.
- **DESIGN** — propose an approach. Surface decisions per `PROJECT_RULES.md` § 2-3.
- **IMPLEMENT** — build the approved design.
- **TEST** — automated tests; for financial code, correctness verification.
- **AUDIT** — self-review against the quality gates (`QUALITY_GATES.md`).
- **DOCUMENT** — update the relevant `docs/` files and project-state files.
- **OWNER APPROVAL** — the owner reviews and explicitly approves.
- **STABLE** — merged to `main`.
- **NEXT PHASE** — only begins after the current phase reaches STABLE, unless the
  owner explicitly authorizes parallel work.

A phase does not skip steps. A dependent phase does not start early.

## 2. Branching Model

- `main` — stable, owner-approved code only. Protected: no direct pushes, no merges
  without approval (`STABILITY_POLICY.md`).
- **Work branches** — all development happens on a branch named for the phase or
  task it covers (e.g. `phase-0-foundation`, `data-pipeline-ingestion`). Created from
  the latest stable `main`.
- Branches are not merged to `main` until they pass every applicable quality gate
  and receive explicit owner approval.
- Avoid creating branches that don't correspond to real, current work.

## 3. Review Before Merge

Before requesting owner approval to merge, a branch must have:

1. A working, complete implementation of its stated scope (no half-finished code).
2. Automated tests, where the work includes testable logic.
3. A Claude Code self-review against `QUALITY_GATES.md`.
4. Updated documentation, including `docs/10-project-state/` files.
5. A written summary for the owner using the decision-presentation format in
   `PROJECT_RULES.md` § 2, if any decisions were embedded in the work.

## 4. Tagging

Tagging policy (when and how milestones are tagged) is owned by
`STABILITY_POLICY.md` § 3, not restated here.

## 5. Commit Hygiene

- Commits should be scoped and describe *why*, not just *what*.
- Never commit secrets, credentials, or API keys (`.gitignore` covers common cases;
  extend it if a new category of local secret file is introduced).
- Never use history-rewriting or force-push on `main`.
