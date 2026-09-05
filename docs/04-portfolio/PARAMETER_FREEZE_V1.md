# Laboratory Parameter Freeze V1

**Status:** frozen synthetic proposal; not calibrated or approved for Iran.

The machine-readable source is `asha.synthetic.parameter_freeze.v1`. Its canonical
SHA-256 identity captures the complete laboratory-v1 configuration before any future
calibration evidence or test result is linked.

## What is frozen

- eight factor weights of 12.5%, each input transformation, cutoff and point region;
- the 20-observation short and 60-observation long laboratory UI horizons;
- 15% minimum cash, 35% single-asset cap, 25% turnover cap, 2% no-trade band and
  25% maximum accepted drawdown from the existing reference fixture;
- preference, risk-breach, cash-transfer, target, turnover and half-even rounding
  rules;
- current conversion-cost treatment and the honest absence of a real all-in cost or
  slippage model;
- fail-closed missing-data rules and five Iran-specific stress labels.

## What is deliberately not selected

Six real acceptance thresholds have `value: null` and `unit: null`: out-of-sample
drawdown, realized cost, turnover, evidence coverage, stability and shadow duration.
Stress magnitudes and probabilities are also null. Their state remains `STATUS: TBD`
until licensed Iran train/validation evidence and owner approval exist. Synthetic or
untouched-test outcomes are forbidden from setting or changing them.

The bundle contains no market value, provider, credential, dataset fingerprint,
financial permission or execution route. Any change requires a new version rather
than rewriting this freeze.
