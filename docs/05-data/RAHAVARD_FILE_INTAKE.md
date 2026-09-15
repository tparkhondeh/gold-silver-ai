# Rahavard official file intake — bounded preparation

Reviewed 2026-09-15, Asia/Tehran. Owner scope: official licensed file acquisition and
local technical testing; no scraping, history accumulation, purchase, server/main
change or financial-method promotion. ADR 0011 remains binding.

## What is actually known

| Item | Fresh evidence / limitation |
|---|---|
| Official route | [Data export](https://rahavard365.com/dataexport) describes a desktop export tool and use of exported data in other analysis software. Lack of API is not itself a blocker. |
| Required entitlement | Following owner-operated login on September 15, the browser menu showed one active Gold subscription. The owner subsequently completed native login; the client's transfer-settings window is now visible instead of sign-in. Successful export/license execution is still unverified. No account-details, private watchlist or portfolio page was read. |
| File container | FAQ explicitly says TXT. Windows installation registry confirms official client version 1.8.4. Its transfer settings are readable, but no export file has been produced or received. See the client-settings checkpoint below. |
| Product coverage | Page lists coins, global commodities, exchange rates, funds and other markets. Exact gold18/silver999/coin provider codes and their availability in the owner's licensed export are **TBD**. No gold fund is mapped to a gram of physical gold. |
| Actual file schema | Columns, delimiter, encoding, price kind (last/close/OHLC), adjustment policy and sample are **TBD**. TXT alone does not establish these. |
| Denomination/quantity/purity | Actual IRR/TOMAN, scale, gram/unit, purity and nullable source fields are **TBD**; never infer from a filename, price size or a similar instrument. |
| Price/receive time | Source calendar, timestamp resolution/timezone and publication versus trading date are **TBD**. Import time is not substituted for missing price time. |
| Acquisition/retention limits | Exact export limits, licensed minimal/latest-only selection and permitted local retention are **TBD**. Public marketing of a history depth is not permission to acquire it. |
| Permission | [Current terms, article 2.1](https://rahavard365.com/terms-and-conditions) require express permission for copying/transferring information. The export page advertises transfer for analysis; reconcile the scope of that specific entitlement with article 2.1 and retention before acquisition. No blanket prohibition or blanket grant is inferred. |

No real price, account secret, private portfolio or licensed history was acquired in
either checkpoint. Login is owner-operated; no cookie extraction or backend-session reuse.

## September 15 access and installer checkpoint

The owner reported successful login; the fresh browser menu confirms Gold active.
The export FAQ separately requires desktop sign-in and an explicit adjustment mode
(including unadjusted where applicable). Browser login is not desktop login, and
neither establishes the actual TXT schema or permission to accumulate history.

The [official x64 download](https://rahavard365.com/downloads/rahavard365-v1.8.4-x64-setup.exe)
completed over normal verified HTTPS: 71,024,836 bytes; SHA-256
`2c4276a66945b83f9150fe2b27b69e08afbafd35ccdad88ecbb67628000aa67f`.
Windows Authenticode reports **NotSigned**, with no signer certificate. A source URL
and checksum do not prove publisher identity or software safety. The unsigned status
was disclosed; the owner explicitly approved installing the official version. The
installer was then opened through the Windows control skill, with no protection
changed or terms accepted by the agent. Its visible window title is the Rahavard
installer, but screenshot capture failed with `SetIsBorderRequired: No such interface
supported (0x80004002)`. A fresh-window text-only recovery returned only the dialog
and title bar, without installer controls. No guessed clicks or alternative Windows
automation were attempted. The installer was brought forward for the owner to finish
manually; native sign-in and any new terms also remain owner-operated. At that
checkpoint installation completion and export settings were unverified.
Do not start data receipt or automatic sync before inspecting the selected scope.

Installation follow-up: the owner reported completion. A bounded read-only Windows
installation registry check confirms Rahavard 365 version 1.8.4 in
`C:\Program Files\Mabna\Rahavard 365`. The registered installed executable was
launched (not the installer). Its native sign-in page exposes the email/phone field
and disabled sign-in button through accessibility, unlike the unreadable installer.
No authentication field was read/filled and no login action was automated; the
owner must complete that separate sign-in. The earlier installer-control blocker
does not establish a blocker for the client after login. Export controls, limits,
license-specific retention and the real file still require inspection after login.
The follow-up pre-edit document copies were hash-verified under ignored
`.cache/checkpoints/rahavard-installed-20260915T134447/`.

## September 15 native login and transfer settings

After the owner reported native login, the client exposed separate watchlist and
transfer-settings windows. Only transfer settings were inspected; the private
watchlist was not opened/read. This supersedes the native-login handoff above.

Observed transfer controls: inactive form, disabled path/browser and filename
controls; price choices last/closing; adjustment choices including unadjusted;
daily/weekly/monthly/yearly periods; symbol selection; automatic execution every
15/30/45/60 minutes; rebuild-files option; separate Apply, Apply-and-run and Cancel
buttons. No latest-row-only or start/end-date control was visible. This does not
prove the client has no such option elsewhere, and period selection is not a
history-depth limit. Exact symbols, selected values and the TXT schema remain TBD.

A click intended only to enable draft settings failed with
`coordinate input geometry is unavailable`. Fresh text-only observation still
showed disabled controls. One Tab navigation attempt left focus on the document.
No Apply/Apply-and-run, export, history or synchronization was invoked. The owner
was asked to open draft symbol selection manually, without confirming or executing.
Do not substitute blind clicks, guessed hotkeys or hidden provider endpoints.
Once selection is visible, inspect only relevant public instrument metadata and
minimal export controls; confirm scope before any acquisition. The bounded official
web search did not locate an additional indexed date-limit guide; that absence is
not proof of unsupported functionality.

Pre-edit copies for this follow-up were hash-verified under ignored
`.cache/checkpoints/rahavard-export-review-20260915T135042/`. This is documentation
and read-only client inspection, not new product code or a real-file acceptance test.

The executable and hash-verified pre-edit copies of the three affected documents are
only in ignored `.cache/checkpoints/rahavard-access-20260915T133037/`; no binary or
market file is staged. Recovery is to compare/copy those document backups deliberately,
not reset Git or delete the current state.

This checkpoint changes documentation only. Product code, calculations, data stores,
main, server and financial lock are unchanged. No new product test run is warranted
by this documentation-only change; the source checkpoint `22c9325` retains its
210 passing web tests and all three successful jobs in
[run 34848037566](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/34848037566).
Those are prior source evidence, not fresh real-file acceptance. This documentation
commit must have its own three CI results checked after push. Self-review: fresh
entitlement evidence recorded without account secrets; original data/history limits
retained; documentation links/diff checked before commit; installer launched only
after explicit consent and no unobservable installer controls activated.
Implementation/data/financial regression gates are not applicable to this docs-only
unit; real-file functional completeness and owner acceptance remain blocked.

Local availability was checked separately: the initial connection was refused
because no application listener was present. The existing `start-local-app.mjs`
launcher was started without source/configuration edits; PostgreSQL and the
loopback-only Node app became ready after startup. Root and `/api/health` then
returned HTTP 200 (health generated `2026-09-15T10:06:19.23Z`), and reloading the
existing local browser tab displayed the overview in market-test mode. Financial
use stayed blocked, history stayed locked, and the quota remained at eight consumed
requests: no provider request was made. This was startup/health/browser smoke
verification, **not** a repeat of all fixture paths or a real-data end-to-end test.

## Short support question — prepared, NOT sent

سلام. آیا استفاده از خروجی TXT ابزار رسمی انتقال داده، با اشتراک فعلی من، در نرم‌افزار شخصی Gold/Silver AI فقط روی کامپیوتر خودم و بدون بازنشر مجاز است و تحت مجوز بند ۲.۱ قرار می‌گیرد؟ برای طلای ۱۸ عیار، سکه امامی و نقره ۹۹۹، آیا می‌توان فقط آخرین رکورد را گرفت؟ لطفاً قالب ستون‌ها، واحد/ضریب قیمت، عیار، نوع قیمت، زمان/منطقه زمانی و حدود دریافت و نگهداری را اعلام کنید. فعلاً درخواست خرید یا دریافت تاریخچه ندارم.

## Implemented independent connection

`apps/web/app/file-market-contract.ts` defines the blocked real profile
`asha.rahavard_export_review.v1`. `realImportEnabled=false`; a user-supplied approval
string, filename or checkbox cannot enable it. A verified authorized sample and
versioned source mapping must be implemented/reviewed before real import is possible.
This is **not a completed parser for the vendor's unobserved TXT layout**.

The independent fixture profile `asha.synthetic_txt_profile.v1` accepts UTF-8 TXT,
optional BOM and CRLF, a mandatory `# ASHA_SYNTHETIC_TXT_V1` marker and exact columns:
`symbol,price,currency,unit,purity_permille,published_at`. These are project-designed
test columns, not claimed vendor columns. Only TEST_GOLD/TEST_COIN/TEST_SILVER map
explicitly to the three already-supported test assets. Limits: 4096 **bytes**, one
to three unique quotes, no series/duplicate selection, no quoted multiline fields,
no unit/locale guessing, no spreadsheet expressions or unknown symbols.

Raw decimals and currency are retained; exact conversion reuses the existing
decimal-to-rial arithmetic at explicit scale 1. Shared position valuation reuses
`evaluateQuotedTestPositions`, extracted without changing the existing Navasan math.
Physical fractional value rounding, cash denominator, minimum cash and concentration
remain identical. Missing price time is null and `unknown_time`, never fresh. Short
and medium outputs remain `undecidable`, amounts/cost/cash-after null and financial
use disabled. No synthetic factors are attached to real quotes.

`asha.file_snapshot.v1` preserves validated source text, SHA-256 of the exact UTF-8
bytes, byte count, profile, raw values/units/times and line numbers. A checksum is
integrity evidence, **not authentication or proof of a vendor license**. No filename,
credential or personal account field is accepted. Browser evaluation does not send
file content to a server/API; Git fixtures are entirely invented.

`asha.file_market_test.v1` and `asha.file_test_document.v1` hold fictitious positions
plus this fixture only. The separate `asha-synthetic-file-market-test-v1` storage key
never overwrites the real-market/Navasan, shared-lab or personal keys. Explicit save
keeps one current document. Replay verifies original-text/hash/result, rechecks
freshness, rejects unknown/duplicate JSON keys and detects intervening storage writes.
Read/quota failures preserve stored bytes; unavailable storage does not auto-save a
blank portfolio. This is not multi-device or database-transactional persistence.

## Next real-data gate

1. Browser Gold, installation and owner-operated native login are verified for
   September 15; do not repeat installation/login without fresh failure evidence.
   Continue from the transfer-settings window. The owner was asked to enable only
   draft settings and open symbol selection, not Apply or Apply-and-run. Inspect
   that selection after confirmation; do not assume an export or sync has run.
   Native authentication/new terms remain owner-operated if encountered again.
2. Review export-specific license/retention and exact minimal selection; send the above
   support question only after separate authorization if clarification remains necessary.
3. Obtain an authorized minimal file into ignored local storage, inspect actual encoding,
   fields, source codes, price kind, units and times, then create its reviewed profile.
   Do not ask the owner to prepend a synthetic marker to a real file.
4. Implement the separate real snapshot/storage adapter for that verified profile and
   exercise the actual-file path. No real-file acceptance is claimed by synthetic tests.

Implemented fixture evidence: [2026-09-14 review](../10-project-state/RAHAVARD_FILE_REVIEW_2026-09-14.md).
Its then-pending browser login is superseded by the September 15 checkpoint above.
