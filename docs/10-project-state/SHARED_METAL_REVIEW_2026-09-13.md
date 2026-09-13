# Shared raw-metal diagnostic — 2026-09-13

Scope: next independent R2 unit after `c049411`, under the owner's active
autonomous-continuation request. Not a whole-product completion or owner acceptance.

## Delivered and verified

- Optional versioned synthetic dollar/ounce references now belong to the same
  shared portfolio. All eight views retain the same input/revision/budget.
- Reused approved current raw-metal formula; exact per-gram value, difference and
  percentage with named denominator. No historical model, calibration or decision
  weights were changed. Coin specifications remain unavailable, not inferred.
- V2 documents replay reference diagnostics as well as the unchanged plan. V1
  documents load with empty references and verified old results; no automatic write.
- 193 web tests pass (7 new grouped tests), coverage 95.07% lines / 85.87% branches /
  96.19% functions; new numerical module 100% in all three. Typecheck, lint and
  production build pass. No dependencies or database schema changed. PostgreSQL
  and Python full regression remain part of the exact-commit GitHub jobs.
- Browser: actual existing V1 portfolio restored at 1,250,000 toman, cost 5,691;
  gold 70 grams, coin 2, silver 100 grams, cash 250,000 remain unchanged. Explicit
  reference example shows gold raw 9,645.2239 and premium 3.6782%; doubling FX to
  2000 shows raw 19,290.4479 and premium −48.1608%. Costs/budget stay unchanged.
- Saved V2, reloaded page, reselected laboratory and verified identical diagnostics.
  Missing gold reference leaves silver calculated. Zero FX rejects computation/save;
  original save survives. Inverted reference dates give an explicit error; Restore
  returns the previous exact result. All eight view totals/costs match.
- Browser testing uses the connected in-app browser at narrow viewport with its
  actual menu control. It is not an independent Chrome/Edge/Firefox/phone test.
  Synthetic reference values are kept in the saved test portfolio; prior V1 bytes
  remain in its previous slot. No personal holdings were read or transferred.

## Recovery/security

Before edits: clean working branch; verified full Git bundle at
`.cache/checkpoints/shared-metal-20260913/before.bundle` includes `c049411` and main
`5c03fabb`. No database/market/provider/server write in this unit. Existing saved
synthetic document is backed up by the Save workflow. See the contract's explicit
V1/V2 rollback caveat; nothing is silently downgraded or deleted.

No new endpoint, network call, secret, permission, package, real observation or
financial activation. Diagnostic fields fail closed on wrong sources/units/dates,
and UI text is React escaped. Local evidence logs are ignored; only source/tests/
documentation may enter the working-branch commit.

## Still open

Private identity/provider selection and secure hosted owner storage remain required
before domain release; the previously inspected domain was 503 with no 3012 backend.
No deployment or fresh domain availability is claimed here. Market regime, historical
bubble statistics, actual Iran evidence and calibration are not completed by this
raw-metal diagnostic. Navasan transport investigation continues independently, without
another keyed request before its documented quota boundary. No paid vendor follow-up.

Publication evidence is recorded against the final delivered SHA in the delivery
message and ignored checkpoint JSON, not by modifying a commit to name itself.
