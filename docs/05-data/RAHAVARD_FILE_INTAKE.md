# Rahavard official file intake — bounded preparation

Reviewed 2026-09-14, Asia/Tehran. Owner scope: official licensed file acquisition and
local technical testing; no scraping, history accumulation, purchase, server/main
change or financial-method promotion. ADR 0011 remains binding.

## What is actually known

| Item | Fresh evidence / limitation |
|---|---|
| Official route | [Data export](https://rahavard365.com/dataexport) describes a desktop export tool and use of exported data in other analysis software. Lack of API is not itself a blocker. |
| Required entitlement | The official FAQ says Gold subscription. An old open tab showed a Gold badge, but after reload it displayed Sign in; current entitlement is **unverified**, not confirmed active or expired. |
| File container | FAQ explicitly says TXT. Official download links show Windows tool 1.8.4, x86/x64; nothing installed or terms accepted in this task. No matching installed program/process was found in the bounded registry/process check; portable copies were not searched across personal files. |
| Product coverage | Page lists coins, global commodities, exchange rates, funds and other markets. Exact gold18/silver999/coin provider codes and their availability in the owner's licensed export are **TBD**. No gold fund is mapped to a gram of physical gold. |
| Actual file schema | Columns, delimiter, encoding, price kind (last/close/OHLC), adjustment policy and sample are **TBD**. TXT alone does not establish these. |
| Denomination/quantity/purity | Actual IRR/TOMAN, scale, gram/unit, purity and nullable source fields are **TBD**; never infer from a filename, price size or a similar instrument. |
| Price/receive time | Source calendar, timestamp resolution/timezone and publication versus trading date are **TBD**. Import time is not substituted for missing price time. |
| Acquisition/retention limits | Exact export limits, licensed minimal/latest-only selection and permitted local retention are **TBD**. Public marketing of a history depth is not permission to acquire it. |
| Permission | [Current terms, article 2.1](https://rahavard365.com/terms-and-conditions) require express permission for copying/transferring information. The export page advertises transfer for analysis; reconcile the scope of that specific entitlement with article 2.1 and retention before acquisition. No blanket prohibition or blanket grant is inferred. |

No real price, account secret, private portfolio or licensed history was acquired in
this unit. New login is owner-operated; no cookie extraction or backend-session reuse.

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

1. Owner logs in again; verify current export entitlement without account/portfolio extraction.
2. Review export-specific license/retention and exact minimal selection; send the above
   support question only after separate authorization if clarification remains necessary.
3. Obtain an authorized minimal file into ignored local storage, inspect actual encoding,
   fields, source codes, price kind, units and times, then create its reviewed profile.
   Do not ask the owner to prepend a synthetic marker to a real file.
4. Implement the separate real snapshot/storage adapter for that verified profile and
   exercise the actual-file path. No real-file acceptance is claimed by synthetic tests.

Current execution evidence: [2026-09-14 review](../10-project-state/RAHAVARD_FILE_REVIEW_2026-09-14.md).
