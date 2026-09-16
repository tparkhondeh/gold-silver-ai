# Purchase lots and local Excel import

**Source of truth for:** the implemented purchase-book, aggregation and import
contract. This is purchase recording, not trade execution or a sale-accounting
method. Product readiness and release evidence remain in
[`CURRENT_STATE.md`](../10-project-state/CURRENT_STATE.md).

## Scope and identity

The personal portfolio has a separate `asha.purchase_book.v1` document containing
purchase lots and import receipts. Existing holdings remain opening balances; they
are not rewritten as purchases. A lot has a stable ID, exact instrument/class/unit/
purity, quantity, purchase date, optional time, payment currency, optional unit price
and fees, note, information source and optional dated FX evidence. Editing replaces
one ID, not an additional purchase. This stage does not delete lots or receipts,
allocate sales, choose FIFO/LIFO, or debit cash automatically.

The supported instrument identities and validators live in
[`purchase-book.ts`](../../apps/web/app/purchase-book.ts). Only the registered gold,
named coin, silver and USD identities are accepted. Instrument unit and purity
must match the catalog exactly; coin quantities are integers. Funds, certificates,
equities or generic asset names are not guessed into a physical-metal identity.

Inputs are canonical decimal strings, at most 18 integer and 12 fractional digits.
Quantity is positive; known price and total fees are nonnegative. Blank price or
fees means unknown, while explicit zero means known zero. Fees are the stated
total side costs of that purchase in its payment currency, with no inferred tax,
commission or conversion fee. Output calculations use reduced nonnegative
`{numerator, denominator}` integer-string ratios, not rounded floating-point money.

## Calculation and missing coverage

For compatible purchases, let `qᵢ` be quantity, `pᵢ` unit price and `fᵢ` the stated
total fees. The engine computes:

- Purchase amount without fees: `Bᵢ = qᵢ × pᵢ`.
- Landed amount with fees: `Lᵢ = Bᵢ + fᵢ`.
- Purchase quantity: `Q = Σqᵢ`.
- Weighted purchase price: `ΣBᵢ / Q`.
- Weighted landed cost: `ΣLᵢ / Q`.

Amounts must first have a common currency. Native-payment-currency coverage is
kept separately for `IRR`, `TOMAN` and `USD`. One toman is exactly ten rial. A USD
payment needs its recorded dated FX rate for a rial/toman equivalent; its actual
USD amount does not need FX.

For a rial/toman purchase with `rᵢ` recorded as **toman per USD on that purchase
date**, historical landed USD equivalent is `Lᵢ / rᵢ` for TOMAN or
`Lᵢ / (10 × rᵢ)` for IRR. Convert each row before summing; never divide total
purchases by today's rate or an arithmetic average of rates. The total USD basis
and compatible-asset USD average sum these exact row amounts. Actual USD payments
and historical equivalents remain separately identified. Unlike instruments have
no combined quantity or per-unit average; portfolio totals sum money only.

Each cost/price output has its own coverage. Missing price, fees or FX leaves the
dependent result unknown, not zero. The contract exposes covered quantity, total
quantity, the available subtotal and a covered-only average. A whole-asset average
is null unless that measure covers the entire quantity. Portfolio money totals
similarly disclose covered purchase count and legacy holding count. A partial
result must not be presented as the complete portfolio's basis.

Legacy holdings merge for presentation only when their exact registered name and
display unit establish compatibility. Their quantity contributes once; the source
records remain intact. An existing total cost can contribute to a projected total
cost, but does not invent its unit price, fees or historical FX coverage. Unknown
or incompatible legacy identities remain separate. New exact quantities/costs
enter the older numeric holding interface only when lossless and valid under that
interface; otherwise projection issues block the affected downstream readiness.

## Dates and FX provenance

Purchase dates are Gregorian `YYYY-MM-DD`; optional purchase time is `HH:mm` in
`Asia/Tehran`. There is no automatic Jalali/date-locale detection. FX contains the
positive toman-per-USD rate, the exact same purchase date, rate type, source,
UTC receipt timestamp and `user_entered_unverified` validity. Manual input is not
verified provider history. For an unchanged manually edited rate, its original
receipt time remains; a changed rate records the new entry time.

No historical request, history accumulation, holiday substitution, nearest-date
fallback or interpolation is introduced. Existing licensing, source, financial
method and execution restrictions remain unchanged.

## XLSX template and parsing

The personal portfolio's purchase panel downloads
`/templates/purchase-lots-v1.xlsx`. It has four sheets: `راهنما`, `خریدها`,
`فهرست‌ها`, and `نمونه ساختگی`. Only `خریدها` is imported; examples are separate
and never added automatically. Asset/class/unit/currency/calendar/time-zone
dropdowns assist entry; validators still enforce the actual allowed combinations.

