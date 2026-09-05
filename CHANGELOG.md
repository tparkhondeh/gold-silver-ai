# Changelog

All notable changes to this project are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Unreleased entries describe
development-branch changes, not a release or merge to `main`. Current operational
state is recorded in `docs/10-project-state/CURRENT_STATE.md`.

## [Unreleased]

### Phase 2 synthetic laboratory authorization — ۱۴۰۵/۰۶/۱۰

- Recorded the owner's acceptance of Phase 1 Data Foundation for progression and the
  exact synthetic-only Phase 2 boundary in ADR 0009.
- Created `codex/phase-2-decision-engine` from verified Phase 1 HEAD `0f90210`; no
  merge or change to `main` was made.
- Real data, paid APIs, financial recommendations, methodology promotion, production
  registry writes, and execution remain explicitly prohibited.
- Added the isolated Python 3.12 laboratory with strict v1 JSON dataset/result
  contracts, canonical replay fingerprints, machine-enforced synthetic namespaces,
  point-in-time availability checks, and permanent no-use/no-execution output state.
- Added six standard-library contract/tamper tests and a separate GitHub Actions job;
  the initial laboratory has no third-party Python runtime dependency.
- Added a fixed 120-period, four-path synthetic fixture with pinned replay identity,
  versioned synthetic assumptions and explicit delayed availability. It contains no
  market symbols, currencies, dates, provider data or randomness.
- Added the first `ASHA_DETERMINISTIC_BASELINE_V1` operation: point-in-time coverage
  only, with permanent `no_decision`/no-use/no-execution output.
- Added bounded canonical UTF-8 JSON artifact encoding and exact replay. Duplicate
  keys, malformed/non-canonical/oversized documents, resealed false results and
  foreign-model results fail closed. Twenty laboratory tests pass locally.
- Contract checkpoint `a7ee94d` passed all three GitHub Actions jobs in run
  [33508480738](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33508480738).
- Fixture/baseline checkpoint `fcfbb22` passed all three GitHub Actions jobs in run
  [33509106798](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33509106798).
- Canonical-artifact checkpoint `10de1d7` passed all three GitHub Actions jobs in run
  [33509410256](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33509410256).
- Added constant synthetic-cash, period-rebalanced synthetic 1/N, and initially equal
  no-trade comparison controls. They use only then-known observations, count delayed carry-forward, pin
  exact reference metrics/result identity, reject resealed false outputs, and always
  remain no-decision/no-use/no-execution. Twenty-five laboratory tests pass locally.
- Cash/1N checkpoint `a5087d6` passed all three GitHub Actions jobs in run
  [33509893452](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33509893452).
- No-trade checkpoint `804657b` passed all three GitHub Actions jobs in run
  [33510192013](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33510192013).
- Added a versioned, dataset-bound synthetic walk-forward plan with parameterized
  rolling/anchored folds, purge/embargo ranges, exact then-available training
  membership fingerprints, canonical artifact replay and fail-closed gap/mismatch/
  tamper handling. Thirty laboratory tests pass locally; no window design or financial
  methodology was selected.
- Walk-forward checkpoint `dda4cfa` passed all three GitHub Actions jobs in run
  [33510661448](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33510661448).
- Added bounded synthetic Parquet transport with hash-locked Apache-2.0
  `pyarrow==25.0.1`. Exact five-column schema/metadata/size checks and canonical JSON
  fingerprint reconstruction keep Parquet from becoming a second source of truth.
  Thirty-four laboratory tests and `pip check` pass locally.
- Parquet checkpoint `cd9d8d3` passed all three GitHub Actions jobs, including the
  hash-locked Linux installation, in run
  [33511252725](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33511252725).
- Added a versioned, dataset-bound point-in-time synthetic return matrix with
  12-decimal changes, explicit delayed carry-forward, canonical artifact replay and a
  pinned 109-row/11-delay reference identity. Thirty-nine laboratory tests pass; it
  performs no fitting, forecast, ranking or decision.
- Point-in-time feature checkpoint `d1363c7` passed all three GitHub Actions jobs in
  run [33511686844](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33511686844).
