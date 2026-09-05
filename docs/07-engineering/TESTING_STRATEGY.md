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
Five inverse-volatility control tests hand-check exact 1/3 and 2/3 weights, require an
exact sum of one, verify zero-variance exclusion and all-zero failure, pin reference
identity/no-decision locks, require provenance-bound artifact replay, and reject
resealed tampering. Fifty-five laboratory tests pass.
Five weighted-control evaluation tests hand-check a frozen 1/3 and 2/3 test-fold
return, cumulative change and drawdown, pin the exact reference identity, require the
complete associated test interval and exact upstream provenance, verify canonical
artifact replay, and reject a resealed false metric. Sixty laboratory tests pass; all
outputs remain synthetic, `no_decision`, no-use and no-execution.
Five multi-fold report tests verify three separate train/test cycles and exact fold
metrics, prove a changed future test value cannot refit the first fold's statistics or
weights, require complete matrix coverage and canonical input-bound replay, pin the
report identity, and reject an omitted/resealed fold. Sixty-five laboratory tests
pass. The report intentionally makes no aggregate performance claim.
Five covariance tests hand-check a symmetric two-path population matrix and explicit
zero variance, prove future test changes cannot alter fitted training values, pin the
exact artifact identity, require canonical replay with the exact standardizer, and
reject a resealed false entry. Seventy laboratory tests pass; covariance remains a
synthetic feature rather than a risk or allocation decision.
Five correlation tests hand-check an exact perfectly negative two-path matrix, require
explicit zero-variance exclusion and fail closed with fewer than two active paths,
prove future test changes cannot alter fitted correlations, pin canonical artifact
replay, and reject a resealed false entry. Seventy-five laboratory tests pass without
selecting a portfolio methodology.
Correlation v2 additionally exists because a later rolling fold exposed correlation
slightly above one when 12-decimal covariance transport values were divided. The same
tests now pin exact-moment output and downstream identities; the multi-fold HRP test
proves the formerly failing fold completes without widening a financial tolerance.
Five correlation-distance tests hand-check zero distance for identical paths and unit
distance for perfectly opposite paths, prove future test changes cannot alter fitted
distances, pin the canonical artifact replay, and reject a resealed false value. Eighty
laboratory tests pass; the distance matrix produces no cluster, weight or decision.
Five clustering tests hand-check nearest-pair and opposite-path merge order, require
lexicographic tie-breaking for equal distances, prove future test changes cannot alter
train-only merges, pin canonical artifact replay, and reject a resealed false linkage
distance. Eighty-five laboratory tests pass; leaf ordering and HRP weights remain
absent.
Five cluster-order tests require every active path exactly once, hand-check ordinary
and equal-distance tree traversal, prove future test changes cannot alter the
train-only order, pin canonical artifact replay, and reject a resealed reversed order.
Ninety laboratory tests pass; the order contract explicitly contains no weights.
Five HRP-style comparison-control tests hand-check recursive cluster variances and
exact 12-decimal weights summing to one, require zero weight for a disclosed zero-
variance path, prove future test changes cannot alter train-only splits/weights, pin
canonical replay, and reject resealed false weights. Ninety-five laboratory tests
pass; the benchmark remains no-decision and non-operational.
Five HRP evaluation tests require the frozen weights to use only the exact associated
test fold, prove future test changes affect evaluation without refitting the train-only
weights, require the complete covariance-to-order provenance chain and canonical
artifact round-trip, and reject resealed false metrics. One hundred laboratory tests
pass; the shared contract explicitly permits only the two reviewed comparison-control
IDs and keeps both no-decision, no-use and no-execution.
Five minimum-CVaR control tests hand-check a three-candidate grid and balanced optimum,
pin exact objective and weights, prove future test changes cannot alter training
results, enforce tail/grid resource bounds, require canonical replay, verify the
versioned schema, and reject resealed false weights. One hundred and five laboratory
tests pass; this remains an explicit synthetic experiment rather than an approved
financial optimizer.
Five minimum-CVaR evaluation tests pin a hand-computable test return and artifact
identity, prove a future test change changes evaluation without refitting the grid,
require the full exact provenance and interval, verify canonical transport and the
three allowed shared-control IDs, and reject incomplete or resealed false metrics. One
hundred and ten laboratory tests pass; all evaluation states remain locked.
Five minimum-CVaR walk-forward tests hand-check all fold ranges and metrics, pin the
report identity and no-aggregation policy, prove first-fold future isolation, require
complete canonical transport, enforce fold parameters, and reject omitted/resealed
folds or incomplete matrices. One hundred and fifteen laboratory tests pass; no
headline performance claim is produced.
Five HRP walk-forward tests hand-check all three fold ranges and metrics, pin the full
report identity, require every intermediate artifact ID, prove first-fold future
isolation, require canonical transport, and reject incomplete or resealed reports.
One hundred and twenty laboratory tests pass with no aggregate claim or decision.
Six synthetic-stress tests hand-check additive shock arithmetic, preserve visible base
and zero-default values, pin deterministic replay, require synthetic namespaces and
sorted unique cells, enforce exact matrix coverage and reject total-loss or resealed
false values. One hundred and twenty-six laboratory tests pass; no crisis methodology,
probability, threshold, ranking or decision is inferred.
Six frozen-weight stress-evaluation tests hand-check both weighted paths and metrics,
pin the exact artifact identity, require every explicit shock to stay inside the
associated test fold, preserve the reviewed train-only weight identity and reject
foreign/resealed weights or metrics. One hundred and thirty-two laboratory tests pass
under an explicit no-ranking/no-threshold/no-decision policy.
Six additional tests apply that contract to frozen HRP and minimum-CVaR weights,
pin both deterministic identities, verify canonical round trips and prove that
resealed false metrics fail closed. One hundred and thirty-eight laboratory tests
pass in total; the controls are never ranked or promoted into a methodology.
Seven multi-scenario-suite tests pin deterministic reports for all three reviewed
controls, require two to sixteen sorted unique scenarios, round-trip canonical bytes,
and reject resealed false scenario metrics. One hundred and forty-five laboratory
tests pass under `none_scenario_metrics_only`, with no cross-scenario aggregation.
Seven walk-forward stress tests pin deterministic reports for inverse-volatility, HRP
and minimum-CVaR, require one ordered scenario set per fold, verify canonical report
transport, and reject omitted cells or noncanonical parameters. One hundred and
fifty-two laboratory tests pass under `none_fold_or_scenario_metrics_only`.
Eight methodology-governance tests pin the predeclared ten-criterion rubric and a
three-control evidence-registry fixture, require source identity/version/review date,
complete criterion cells and canonical transport, and reject authority drift,
reordered evidence, claimed Iranian validation, scoring or selection. One hundred and
sixty laboratory tests pass; no method is ranked or approved.
Six reviewed-source tests pin the exact three-control research registry, publication
locators, versions and review date; require all Iranian/real-cost cells to remain
unmet; preserve method-specific non-equivalence limitations; round-trip canonical
bytes; and reject fingerprint-resealed source or evidence drift. One hundred and
sixty-six laboratory tests pass with selection still blocked.

## Related Documents

- Quality gates: `docs/00-governance/QUALITY_GATES.md`
- Historical validation: `docs/03-market/HISTORICAL_ANALYSIS.md`
- AI boundaries being tested for: `docs/06-ai/AI_ROLE.md`
- Financial Engine Contract (testable + versioned requirement): `docs/02-architecture/AI_ARCHITECTURE.md`
