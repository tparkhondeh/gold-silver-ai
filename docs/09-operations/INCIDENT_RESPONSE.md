# Incident Response

**Source of truth for:** what happens when something goes wrong on `main` or in a
deployed system. Nothing is deployed yet; this document establishes the principle
ahead of need.

## Principle

If incorrect data, a broken calculation, or a security issue reaches `main`, it is
treated as an incident, not a normal bug — per
`docs/00-governance/STABILITY_POLICY.md` § 1. Specifically for financial
correctness: if a deterministic calculation is found to have been wrong, every
downstream output that depended on it (analysis shown to the owner, decision
history entries) must be identified, not just the code fixed going forward — this
follows from the decision-history/audit-trail requirement in
`docs/06-ai/DECISION_ENGINE.md`.

## Response Steps (principle-level; concrete tooling `STATUS: TBD`)

1. Identify the last known-good state on `main`.
2. Contain: stop the incorrect behavior from continuing to affect new output.
3. Assess blast radius: what analysis/decisions were affected, and when it started.
4. Fix forward (preferred) or revert the offending change — never force-push over
   `main` history (`docs/00-governance/STABILITY_POLICY.md` § 2).
5. Communicate to the owner in plain language what happened, what was affected,
   and what changed (`docs/00-governance/PROJECT_RULES.md` § 2).
6. Record the incident and the fix; if it reveals a missing quality gate or
   process gap, update `docs/00-governance/QUALITY_GATES.md` accordingly.

## Status

`STATUS: TBD` for tooling (alerting, rollback mechanics) — depends on the
deployment approach (`DEPLOYMENT.md`).

## Related Documents

- Stability policy: `docs/00-governance/STABILITY_POLICY.md`
- Backup/recovery: `BACKUP.md`
- Decision audit trail: `docs/06-ai/DECISION_ENGINE.md`
