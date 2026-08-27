# Deployment

**Source of truth for:** how the system is deployed/run.

## Status

`STATUS: PARTIAL`. The Phase 1 working branch has an owner-authorized public Sites
deployment for interface review at
`https://asha-gold-silver-ai.taha-p.chatgpt.site`. It is not a stable release and is
not merged to `main`.

The review deployment has no server-side portfolio persistence, no account model,
and no production authentication. Portfolio/demo state is browser-session-local;
the loopback CSV operator is disabled on the public hostname. Reviewers must use
synthetic, non-sensitive inputs.

The local application remains the only approved operator surface. PostgreSQL,
environment separation for persistent data, monitoring, backup, and a stable release
process remain `STATUS: TBD` or partial in their respective operations documents.

## Principle (to hold regardless of eventual approach)

Only code that is on `main` (stable, owner-approved — see
`docs/00-governance/STABILITY_POLICY.md`) may be deployed anywhere the owner relies
on for real financial use. A branch-based public review must remain labelled and
treated as evaluation-only.

## Related Documents

- Stack decision: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
- Stability policy: `docs/00-governance/STABILITY_POLICY.md`
- Monitoring once deployed: `MONITORING.md`
