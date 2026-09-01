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

## Related Documents

- Portfolio analysis this feeds: `PORTFOLIO_MODEL.md`
- Iran-specific risk context: `docs/03-market/IRAN_MARKET_MODEL.md`
- Regime dependency: `docs/03-market/MARKET_REGIME.md`
