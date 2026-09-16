# Purchase-book and Excel delivery review — 2026-09-16

## Scope and source

Owner-authorized purchase recording and grouped Excel intake, based on clean
`8789737c3e9909ac37e2af3204c56e9fd53d5fd8`, in the existing checkout and
`codex/phase-2-decision-engine`. The implemented identity, formulas, missing-data,
dated FX, projection and import rules are authoritative in
[PURCHASE_LOTS.md](../04-portfolio/PURCHASE_LOTS.md), not duplicated here.

This is local personal-portfolio functionality. Existing real-market tests and
the synthetic seven-method laboratory retain their separate contracts. No new
provider/history request, private-data export, server/main change, financial
method, sale-accounting method or financial unlock occurred. Owner acceptance and
whole-project completion are not claimed.

## Delivered code and independent review

- Exact purchase lots and weighted raw/landed costs; per-purchase dated USD with
  actual USD payments distinguished from manually converted equivalents. Legacy
  records remain opening balances and compatible quantities are counted once.
- Versioned local-only XLSX reader, blank downloadable template, explicit preview,
  row errors, file/ID duplicate guards and one atomic versioned database write.
- Existing PostgreSQL/RLS portfolio row extended by additive migration 0012;
  omitted books are preserved and accidental removal of purchases/receipts fails.
- The coordinator integrated personal dashboard, asset center, analysis and
  decision views, authored/rendered all four workbook sheets with the bundled
  spreadsheet tool, and performed browser acceptance.
- `finance_data_review` implemented/reviewed the math; `security_storage_review`
  implemented persistence and adversarial tests; `architecture_qa_review` owned
  the importer and reviewed integration. Calculation and storage changes were
  independently reviewed by another specialist, not accepted on role names alone.

Found and corrected during review/testing: exact decimal projection rounding,
large rational-sum performance, optional Excel values with incompatible cell
types, stale preview/edit bases, incomplete FX metadata, uncertain-save recovery
messages, cancellation during a pending commit, partial-cost profit reporting,
misleading current-FX acquisition-cost conversion, and PostgreSQL JSONB object-key
ordering falsely triggering a stale-book error. Canonical validators retain all
field values, array order and provenance; explicit handler regressions reproduce
the database key-order case.

The local dependency installation invalidated the prior running pnpm-resolved
React optimizer graph. Browser evidence showed an invalid-hook error. Restarting
the verified project process with the current installed tree and moving its old
project-local optimizer cache to the checkpoint resolved it. No user storage was
cleared. Intermediate hot reloads are not presented as a production restart test.

## Safeguards and evidence

Before changes, `.cache/checkpoints/purchase-lots-20260916/before.bundle` was
verified to contain repository refs. Before the additive migration, backup
`asha-local-20260916T140645Z-ea0b212c.dump` was fully restored into an isolated
verification database: all 25 table counts and migration checksums matched.
Its SHA-256 is `a839057330b8f458cb8debbdf67a1d2716e4fd8087c522133f30320916a63c14`.
Backup files remain in ignored owner-ACL storage; they are not encrypted or
uploaded. Source data and protected configuration were not reset.

Current local checks: 309 web tests pass; coverage lines 95.72%, branches 88.86%,
functions 96.95%. Nineteen real isolated PostgreSQL tests pass, including migration,
exact purchase round trips, legacy preservation, coherent reads, rollback/RLS and
backup restoration. Typecheck, lint, production build and production npm audit
pass (zero production advisories). Test logs, workbook previews, downloaded-copy
hash checks and recovery artifacts are ignored in the checkpoint/output folders.
The Python financial method was not edited; its exact-commit CI result is a
separate release gate.

### Browser acceptance

Performed by the coordinator in the available in-app browser against loopback,
using a previously empty personal database portfolio and explicitly synthetic
fixtures only:

