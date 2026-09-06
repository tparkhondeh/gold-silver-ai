# Empty Calibration Intake Plan

Date: 2026-09-05. Scope: owner-authorized laboratory continuation.

The exact validated report now creates 64 ordered empty evidence slots. Every slot
contains its original gate, evidence identifier, Persian label, `not_collected`
state and null content. There is no collection endpoint or provider call.

The versioned schema and canonical transport preserve the full upstream validation
chain. Validation recomputes the plan and compares canonical JSON, including scalar
types. Even a freshly resealed artifact cannot add content, identity, credentials,
scores, permission or a real-gate result, or omit/reorder/duplicate evidence.

Seven focused tests cover completeness, replay, non-mutation, upstream tampering,
invalid transport, unauthorized fields and boolean/integer confusion. Full-suite
and remote results are recorded in CURRENT_STATE after verification. No dependency,
runtime integration, database migration or financial parameter changed.

The clean pre-change repository was backed up to a verified Git bundle under the
ignored `.cache/checkpoints/` directory. Main is unchanged. The next owner-authorized
deliverable is the quantitative decision workbench described in
`../04-portfolio/DECISION_ACTION_PLAN.md`.
