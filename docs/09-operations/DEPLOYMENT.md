# Deployment

**Source of truth for:** how the system is deployed/run. Nothing is deployed yet;
no application code exists.

## Status

`STATUS: TBD` — deployment target (local, cloud, self-hosted), environment
strategy, and release process all depend on the technology stack decision in
`docs/02-architecture/SYSTEM_ARCHITECTURE.md`, which has not been made.

## Principle (to hold regardless of eventual approach)

Only code that is on `main` (stable, owner-approved — see
`docs/00-governance/STABILITY_POLICY.md`) is ever deployed anywhere the owner
relies on for real use.

## Related Documents

- Stack decision: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
- Stability policy: `docs/00-governance/STABILITY_POLICY.md`
- Monitoring once deployed: `MONITORING.md`
