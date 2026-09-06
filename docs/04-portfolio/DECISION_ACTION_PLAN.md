# Quantitative decision workbench v1

Owner request: 2026-09-05, continuation in the existing branch, short/medium horizons,
entry/exit quantities, peer/cross-class conversion, wait and insufficient evidence.
This engineering layer extends ADR 0010's synthetic proposal; it does not modify
the frozen Python v1 parameters or use synthetic outcomes to calibrate them.

## Method and contracts

Reuse the existing eight-factor TypeScript laboratory calculation as the target
generator. Its 20/60-observation momentum inputs remain unchanged. A separate,
explicit short/medium calendar duration and horizon-budget fraction belong to this
new action-plan version, not the frozen v1. Whole-portfolio horizon previews are
alternatives, never additive; only one budget-weighted target drives the final plan.

Amounts use whole-toman integer arithmetic and quantity uses thousandths of the
declared unit. An asset-specific lot size bounds orders. Sales precede purchases;
every purchase lists exact funding drawn once from starting free cash or a sale.
Bid/ask spread, adverse slippage, fees, tax, minimum order, liquidity, cash reserve,
concentration and turnover limit the realizable target. Integer rounding is visible.

The machine contract is `ActionInput` / `ActionPlan` in
`apps/web/app/decision-action-plan.ts`, with versions
`asha.synthetic.action_input.v1` and `asha.synthetic.action_plan.v1`.
Runtime validation rejects extra fields, nonfinite/out-of-range numbers, mismatched
units/lots and invalid dates. `encodeActionPlan` / `decodeActionPlan` recompute the
entire result and require exact canonical serialization; no saved result is trusted.

### Explicit arithmetic and selection

- Let `B = 10000` basis points, `Q = 1000` quantity subunits and
  `value(q,p) = floor(q*p/Q)`. All monetary balances use native `BigInt`.
- Each asset's combined target is `floor((shortBps*s + mediumBps*(B-s))/B)`;
  cash receives the exact remaining basis points. Amount targets use initial total
  value; any whole-toman residual also goes to cash.
- Candidate fractions are exactly `[0, 2500, 5000, 7500, 10000]` of the desired
  change. Sub-lot quantities are rounded down. Asset-ID sorting is the explicit
  funding priority, not a claim of the globally best order sequence.
- Buy price is `ceil(ask*(B+slippageBps)/B)` and sale price is
  `floor(bid*(B-slippageBps)/B)`. Buy notional is rounded up, sale notional down;
  fee and tax are each rounded up from gross notional. Mark-value change uses the
  difference of before/after position values, preserving fractional rounding.
- Buy ceiling is `floor(reference*(B+toleranceBps)/B)`; sale floor is
  `ceil(reference*(B-toleranceBps)/B)`. They bound acceptable execution costs.
- Objective `J = sum(abs(afterValue_i - targetValue_i)) + 2*totalCost`, including
  cash. Select the smallest feasible `J`, breaking ties by lower turnover and
  then existing candidate order. Improvement must be strictly greater than
  `initialTotal*minimumImprovementBps/B`; otherwise emit no orders.
- A single asset's delta below `initialTotal*noTradeBandBps/B` causes no order.
  These bands and the cost penalty reduce unnecessary changes; there is no
  persistent execution cooldown because this surface does not execute or apply
  orders. Recalculation alone does not alter quantities.
- Reserve initial cash `ceil(initialTotal*minimumCashBps/B)`. Sale proceeds first
  repair any reserve deficit. Each purchase draws from remaining funding buckets
  exactly once. Purchases are bounded by lots, capacity, cash and concentration.
- Turnover is `max(totalBoughtAtMark,totalSoldAtMark)/initialTotal`. Final candidates
  must satisfy cash reserve, concentration, turnover and stress constraints.
- Stress envelope is `ceil(sum(afterValue_i*abs(worstScenarioMove_i)Bps)/B)`.
  Its ratio to final value must not exceed the stated loss tolerance. Combining
  each asset's worst scenario is a conservative envelope, not a simultaneous
  calibrated scenario, VaR, probability or price stop-loss.
- An infeasible initial portfolio is reported as constrained `wait`, never as
  safe `hold`. The output identifies missing bid/ask, future and expired quotes.