[`purchase-import-schema.ts`](../../apps/web/app/purchase-import-schema.ts) owns
the exact layout: A1 is `asha.purchase_import.v1`, row 2 contains the following
20 machine headers in order, row 3 contains Persian descriptions, and purchases
start on row 4. Each populated purchase row needs its own stable ID.

| Columns | Meaning and requirement |
|---|---|
| `id`, `assetId`, `assetClass`, `unit`, `purityPermille` | Stable ID and exact catalog identity; purity blank only when the instrument has no recorded purity. |
| `quantity`, `purchaseDate`, `purchaseTime` | Positive quantity; Gregorian date required; Tehran time optional. |
| `paymentCurrency`, `unitPrice`, `fees` | Currency required; blank price/fees unknown; explicit zero preserves known zero. |
| `note`, `sourceReference` | Optional note and purchase-information reference, preserved as entered. |
| `fxTomanPerUsd`, `fxRateDate`, `fxRateType`, `fxSource`, `fxReceivedAt` | FX optional as a group; if supplied, rate/date/type/source required. A blank receipt timestamp records actual application import time, with an explicit warning that it is not provider receipt evidence. |
| `calendar`, `timeZone` | Required exact values `gregorian` and `Asia/Tehran`. |

Ordinary template quantities/prices/dates are typed Excel values. The parser reads
the stored numeric lexeme exactly, including bounded numeric exponent expansion.
Excel itself can round long numeric input; use text for more than 15 significant
digits and inspect the preview. Text decimals do not accept exponent/comma
notation. Dates accept ISO text or an integer 1900-system Excel serial; serial 60,
fractional-day dates and the 1904 system are rejected. Optional time is `HH:mm`
text, and an explicit FX receipt timestamp is canonical UTC ISO text.

[`purchase-import.ts`](../../apps/web/app/purchase-import.ts) parses solely in the
browser. No workbook bytes are uploaded, logged or sent to a provider. Parsing uses
pinned native-stream ZIP and XML readers, not a spreadsheet calculation engine.
Cell formulas, macros, encrypted files, external relationships, external formula
references, entities/DTDs, ambiguous paths/entries and incompatible cell payloads
are rejected. Local static dropdown lists/ranges are allowed but not evaluated.

Resource limits are 2 MiB compressed, 16 MiB total expanded, 4 MiB per XML entry,
128 ZIP entries, 500 input purchases, 40,000 cells/shared strings and 4,000 characters
per cell. Declared expansion is checked before decompression and actual streamed
bytes are capped too. Row/column/schema checks reject hidden populated input rows,
duplicate coordinates, unsupported data types and extra populated columns.

## Preview, atomic save and recovery

Preview shows valid rows, row errors, possible similarities and the projected
inventory/basis effect. Any row error, existing/duplicate ID or capacity overflow
blocks the entire import. A previously recorded file SHA-256 blocks reimport.
Economically similar purchases with different IDs produce a warning, not automatic
deletion. The user must explicitly confirm the valid preview.

Confirmation requires the original, unmodified preview and unchanged base book;
the UI also guards the legacy balances used in its effect preview. It builds one
candidate with all new lots and one `{fileSha256, importedAt, lotIds}` receipt.
The database save uses the current optimistic portfolio version and one
transaction for legacy holdings, preferences, the exact book and receipts.
Existing purchase IDs and receipt identity cannot be removed by a save. An older
client omitting the book preserves it; malformed stored data fails closed.

The UI publishes purchases only after a valid successful response. Rejection or
failure leaves the prior local book and current draft/preview intact. A lost reply
does not prove the transaction failed: recover the database snapshot before
retrying. If another tab changed the portfolio, restore and create a fresh preview.
If the browser book is unreadable or differs from the database book, new writes
remain blocked until explicit database recovery; unreadable input is not silently
overwritten. Cancel a preview before confirmation to leave the portfolio unchanged.

## Integration boundary

Purchase lots belong to the **separate personal portfolio** and require its
enabled owner-local PostgreSQL save/restore boundary. Dashboard, asset center,
analysis and decision views consume the same evaluated purchase book and projected
holdings. Purchase basis is never substituted for current quotes, market history
or a missing analytical method. Current value and profit/loss remain dependent on
valid market inputs and complete applicable cost/quantity data.

The actual-price market-test/file-intake workspace and synthetic laboratory keep
their independent contracts and storage. Recording purchases does not transfer
them into those modes, authorize new data access, select a financial methodology
or enable operational recommendations or trading. Hosted personal-data collection
remains subject to the existing identity/storage gates.