- Added train-only population z-score statistics with exact dataset/matrix/plan/fold
  provenance. Hand-calculated statistics, test-tail isolation, explicit zero variance,
  canonical artifact replay and fail-closed range/tamper handling bring the laboratory
  to forty-five passing tests without producing a model, forecast, ranking or decision.
- Train-only standardizer checkpoint `cf6e362` passed all three GitHub Actions jobs in
  run [33512088284](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33512088284).
- Added an exact train-fitted test transform with explicit zero-variance handling,
  complete test coverage, full upstream provenance, canonical artifact replay and a
  pinned reference identity. Fifty laboratory tests pass; the artifact contains no
  prediction, score, allocation or decision.
- Train-fitted transform checkpoint `8ec4b1b` passed all three GitHub Actions jobs in
  run [33512453084](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33512453084).
- Added train-only inverse-volatility comparison weights with exact 12-decimal sum,
  deterministic residual rounding, zero-variance exclusion, all-zero fail-closed
  behavior and provenance-bound replay. Fifty-five tests pass; the artifact remains
  no-decision/no-use/no-execution and is not an approved allocation.
- Inverse-volatility weight checkpoint `5cca28b` passed all three GitHub Actions jobs
  in run [33512985341](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33512985341).
- Added versioned, exact test-fold evaluation of frozen train-only comparison weights.
  Period returns, wealth path, cumulative change and maximum drawdown are recomputed
  on replay with full provenance. Sixty tests pass; incomplete or resealed false
  results fail closed and the artifact remains no-decision/no-use/no-execution.
- Frozen-weight evaluation checkpoint `a41e931` passed all three GitHub Actions jobs
  in run [33513624194](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33513624194).
- Added a versioned multi-fold inverse-volatility comparison report. It fits, freezes
  and evaluates every synthetic walk-forward fold separately, proves future test
  changes cannot refit earlier statistics or weights, and rejects incomplete or
  omitted/resealed folds. Its no-aggregation policy prevents a combined performance
  claim. Sixty-five tests pass.
- Multi-fold comparison-report checkpoint `486fb6b` passed all three GitHub Actions
  jobs in run [33514166000](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33514166000).
- Added deterministic train-only population covariance for synthetic returns. The
  versioned artifact records a symmetric matrix and zero-variance paths, binds the
  exact dataset/matrix/plan/standardizer chain, and rejects future leakage or resealed
  values. Seventy tests pass without selecting a risk or allocation methodology.
- Train-only covariance checkpoint `39e29dd` passed all three GitHub Actions jobs in
  run [33514636287](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33514636287).
- Added train-only Pearson correlation derived from the provenance-bound covariance
  artifact. It excludes and discloses undefined zero-variance paths, fails closed with
  fewer than two active paths, and rejects future leakage or resealed values. Seventy-
  five tests pass with no portfolio methodology selected.
- Train-only correlation checkpoint `5a213e1` passed all three GitHub Actions jobs in
  run [33515041657](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33515041657).
- Added canonical train-only correlation distance using
  `sqrt((1-correlation)/2)`. Identical and perfectly opposite synthetic paths are hand-
  checked, future test changes cannot alter fitted distances, and resealed false
  values fail closed. Eighty tests pass with no cluster, weight or decision output.
- Correlation-distance checkpoint `77b279e` passed all three GitHub Actions jobs in
  run [33515393483](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33515393483).
- Added deterministic train-only single-linkage clustering. Nearest-path merges and
  lexicographic equal-distance tie-breaks replay exactly; future test changes cannot
  alter training merges and resealed false steps fail closed. Eighty-five tests pass;
  leaf ordering and HRP weights remain absent.
- Single-linkage clustering checkpoint `4fac0eb` passed all three GitHub Actions jobs
  in run [33515814787](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33515814787).
- Added deterministic left-to-right cluster leaf ordering with every active synthetic
  path exactly once. Zero-variance exclusions remain visible, future test changes
  cannot alter train-only ordering, and reversed/resealed order fails closed. Ninety
  tests pass with weighting explicitly uncomputed.
- Cluster leaf-order checkpoint `a80ac2e` passed all three GitHub Actions jobs in run
  [33516266233](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33516266233).
