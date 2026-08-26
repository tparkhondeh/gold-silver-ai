# Dependency Policy

**Source of truth for:** how external dependencies (libraries, packages, services)
are chosen and added.

## Rule

A dependency is added only when a current, approved task genuinely requires it —
never speculatively "for later." See `docs/00-governance/PROJECT_RULES.md` § 1,
non-negotiable #7.

## Before Adding a Dependency

1. Is there a way to accomplish this without a new dependency? Prefer that if
   reasonable.
2. Is the dependency actively maintained and reasonably trustworthy (supply-chain
   risk — see `docs/02-architecture/SECURITY_ARCHITECTURE.md`)?
3. Does it introduce a license that conflicts with the project's needs?
   `STATUS: TBD` — project license not yet chosen.
4. For anything touching financial calculation: is the dependency's correctness
   verifiable, or does it become an unverified black box in a place that must be
   deterministic and auditable (`docs/06-ai/AI_ROLE.md`, `docs/00-governance/QUALITY_GATES.md`)?

## Dependency Registry

Once dependencies exist, the actual list in use (name, version, why it was added,
license) must be visible from the ecosystem's own manifest/lockfile — that
manifest *is* the registry; this policy does not require a second, hand-maintained
list duplicating it. What this policy requires is that nothing appears in that
manifest without having gone through § Before Adding a Dependency above.

## Status

`STATUS: ACTIVE`. Phase 1 uses npm with committed `package.json` and lockfile; those
files are the dependency registry. The first Data Foundation slice added no new
dependency: CSV parsing, hashing, validation, and repository boundaries use platform
APIs plus the already-present Drizzle PostgreSQL schema package. Project license/IP
posture remains owner-critical decision A18.

## Related Documents

- Security posture: `docs/02-architecture/SECURITY_ARCHITECTURE.md`
- Stack decision: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