| Path | Evidence |
|---|---|
| Download → fill → upload → preview → confirm | Actual UI download SHA matched the public template. The downloaded copy was filled with the two separate educational rows; blank/sample sheets do not auto-import. Both rows were previewed and committed together. |
| Weighted costs | Gold 2.5g + 1.5g = 4g; raw average 10,750,000 toman/g; landed average 10,775,000 toman/g; historical equivalent 401 USD, average 100.25 USD/g. Compact 100.3 opened to exact 100.25. |
| Duplicate/corrupt file | Reupload was rejected without another save; intentionally non-ZIP XLSX was rejected without changing inventory. |
| Manual small quantity and missing FX | Synthetic silver 0.0001g at 1,000,000 toman/g, explicit zero fees, saved as 100 toman; compact text says below 0.1 and exact disclosure shows 0.0001. USD basis remains unknown with explicit coverage. |
| Edit and provenance | Gold purchase 2.5→2.75g updated the same ID and totals, not row count; restored to 2.5g. A next-day FX date was rejected; original source and unchanged FX receipt time remained. |
| Database recovery | Saved purchases survived page reload and explicit restore; a subsequent new purchase succeeded after the JSONB key-order correction. |

The coordinator also opened dashboard → asset center → analysis (both available
horizons) → decisions (both horizons): 4g gold, 43,100,000 toman gold basis and the
same weighted averages were retained. The additional silver purchase remained
separate, yielding 43,100,100 toman total entered basis. Missing current quotes
kept value/profit and financial decisions unavailable; basis did not replace a
market price. A final reload and explicit database recovery retained three lots
in version 4. Browser testing exposed the `decision`/`decisions` view-ID mismatch;
the corrected summary was then verified in the actual decision page.

Unit/cell
incompatibility, missing prices/fees, legacy merges, native USD, timeout/409/422,
lost responses, concurrent versions and rollback were tested with controlled
automated fixtures. These are not claims of manual browser fault injection.
Microsoft Excel desktop, external browsers/devices, hosted persistence and live
historical FX were not tested this stage. Three marked synthetic purchases remain
in the local test portfolio; no existing personal portfolio was overwritten.

## Dependencies and workbook reproducibility

Only the manifest/lock pins for `@zip.js/zip.js` 2.15.0 (BSD-3-Clause) and
`@xmldom/xmldom` 0.9.12 (MIT) were added. Reviewed on this date against the official
[zip.js project](https://github.com/gildas-lormeau/zip.js) and
[xmldom project](https://github.com/xmldom/xmldom), registry metadata, licenses and
fresh audit. Both are maintained upstream, have no runtime dependency chain and
were selected for bounded ZIP/XML parsing, not financial calculations. The native
ZIP entry point disables workers/WASM/network loading. Existing package records
and Linux libc metadata were preserved. Permissive-library review does not resolve
the open product-license/IP decision.

The full development tree has pre-existing advisories; see the current scope and
patch follow-up in [KNOWN_ISSUES item 8](KNOWN_ISSUES.md). Production audit is not a
claim that the entire development toolchain is vulnerability-free.

`tools/purchase-template/build.mjs` uses only the bundled artifact-tool for XLSX
authoring; normal CI tests the checked-in blank template against the importer and
catalog without requiring that authoring runtime. All four sheets and the filled
acceptance copy were rendered and visually inspected. Only the blank template
with its separately marked instructional examples is committed, never uploads,
private holdings, backups, provider data or keys.

## Owner test and next gates

Open `http://127.0.0.1:4174/` → «سبد شخصی جداگانه» → «فهرست دارایی‌ها» →
«دفتر خرید و ورود Excel». Download the blank template or use «ثبت خرید جدید».
Fill only «خریدها», one independent purchase per row, then inspect the preview
before confirming. Zero fees means known zero; blank means unknown. For recovery
use «بازیابی نسخهٔ دیتابیس» before retrying an uncertain save. Existing balances
must not be entered again as new purchases. Dates are explicitly Gregorian.

Remaining: owner acceptance, licensed historical FX/source evidence, valid current
market inputs for personal valuation/analysis, independent hydrated-browser
regression automation and bounded development-dependency maintenance. Existing
hosted identity/storage/deployment gates remain. No historical rate is inferred
from today's or a neighboring day's price.

## Delivery verification

Commit/Push and all three GitHub jobs must be verified for the exact delivery SHA;
prior branch runs are not evidence. Final publication details are recorded in the
ignored checkpoint delivery manifest and the turn's delivery response.