- Added an HRP-style synthetic comparison control with deterministic ordered-half
  recursive bisection. Every cluster variance/split replays, weights sum exactly to
  one, zero-variance exclusions receive zero, and future-tail or resealed tampering
  fails closed. Ninety-five tests pass; HRP remains unapproved and non-operational.
- HRP comparison-control checkpoint `9e0b3e1` passed all three GitHub Actions jobs in
  run [33517070244](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33517070244).
- Added exact synthetic test-fold evaluation of frozen HRP comparison weights using
  the shared versioned evaluation contract. The complete covariance-to-order chain is
  required for replay, future test changes do not refit weights, and resealed false
  metrics fail closed. One hundred tests pass; no decision, use or execution is
  enabled.
- HRP test-fold evaluation checkpoint `c44d255` passed all three GitHub Actions jobs
  in run [33518097199](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33518097199).
- Added a bounded discrete minimum-CVaR synthetic comparison control. It exhausts all
  long-only full-investment candidates for explicit tail-count and weight-step inputs,
  records the selected tail losses and exact objective, uses deterministic tie-
  breaking, and rejects unsafe grid size, future leakage or resealed tampering. One
  hundred and five tests pass; the output is unapproved and non-operational.
- Minimum-CVaR comparison checkpoint `4f4e7be` passed all three GitHub Actions jobs in
  run [33520594615](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33520594615).
- Added exact test-fold evaluation of frozen minimum-CVaR grid weights through the
  shared weighted-control contract. Full provenance and interval coverage are
  mandatory, future test changes cannot refit weights, and resealed false metrics fail
  closed. One hundred and ten tests pass; the output remains no-decision/no-use/no-
  execution.
- Minimum-CVaR test-fold checkpoint `897da2b` passed all three GitHub Actions jobs in
  run [33521035243](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33521035243).
- Added an exact minimum-CVaR multi-fold report. Each fold refits only its training
  grid and freezes weights for its test interval; fold metrics remain separate under
  a no-aggregation policy. Missing folds, incomplete inputs and resealed output fail
  closed. One hundred and fifteen tests pass and no financial claim is enabled.
- Minimum-CVaR multi-fold checkpoint `548a2fa` passed all three GitHub Actions jobs in
  run [33521541570](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33521541570).
- Versioned train-only correlation as v2 and now compute Pearson values from exact
  training moments instead of rounded covariance transport fields. This fixes a real
  later-fold value just above one without widening a tolerance; downstream identities
  were deterministically rebuilt.
- Added an HRP multi-fold report with every standardizer, covariance, correlation,
  distance, cluster, order, weight and evaluation identity per fold. Separate metrics
  cannot become an aggregate performance claim. One hundred and twenty tests pass.
- Added canonical explicit synthetic stress scenarios and a stressed-return matrix.
  Each cell retains its base return, visible additive shock and deterministic stressed
  result. Invalid namespaces/ranges, ambiguous shocks, total-loss arithmetic and
  resealed tampering fail closed. One hundred and twenty-six tests pass; no real
  crisis model, ranking, decision, financial use or execution is enabled.
- Synthetic stress-matrix checkpoint `860ed2b` passed all three GitHub Actions jobs
  in run [33962814546](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33962814546).
- Added a canonical side-by-side evaluation of frozen inverse-volatility weights under
  explicit synthetic shocks. Both paths and metrics replay exactly; shocks outside
  the associated test fold, foreign weights and resealed values fail closed. One
  hundred and thirty-two tests pass with no ranking, threshold or decision output.
- Frozen inverse-volatility stress checkpoint `069018d` passed all three GitHub
  Actions jobs in run
  [33963506190](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33963506190).
- Extended the canonical frozen-weight stress evaluation to HRP and minimum-CVaR.
  Exact weight provenance, base/stressed paths, canonical transport and tamper
  rejection are covered by one hundred and thirty-eight tests; the shared contract
  still emits no ranking, threshold, financial decision or execution.
- Extended frozen-control stress checkpoint `4a1ace9` passed all three GitHub Actions
  jobs in run
  [33965934288](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33965934288).
