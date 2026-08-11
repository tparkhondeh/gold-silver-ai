# Stability Policy

**Source of truth for:** what `main` means and how it's protected.

## 1. What `main` Is

`main` contains only stable, owner-approved code and documentation. Anything on
`main` is assumed correct, reviewed, and safe to build on. If something on `main`
turns out to be wrong, that's treated as an incident, not a normal edit (see
`docs/09-operations/INCIDENT_RESPONSE.md`).

## 2. Protections

- No direct commits to `main`.
- No merges to `main` without: all applicable quality gates passed
  (`QUALITY_GATES.md`) and explicit owner approval.
- No force-push to `main`, ever.
- No history rewriting on `main`.

Enforcement mechanism (branch protection rules, CI checks, etc.):
`STATUS: TBD` — `DECISION REQUIRED: YES`, deferred until a Git hosting platform and
CI approach are chosen (see `docs/02-architecture/SYSTEM_ARCHITECTURE.md`).

## 3. Tags and Releases

Meaningful milestones are tagged after merge to `main`. Tagging scheme and release
process: `STATUS: TBD` — to be decided at or before the first tag-worthy milestone
(likely end of the first implementation phase).

## 4. Recovery

If a problem reaches `main`, the response is to identify the last known-good state
and roll forward with a fix (preferred) or revert the offending merge — never to
force-push over history. Full incident process: `docs/09-operations/INCIDENT_RESPONSE.md`.
Backup/restore expectations for data (once data exists): `docs/09-operations/BACKUP.md`.

## 5. Definition of "Stable"

A merge to `main` is considered stable when it has passed every gate in
`QUALITY_GATES.md` for its phase and the owner has approved it in writing. Stability
is a property of what's on `main`, not of any work-in-progress branch.