The cost-aware optimization framing is supported by Boyd, Busseti, Diamond, Kahn,
Koh, Nystrup and Speth (2017), *Multi-Period Trading via Convex Optimization*,
Foundations and Trends in Optimization 3(1), reviewed 2026-09-05 at the
[authors' Stanford page](https://web.stanford.edu/~boyd/papers/cvx_portfolio.html).
That framework separates forecasts from constrained allocation and costs. This
implementation is **not** its convex solver or multi-period strategy: it uses a
bounded integer-lot grid and tracking objective without return forecasts. Its
advantage is exact, easily audited small-universe sizing; its weaknesses are coarse
search, fixed funding order and no price prediction. No extra library was added.

Entry/exit prices are acceptable quote limits around the snapshot's reference
price, not predicted peaks/troughs. The objective is to reduce absolute distance
from the combined target, subject to explicit transaction-cost penalty and limits.
It is a tracking objective, never expected profit. Any future predictive price
model requires its own evidence and version rather than a relabelled quote limit.

Freshness and point-in-time validation precede planning. Invalid/missing quotes
produce `undecidable`; quotes beyond the limit produce conditional `wait`. A valid
plan with insufficient net tracking improvement produces `hold` with zero changes.
New constraints, quote expiry, factor changes or the review date invalidate a plan.

## First-version acceptance inventory

Each row is one acceptance item; only passed, demonstrated items count as complete.
This bounded workbench inventory is not a percentage of the entire financial release.

| ID | Deliverable | Acceptance evidence | State |
|---|---|---|---|
| A1 | 64-slot intake | All 254 laboratory tests pass, including seven intake tests | Passed locally |
| A2 | Versioned planner | Exact quantities, reconciliation, hand-checked sale, 30 perturbations and unique funding | Passed locally |
| A3 | Horizon reconciliation | Exact combined targets, endpoint shares and calendar boundaries; browser previews | Passed locally |
| A4 | All decision states | Eight deterministic fixtures, including all seven sizing/error states | Passed locally and in browser |
| A5 | Owner workbench | Editable cash/prices/costs/limits, cards, factor inputs, ranked sizing options | Passed in current narrow browser viewport |
| A6 | Recovery and end-to-end | Save/change/restore; real database restart and 25-table backup/restore | Passed locally; browser draft is origin-local |
| A7 | Delivery checks | Build, coverage, lint, types, audit and three same-head CI jobs | Local checks pass; GitHub run for delivered head is authoritative |
| A8 | Costed same-fold controls | Seven methods, two folds, common holdings/costs/lots; no future influence on sizing | Eight web and three bridge tests pass; panel connected |

Evidence and remaining release dependencies are in
`../10-project-state/DECISION_WORKBENCH_DELIVERY_AUDIT.md`; owner steps are in
`../09-operations/OWNER_DECISION_TEST_FA.md`.

### Scope and parameter provenance

This first physical-unit workbench has three explicit metal fixtures plus cash:
18-karat gold and Emami coin belong to `gold`, silver bullion to `silver`.
Same-class means identical class IDs, not identical unit or purity. Two gram lots
with different purity are valued at their own quoted unit prices; grams are never
converted by equating raw weight. The original broader ten-position dashboard is
a separate demo, not the source of these three positions.

The seven non-method fixtures use fixed target vectors declared in `horizon()`
solely to exercise action states. The default `method` fixture uses the existing
eight-factor generator. Its synthetic valuation percentile, liquidity and cost
factor profiles are distinct from the editable order fee and market-capacity
constraints. Changing cash/quantity affects composition and sizing; changing the
reference price does not invent a new historical price path.

The existing factor bands/weights remain in `sandbox-intelligence-engine.ts` and
the frozen Python method. The new fixture explicitly sets 30/180 calendar days,
50/50 budget weighting, 150-bps price tolerance, 20-bps adverse slippage,
20-bps per-side fee, no tax, 200-bps no-trade band, 10-bps minimum objective
improvement and a cost penalty of two. All are disclosed laboratory design inputs,
not parameters fitted to returns. Days label the review horizons; the legacy trend
features remain 20/60 observations. Changing days does not recalibrate those features.
Only one current tranche is sized; no unsupported multi-stage future order schedule
or profit-taking forecast is generated. The next review recomputes from a new input.

Iran validation must cover factor bands/weights, historical-window mapping to
calendar/trading days, horizon shares, loss tolerance, FX/inflation/political stress,
coin premium, pure-metal/unit conventions, settlement/physical costs, bid/ask depth,
tax/fees, rounding/lots, reserve, concentration, turnover and no-trade/benefit limits.

The next independent unit is also implemented: the actual seven Python train-only
weight sets now pass through the shared physical solver with identical costs and
constraints. See `COSTED_SIZING_COMPARISON.md` for its separate contracts, exact
evaluation arithmetic, canonical bridge, assumptions and tests.

Real-source adapters, historical validation and comparisons already built remain
referenced by CURRENT_STATE. Licensed Iranian quotes/history, calibration, shadow
evaluation and owner-only production identity remain final-release dependencies.