- Added canonical multi-scenario stress suites for all three reviewed controls.
  Sorted unique scenarios keep separate stressed-matrix/evaluation identities and
  metrics; exact replay rejects omissions, reordering or resealed results. One hundred
  and forty-five tests pass under permanent no-aggregation/no-ranking locks.
- Multi-scenario stress-suite checkpoint `90d307d` passed all three GitHub Actions
  jobs in run
  [33966709184](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33966709184).
- Added canonical walk-forward stress reports for all three reviewed controls. Every
  training fold rebuilds and freezes its own weights before its ordered scenario
  suite is evaluated; all fold/scenario metrics remain separate. One hundred and
  fifty-two tests pass with no combined claim, ranking, threshold or decision.
- Multi-fold/multi-scenario stress checkpoint `eaf41c6` passed all three GitHub
  Actions jobs in run
  [33972395723](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33972395723).
- Added canonical methodology-rubric and evidence-registry contracts. Ten predeclared
  criteria require versioned source/currentness, assumptions, explainability, data,
  Iran-gap and robustness records for every method. Eight new tests bring the
  laboratory total to one hundred and sixty; no score, threshold, ranking, selection
  or methodology approval is enabled.
- Methodology-evidence governance checkpoint `5ca14c5` passed all three GitHub Actions
  jobs in run
  [33975366552](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33975366552).
- Added an exact primary-source registry for inverse-volatility, HRP and minimum-CVaR.
  It records publication identity, 2026-09-05 review date, method-specific limitations
  and pinned synthetic evidence while Iranian adequacy and real cost/liquidity remain
  unmet. Six new tests bring the laboratory total to one hundred and sixty-six; source
  or evidence drift fails exact replay and no selection is possible.
- Reviewed-source registry checkpoint `1aeed02` passed all three GitHub Actions jobs in
  run
  [33978255294](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33978255294).
- Added a canonical methodology evidence-gap report derived only from the exact
  reviewed registry. All 30 method/criterion cells retain their plain status,
  references, limitations and unresolved requirements; method-level data, Iran,
  robustness and failure-mode gaps remain separate. Six new tests bring the laboratory
  total to one hundred and seventy-two with no score, ranking or selection.
- Evidence-gap report checkpoint `b8d5878` passed all three GitHub Actions jobs in run
  [33981364535](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33981364535).
- Added the versioned research-candidate intake contract and canonical transport.
  Dated manual search, human review, authoritative source identity, bounded scope,
  non-equivalence limits and all ten evidence gaps are mandatory. Eight new tests bring
  the laboratory to one hundred and eighty; no candidate can be implemented, scored,
  ranked, selected or claimed fit for Iran.

### Fail-closed Navasan history authorization — ۱۴۰۵/۰۶/۱۰

- Added a second, explicit authorization boundary for `dailyCurrency` and
  `ohlcSearch`. A live key is no longer sufficient: execution must be deliberately
  enabled and reference an approved written-license record.
- The lock is evaluated before quota resolution or network access. A controlled
  request against the running local app returned HTTP 423 and left free-plan usage
  unchanged at 4 used / 111 remaining.
- Health now reports Navasan history separately as `locked`. The strict local
  readiness check fails if that state is missing or becomes authorized during the
  Phase 1 local-only stage.
- The owner-local history planner now reads that monitored state instead of showing
  a fixed safety label. It displays `قفل فنی فعال` only for the exact locked contract;
  missing, malformed or authorized states produce `توقف ایمنی`, while the execution
  button remains disabled in every state.
- Local build, lint, typecheck, 129 unit tests and 16 real PostgreSQL tests pass with
  93.78% line, 79.51% branch and 94.67% function coverage.
- Working-branch checkpoint `12728ee` passed both GitHub Actions jobs in run
  [33500322761](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33500322761);
  `main` remained unchanged.
- History-lock monitoring checkpoint `58c3325` passed both GitHub Actions jobs in run
  [33500854728](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33500854728);
  `main` remained unchanged.
- Owner-local lock-visibility checkpoint `2908564` passed both GitHub Actions jobs in
  run [33501750783](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33501750783);
  `main` remained unchanged.

### Dependency security re-audit — ۱۴۰۵/۰۶/۱۰

