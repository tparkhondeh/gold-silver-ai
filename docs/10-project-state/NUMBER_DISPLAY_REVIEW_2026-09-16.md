# Number presentation and file-draft continuity — September 16, 2026

## Scope and baseline

Owner requested at most one displayed decimal without changing precision, then the
next necessary independent correction. Started clean on the working branch at
`9cc0addb05b3ca27841955d541d2e20b9cbac381`; fresh `git ls-remote` matched that SHA
and main `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
Before edits, a complete, verified Git bundle was saved at
`.cache/checkpoints/number-display-20260916T110413/before.bundle`.
Build/test logs are in that ignored checkpoint; no credentials or market files
were collected. Main, server, financial methods and data contracts are unchanged.

## Implemented and reviewed

- Shared display-only formatter uses exact integer arithmetic on the existing
  decimal value or numerator/denominator. Half-away rounding has at most one decimal,
  no artificial trailing zero, Persian digits and grouping. Nonzero magnitude below
  0.1 explicitly says so and retains its sign. Invalid values do not become zero.
- Rounded interactive figures show `≈` and disclose the exact original decimal or
  reduced fraction on click/keyboard. Bidirectional isolation keeps minus signs
  and fractions readable. Exact details, editable inputs, technical identities and
  timestamps are intentionally not truncated. Narrative/currency strings use the
  same compact formatter; no formatted text is sent back to the financial engine.
- Shared portfolio, decision cards, comparison, analysis, raw-metal diagnostics,
  market/file quantities and legacy personal-view numeric displays use the common
  presentation. Ratios use their original fractions, not previously truncated
  transport fields. Existing basis-point resolution is unchanged; rounded displayed
  weights need not add to 100. Price limits remain permission bounds, not forecasts.
- The next useful independent defect was reproduced in the browser: changing fake
  file quantity to 1.234 and cash to 345678.9, switching to Navasan and back restored
  the old 1 / 234567.8 draft. The file workspace now mounts lazily once and remains
  mounted, hidden when inactive. Draft text/input survives source and workspace
  navigation. Return/view change refreshes quote age without fetching or rereading
  storage. Full reload/closing still requires explicit Save; no autosave or sync is
  implied. This is preservation of existing functionality, not a new data feature.

## Fresh evidence

- 228 web tests pass (eight new grouped tests). Coverage: 95.26% lines, 86.93%
  branches, 96.45% functions; display helper has 100% on all three measures.
- TypeScript, ESLint, production build and dependency audit pass; audit reports zero
  known production dependency vulnerabilities, not a guarantee of total security.
- All 15 local-readiness checks pass, financial lock stays enabled, external market
  calls remain absent. Existing local service is reachable at `127.0.0.1:4174`.
- Automated checks cover signs, tiny/exponent/large values, exact recurring fractions,
  double-rounding boundaries, invalid/bounded input, unchanged canonical portfolio
  replay and budget conservation. Actual guarded file save/replay preserves 1.234
  quantity, 12.34% limit and 345678.9 test cash. Existing storage conflict/error and
  financial regression suites pass unchanged.

| Browser check (available in-app browser, local only) | Observed result |
|---|---|
| All eight shared views | Same 1,000,000 total, 3,920 cost and 179,080 final cash |
| Existing synthetic snapshot Save/reload | Same total, silver selection and 14/90-day horizons; no-op save retains prior backup |
| Seven-method reference panel | Both windows, 14 method rows, no winner/financial ranking |
| File precision/navigation | 1.234 quantity, 345678.9 cash and 12.34% limit remain after switching; total 346002.3 |
| Small quantity | 0.001 displays “less than 0.1”; disclosure returns exactly 0.001 |
| Negative raw-metal premium | Fake XAU input 414.72 produces negative “less than 0.1%”, exact fraction -109/64800; not zero |
| Visual/console | Persian layout and minus/fraction direction inspected; no captured warning/error |

Existing localhost file/shared snapshots were preserved. Unsaved test changes were
restored from those snapshots after checks. Browser storage was not cleared; actual
file precision writes were tested against a memory storage double, not an existing
owner snapshot. No personal-account data was modified. A transient DOM-read timeout
was resolved with a fresh DOM snapshot; the displayed inputs confirmed preservation.
External Chrome/Edge/Firefox, mobile, real-data and hosted journeys were not tested
this turn. Database and Python code did not change; their full regressions run in
the existing final-SHA CI rather than being claimed as new local executions.

## Delivery boundary and recovery

Self-review covers functional/display consistency, exact numerical invariants,
regression, safe React rendering, bounded formatting, lock/storage isolation and
architecture. No dependency, endpoint, permission, source request or export was added.
Publication and all three CI jobs must be verified for the final commit and recorded
in the delivery/checkpoint; old green CI is not evidence for this change.
Rollback is a reviewed forward revert on the working branch, using the verified
bundle; never reset or rewrite owner history. Document schemas require no migration.

These two bounded corrections are ready for owner testing, not overall completion
or owner acceptance. Next substantive gates remain the licensed Rahavard reply and
minimal real sample/profile, actual market validation, registered historical/regime
method decisions and private hosted identity/storage. Do not guess them or add filler.
No mailbox check, repeated inquiry, automatic export, scheduled continuation, paid
API, server mutation or financial-use approval occurred.
