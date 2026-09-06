# Quantitative workbench delivery audit

Date: 2026-09-05 (local development calendar; UTC backup timestamps may be Sep 6).
Scope: owner-testable synthetic physical-metal workbench, not the financial release.
Branch: `codex/phase-2-decision-engine`. No changes to `main`.

## Engine readiness map

The source/test roots below are repository-relative. The method/band source is
`apps/web/app/sandbox-intelligence-engine.ts`; its tests are
`apps/web/tests/sandbox-intelligence-engine.test.mjs`. The new sizing source and
15 acceptance tests are `apps/web/app/decision-action-plan.ts` and
`apps/web/tests/decision-action-plan.test.mjs`.

| Engine | Existing/new calculation and acceptance | Technical status |
|---|---|---|
| Data quality | Exact input fields, integers, units/lots, bid/ask, cutoff and expiry; missing values issue no order | Integrated in planner, malformed/time tests pass |
| Valuation | Existing synthetic percentile/premium bands; metal-content premium also tested separately | Reused; empirical Iran fair value remains unvalidated |
| Trend | 20/60-observation momentum divided by 20-observation volatility; five bands | Reused; both horizons exposed |
| Volatility | Standard deviation of last 20 synthetic percentage returns, population denominator; relative-volatility bands | Reused, deterministic history tests |
| Drawdown | Running peak-to-trough decline on 90-point synthetic history, compared with tolerance | Reused, crisis/risk tests |
| Crisis/scenario | Existing explicit shock sensitivities; sum of asset-wise worst losses bounds new portfolio | Integrated; one-percent impossible-risk-budget test |
| Liquidity | Existing synthetic 1..5 factor, plus exact new order capacity and lot constraints | Integrated; zero-capacity/oversize tests |
| Conversion cost | Separate bid/ask, adverse slippage, fee, tax and rounding; net cash reconciliation | Integrated; hand calculation and 30 deterministic perturbations |
| Concentration | Before/after weights, hard final cap and minimum cash | Integrated; infeasible cap and cash tests |
| Allocation | Eight-factor targets, one weighted short/medium budget, five candidate sizes | Integrated; no double funding, target sum and optimal-grid tests |
| Decision/display | Entry/exit, same/cross-class, hold, wait and undecidable; exact quantity, amount, source and conditions | Eight fixtures connected to editable Persian UI |
| Reproduction | Full typed/versioned input and result, canonical replay on save/restore | Tampering/duplicate JSON rejected; browser save/change/restore checked |

Exact formulas/defaults/limitations live in `../04-portfolio/DECISION_ACTION_PLAN.md`,
not in this status map. Existing Python comparisons and stress/walk-forward evidence
are reused from `PHASE_2_DECISION_METHOD_AUDIT.md` and tests
`test_transparent_decision.py`, `test_method_comparison.py`, `test_stress_walk_forward.py`,
`test_hrp_walk_forward.py` and `test_minimum_cvar_walk_forward.py`. This new integer-lot
execution-sizing layer has not been ranked against those controls on financial
performance; existing comparison conclusions do not transfer to it automatically.

## Verification

- Python: 254 tests passed (344 seconds), including seven new exact 64-slot intake tests.
- Web: 153 tests pass including 15 action-plan and two network-boundary tests;
  production build, TypeScript and lint pass. Source coverage is over the required
  85% lines / 65% branches / 80% functions. The full test command builds before testing.
- PostgreSQL: all 16 integration tests pass, including restore, row isolation,
  immutable lineage and quota concurrency. Fixtures stay in the separate test database.
- Browser: current local narrow viewport checked visually; all seven explicit
  action/error fixtures, default computed fixture, editable cash, negative-input
  failure, horizon controls and save/change/restore checked. No wide-screen resize
  claim is made. Error console was empty after the fresh local navigation.
- Local health: `readyForLocalEvaluation=true`, all 15 checks pass at
  `http://127.0.0.1:4174/api/health`; market endpoint reports `networkAllowed=false`
  and zero quotes. No provider request is required for either check.
- Cold database restart: stopped and restarted only project PostgreSQL, then all
  local readiness checks passed. `pg_ctl` startup no longer passes captured pipes
  to its long-lived Windows child; existing files/data remain untouched.
- Backup: `asha-local-20260906T035903Z-e27d536b.dump` and matching manifest, SHA-256
  `8cf6006e4f023a8ed9a59d53f6255c1a00bbdd4befa9e6992884a9465e190d7e`,
  full restore verified for all 25 governed tables, in ignored protected storage.
  The verified pre-change Git bundle also remains under `.cache/checkpoints/`.
- Security: production npm audit reports zero vulnerabilities. No dependency was
  added, secret changed/exposed or execution path enabled. Existing dependency pins
  and lockfile are unchanged. Native BigInt requires the declared ES2020 target.
- Network: server market I/O is fail-closed before cache, manual snapshot, quota and
  provider calls. Browser fallback requires the exact server opt-in. The local
  launcher forces both market-network and history execution flags off.
- Remote evidence: intake commit `6e3c4ae` passed all three jobs in
  [run 34009462993](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/34009462993).
  The final workbench commit must have its own three successful jobs; use the exact
  head SHA in [branch Actions](https://github.com/tparkhondeh/gold-silver-ai/actions?query=branch%3Acodex%2Fphase-2-decision-engine).
  A prior successful run is not proof for a later head.

## Remaining scope, explicitly separated

The bounded acceptance inventory covers this workbench, not 100% of the complete
financial product. Its saved draft belongs to this browser and exact local origin;
it is not production decision persistence and is not included in a PostgreSQL backup.
The original ten-position dashboard and Python research laboratory remain separate
surfaces. A shared, validated production-data/decision integration, durable promoted
decision records, empirical Iranian calibration, licensed history, authenticated
owner-only deployment and real-data/shadow acceptance are still release gates.

Before financial activation, the new physical sizing layer must also be compared
using identical execution costs/lots with the existing controls in out-of-sample
and walk-forward runs. No exact profit peak/trough or probability is implemented.
Current prices are cost-bounded entry/exit limits, not a prediction in disguise.
No purchase, vendor follow-up, main merge or recurring automation is authorized here.