- Re-audited the exact locked dependency tree against the live registry. The
  production tree has no known vulnerability. The full development tree has one
  moderate esbuild advisory reachable only through the pinned drizzle-kit generator.
- The latest stable drizzle-kit remains 0.31.10 and still carries the deprecated
  loader path. A beta replacement is not promoted into this long-lived branch
  without compatibility evidence; the generator remains limited to trusted local
  schemas and is absent from production installs.

### Navasan next-eligible visibility — ۱۴۰۵/۰۶/۱۰

- Added a deterministic next-call calculation from the newest durable reservation
  and the active safe cadence. Health and the Persian Data Trust card now show the
  first exact time another live call is allowed.
- Added a Persian time-remaining label that refreshes inside the browser every 30
  seconds. It performs no health refresh and no provider request.
- The calculation reads only local PostgreSQL state and makes no provider request.
  Local usage stayed at 4 used / 111 remaining. Local build, lint, 126 unit tests and
  16 real PostgreSQL tests pass with 93.75% line, 79.18% branch and 94.63% function
  coverage.
- Working-branch checkpoint `9a07947` passed both GitHub Actions jobs in run
  [33497221903](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33497221903);
  `main` remained unchanged.
- Countdown checkpoint `6ce6d9b` passed both GitHub Actions jobs in run
  [33497834262](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33497834262);
  `main` remained unchanged.

### Durable Navasan restart guard and latest-status monitoring — ۱۴۰۵/۰۶/۱۰

- Added migration 0011 with one mutable operational-status row that keeps only the
  latest Navasan success/failure, duration and quote count. It stores no provider
  payload, credential, price, or long-term market history.
- Moved the free-plan refresh interval into the PostgreSQL reservation transaction.
  Browser refreshes, hot reloads and process restarts now fail closed during the
  6h40m cooldown instead of spending another call. A controlled local replay kept
  usage unchanged at 4 used and 111 remaining.
- A third owner-only backup restored and compared all 25 governed tables. Local
  build, lint, 124 unit tests and 16 real PostgreSQL tests pass with 93.87% line,
  78.81% branch and 94.58% function coverage.
- Working-branch checkpoint `23a8e82` passed both GitHub Actions jobs in run
  [33496090925](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33496090925);
  `main` remained unchanged.

### Navasan free-plan cadence and quota visibility — ۱۴۰۵/۰۶/۱۰

- Raised the free-plan refresh floor from six hours to 6h40m, limiting a continuously
  running 31-day window to at most 112 scheduled calls below the existing 115-call
  hard ceiling and provider's 120-call allowance.
- Added aggregate used/remaining quota health and a loopback-only Persian status card;
  no credential or raw provider response is exposed.
- One authorized live check returned eight approved valid Iranian quotes. No history
  was requested or stored. Local build, lint, 122 unit tests and 14 real PostgreSQL
  tests pass with 94.25% line, 78.49% branch and 94.53% function coverage.
- Working-branch checkpoint `6b64e16` passed both GitHub Actions jobs in run
  [33493075764](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/33493075764);
  `main` remained unchanged.

### GoldAPI global-history foundation — ۱۴۰۵/۰۶/۱۰

- Updated the keyed live adapter to GoldAPI's current official price endpoint and
  added exact pair, timestamp and range checks.
- Added strict daily-history normalization, deterministic 90-day request chunking,
  explicit missing-date auditing and a local Persian preview planner. No API request,
  token, purchase or historical write is part of this change.
- Added a dated Persian purchase-readiness checklist. The local build, lint and 115
  unit tests pass with 94.19% line, 77.80% branch and 94.41% function coverage.
- Checkpoint `eab4b16` passed GitHub quality/audit and real PostgreSQL jobs in run
  33489418166; remote `main` remained unchanged.

### Pre-API readiness audit — ۱۴۰۵/۰۶/۱۰

- Added a concise Persian quality-gate audit and progress map for the owner.
- The accepted local/no-paid-API Phase 1 scope is complete; the provisional whole
  real-release coordinate is 55%, with the remainder explicitly assigned to licensed
  real data, independent validation, approved financial methodology and production
  operations. This estimate is not a financial-readiness claim.

