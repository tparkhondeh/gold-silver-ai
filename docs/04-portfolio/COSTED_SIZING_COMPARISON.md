# Costed physical-sizing comparison v1

Implemented and reviewed 2026-09-05. This is a mechanical synthetic comparison,
not a financial ranking or a reproduction of a published trading strategy.

## Sources and contracts

- `packages/financial-lab/src/asha_financial_lab/sizing_bridge.py` reuses the existing
  `build_method_comparison_report` and point-in-time `known_levels`; it does not
  reimplement HRP, inverse volatility or minimum-CVaR. Research references remain in
  `METHODOLOGY_EVIDENCE.md` and ADR 0010.
- `asha.synthetic.physical_sizing_bridge.v1` binds the exact dataset, original
  comparison, walk-forward and bridge identities. Python CI regenerates and verifies
  `apps/web/data/physical-sizing-bridge-v1.json` against canonical replay.
- `buildSyntheticSizingTrial` in `apps/web/app/decision-action-plan.ts` shares the
  actual workbench solver and emits `asha.synthetic.sizing_trial.v1`. External
  research targets cannot masquerade as the UI method's own encoded ActionPlan.
  Target membership, integer basis points and an exact 10,000 total are required.
- `apps/web/app/action-sizing-comparison.ts` returns
  `asha.synthetic.costed_sizing_comparison.v1`, with exact input/trial/period paths,
  reproducible encoding, no aggregation, no ranking and false financial/execution
  permissions. The read-only panel uses these computed results, not copied numbers.

## Common assumptions, fixed before evaluation

Each of the two independent folds starts from the same 1,000,000-toman three-metal
fixture and the same fee/slippage/lot/capacity/cash/concentration/stress policy.
There is one initial rebalance, then fixed physical quantities, no daily
rebalancing and no terminal liquidation. End value is mark-to-market, not cash
received from an unmodelled final sale. Hard guards can suppress/alter a control's
target, so these are common-constraint sizing trials, not the unconstrained methods.

The explicit `DEFENSIVE → GOLD`, `TREND → COIN`, `VOLATILE → SILVER` mapping exercises
physical-unit arithmetic only. It asserts no economic relationship with actual
metals. At each cutoff, each index is rebased to the unchanged synthetic fixture
quote. The seven original 12-decimal Python weight sets supply target weights:
noncash weights are floored to basis points and residual basis points go to cash.
One exception is deliberately explicit: no-trade means the common starting holdings,
not rebalancing to the older research fixture's different starting weights.

Training ends at indices 59/79, execution uses cutoff 60/80, and evaluation spans
61–80 / 81–100. Starting and subsequent levels use the existing `known_levels`
availability rule, and delayed-observation membership is retained. Future levels
are supplied only to `evaluateSyntheticSizingTrial`, after the trial is constructed.
The reported future shock test changes evaluation, never the earlier trial.

## Exact evaluation arithmetic

- Parse index levels as positive integers scaled by 10^12; cash index stays 100.
- For each period: `price = floor(startQuote * knownLevel / cutoffKnownLevel)`.
- `NAV = cashAfter + sum(floor(quantityMilli * price / 1000))`.
- The initial transaction cost is already deducted from the starting portfolio;
  it is never subtracted a second time. Cumulative change uses pre-cost initial NAV.
- Drawdown uses the running peak beginning at pre-cost NAV, so initial execution
  costs also count as drawdown. Displayed drawdown basis points round up; signed
  change basis points truncate toward zero. Exact whole-toman changes remain in
  the result for audit.
- Periods must be contiguous and strictly after the execution cutoff. Missing,
  malformed, nonpositive, pre-cutoff or reordered inputs fail; no gap is silently
  repaired by this evaluator. Any carry-forward in the upstream synthetic dataset
  is the already-declared `known_levels` rule and remains separately recorded.

## Evidence and remaining validation

Eight web tests cover identical starting conditions, target sums, one-order-per-asset,
flat-path hand checks, no double costs, exact no-trade, all-cash consistency,
future shocks, cutoff/order violations, input tampering, canonical bridge/result
replay and UI wiring. Three Python tests verify exact upstream weights and cutoffs,
reject altered evidence/permissions and reproduce the checked-in bridge. The full web
suite is 161 tests; the previous 254 Python tests plus these three total 257.
The owner-facing panel was opened locally and both seven-row tables inspected.

The panel is a fixed reference experiment, independent of editable workbench inputs.
It is not a custom-portfolio backtest service. The original daily-fixed-weight
comparison remains distinct; its results cannot be substituted for this one.
Iran calibration, settlement, depth, genuine cost/fee schedules, execution delays,
history rights and real out-of-sample/shadow validation remain release dependencies.
