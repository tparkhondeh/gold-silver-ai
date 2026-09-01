# Testing Strategy

**Source of truth for:** how correctness is verified.

## Principles

1. **Financial calculations are never trusted untested.** Any deterministic
   calculation (valuation, percentile, allocation, risk, backtest logic) requires
   automated tests with known, hand-verified expected outputs before it's
   considered complete — see `docs/00-governance/QUALITY_GATES.md` gate 3.
2. **Historical validation is a form of testing.** Backtesting and walk-forward
   validation (`docs/03-market/HISTORICAL_ANALYSIS.md`) are required in addition
   to, not instead of, unit tests of the calculation logic itself.
3. **Data quality checks are tested too.** The validation logic in
   `docs/05-data/DATA_QUALITY.md` needs its own tests (e.g. does it actually catch
   a known-bad value?), not just the calculations built on top of it.
4. **Regression protection.** Existing tests must keep passing as the system
   grows (`docs/00-governance/QUALITY_GATES.md` gate 7).
5. **AI-layer outputs are checked structurally, not by "does this look right."**
   Wherever the AI layer is expected to only interpret/explain, tests should
   verify no fabricated numbers are being introduced — see `docs/06-ai/AI_ROLE.md`.

## Status

`STATUS: ACTIVE FOR PHASE 2`. Phase 1 uses Node's built-in test runner for
deterministic unit, contract, repository, rendered-output, and API tests; ESLint and
the Vinext build are separate gates. The GitHub Actions workflow runs these gates on
the development branch; its first run identified a runtime-command mismatch.

The default test command now measures only imported project source under `app/`,
`data/`, `db/`, `scripts/`, and `worker/`; generated build output is excluded by
construction.
It fails when line coverage is below 85%, branch coverage is below 65%, or function
coverage is below 80%. These are regression floors, not a reason to omit risk-based
tests: critical financial, persistence, security, and fail-closed paths still require
direct tests even when the aggregate percentages pass.

The local operations check is also contract-tested: it accepts only the exact
loopback health endpoint on port 4174, requires every database-backed Phase 1 surface,
and fails if the explicit financial-use lock is absent. Provider endpoints are never
part of this check.
The owner-local launcher has separate tests for missing, disabled, duplicated,
unexpected and malformed runtime entries plus remote, privileged, credential-free,
wrong-database and option-bearing PostgreSQL URLs.

`npm test` builds first, then delegates to `npm run test:coverage`. Both the coverage
command and the faster `npm run test:unit` command use
`node --experimental-strip-types --test tests/*.test.mjs` so direct `.ts` imports
also work on the declared Node 22.13 minimum. Native type stripping became enabled
by default only in 22.18; see the [official Node history](https://nodejs.org/docs/latest-v22.x/api/typescript.html#modules-typescript).
A runtime-contract regression test protects the shared command. This strips types
for execution; it does not replace the separate TypeScript typecheck gate.

The synthetic intelligence suite separately verifies deterministic repeatability,
hand-reconstructable weighted score arithmetic, ordering of best/worst scenarios,
90-observation history coverage, bounded rotation amounts, tolerated-drawdown override,
and tangible technical/bubble/portfolio lens output. These tests validate the sandbox
calculation path only; they are not a substitute for backtesting or walk-forward
validation of a real Iranian-market methodology.

The isolated Phase 2 Python laboratory uses Python 3.12's standard `unittest` runner
in a separate GitHub Actions job. Its first contract suite verifies canonical replay
fingerprints, exact schema keys, synthetic namespaces, point-in-time availability,
permanent no-financial-use/no-execution flags, unapproved methodology state, and
tamper rejection. The next fixture/baseline tests pin the exact 120-period dataset
fingerprint, prove absence of market namespaces/units, resolve versioned synthetic
assumptions, hand-check initial index values, reject premature availability, and verify
that a cutoff sees only then-known observations. Artifact/replay tests also reject
duplicate JSON keys, invalid UTF-8, non-canonical or oversized documents, a resealed
but false result, and a result belonging to another model. Twenty laboratory tests
pass. These tests establish mechanics and a safety boundary; they are not market
validation or evidence for a real methodology. Five additional control tests verify
hand-computed cash, rebalanced 1/N and no-trade cumulative change and drawdown,
delayed-observation carry forward, exact reference identity, invalid ranges, missing
cash, and rejection of a resealed false control result. Twenty-five laboratory tests
now pass.
Five walk-forward contract tests pin a 54-fold reference plan, verify rolling and
anchored ranges, purge/embargo separation, point-in-time exclusion of a delayed
training row, canonical artifact round-trip, exact dataset binding, invalid-parameter
and period-gap rejection, and resealed-tamper rejection. Thirty laboratory tests pass.
Four Parquet tests verify the exact reviewed package version/license, deterministic
same-runtime encoding, semantic reconstruction of the original dataset fingerprint,
explicit schema version, and rejection of corrupt, oversized or wrong-metadata files.
Dependency health also passes `pip check`; thirty-four laboratory tests pass locally.
Five feature-contract tests verify a delayed level is carried forward without
look-ahead and catches up only when available, pin the 109-row/11-delay reference
matrix identity, require exact dataset-bound artifact replay, and reject invalid ranges
or resealed tampering. Thirty-nine laboratory tests pass locally.
Six train-only normalization tests hand-check mean/standard deviation and zero-
variance handling, prove changing test-tail values cannot alter fitted statistics,
pin exact reference identity, require complete training coverage and provenance-bound
artifact replay, and reject invalid folds or resealed tampering. Forty-five laboratory
tests pass locally.
Five transform tests hand-check application of frozen training statistics, require
zero output for zero variance, pin the exact reference transform, enforce complete
test coverage and exact standardizer provenance, verify canonical artifact replay,
and reject a foreign standardizer or resealed tampering. Fifty laboratory tests pass.

## Related Documents

- Quality gates: `docs/00-governance/QUALITY_GATES.md`
- Historical validation: `docs/03-market/HISTORICAL_ANALYSIS.md`
- AI boundaries being tested for: `docs/06-ai/AI_ROLE.md`
- Financial Engine Contract (testable + versioned requirement): `docs/02-architecture/AI_ARCHITECTURE.md`
