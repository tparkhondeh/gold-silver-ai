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
zero weight and all-zero variance fails closed. This is benchmark plumbing under ADR
0009, permanently `no_decision` and non-operational; it does not implement, approve or
preview the real allocation methodology described above.

## Related Documents

- Underlying analysis: `PORTFOLIO_MODEL.md`
- Turning allocation gaps into concrete actions: `ROTATION_ENGINE.md`
- Risk constraints: `RISK_MODEL.md`
