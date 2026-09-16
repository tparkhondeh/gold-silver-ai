# Actual latest-price acceptance — September 16, 2026

## Scope and baseline

Owner authorized permitted actual market data for local software testing, not
history, new financial methods, private portfolio extraction, deployment or trading.
Started clean at `13c78d8cbdf381c4524b07a2a86ccb393b1add36` on the working branch.
Complete pre-edit Git bundle verified at
`.cache/checkpoints/real-market-20260916/before.bundle`. Main and server unchanged.
Existing adapters and isolated contracts were reused, not rebuilt.

Three existing subagents were used: financial/data review implemented an exact
risk helper, security/storage review corrected request cadence, architecture/QA
independently reviewed both changes. The coordinator handled permitted acquisition,
browser acceptance, integration and publication. No external agent was installed.

## Actual acquisition and source boundaries

The [official Navasan plan page](https://www.navasan.tech/api/) was checked afresh:
120 free calls/month, advertised two-hour updates and three-month validity. The
[official API guide](https://www.navasan.tech/webserviceguide/) documents latest
JSON prices and source Unix timestamps. The UI now explicitly identifies this
free delayed-update feed rather than implying tick-by-tick prices. HTTPS-only,
no redirects, existing rotated-key checks and all operational locks remain intact.

Read-only local preflight showed free-plan quota ready: 8 used, 107 remaining,
24,000-second cadence and an already-passed eligibility time. Generic market
networking, history and financial-decision engines remained blocked. Exactly one
explicit browser Receive requested the authorized latest snapshot; no usage/history
endpoint, automatic retry or unrelated source request was made.

Durable result: success, **8 approved observations**, 1,156 ms, completed
`2026-09-16T12:13:31.312Z` (15:43:31 Tehran). Local quota became **9 used / 106
remaining** and stayed unchanged after all navigation, editing, restore and reload
checks. Next eligibility recorded by the ledger is
`2026-09-16T18:53:29.864Z` (22:23:29 Tehran); check current health before any next
request. This project's ledger is not the provider-wide account usage counter.

The normalized observations cover the approved eight mappings: 18k gold, mesghal,
Emami/Azadi/half/quarter/gram coins and USD sell. Current portfolio support uses
gold18k and Emami; other rows are source provenance, not silently added instruments.
Gold/coin prices were fresh in the browser test. Source and receive time, original
currency, provider scale, units and explicit/unknown purity are preserved. Current
freshness remains 60 minutes; successful receipt does not make an old quote fresh.
No silver quote was acquired and no global price was converted into an invented
Iranian silver quote.

Only the latest permitted document was saved in the existing separate browser
namespace at `http://127.0.0.1:4174/`. Existing hypothetical inputs were preserved;
temporary edits were restored. No personal database was used and no price series,
provider payload file, key or market quote was put in Git. Browser storage remains
origin/device-local: `localhost` and `127.0.0.1` are not the same storage origin.
Freshness expiry is not automatic retention deletion or cross-device persistence.

## Rahavard and bounded alternative review

The Gmail connector is still disconnected. An authorized browser search limited
to the September 15 inquiry, relevant provider senders and destination returned
only the already-sent message; no relevant reply/bounce was found. This is not a
delivery receipt or proof that no reply can arrive under a different subject/address.
No message was sent, terms accepted or export enabled. The existing
[minimal-file permission question](../05-data/RAHAVARD_FILE_INTAKE.md#support-question--substance-sent-by-email)
is sufficient; do not resend it. Real TXT profile/permission/retention remain TBD.

Official public documentation was compared without quote calls or new enrollment:

| Source | Evidence and fit | Why it does not close the remaining Iran-silver gap |
|---|---|---|
| [XAUS](https://xaus.com/api/) | Keyless indicative XAU/XAG, USD per troy ounce; reasonable personal/dashboard use and at least 30-second caching | Global reference, not an Iranian physical quote. Gold-specific price freshness is documented; a separate silver observation time and long-term retention rights are not established |
| [Gold-API](https://gold-api.com/llms.txt), [terms](https://gold-api.com/terms) | Free latest XAU/XAG, published update field, application use allowed, caching/anti-abuse constraints | Iran basis/purity/physical spread absent; reviewed XAG unit and durable retention contract need clarification. XAUS names Gold-API upstream, so independence must not be assumed |
| [TGJU official API request](https://www.tgju.org/form/api) | Distinguishes Iranian silver999 from global silver ounce; commercial API request path exists | No free licensed entitlement, field/unit/time/retention contract established; widget/public display is not an extraction license |

Do not add a global informational feed merely to disguise the missing local input.
No purchase, vendor switch or source-policy permission was inferred from this review.

## Corrections and verification

1. The one-shot route hardcoded a 24,000-second cooldown while health could show a
   slower configured cadence. It now uses the same reviewed refresh policy; free
   limits cannot be shortened through body/query/header or paid-plan settings.
2. Market and file risk views compared truncated display weights to concentration
   limits. They now compare exact integer cross-products, catching a one-rial breach
   even when the displayed weight is 50%. Missing/zero/inconsistent totals stay
   unknown. Financial methods, valuation arithmetic, snapshot schemas and replay
   results are unchanged.
3. Free-feed cadence and analysis limitations are clear in the UI; missing prices
   are not accompanied by an unconditional claim that valuation is possible.

| Path | Actual evidence this unit |
|---|---|
| Receive, validate and normalize | One successful actual Navasan latest request; eight accepted mappings, no secret exposed |
| Value and navigate | All nine market views agreed on recorded/current totals and cash using the same actual snapshot and hypothetical inputs |
| Edit and reconcile | Gold quantity change matched an independent exact integer calculation; unsupported nonzero silver removed complete totals instead of inventing a quote |
| Input errors | Fractional coin and keyboard-cleared cash blocked calculations/save; explicit restore recovered prior input and figures |
| Risk and horizons | Actual gold price with hypothetical cash one rial below equal weighting triggered the corrected 50% warning; changed short/medium horizons appeared in analysis, then original inputs restored |
| Save/reload | Same latest actual snapshot, inputs, totals and original horizons restored after page reload; no extra provider reservation |
| Analysis and decision | Valuation/risk diagnostics available within their inputs; trends, volatility, liquidity, fees and actionable allocations remain missing/undecidable, not synthetic substitutes |
| Failure/freshness/security cases | Controlled automated fixtures cover stale/future/missing/unit/source inconsistencies, outage, malformed/oversized responses, quota/cadence, storage failure/conflict and replay. These are not additional actual-source events or a live outage test |
| Rahavard, Iran silver, executable orders, other devices | Blocked or untested; no claim of acceptance |

Local gates: **252 web tests passed**, coverage 95.34% lines / 87.61% branches /
96.52% functions in the configured scope; typecheck, lint and production build
passed; production dependency audit reported zero known vulnerabilities. Independent
review passed 21 targeted tests and 8 additional boundary checks. Counts overlap;
do not add them to the full-suite total. No new dependency or SQL schema changed.
Database/Python full regression is additionally required in the exact-SHA three-job
CI run. Logs and final publication/CI metadata are retained in this unit's ignored
checkpoint; prior run success is not attestation for this change.

Actual browser evidence is the in-app browser at its existing narrow viewport;
menu navigation was also exercised by keyboard. Empty-input `fill` and an exact-text
locator were unreliable tool interactions; keyboard deletion and fresh page state
verified the real behavior. Final warning/error capture was empty, and the real
workspace was left open. No external browser/mobile-device acceptance is claimed.

## Next route and recovery

Use the [owner market guide](../09-operations/OWNER_MARKET_TEST_FA.md). Do not repeat
provider calls merely to re-demonstrate this passing snapshot. After freshness
expires, retain the stale label and wait for ledger eligibility; no background
acquisition or scheduled continuation exists.

Next independent engineering gap remains isolated hydrated browser regression
automation. Real-data expansion depends on Rahavard's written minimal-file terms,
an observed schema/sample, permitted Iran-silver/history/liquidity/cost inputs and
the registered calibration/method gates. Hosted identity/deployment is separate.
Code recovery is a reviewed forward revert using the verified bundle, not a data
reset or history rewrite. This acceptance is technical real-price valuation, not
financial performance approval, hosted readiness or whole-project completion.
