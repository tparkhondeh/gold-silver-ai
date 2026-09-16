# Independent browser-storage review — September 16, 2026

## Scope and prior evidence

Owner requested necessary work independent of the pending Rahavard/Mabna response,
local execution/testing, preservation of data, and working-branch publication only.
Started clean at `6fd95d6870c8bde381fbc28741db439510f07569` on
`codex/phase-2-decision-engine`; September 16 fresh `git ls-remote` returned the same
working SHA and main `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.
No tia scope, server change, new source, payment, provider request, inbox access,
mail resend, automatic export, history or financial-method change belongs here.

Shared diagnostics, physical sizing and synthetic file intake were already built.
Inspection found shared/market saves did not compare the last-read storage value,
so a stale tab could replace a newer document. Shared repeated Save also rotated
away the useful prior version. A failed initial read left these Save paths writable.
File intake had a byte comparison, but no cooperating cross-tab exclusive lock.

## Delivered scope

Reused the exact codecs and financial calculations; added a small shared storage
guard and shared-portfolio adapter. Shared and market restore return validated
bytes plus portfolio, and writes compare that baseline under an exclusive lock.
File writes use the same lock with existing async SHA/replay validation. All three
keep their existing keys/schema/real-vs-synthetic separation. Invalid/unread storage
does not get replaced by the visible empty/reference example. Controlled storage
errors show safe Persian messages rather than opaque exception contents.
The detailed persistence boundary is defined once in
[the shared contract](../04-portfolio/SHARED_SYNTHETIC_PORTFOLIO.md#browser-save-protection-2026-09-16).

## Verification

- 220 web tests passed, including 10 new grouped storage regressions; coverage
  95.22% lines, 86.64% branches, 96.40% functions. Existing cash conservation,
  physical lots, all action fixtures, seven-method comparison, real-source guards,
  incomplete/stale/future inputs and file provenance suites remain passing.
- Typecheck, full lint and production build passed. Production dependency audit
  reported zero known vulnerabilities; no dependency was added. This is not a
  claim that all security risks are absent.
- Existing Windows launcher started local PostgreSQL/web. A cold readiness request
  timed out; a warmed retry passed all 15 checks with financial use locked and no
  external market call. No TLS/security/time limit was weakened.
- Database/laboratory source and schemas are unchanged; full PostgreSQL and Python
  regressions are delegated to the existing three-job final-commit CI workflow,
  not represented as newly executed local tests. Final commit/run identifiers and
  job conclusions must be reported at delivery and recorded in the ignored checkpoint.

| Path | Actual evidence |
|---|---|
| Independent browser/local access | Edge opened `http://127.0.0.1:4174/`; no internal-browser-only success claim |
| Shared input → all eight views | Edge: 61 g test gold, 200,000 test toman cash; total 1,110,000, cost 4,491 and final cash 122,509 in each view |
| Shared stale-tab save | Edge: tab A saved; tab B rejected the write with visible conflict, then Restore loaded the newer total |
| Invalid quantity/recovery | Edge: 1.5 coins made the plan undecidable; attempted Save did not replace the valid snapshot, Restore recovered the prior total |
| Two horizons/selection/reload | In-app browser: saved 14/90 days and silver selection, reloaded and reselected laboratory; both horizons and silver 100 g/value 100,000 replayed |
| Market test without a source request | In-app `localhost`: initially empty slot, artificial cash 123,456.7; stale-tab Save blocked, Restore showed exact cash, no quote or decision invented |
| Synthetic file | In-app `localhost`: entered built-in fake TXT, saved, changed test cash to 234,567.8; stale-tab Save blocked, Restore/reload returned observed total 234,867.8 and no fresh total; 2000 fixture prices stayed stale |
| Same-time writes, failed reads/writes, corrupt documents | Controlled automated tests, including unavailable lock, quota/backup failures, removed slot, V1 migration and no-op backup preservation; not browser fault injection |
| Real-data and hosted journeys | Not exercised; no licensed Rahavard file, provider permission, hosted identity or server mutation in this unit |

Edge tool availability disappeared after initiating its reload, so post-reload Edge
acceptance is not claimed. Remaining replay checks used the available in-app browser;
Chrome, Firefox, mobile and cross-device persistence were not tested. Existing
in-app `127.0.0.1` saved market input was inspected in the UI but not overwritten.
The separate `localhost` market/file/shared slots were verified empty before test
saves. New test snapshots remain local; no browser storage was cleared. Edge shared
slot also started at the reference with no existing save. Browser/origin stores are
deliberately separate, not automatically synchronized.

## Recovery, security and self-review

Before edits, complete Git history was backed up and `git bundle verify` passed for
`.cache/checkpoints/storage-hardening-20260916T101659/before.bundle`. Worktree was
clean, so it contains the full pre-change tracked state. Logs/delivery metadata stay
in that ignored checkpoint. No database content or private holdings were changed by
these browser tests; no new credentials, endpoint, permission or network path added.
Security review covered fail-closed invalid reads, optimistic conflicts, simultaneous
cooperating writers, storage isolation, error text, quota failures and canonical
replay. Existing safe React rendering and source/financial locks remain intact.

Rollback is a reviewed forward revert on the working branch using this bundle as a
reference, never a reset or main rewrite. Saved document formats are unchanged, but
old code lacks the new conflict protection; close/reload stale tabs before testing.
Browser-profile loss and hosted backup are not solved by retaining one previous copy.

Functional scope, regression, numeric behavior, security, architecture and docs gates
are locally satisfied for this bounded correction. Exact-SHA CI and owner acceptance
are separate; no main merge or whole-product completion is implied.

## Remaining gates / useful next step

| Dependency | Next legitimate step |
|---|---|
| Rahavard permission/minimal export/profile | Review the reply to the already-sent inquiry, then an authorized minimal sample; no guessed columns/units/retention or scheduled export |
| Real market calibration/evidence | Obtain permitted observations/history under separate gates; synthetic tests cannot establish market validity |
| Historical bubble/regime methodology | Resolve the registered method/inputs before implementing a classifier or new weights; raw-metal diagnostics are not a substitute |
| Private hosted identity/storage | Owner/provider setup decision under ADR 0008; do not publish a shared-password alternative or change this server |
| Product acceptance | Owner can test the current local route using the updated [R2 guide](../09-operations/OWNER_R2_TEST_FA.md); report concrete usability failures for the next bounded correction |

No additional necessary independent correction was identified in the paths exercised
here. Do not rebuild completed adapters or expand features to fill the waiting time.
The full R1–R8 roadmap remains open beyond this tested unit. No background continuation
or scheduled message was created; the next gate requires a new observation/decision,
not a generic instruction to repeat completed work.
