# Phase 2 Freeze-aware Calibration Preflight Audit

**Audit date:** 2026-09-05

**Boundary:** synthetic gate mechanics only; no real threshold, data or permission

## Prior state and delivery

The parameter freeze and ten-gate evaluator were separately canonical, but nothing
proved that G07 referred to the exact unchanged pre-evaluation freeze. The new
`asha.synthetic.calibration_preflight.v1` artifact binds the manifest, freeze,
artificial evidence and recomputed gate result by their exact identities.

G07 mechanics pass only when the freeze exactly replays, has no evidence/test links,
is not outcome-derived, retains null real acceptance/stress values, has both artificial
G07 checks and is reached after all prior gates. Real G07 always remains
`not_evaluated`; promotion, parameter mutation, financial use and execution stay
blocked.

## Quality gates

1. Functional: all seven freeze/G07 conditions are explicit and replayable.
2. Automated tests: eight new preflight/replay/tamper tests pass; 238 lab tests pass.
3. Financial correctness: no parameter, threshold, score or performance is computed.
4. Security: no provider, network, credential, real datum or runtime write was added.
5. Architecture: the result recomputes all upstream validators and the gate evaluator.
6. Documentation: calibration, testing and project-state sources are updated.
7. Regression: production web build, 130 tests, coverage, lint and typecheck pass.
8. Self-review: resealed link, threshold, stress, outcome, promotion and permission
   mutations fail closed; missing/failed/prior-blocked gates remain closed.
9. Owner approval for `main`: not requested; `main` remains unchanged.
10. Remote verification: pending the branch checkpoint workflow.

## Next safe unit

Build a canonical, owner-readable synthetic readiness report over all ten gates. It
may explain state and missing real evidence, but must not score methods, set thresholds,
request data, promote a gate or enable financial use/execution.
