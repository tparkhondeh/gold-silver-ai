# Market technical test — 2026-09-10

Scope authority: [ADR 0011](../08-decisions/ADR/0011-isolated-authorized-market-software-test.md).
Checkout: owner `gold silver`; branch `codex/phase-2-decision-engine`.
Starting commit: `dc83079e08680262f8228c2f1972baaf738d96bf`, initially clean.
Local `main` remains `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.

## Outcome and source evidence

Technical implementation and local evaluation are available, but **the requested
full real-data acceptance is not complete**. No usable market quote was acquired
this turn. Do not report vendor activation, real-price valuation or financial
method approval as tested. Existing personal data and financial methods unchanged.

- Rahavard UI access exists. Its current article 2.1 prohibits copying/transferring
  information without explicit provider permission. No quote/account/portfolio was
  extracted; no scraping, new login, payment or supplier contact occurred.
- Navasan configured key and rotation declaration exist; declared plan is free.
  They do not prove current vendor activation. Before the test, local quota was
  6 used / 109 remaining. One reservation was made at
  `2026-09-09T23:19:13.867Z`; outcome failed after 18 ms, no valid quotes returned.
  Runtime reproduction identified Workerd rejecting `redirect: "error"` before
  transport. Fixed with `manual` and explicit rejection of non-2xx, including
  redirects, so credentials cannot follow redirects. A no-key HEAD of the public
  provider root returned HTTP 200 using the corrected Worker transport; this is
  connectivity evidence, **not an API-key or market-data success**.
- The reservation is conservatively retained: 7 used / 108 remaining. Browser
  retry was rejected by the durable cooldown with **no extra reservation or
  upstream request**. Next earliest attempt: `2026-09-10T05:59:13.867Z`, i.e.
  09:29:13 Tehran, subject to rechecking quota/access. No scheduled retry created.
  First response did not retain a detailed error stage; the corrected endpoint
  now reports sanitized network/HTTP/payload/validation/recording stages.
- Navasan's documented free offer: 120 calls/month, two-hour updates, three-month
  validity. Existing conservative project limits remain 115/31 days and 24,000 s
  minimum spacing. Existing 60-minute quote TTL is **not extended** to make a stale
  free quote appear fresh. No history acquired, stored or accumulated.

## Implemented contract and user experience

`market-test-contract.ts`, `market-test-storage.ts`, `api/market-test/route.ts` and
`market-test-workspace.tsx` implement:

- One versioned input across all nine navigation views; explicit fictitious
  holdings/cash, separate authenticated source acquisition, selected asset,
  short/medium horizons and constraints. No imports into the personal database.
- Exact decimal → integer rial conversion; source-specific multiplier is retained.
  Display divides by 10 for toman. Quantity scale is 1,000; coin count must be whole.
  Fractional-position valuation floors at one rial, disclosed. Cash editing remains
  exact even beyond JavaScript Number precision. Whole-portfolio totals/weights
  are unavailable when a nonzero position has no price. Stale reference values
  never become current values. Unknown source purity remains unknown.
- Financial action, physical change, cost and cash-after remain null/undecidable;
  no artificial factor/historical return is attached to a real quote. This is not
  a hold recommendation. Both horizons share the same budget and spend nothing.
- Canonical input/result save/replay in `asha-real-market-test-v1`, bounded to one
  current snapshot (eight approved observations maximum); no history or Git data.
  Replay checks the original calculation and re-evaluates freshness at current time.
  This detects inconsistency, not a cryptographic forged/resealed-source attack.
- Server key never returned. Local flag + loopback + exact origin + browser
  same-origin context + intent header; no body, arbitrary URLs or redirects.
  Bounded streamed source payload, timeout, no retry, durable reservation first.
- Main view removes unrelated personal notifications and promotional/legacy cards.
  Work environment is explicit. Source/freshness/error/decision limitations remain
  visible; provenance and detailed calculations are expandable. Synthetic scenario
  presets moved into a disclosure; duplicate save buttons removed in shared mode.
- Environment switching no longer treats an uninitialized empty UI state as a
  personal backup. Existing backup records are retained; unreadable legacy input
  disables automatic writes rather than being deleted or overwritten with defaults.

## Acceptance matrix — evidence classes kept separate

| Path | Evidence | Result / limitation |
|---|---|---|
| Rahavard receive/import | Actual signed-in UI terms review | Blocked pending explicit provider transfer permission; no data copied |
| Navasan live acquisition | Actual local browser POST + durable ledger | First attempt failed before data; runtime transport fixed, full keyed retry pending cooldown |
| Navasan cooldown | Actual second browser POST + health | Blocked correctly; usage stays 7 |
| Receive → validate → normalize → value | Controlled synthetic transport, versioned test input | Exact scale/currency/quantity and entire total tested; not real-price evidence |
| Main/portfolio/asset/analysis/decision/risk/market/data/review | Actual browser, missing real quote state | Selection, amounts and constraints propagate; nine views work; numerical market valuation blocked |
| Save → bad edit → failed save → restore → reload | Actual browser | 2.345 g test gold, one coin, 12,500,000.1 toman test cash, 14/90-day horizons; fractional coin rejected; saved input survives |
| Missing/stale/future/currency/purity/duplicate/malformed | Automated controlled fixtures | Fail closed; no invented price or action |
| Actual source disagreement | No pair of licensed observations available | Blocked; existing source-reconciliation unit/integration mechanics tested synthetically, not actual price agreement |
| Connection/429/oversize/302/ledger failure | Controlled transport | No retries/redirect forwarding or secret leakage; reservation preserved |
| Storage denied/full/resealed or inconsistent document | Injected storage adapters / controlled documents | Error, original stored input intact; no cross-namespace write |
| Synthetic eight action scenarios | Actual browser + unchanged numerical regression suite | Entry/exit/peer/cross/hold/wait/missing/method render; original saved shared portfolio restored |
| Seven-method comparison, two windows | Actual browser + existing tests | Preserved; remains separate artificial reference, not real market superiority |
| Personal persistence and database recovery | Dedicated synthetic PostgreSQL integration | 16 tests; no owner's portfolio entered, extracted or overwritten |

## Verification and backups

- 179 web tests pass, including ten new grouped boundary/transport/storage tests.
  Coverage after final full run: 94.93% lines, 85.04% branches, 96.04% functions;
  new numerical contract and storage have full source coverage at that checkpoint.
- Typecheck, lint and production build pass; default rendered-HTML expectations
  updated for the intentional isolated workspace (security header checks retained).
- 257 Python laboratory tests pass (335.785 s); 16 actual PostgreSQL tests pass.
- All 15 local readiness checks pass, including locked history and financial engine.
  This probe itself performs no provider request; the separately recorded attempt
  above is not erased by that readiness result.
- Initial backup: complete Git bundle in
  `.cache/checkpoints/real-market-20260910/repository.bundle` and private database
  dump `.cache/postgres-local/backups/pre-real-market-20260910.dump` (archive readable).
  Standard backup initially required fresh integration evidence. After integration
  passed, `asha-local-20260909T232126Z-71d05963.dump` was fully restored in an isolated
  temporary database and all 25 table counts matched. No production data deleted.
  Backups and logs remain ignored/local, never committed.
- No dependencies added, removed or upgraded. Production npm audit was attempted
  but TLS disconnected; it is **not a fresh successful vulnerability audit**.
  Earlier CI attestations apply only to their old commits.

## Git / handoff boundary

Fresh remote inspection failed using default Schannel, OpenSSL, HTTP/1.1 and the
public GitHub API from this device (TLS connection errors). Local `origin/*` is not
treated as fresh GitHub evidence. Final commit/push outcome must be recorded below;
all three CI jobs are **unverified until the exact new commit is actually uploaded
and each job is successful**. No main change or deployment is part of this unit.

Final local commit: identify the commit containing this report using `git log`.
Push / exact-commit CI: blocked by the recorded TLS connectivity failure; awaiting
successful publication and exact-commit checks. No success claimed.

## Next independent work / owner test

Use [short Persian test guide](../09-operations/OWNER_MARKET_TEST_FA.md).
First bounded next action: after the recorded eligibility time, recheck the durable
ledger and make one same-origin Navasan latest request, then execute the price-backed
valuation/save/reload browser path and update this matrix. Do not alter or bypass
cooldown, inject fixture prices as real, or promise background continuation.
Rahavard import separately needs provider permission. Then address exact-commit
publication/CI when network recovers; R2 specialized analysis/real calibration,
private hosted access, deployment and owner acceptance remain separate unfinished work.