### One-step owner-local launch — ۱۴۰۵/۰۶/۱۰

- Added `npm run local:run` for the prepared Windows owner host. It starts project
  PostgreSQL, validates the protected persistence environment, and starts or confirms
  the web application only on `127.0.0.1:4174`.
- Added strict rejection tests for unsafe runtime keys and database targets. The
  command passed against the real running host without revealing a credential.
- Typecheck, lint, production build, 103 unit tests and 14 real PostgreSQL tests pass;
  source coverage is 93.77% lines, 76.31% branches and 93.96% functions.
- Checkpoint `38fba17` passed both GitHub quality jobs in run 33480065419; remote
  `main` remained unchanged.

### Fail-closed local readiness — ۱۴۰۵/۰۶/۱۰

- Added `npm run ops:check-local`, restricted to the exact loopback health endpoint
  on port 4174; it cannot contact a provider or arbitrary URL.
- The command requires all local database-backed Phase 1 surfaces and treats the
  financial-use lock as mandatory. It exits with failure for a broken contract.
- The running local application passed. Typecheck, lint, production build, 100 unit
  tests and 14 real PostgreSQL tests pass locally; total source coverage is 93.68%
  lines, 75.64% branches and 93.92% functions.
- Checkpoint `d3da848` passed both GitHub quality jobs in run 33479256145; remote
  `main` remained unchanged.

### Verified local backup — ۱۴۰۵/۰۶/۰۹

- Added `npm run db:backup` for unique PostgreSQL custom-format backups in the
  protected, Git-ignored local project directory.
- Every backup is restored into a temporary database and checked against the source
  migration journal and row counts for all 24 governed tables before success is
  reported; the temporary database is then removed.
- Added a SHA-256 manifest, atomic temporary-file publication, path/name validation,
  and two deterministic safety tests. The local suite now passes 96 tests with
  93.49% line, 74.73% branch, and 93.84% function coverage.
- Created and fully restored two real local backups without replacing or modifying the
  primary database. It is owner-only and Git-ignored, but deliberately documented as
  unencrypted and not offsite.
- Backup checkpoint `5fd67d0` passed both GitHub quality jobs in run 33478298802;
  remote `main` remained unchanged.

### Test-coverage and portfolio-persistence hardening — ۱۴۰۵/۰۶/۰۹

- Added an enforced source-only coverage gate using Node's built-in runner: minimum
  85% lines, 65% branches, and 80% functions. Generated build output cannot inflate
  the result.
- Added direct repository tests for empty restore, exact holding/preference restore,
  atomic versioned save, and fail-before-replace behavior on stale versions.
- The local suite now passes 94 tests with 93.44% lines, 74.54% branches, and 93.77%
  functions on the current host; the separate real PostgreSQL suite still passes
  14 tests including independent restore.
- Replaced stale starter/runtime documentation with the actual Asha local boundaries.
- Checkpoint `01095cb` passed the GitHub quality and real PostgreSQL jobs in run
  33477121188; remote `main` remained unchanged.

### Navasan quota and history foundation — ۱۴۰۵/۰۶/۰۹

- Replaced the exposed Navasan credential through the official bot and transferred
  it directly into Git-ignored local configuration; a live check normalized all
  eight approved Iranian quotes without exposing the key.
- Added migration 0010 and an immutable PostgreSQL request-reservation ledger. All
  application workers share a conservative 115-call rolling 31-day ceiling, leaving
  five calls below the provider's free-plan limit as safety headroom.
- Added strict shared normalization for Navasan `dailyCurrency` and `ohlcSearch`
  responses behind a loopback/same-origin route. No historical request or backfill
  was made.
- Added a Persian, local-only backfill readiness planner that validates Jalali dates
  and approved symbols, calculates the exact request count, and keeps execution
  disabled while licensing and independent-source gates remain open. Planning sends
  no provider request and stores no market data.
- Added an offline deterministic OHLC continuity audit that records unobserved Jalali
  dates and marks duplicates, range/instrument violations and Tehran
  timestamp/date mismatches. Synthetic fixtures only; zero interpolation, provider
  calls and historical writes; flagged rows are reported as quarantine-required.
