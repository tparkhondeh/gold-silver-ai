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
| A2 | Versioned planner | Exact quantities, cash/cost reconciliation and funding uniqueness | Pending |
| A3 | Horizon reconciliation | Short/medium previews and one consistent final budget | Pending |
| A4 | All decision states | Entry, exit, same/cross-class, hold, wait, missing-data fixtures | Pending |
| A5 | Owner workbench | Editable synthetic inputs, concise cards, calculation disclosure | Pending |
| A6 | Recovery and end-to-end | Save/restore with recomputation; local desktop/mobile review | Pending |
| A7 | Delivery checks | Appropriate local tests/security and all three final-commit CI jobs | Pending |

Real-source adapters, historical validation and comparisons already built remain
referenced by CURRENT_STATE. Licensed Iranian quotes/history, calibration, shadow
evaluation and owner-only production identity remain final-release dependencies.
