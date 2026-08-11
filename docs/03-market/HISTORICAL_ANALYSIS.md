# Historical Analysis

**Source of truth for:** the required process for historical study, backtesting,
and walk-forward validation, and the rule that no decision model goes operational
before completing it. Not implemented in Phase 0.

## The Historical Validation Principle

The system must not be tested directly on the owner's real portfolio as an
experiment. Before any decision model (valuation, bubble/premium, regime,
allocation, rotation, risk) is used operationally, it must go through this
sequence, in order:

1. Acquire appropriate historical data.
2. Validate data quality (`docs/05-data/DATA_QUALITY.md`).
3. Study historical behavior.
4. Calibrate the model for Iran specifically (`IRAN_MARKET_MODEL.md`).
5. Perform backtesting.
6. Perform walk-forward validation where appropriate.
7. Evaluate failure cases.
8. Document limitations.
9. Only then consider operational use.

A model that has not completed this sequence is not used to inform real decisions,
even experimentally, even if the owner asks for a quick preview — see
`docs/00-governance/QUALITY_GATES.md` (blocking rule).

## Definitions (for shared understanding — not methodology decisions)

- **Backtesting:** evaluating how a model/rule would have performed on historical
  data it wasn't tuned on, or with clear acknowledgment of look-ahead risk if it was.
- **Walk-forward validation:** repeatedly re-fitting/evaluating a model on rolling
  historical windows to check that performance isn't an artifact of one lucky period.
- **Failure case:** a historical scenario where the model would have given a
  misleading or wrong signal — these must be found and documented, not hidden.
- **Look-ahead bias:** letting a backtest use data that would not actually have
  been available at the simulated decision time. Prevented structurally by the
  Point-in-Time Data requirement in
  `docs/02-architecture/DATA_ARCHITECTURE.md` § Point-in-Time Data — data not yet
  published/collected as of a given historical moment must never feed a backtest
  of a decision made at that moment, under any methodology.

## Status

`STATUS: TBD` for exact backtesting methodology, evaluation metrics, and
walk-forward window design. These are design decisions for the phase that
implements the first decision model, and should be presented to the owner per
`docs/00-governance/PROJECT_RULES.md` § 2.

## Related Documents

- Applies to: `BUBBLE_MODEL.md`, `MARKET_REGIME.md`, `docs/04-portfolio/*`
- Governance gate that enforces this: `docs/00-governance/QUALITY_GATES.md`
- Data quality prerequisite: `docs/05-data/DATA_QUALITY.md`