- Local typecheck, lint, production build, 90 unit tests, and 14 real PostgreSQL
  migration/concurrency/restore tests pass.
- Code checkpoint `b0bb80a` passed both GitHub quality and real PostgreSQL jobs in
  run 33417744818.
- Backfill-readiness checkpoint `8a21a97` passed both GitHub jobs in run
  33421273488.
- Added a plain-language licensed-backfill proposal using reviewed official Navasan
  and TGJU material, with safe/rejected options, an exact acceptance gate and Persian
  vendor messages ready for owner authorization. It makes no provider request,
  purchase, source decision or market-data write.
- With explicit owner authorization, sent the proposal's no-secret storage/licensing
  inquiry through Navasan's official contact bot. Telegram marked the outgoing message
  read; a written vendor response is still pending and no permission is inferred.
- Vendor follow-up and subscription purchase were later deferred by the owner until
  the final integration stage. No active monitor, purchase, or historical request is
  part of the current development slice.

### Identity proposal and evaluation ledger foundation — ۱۴۰۵/۰۶/۰۹

- Simplified the local hidden-input market-key setup for the nontechnical owner with
  Persian guidance, safe defaults and Persian plan names; secret values remain local
  and Git-ignored, and the revoked-key confirmation remains mandatory.
- Accepted the staged identity timing in ADR 0008: current local/demo work stays
  simple, while production owner authentication is a fail-closed prerequisite before
  any real personal financial data is hosted or synchronized. Existing controls are
  not weakened and no provider was selected.
- Accepted the third-party identity boundary in ADR 0007: an external service may
  handle only minimum login identifiers/session evidence and must never receive
  portfolio or financial data. No provider was selected or activated.
- Accepted the owner-only audience for the next real release in ADR 0006. This does
  not select a provider or enable production identity, public registration or holding
  migration.
- Added a plain-language Persian Tier-A production identity proposal and a dated
  official pricing/terms snapshot without selecting or enabling a vendor; Iran access,
  real identity and portfolio migration remain owner-gated.
- Recorded a read-only owner-server access preflight: general provider documentation
  is reachable, but an existing local Cloudflare API hostname override blocks that
  candidate's host-readiness; no server configuration was changed.
- Added migrations 0007–0009 and an append-only, forced-RLS transaction and evaluation-only
  valuation ledger with exact Dataset, Methodology, observation and event lineage.
- The normal runtime is read-only for the new ledger. No real transaction/value or
  financial methodology was created; 77 unit and 13 real PostgreSQL tests pass locally.

### Private publication and CI repair — ۱۴۰۵/۰۶/۰۸

- Published only `codex/phase-1-data-ui` at `b58f393` and verified matching remote
  HEAD/upstream, unchanged `main`, and no remote tags or backup branch.
- Diagnosed the first GitHub quality-run failure: Node 22.13.1 could not load `.ts`
  tests without explicit type stripping. Shared test scripts now enable it.
- Added a runtime-command regression test; local typecheck, lint, and 51 tests pass.
  Remote verification of the repaired command follows this commit.

### Phase 1 local stabilization — ۱۴۰۵/۰۶/۰۸

- Preserved and reviewed the accumulated market-adapter, synthetic-intelligence,
  portfolio-interaction, and UI changes in the active Phase 1 checkout.
- Paused Navasan requests until the exposed credential is revoked and replaced;
  API health and setup now make that requirement explicit without returning keys.
- Made the market contract test offline and checked that an unrotated credential
  never reaches the provider.
- Corrected legacy typography overrides; inspected all nine UI workspaces for
  visible text below the 13px supporting-text minimum.
- Local typecheck, lint, production build, and 50 tests passed. PostgreSQL
  integration, remote CI, and remote publication are not verified.
- Reconciled documentation with the real staged-development gates. No Phase 2
  branch or real baseline engine was created; no `main` operation was performed.

### Phase 0 — Foundation & Governance (owner-approved)

- Established repository governance, documentation architecture, and development
  workflow. No application functionality in that phase. Owner approval to continue
  into Phase 1 is recorded; a merge to remote `main` is not claimed by this log.
  See `PHASE_0_AUDIT.md`.
