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
files are the dependency registry. CSV parsing, hashing, and validation use platform
APIs. The guarded local database runtime adds pinned `pg` (MIT), and the Persian UI
bundles pinned Vazirmatn through Fontsource (OFL-1.1). Production-dependency audit is
clean as of ۱۴۰۵/۰۶/۱۰. The exact full development tree has one moderate advisory in
the drizzle-kit-only esbuild loader chain; see `docs/10-project-state/KNOWN_ISSUES.md`
item 8. Project license/IP posture remains owner-critical decision A18.

The open-source product review and adopt/defer/reject decisions are recorded in
`OPEN_SOURCE_ADOPTION.md`. The GitHub Actions workflow uses only official MIT-licensed
GitHub actions and receives read-only repository contents permission. No source code
from the reviewed AGPL financial products is included.

The Phase 2 laboratory uses the Python 3.12 standard library for contracts and every
financial calculation. GitHub CI uses the official MIT-licensed
`actions/setup-python@v7`, reviewed on 2026-09-01. Parquet transport now uses exactly
`pyarrow==25.0.1` from Apache Arrow, only for serialization. The official package is
Apache-2.0, supports Python 3.12, declares no mandatory Python dependency, supplies
official Windows/Linux/macOS CPython 3.12 wheels, and had zero OSV records for this
exact version when reviewed on 2026-09-01. `requirements.lock` pins SHA-256 hashes for
all official CPython 3.12 wheels and CI installs with `--require-hashes`. The project
license/IP decision remains open, so this permissive dependency review is technical,
not a substitute for that owner/legal decision. See the
[official PyPI record](https://pypi.org/project/pyarrow/25.0.1/) and
[Apache installation documentation](https://arrow.apache.org/docs/python/install.html).

## Related Documents

- Security posture: `docs/02-architecture/SECURITY_ARCHITECTURE.md`
- Stack decision: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
- Open-source review: `OPEN_SOURCE_ADOPTION.md`
