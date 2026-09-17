# Personal portfolio × real latest-price review — 2026-09-17

## Scope and baseline

Local-only owner-authorized connection of current permitted Navasan prices to
existing personal purchase lots. Started on clean
`bf8e7c959e8653f816d81ed507b17ffe73bfe905`, branch
`codex/phase-2-decision-engine`. No main, server, dependency, database schema,
financial method, financial-use gate, historical request or Rahavard export change.
See [versioned valuation contract](../04-portfolio/PERSONAL_MARKET_VALUATION.md).

Before edits, a recoverable source bundle was verified at the ignored checkpoint
`.cache/checkpoints/personal-market-20260917/before.bundle`. Existing local data
was backed up and independently restored into a verification database (25 tables).
Backup: `.cache/postgres-local/backups/asha-local-20260917T032807Z-67867771.dump`,
113403 bytes, SHA-256
`14f174ed80a639d7a2838adde536629b37c56e6e9c1c6f0b911c2a4ef102bd7b`.
Restore verification did not replace the owner's database.

## Actual receipt, not a mock

Fresh local inspection found the app stopped; the existing loopback-only launcher
was started successfully. The key/configuration remained private and unchanged.
Official [Navasan plan](https://www.navasan.tech/api/) and
[service guide](https://www.navasan.tech/webserviceguide/) were reviewed this date:
free plan advertises 120 monthly calls, two-hour updates and three-month validity.
These declarations do not establish a live quote or override the existing safe
application cap of 115 / rolling 31 days and 24,000-second request interval.

Exactly one actual latest request succeeded through the personal UI, received
`2026-09-17T03:41:21.203Z` (07:11:21 Tehran). Eight validated observations arrived;
seven met the existing freshness rule and USD did not. The shared durable ledger
advanced from 9 to 10 used, 105 safe calls remaining. Next eligibility recorded as
`2026-09-17T10:21:20.238Z`; recheck the current ledger before any later request.
No usage/history call, retry, polling or provider change occurred.

Actual 18K gold matched the existing explicitly synthetic two-purchase holding.
The silver holding had no compatible quote; the portfolio's full value and P&L
stayed unknown while the gold subtotal and asset P&L were shown. Current USD
equivalents stayed unknown because its source price was stale. Mesghal's unit
mismatch is a separate explicit contract limit, not an implicit conversion.
No new coin/USD holdings were created just to exercise the actual response;
those supported identities are fixture-tested, not actual-held-asset acceptance.
Raw provider payloads, quote values, keys and personal data are not committed here.

## Implementation and actual specialist work

- Finance/data agent: exact quantity, raw/landed basis, current valuation, partial
  coverage, unit/purity/freshness and signed P&L; 20 focused tests.
- Security/storage agent: bounded same-origin client and separate latest-only
  browser storage; 9 focused tests. Independently reviewed arithmetic, including
  40 direct-fraction oracle cases spanning 960 synthetic purchases.
- Architecture/QA agent: lifecycle-safe personal panel/hook and 14 focused tests;
  independently reviewed client/storage and final root integration guards.
- Coordinator: integrated existing views, exact sorting/counts/color/grouping,
  blocked unsafe legacy projections and synthetic personal what-if factors,
  exercised the actual browser workflow and controlled final delivery.

No duplicate purchase implementation or new financial methodology was added.
Purchase data and database version 4 / three prior synthetic lots remained
unchanged through actual receipt, latest-price save, navigation and reload.

## Verification matrix

| Path | Evidence / result |
|---|---|
| Actual receive → validate/map → two gold purchases → current valuation/P&L | Passed in the local browser with real Navasan quote and explicitly hypothetical holdings |
| Portfolio, overview, gold/silver asset center, analysis, decision readiness | Same exact value/coverage; missing silver not zero; short/long existing horizon controls exercised; financial decision remained blocked |
| Exact tiny quantity and weighted acquisition basis | Disclosure exercised; acquisition cost/dated FX unchanged |
| Latest-price save → explicit restore → reload → personal mode | Same valid price/value and purchase basis recovered; no extra provider call; database stayed version 4 |
| Unit/purity/currency mismatch, stale/future price, unsupported asset/quantity, missing cost, signed/zero-denominator P&L, large and 12-decimal quantities | Controlled synthetic contract tests, not injected into actual provider data |
| Timeout/abort/network/quota/invalid/oversized responses, concurrent action, mode switch, exact expiry, corrupt/conflicting/failed storage | Controlled client/hook/storage tests; no real outage/quota exhaustion induced |
| Duplicate purchases/import receipts and precision-preserving persistence | Existing purchase/import regression suite and isolated real PostgreSQL tests passed; no user holdings rewritten for testing |
| Hosted site, another device, external Chrome/Firefox, real trades | Not exercised or authorized by this local stage |

Final local gates: **352 web tests**, no failures/skips; line/branch/function
coverage **95.90% / 89.50% / 96.94%** for the configured TypeScript calculation,
data, database and script scope (not a claim of hydrated-browser automation).
Build, typecheck, lint and local readiness passed. **19 isolated PostgreSQL
integration tests** passed, including real backup/restore. Production dependency
audit: zero findings; unchanged development-toolchain findings remain tracked in
[KNOWN_ISSUES item 8](KNOWN_ISSUES.md). No new dependency was introduced.

Hook tests execute a controlled hook harness plus SSR/source-wiring checks;
manual live-browser acceptance above is separate. A fully automated hydrated
browser lane is still a follow-up, not claimed complete. Browser viewport visual
inspection passed; cross-browser/mobile-device acceptance remains untested.

Evidence logs live under ignored `.cache/checkpoints/personal-market-20260917/`.
Exact final Commit/Push and all three GitHub jobs must be verified for that SHA;
final publication details belong in the ignored delivery manifest and handoff,
not a previous SHA's CI result.

## Owner test and remaining gates

1. Open `http://127.0.0.1:4174/` while the local launcher is running. Select
   «سبد شخصی جداگانه» then «فهرست دارایی‌ها».
2. Use the existing purchase book/Excel template for supported assets. Do not
   enter an existing balance again as a new purchase. The current three rows are
   the prior explicitly synthetic acceptance data, not the owner's real portfolio.
3. Open «جزئیات مقدار، میانگین خرید، قیمت و سود/زیان هر دارایی»; compare acquisition
   basis versus current quote/value. Missing cost/price is explained, not zero.
4. «بازیابی قیمت ذخیره‌شده» uses this browser's latest snapshot. «دریافت یک‌بارهٔ قیمت
   از نوسان» requests new data only when the shared quota/cooldown permits it.
   Saving/reloading cannot refresh old prices; no automatic API polling exists.
5. «ذخیرهٔ آخرین قیمت» saves just that latest price separately from purchases.
   Purchase recovery remains «بازیابی نسخهٔ دیتابیس». Other devices do not inherit
   this browser's prices or local database automatically.

Remaining: source freshness gaps between permitted calls, silver/24K coverage,
reviewed mesghal unit bridge, licensed dated FX/history, cost/liquidity evidence,
independent data validation, calibrated/approved real financial methods, hosted
identity/storage, maintenance and owner acceptance. This finishes the bounded
local price connection, not the entire project, deployment or financial validation.
