# ADR 0010: Transparent Guarded Laboratory Decision Method

- **Status:** Accepted for laboratory evaluation only
- **Date:** 2026-09-05
- **Decision owner:** Project owner

## Context

ADR 0009 allowed isolated synthetic mechanics but deliberately prohibited method
selection without a later owner decision. The owner has now explicitly authorized
selection and implementation of a proposed technical method in the synthetic
laboratory, while continuing to prohibit real data, real money, recommendations,
API purchases, execution and production activation.

## Problem

The laboratory needs one deterministic proposal that can turn visible evidence into
an exact target weight and amount, while remaining understandable to a non-programmer
and comparable with cash, hold, 1/N, inverse volatility, HRP and minimum-CVaR.

## Options Considered

1. Promote one existing optimization or hierarchical control unchanged.
2. Add a complex return-forecast/solver method.
3. Build a transparent factor-to-target synthesis with explicit safety constraints.
4. Keep only no-decision controls and defer all method design.

## Decision

Choose option 3 as `ASHA_TRANSPARENT_GUARDED_DECISION_V1`, a laboratory proposal.
Ten engineering-fit criteria are equally weighted before synthetic results are read.
The method uses eight equally weighted, banded factors and explicit cash, single-
asset, turnover and no-trade constraints. All formulas, inputs, thresholds, reasons,
invalidation rules, missing evidence and alternatives are versioned and exactly
replayable. AI may explain the artifact but cannot calculate or change it.

This ADR narrowly supersedes ADR 0009's ban on **laboratory method selection**. Every
other ADR 0009 boundary remains binding. The selected method is not approved for Iran,
real financial support, production or execution.

## Rationale

The method scored 1.9/2 on the predeclared engineering-fit rubric: higher than the
eight reviewed alternatives because it is inspectable, deterministic, parsimonious,
cost/constraint aware and makes Iran-specific gaps visible. It does not require an
unstable expected-return estimate, covariance inversion or opaque solver. Selection
was independent of synthetic performance.

## Trade-offs

- The synthesis itself is not a published standalone strategy.
- Equal factor weights and all bands are hypotheses, not measured Iranian parameters.
- Simplicity gives up some dependence modeling available in HRP/robust optimization.
- Banded scores reduce false precision but can change at a boundary.

## Consequences

- The laboratory may emit only visibly synthetic increase/reduce/hold/convert
  proposals with exact weights and amounts.
- Same-fold synthetic comparisons cannot rank methods or support a return claim.
- All real-data calibration, Iran validation, out-of-sample testing and shadow mode
  remain mandatory before a later production-method ADR.
- `financialUseAllowed` and `executionAllowed` remain false and fail closed.
