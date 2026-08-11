# Next Task

**Source of truth for:** what should happen next. Read this before starting any
new work session.

## Immediate Next Step

**Owner review of Phase 0.** Read `PHASE_0_AUDIT.md` (repository root) for the full
account of what was built and why. Per
`docs/00-governance/DEVELOPMENT_WORKFLOW.md`, `phase-0-foundation` is not merged to
`main` until the owner explicitly approves it.

Nothing further should be built until that review happens — see
`docs/00-governance/STABILITY_POLICY.md` and `docs/01-product/ROADMAP.md`
("phases proceed sequentially").

## After Approval

1. Merge `phase-0-foundation` into `main` (owner-approved action).
2. Optionally tag the milestone once a tagging convention is decided
   (`docs/10-project-state/OPEN_DECISIONS.md` item 26).
3. Scope Phase 1. The working hypothesis in `docs/01-product/ROADMAP.md` is that
   Phase 1 should be the **data foundation** (asset universe confirmation, data
   source selection, ingestion, validation) since every later capability depends
   on trustworthy data — but this is a hypothesis for the owner to confirm, not a
   commitment.
4. Before Phase 1 implementation starts, resolve the decisions in
   `docs/10-project-state/OPEN_DECISIONS.md` marked "Blocking for Phase 1,"
   presented to the owner per `docs/00-governance/PROJECT_RULES.md` § 2.

## Do Not

- Do not start Phase 1 work before owner approval of Phase 0.
- Do not choose a technology stack, data source, or methodology unilaterally.
- Do not build application code, UI, or financial calculations yet.
