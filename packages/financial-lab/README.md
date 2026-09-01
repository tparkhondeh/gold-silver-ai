# Asha Financial Laboratory

This package is the isolated Phase 2 laboratory approved in ADR 0009.

It accepts only machine-verifiably synthetic fixtures. Every result is
`evaluation_only`, keeps financial use and execution disabled, and carries exact
dataset/model/methodology/assumption references for deterministic replay.

It is not imported by the web runtime, does not call providers, and does not write to
production registries. Standard-library-only tests run with:

```text
python -m unittest discover -s tests -v
```

`schemas/v1` contains the versioned JSON exchange contracts. Parquet transport is a
separate implementation unit; no optional binary dependency is introduced silently.

`build_reference_dataset()` deterministically creates four explicitly synthetic index
paths over 120 ordinal periods. `evaluate_no_decision()` admits only rows available at
the requested cutoff and emits coverage metrics inside a permanently locked,
fingerprinted `no_decision` result. Neither function knows any market symbol, currency,
calendar date, provider, portfolio, or execution route.

Dataset and result artifacts are encoded as one canonical UTF-8 JSON representation.
The decoder rejects duplicate keys, invalid Unicode, non-canonical formatting,
oversized documents and contract violations. `replay_no_decision_artifacts()` then
recomputes the stored result and accepts it only when every byte-level input identity
and every output field agree exactly.

`evaluate_comparison_controls()` implements three laboratory rulers: the constant
`SYNTH_CASH` path, a 1/N path rebalanced at every ordinal period, and an initially
equal 1/N path that makes no further trades. At each period it uses only the highest-period
observation whose `periodIndex` and `availableAtIndex` are both then known; a delayed
row is carried forward visibly and counted. It compounds arithmetic-mean period
returns for the rebalanced path and fixed initial units for the no-trade path under the
registered synthetic full-liquidity/zero-cost assumptions. It computes maximum
peak-to-trough drawdown and rounds only final percentages to eight decimal places with
half-even rounding. These are comparison controls, not an approved allocation
methodology or recommendation.

`build_walk_forward_plan()` is a parameterized mechanics generator, not a selected
window design. It creates rolling or anchored training/test folds with explicit purge
and embargo ranges. Each training fold is cut off at its own final training period;
observations published later are excluded and the exact admitted observation IDs are
fingerprinted. The complete plan has a versioned JSON Schema, canonical artifact, and
dataset-bound replay identity.

The Parquet transport uses hash-locked `pyarrow==25.0.1` only for table serialization,
never for a financial calculation. It writes the five reviewed observation columns
without compression and embeds the canonical dataset manifest. Reads are bounded to
64 MiB, 100,000 rows, five exact columns and 1,024 row groups. Semantic round-trip
must reconstruct and validate the original JSON dataset fingerprint; Parquet file
bytes themselves are not treated as the canonical dataset identity.

`build_point_in_time_return_matrix()` converts latest-known synthetic levels into
12-decimal return rows. A delayed level produces a visible carried-forward zero for
that period and catches up only when published. The matrix is bound to the dataset,
has its own versioned JSON Schema and canonical artifact, and is fully recomputed on
validation. It is feature plumbing only: no fitting, forecast, ranking or decision is
performed.

`fit_train_only_standardizer()` computes population z-score mean and standard
deviation only from feature rows inside one validated walk-forward training interval.
The earliest computable return and rolling-window boundary are enforced; test rows
cannot influence the statistics. Zero-variance instruments are recorded explicitly
for the future `emit_zero_when_applied` policy. The standardizer artifact is bound to
the exact dataset, return matrix, walk-forward plan and fold.

`apply_train_fitted_standardizer()` applies that frozen standardizer only to the same
fold's complete test interval. It never recomputes statistics. Zero standard deviation
maps to an explicit zero; other values use `(value - training mean) / training standard
deviation`. The normalized-fold artifact is bound to all upstream identities and still
contains no prediction, score, allocation or decision.

`build_inverse_volatility_control_weights()` is a train-only benchmark ruler. It uses
the frozen population standard deviations, gives zero weight to zero-variance paths,
normalizes inverse deviations to an exact 12-decimal sum of one, and fails closed when
all variances are zero. Residual rounding is assigned deterministically to the largest
raw weight. The artifact is permanently `no_decision`, financial-use-disabled and
execution-disabled; these weights are not an approved portfolio allocation.

The reviewed train-only covariance, correlation distance, deterministic single-
linkage tree and leaf order can feed `build_hrp_comparison_control_weights()`. Its
ordered-half recursive bisection is an HRP-style comparison ruler only. Both inverse-
volatility and HRP comparison weights may be frozen and evaluated on their exact
synthetic test fold with the shared weighted-control evaluation contract. Replay
recomputes the full return/wealth path and metrics from exact upstream identities;
neither path can emit a financial decision or execution instruction.

`build_minimum_cvar_comparison_control_weights()` performs an exhaustive bounded grid
experiment over one fold's synthetic training returns. The caller must explicitly
provide a worst-scenario count and a weight step; there is no hidden confidence level,
return target or production default. Every long-only, fully invested candidate is
replayed with `loss = -weighted_return`, and equal objectives use the lexicographically
first weight vector. Candidate limits prevent accidental resource explosion. This is
a dependency-free mechanics control, not an approved optimization policy.

Those minimum-CVaR grid weights may then be frozen across the associated synthetic
test fold with `evaluate_minimum_cvar_comparison_control_fold()`. It uses the same
versioned weighted-evaluation contract as the other reviewed controls and recomputes
the entire test return/wealth path and metrics during replay. Evaluation cannot refit
the training grid or cross the permanent no-decision/no-execution boundary.

`build_minimum_cvar_walk_forward_report()` repeats that exact refit-then-freeze process
for every fold in a validated synthetic plan. It records each fold's training range,
scenario/candidate count and artifact identities. Metrics are never stitched into a
headline result: `aggregationPolicy` is permanently `none_fold_metrics_only`.
