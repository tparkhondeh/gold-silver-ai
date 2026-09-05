# Phase 2 Transparent Decision Method Audit

**Audit date:** 2026-09-05

**Branch:** `codex/phase-2-decision-engine`

**Boundary:** synthetic evaluation only; no real data, financial use or execution

## Prior state

The repository already had deterministic synthetic datasets, point-in-time feature
plumbing, walk-forward/stress mechanics and cash, 1/N, no-trade, inverse-volatility,
HRP and minimum-CVaR controls. It also had a source/evidence registry and four newer
research candidates. No method was selected and no exact decision amount was emitted.

## Delivered

- ADR 0010 records the owner's narrow permission to select a laboratory proposal.
- A dated record compares nine methods on ten predeclared equal engineering-fit
  criteria and preserves eighteen primary/official sources, assumptions and limits.
- `ASHA_TRANSPARENT_GUARDED_DECISION_V1` deterministically converts eight equal factor
  bands into a score, constrained target weights, actions and whole-toman amounts.
- The result includes factor contributions, reasons, horizon, invalidation, evidence
  adequacy/missing data and same-/cross-class alternatives.
- A two-fold report applies the proposal and six controls to the same unseen synthetic
  windows. It preserves metrics separately and forbids aggregation and ranking.
- Horizon, crisis and one-factor sensitivity fixtures have distinct fingerprints.
- The Persian demo shows the short answer first and expandable formula/factor detail.

## Decisions and assumptions

The engineering choice is transparent factor-to-target, not a claim of financial
superiority. V1 gives each factor 12.5% weight, uses -2..+2 bands and an equal-capital
anchor, and pins cash/cap/turnover/no-trade constraints in the synthetic fixture. The
selected method scored highest on engineering fit before synthetic results were read.
Every numeric parameter is code, schema or input—not LLM output.

## Quality-gate evidence

1. Functional completeness: every requested laboratory output is represented in the
   versioned result and demo UI.
2. Automated tests: 206 Python laboratory tests and 130 web tests pass.
3. Financial correctness: exact factor reconciliation, target-sum, whole-toman amount,
   replay/tamper, same-fold and sensitivity tests pass; no performance claim is made.
4. Security: no provider call, credential, real financial datum, new calculation
   dependency or execution route was added. Financial/execution locks are schema-
   tested. `pip check` reports no broken dependency.
5. Architecture: the Python laboratory stays isolated; the web module is an explicitly
   synthetic UI mirror and is not a production financial engine.
6. Documentation: ADR, methodology, allocation, risk, rotation, AI boundary, testing,
   current/next/completed state and changelog are updated.
7. Regression: production build, typecheck, lint, all web tests and coverage gates
   pass. Final source coverage is 94.11% lines, 79.57% branches and 94.72% functions.
8. Self-review: this document records the review and remaining limitations.
9. Owner approval for `main`: not requested or inferred; `main` remains unchanged.
10. Remote verification: code checkpoint `909d537` passed all three GitHub Actions
    jobs in run 33992126608.

## Risks and unresolved evidence

- Equal weights and every band/constraint require licensed Iranian calibration.
- Synthetic paths prove calculation and traceability only, not returns or robustness.
- Trend evidence is contested; both positive and critical sources are retained.
- Iran inflation/FX regimes, political shocks, coin/gold premium, non-synchronous
  prices, thin liquidity, spreads, tax/fees and physical conversion costs remain
  unmeasured.
- Real promotion requires frozen parameters, out-of-sample and walk-forward tests,
  overfit controls, shadow mode, data/source approval and a later owner ADR.

## Next safe unit

Create a versioned Iran calibration manifest defining required fields, minimum sample,
point-in-time provenance, cost/liquidity evidence, train/test isolation and promotion
gates. It may use synthetic fixtures only and cannot adjust v1 from synthetic returns
or enable financial use.
