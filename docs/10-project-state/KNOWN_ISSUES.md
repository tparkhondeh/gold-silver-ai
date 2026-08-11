# Known Issues

**Source of truth for:** known limitations and gaps in the current state of the
project. None of these are blocking for Phase 0's own deliverable (documentation
and governance), but they should be resolved before the affected future work begins.

## Phase 0 Limitations

1. **No remote git hosting configured.** The repository exists only locally.
   `main` branch protection (no direct push, no unapproved merge) is currently a
   documented policy, not a technically enforced one — see
   `docs/00-governance/STABILITY_POLICY.md` § 2. Enforcement requires choosing a
   Git hosting platform, which is `STATUS: TBD`.
2. **No CI/automation exists** to run tests or checks — there's no code to test
   yet, so this isn't blocking now, but it's not yet set up for when code exists.
3. **ADR folder is empty by design** — no architecture decisions have actually
   been made yet (deliberately; see `docs/08-decisions/ADR/README.md`). This is
   correct for Phase 0, not a gap to fill artificially.
4. **Local git commit identity** was set locally (not global) using the owner's
   known email, since no git identity existed in this environment. Worth the
   owner confirming this is the identity they want attributed to commits going
   forward.

## Not Yet Known

Whether the documentation architecture actually scales well in practice can only
be evaluated once real implementation work (Phase 1) starts using it — flag any
friction discovered then rather than assuming the structure is perfect now.
