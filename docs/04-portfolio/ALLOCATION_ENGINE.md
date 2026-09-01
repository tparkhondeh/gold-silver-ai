# Allocation Engine

**Source of truth for:** the requirement to propose portfolio allocation. Not
implemented in Phase 0.

## Requirement

Given the multi-dimensional portfolio analysis in `PORTFOLIO_MODEL.md`, the system
must eventually be able to propose an allocation across the asset universe
(`docs/03-market/ASSET_UNIVERSE.md`) — how much exposure to hold in each
instrument, respecting the owner's constraints
(`docs/01-product/USER_REQUIREMENTS.md`).

## Non-Negotiable Constraints

- Allocation weights are computed deterministically by code from validated inputs
  — never generated or adjusted by an LLM. See `docs/06-ai/AI_ROLE.md`.
- Any proposed allocation must be explainable in terms of the specific inputs that
  drove it (traceability), not presented as an opaque output.
- Not used operationally until validated per
  `docs/03-market/HISTORICAL_ANALYSIS.md` and `docs/00-governance/QUALITY_GATES.md`.

## Status

`STATUS: TBD` for methodology (e.g. optimization approach, constraint handling,
how conviction/confidence is represented). `DECISION REQUIRED: YES` at design
time — this is a financial-methodology decision requiring owner review per
`docs/00-governance/PROJECT_RULES.md` § 2-3.

The isolated Phase 2 laboratory now includes inverse-volatility **comparison-control**
weights computed from train-only synthetic population deviations. Zero variance gets
zero weight and all-zero variance fails closed. Those frozen weights can now be applied
to their exact synthetic test fold, without refitting, to calculate a replayable path,
cumulative change, and maximum drawdown. This is benchmark plumbing under ADR 0009,
permanently `no_decision` and non-operational; it does not implement, approve or
preview the real allocation methodology described above.

The same mechanics can now replay every fold in a supplied synthetic walk-forward
plan. Each fold keeps its own train range, frozen weights, test range and metrics. The
report deliberately uses `none_fold_metrics_only`: it does not combine fold returns
into a headline performance claim.

The laboratory now also contains an HRP-style **comparison control** built only from
the reviewed train-only covariance, correlation distance, single-linkage tree and leaf
order. Recursive ordered-half bisection records each cluster variance and allocation;
zero-variance paths receive zero. This benchmark is permanently `no_decision`, does
not approve HRP for the real project, and cannot produce an operational allocation.
Its frozen weights can be applied to only their associated synthetic test fold under
the same versioned weighted-evaluation contract; this records comparison metrics but
does not turn them into a recommendation.

The synthetic laboratory also has a discrete minimum-CVaR **comparison control**. It
exhausts a bounded long-only full-investment grid on train-only scenarios. Tail count
and grid step must be supplied explicitly, and exact replay records every relevant
input and selected objective. No target return or real portfolio policy is inferred;
the artifact remains `no_decision` and non-operational.
The selected experimental grid weights can be held fixed across their exact synthetic
test fold. This creates replayable comparison metrics only and does not promote the
grid, tail size or step into an approved allocation rule.

## Related Documents

- Underlying analysis: `PORTFOLIO_MODEL.md`
- Turning allocation gaps into concrete actions: `ROTATION_ENGINE.md`
- Risk constraints: `RISK_MODEL.md`
