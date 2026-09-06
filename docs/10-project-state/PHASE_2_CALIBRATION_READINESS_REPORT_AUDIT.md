# Phase 2 Calibration Readiness Report Audit

**Audit date:** 2026-09-05

**Boundary:** Persian synthetic status view only; no real data request or permission

## Prior state and delivery

The manifest, freeze, artificial evidence, gate result and preflight were exact but
required technical contract reading. `asha.synthetic.calibration_readiness_report.v1`
now binds those five identities and renders all ten gates with concise Persian titles,
explanations, synthetic-mechanics state and a separate real-Iran state.

The 64-item remaining-evidence inventory is derived deterministically from manifest
history floors, factor coverage and Iran checks, split rules, constraint evidence,
unset acceptance thresholds, out-of-sample requirements and final owner approval.
It is not a score or progress percentage. Real states remain `not_evaluated`.

## Quality gates

1. Functional: ten ordered gates and exact remaining evidence are owner-readable.
2. Automated tests: eight new report/replay/tamper tests pass; 246 lab tests pass.
3. Financial correctness: no price, return, allocation, threshold or performance is
   calculated or inferred.
4. Security: no provider, network, credential, real datum or runtime write was added.
5. Architecture: all five upstream artifacts are validated and identity-bound.
6. Documentation: calibration, testing and project-state sources are updated.
7. Regression: production web build, 130 tests, coverage, lint and typecheck pass.
8. Self-review: foreign preflight, omitted evidence, text, claim and permission drift
   fail closed even when the report fingerprint is recomputed.
9. Owner approval for `main`: not requested; `main` remains unchanged.
10. Remote verification: checkpoint `0fff4d9` passed all three GitHub Actions jobs
    in run 34007016125; `main` remained unchanged.

## Next safe unit

Export one checked-in canonical synthetic reference report and display it in a
read-only expandable Persian panel. The web boundary must validate and fail closed on
artifact drift or any permission while making no provider call or real-data claim.
