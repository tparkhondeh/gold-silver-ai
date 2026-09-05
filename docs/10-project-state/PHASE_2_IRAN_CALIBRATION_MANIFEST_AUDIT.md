# Phase 2 Iran Calibration Manifest Audit

**Audit date:** 2026-09-05

**Boundary:** requirements and synthetic contract only; no real data or financial use

## Prior state

The laboratory method and its Iran-specific unknowns were documented, but no single
machine-readable artifact required every factor field, history floor, split rule,
parameter freeze and promotion gate.

## Delivered and assumptions

- A canonical v1 manifest covers eight factors and five constraints.
- The 1,260 valid-observation floor, 756/252/252 chronological split, six walk-forward
  folds, 20-observation purge and 5-observation embargo are conservative evaluation
  precommitments, not claims of Iranian sufficiency or performance.
- Point-in-time lineage and two Iran-specific checks are mandatory per factor.
- Ten gates remain `not_evaluated`; no value is calibrated and no provider is chosen.

## Quality gates

1. Functional: every requirement in `NEXT_TASK.md` is represented.
2. Automated tests: eight new contract, replay and tamper tests pass.
3. Data/financial correctness: split totals reconcile; synthetic/test outcomes cannot
   alter frozen parameters; missing evidence fails closed.
4. Security: no network, provider, secret, real datum or execution path was added.
5. Architecture: the artifact remains inside the isolated Python laboratory.
6. Documentation: methodology, data, testing and project-state records are updated.
7. Regression: the complete local laboratory and web gates pass.
8. Self-review: exact-key validation and resealed-drift tests cover the critical
   boundary; this audit records the remaining limits.
9. Owner approval for `main`: not requested; `main` remains unchanged.
10. Remote verification: checkpoint `4588088` passed all three GitHub Actions jobs
    in run 33993319908.

## Remaining limits and next safe unit

The floors are not evidence of data availability or method fitness. Real sources,
licenses, acceptance thresholds, regime labels and owner constraints remain unresolved.
The next safe unit is a synthetic gate-evidence evaluator that can report each manifest
gate as pass/fail/blocked from artificial records without changing parameters or
enabling real use.
