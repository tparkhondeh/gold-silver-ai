# Risk Model

**Source of truth for:** the requirement to analyze portfolio and instrument risk.
Not implemented in Phase 0.

## Requirement

The system must eventually be able to characterize risk at both the instrument and
portfolio level, feeding into `PORTFOLIO_MODEL.md`, `ALLOCATION_ENGINE.md`, and
`ROTATION_ENGINE.md`. At minimum, risk analysis should eventually address:

- Historical volatility of each instrument.
- Concentration risk within the portfolio.
- Liquidity risk (see `PORTFOLIO_MODEL.md` § Liquidity).
- Regime-dependent risk (risk may differ by market regime — see
  `docs/03-market/MARKET_REGIME.md`).
- Iran-specific risk factors (currency, policy, sanctions-related market friction)
  — see `docs/03-market/IRAN_MARKET_MODEL.md`; not assumed from foreign-market
  risk models.

## Non-Negotiable Constraints

- All risk metrics are deterministic, code-computed from validated historical
  data — never AI-estimated. See `docs/06-ai/AI_ROLE.md`.
- Risk analysis is descriptive of measured/historical risk; it must not be
  presented as a guarantee about future risk.
- Not used operationally until validated per
  `docs/03-market/HISTORICAL_ANALYSIS.md`.

## Status

`STATUS: TBD` for specific risk metrics, methodology, and thresholds. `DECISION
REQUIRED: YES` at design time, including the owner's actual risk tolerance
(`docs/01-product/USER_REQUIREMENTS.md`).

The isolated Phase 2 laboratory now has a train-only population-covariance feature
for synthetic returns. It uses one validated walk-forward fold, is bound to the exact
dataset/matrix/plan/standardizer provenance, and permanently emits `no_decision` with
financial use and execution disabled. This verifies deterministic matrix mechanics;
it does not select a risk model, threshold, allocation method, or owner risk tolerance.
That artifact can now be converted into a train-only Pearson-correlation feature.
Zero-variance paths are excluded and disclosed because their correlation is undefined;
fewer than two remaining paths fails closed. This is still feature plumbing only.
The correlation feature can also be converted into the bounded distance
`sqrt((1-correlation)/2)`: identical paths have distance zero and perfectly opposite
paths have distance one. This is a deterministic clustering input only and does not
implement or approve HRP allocation.
The distance artifact now supports deterministic agglomerative single-linkage
clustering. Every merge and tie-break is recorded; equal distances use lexicographic
member IDs. Leaf ordering and HRP weights are deliberately not computed yet.
The linkage tree can now be traversed left-to-right into one deterministic leaf order.
Every active path appears exactly once and excluded zero-variance paths remain
disclosed. The order artifact still has `weightingPolicy: not_computed`.
Separately, that reviewed chain can feed an HRP-style recursive-bisection comparison
control. Its train-only weights and every split are replayable, but it remains an
unapproved synthetic benchmark rather than the project's selected risk/allocation
method.

## Related Documents

- Portfolio analysis this feeds: `PORTFOLIO_MODEL.md`
- Iran-specific risk context: `docs/03-market/IRAN_MARKET_MODEL.md`
- Regime dependency: `docs/03-market/MARKET_REGIME.md`
