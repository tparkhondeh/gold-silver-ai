# Change Management

**Source of truth for:** how decisions, scope changes, and unresolved questions are
tracked and resolved.

## 1. Marking Unresolved Items

Two markers are used consistently across all documentation:

- `STATUS: TBD` — the information is not yet known or not yet decided. Do not fill
  it with a plausible-sounding guess.
- `DECISION REQUIRED: YES` — a choice needs to be made, and it requires owner input
  (see `docs/00-governance/PROJECT_RULES.md` § 3 for which decisions need owner
  approval).

Both markers are tracked centrally in `docs/10-project-state/OPEN_DECISIONS.md` so
they don't get lost inside individual documents.

## 2. Proposing a Change

1. Identify which single document is the source of truth for the thing being
   changed (see `CLAUDE.md` § 2). Changes are made there, not copied elsewhere.
2. If the change is a decision requiring owner approval, present it using the
   format in `PROJECT_RULES.md` § 2 (what/why/options/pros/cons/recommendation/risk).
3. Once approved, if the decision is architectural or product-significant, record
   it as an ADR under `docs/08-decisions/ADR/` using the template there.
4. Update `docs/10-project-state/OPEN_DECISIONS.md` to remove the resolved item.
5. Update `CHANGELOG.md` if the change affects what's on `main`.

## 3. When Scope Changes Mid-Phase

If new information surfaces mid-phase that changes what should be built:

- Stop and re-run the affected part of DISCOVER/DESIGN
  (`DEVELOPMENT_WORKFLOW.md` § 1) rather than silently expanding scope.
- Surface the change to the owner if it affects timeline, cost, architecture, or
  product behavior.
- Do not let scope creep into a phase without an explicit decision to do so.

## 4. ADR Lifecycle

ADRs move through statuses: `Proposed → Accepted → (later) Superseded/Deprecated`.
An ADR is never deleted; superseding decisions get a new ADR that references the
old one. See `docs/08-decisions/ADR/README.md` for the template and rules.

## 5. What This Document Does Not Cover

- The mechanics of branching/merging: `DEVELOPMENT_WORKFLOW.md`.
- What must be true before a merge: `QUALITY_GATES.md`.
- What `main` protection looks like: `STABILITY_POLICY.md`.
