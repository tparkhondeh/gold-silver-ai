# Iran Calibration Manifest

**Status:** requirements-only laboratory contract; calibration has not started.

The machine-readable source of truth is
`asha.synthetic.iran_calibration_manifest.v1`, implemented in
`packages/financial-lab/src/asha_financial_lab/iran_calibration_manifest.py` and
mirrored by its JSON Schema. It contains no market observation, provider choice,
credential, financial permission or execution route.

## What it fixes before real data arrives

- all eight decision factors have exact required fields, point-in-time lineage,
  minimum valid-row counts, coverage, independent-source and Iran-specific checks;
- all five portfolio constraints retain their laboratory-v1 value but require
  separate cost, liquidity, risk and owner evidence before real calibration;
- the predeclared minimum is 1,260 aligned valid observations: 756 train, 252
  validation and 252 untouched test, with at least six walk-forward folds, a
  20-observation purge and 5-observation embargo;
- factor weights, bands, horizons, costs, constraints, missing-data rules, regime
  labels, stress windows, acceptance thresholds and valuation rules must be frozen
  into a fingerprinted artifact before the untouched test is opened;
- ten fail-closed gates cover license/provenance, point-in-time integrity, history,
  Iran-specific evidence, split isolation, parameter freeze, out-of-sample replay,
  predeclared acceptance, shadow review and later owner approval.

These observation counts and split sizes are conservative **precommitment floors for
future evaluation**, not evidence that the method works in Iran. A licensed-data audit
may require more history. It cannot silently reduce these floors or alter v1 after
looking at synthetic or untouched-test results.

## What must be represented for Iran

The exact field lists are in the contract. They cover synchronized domestic/global/FX
timestamps, coin and bullion specifications, inflation/FX regimes, closures and price
limits, executable bid/ask and depth, traded value, fees/tax/physical conversion cost,
stale and non-tradable periods, crisis labels, portfolio snapshot lineage and source-
contract versions. Missing evidence fails closed; it is never filled or estimated.

## Promotion boundary

No gate currently passes: every one is `not_evaluated`. Future real evaluation also
requires licensed Iranian data, an independent cross-check, a frozen artifact,
out-of-sample replay, shadow review and a separate owner ADR. Synthetic results cannot
prove financial performance and neither financial use nor execution is enabled.
