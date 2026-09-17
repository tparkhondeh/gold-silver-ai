# Personal portfolio current-market valuation

**Source of truth for:** the implemented deterministic valuation result,
`asha.personal_market_valuation.v2`, and its use in the unified personal workspace.
This extends the [purchase book](PURCHASE_LOTS.md), not the decision methodology,
sale accounting or hosted access. Implementation:
[`personal-market-valuation.ts`](../../apps/web/app/personal-market-valuation.ts).
The v2 result adds separate USD acquisition/performance coverage and provenance;
stored purchase-book and Navasan snapshot schemas are unchanged.

## Inputs and exact identity

The evaluator consumes the validated purchase book, retained legacy holdings,
the existing `asha.navasan.latest_snapshot.v1` contract and an explicit evaluation
time. It never mutates these inputs. There is no name search, estimated fallback,
implicit purity conversion, fund/certificate substitution or historical request.

| Purchase asset | Required quote identity | Behavior |
|---|---|---|
| 18K physical gold | `GOLD_18K_IRR`, gram, purity 750 | Exact quantity × compatible fresh price |
| Emami, Azadi, half, quarter, one-gram coins | Corresponding distinct coin ID, unit | Separate instruments; integer quantities only |
| USD | `USD_IRR`, usd | Its own compatible quote, never historical purchase FX |
| Mesghal | Purchase unit mesghal versus current source contract unit | Blocked until an explicitly reviewed unit bridge exists |
| 24K gold and silver | No compatible quote in the current adapter | Missing, not zero or a gold/USD substitute |
| Unknown legacy asset, fund or certificate | No exact existing catalog contract | Unsupported; no automatic conversion |

The existing snapshot validator binds provider symbol, source, instrument, raw
currency/scale, converted rial value, unit, purity and timestamps. Duplicate
symbols and inconsistent conversion fail closed. Known legacy positions are
consumed once by the existing purchase aggregation; unmatched positions remain
visible and unsupported. Individually fractional legacy coin records do not
become valid merely because their sum is an integer.

## Valuation and cost

All portfolio money and quantities use reduced BigInt rational pairs, not
floating-point or whole-rial truncation. Existing 12-decimal purchase precision
is retained. For each asset:

- Quantity = retained compatible inventory + each independent purchase once.
- Current value in rial = total quantity × fresh compatible price in rial.
- Raw weighted average = known purchase consideration ÷ corresponding quantity.
- Landed weighted average includes explicitly recorded fees and the existing
  per-purchase currency conversion rules. Blank fees/FX are not assumed zero.
- Unrealized P&L = current value − complete landed acquisition basis.
- P&L percent = P&L ÷ that same landed basis × 100, only for a positive denominator.
- Current USD value = current rial value ÷ fresh current rial/USD quote.
  Historical USD cost and USD investment performance are separate, as below.

Sale fees, executable bid/ask spreads, taxes on disposal and unregistered cash
are not invented or included. Legacy recorded costs remain identifiable; they
do not prove complete landed fees. Partial cost-covered P&L, when shown in
details, uses the value and cost of exactly the same covered purchase subset.
Its denominator is not the cost or value of the entire asset/portfolio.

The known-price subtotal is explicitly separate from the full portfolio total.
Any unpriced holding makes the full current total unknown. Whole-portfolio P&L
also requires complete costs. Coverage is a count of priced assets, not a
percentage of portfolio value. Empty or unavailable values are not zero.

### Exact USD basis, P&L and provenance

For purchase `i`, let `qᵢ` be quantity, `pᵢ` its recorded unit price, `fᵢ` its
explicit total fees, and `xᵢ` the entered **toman per USD on that purchase date**.
Compute landed USD basis per purchase before aggregation:

| Recorded payment currency | Landed USD basis of that purchase |
|---|---|
| USD | `qᵢ × pᵢ + fᵢ`; actual USD payment, no historical FX needed for this USD basis |
| TOMAN | `(qᵢ × pᵢ + fᵢ) ÷ xᵢ` |
| IRR | `(qᵢ × pᵢ + fᵢ) ÷ 10 ÷ xᵢ` |

Missing price or fees makes that purchase's landed basis unknown. Local-currency
purchases additionally require a valid positive same-date historical rate. Rates
are manually supplied, `user_entered_unverified`, not independently verified
provider history. No historical fetch occurs, no average FX rate is substituted,
and today's USD quote never rewrites acquisition inputs. Purchase dates remain
Gregorian and optional times denote Asia/Tehran under the purchase contract;
opening-record dates have no inferred calendar conversion or FX basis.

USD P&L = current USD value − complete landed USD acquisition basis.
USD P&L percent = that P&L ÷ the same positive USD basis × 100. It is **not** rial
P&L divided by today's FX; the two currencies can show different signs. Zero cost
may have known monetary P&L but a null percentage. Portfolio percentages use
summed matching monetary basis, not an average of asset percentages.

Rial and USD completeness are independent. Native USD payment can establish USD
cost without the FX needed for rial cost; a toman purchase without historical FX
can have rial cost and unknown USD cost. Missing/stale/future current USD blocks
current USD value and USD P&L, not known acquisition basis or valid rial valuation.

## Result fields and honest coverage

Top-level fields are `version`, `evaluatedAt`, `snapshotState`, `issues`,
`usdConversion`, `rows`, `totals`, and `financialUseAllowed: false`.
`snapshotState` is valid, missing or invalid. Rows retain exact instrument/unit/
purity, quantity, `lotIds`, `legacyIds`, observation and `quoteState`: fresh,
stale, future, missing, unsupported asset/unit/quantity, or invalid snapshot.
`recordedPriceRial` can retain a compatible expired/future quote for disclosure;
it does not authorize `currentValueRial`.

| Field family | Meaning |
|---|---|
| `purchaseBasisRial`, `landedBasisRial`, `legacyRecordedCostRial` | Raw/landed acquisition coverage and separately retained opening cost; `costComplete` gates full rial P&L |
| `landedBasisUsd`, `paidBasisUsd`, `equivalentBasisUsd` | Combined USD basis and native-payment/historical-equivalent components; `usdCostComplete` gates full USD P&L |
| `usdBasisSources` | Per-lot ID, date/currency, actual-payment or historical-equivalent kind, applicable manual FX record, and missing inputs (`unit_price`, `fees`, `historical_fx`) |
| `usdConversion` | Current USD quote state, observation and usable `currentRialPerUsd`; never acquisition FX |
| `currentValueRial/Usd`, `profitLossRial/Usd` | Full-row values only when their respective price/cost requirements are met |
| `covered`, `coveredUsd` | Current value, cost, P&L and percentage for the same covered purchase subset; USD also lists its covered lot IDs |

Each acquisition coverage contains `total`, `coveredQuantity`, `totalQuantity`,
`complete`, `averageCovered`, and `average`. Its `total` is the known subset's
basis, not necessarily the full asset's; `average` is null until complete.
`usdBasisSources.fx` is null for native USD payment because FX is not the source
of that USD basis; the original purchase record, including any FX, stays intact.

Portfolio `knownCurrentValueRial/Usd` and `knownLandedCostRial/Usd` sum available
subsets. Full `currentValueRial/Usd`, `landedCostRial/Usd` and full P&L require all
relevant constituents. Known acquisition cost remains available for an unpriced
asset, but that asset is excluded from current covered P&L. `coveredCost*`,
`coveredValue*`, `coveredProfitLoss*` and percentages sum matching monetary
subsets separately for each currency; their denominator is not the entire
portfolio's cost when coverage is incomplete.

`valuedAssetCount / totalAssetCount` counts assets with usable current rial value,
not value-weighted coverage. `costCoveredLotCount` and `usdCostCoveredLotCount`
count currently comparable purchases separately against `totalLotCount`;
`legacyHoldingCount` reports retained opening records. The covered-lot counts
can differ. No known subtotal is labelled the complete portfolio value.

## Freshness, requests and persistence

Freshness retains the existing 60-minute technical TTL from source publication.
The TTL boundary is inclusive, with expiry at TTL + 1 ms. Future source/receipt
timestamps cannot support current value. Reopening, receiving or caching old data
never advances publication time. The valuation clock updates every 30 seconds,
on focus/visibility, and at publication/receipt/expiry boundaries. The boundary
timer itself makes no request.

The unified workspace automatically checks bodyless local
`POST /api/managed-market` while active, respecting `nextCheckAt`, one in-flight
browser check and visibility. Focus/visibility can also make a due local check.
The key stays server-side; no portfolio, holdings, purchases or caller-selected
symbols are sent. The server shares the existing durable Navasan quota/cadence
and validates before publishing. Cached/unavailable responses need not involve
a provider request: HTTP 200 alone is not evidence of a newly received quote.
Unmount removes timers/listeners and aborts browser transport, but does not undo
an already-reserved shared acquisition. Failed or null-snapshot responses retain
the in-memory snapshot, whose freshness continues to expire normally.

The free plan's declared two-hour refresh is not a live feed. The application's
conservative call cadence can leave periods with no fresh quote; it must display
that limitation rather than increase quota or silently extend TTL.

The owner-local service keeps one validated latest snapshot in a protected
filesystem cache (`asha.managed_market_cache.v1`), independent of portfolio
PostgreSQL data/backups. Replacement coordinates concurrent writers and rejects
regressing source coverage/timestamps and conflicting publications. It is not
an append-only price archive. Failures preserve the prior committed record;
unknown/corrupt cache data is not silently promoted.

Personal records load from local PostgreSQL. Confirmed edits and Excel import
use expected-version, whole-snapshot saves, with returned version/content checks.
Conflicts or uncertain writes retain form inputs and require recovery, not blind
retry. This remains local persistence, not hosted identity or cross-device sync.

## Views and limits

The public entry now contains one personal workspace: portfolio overview,
recording/editing, analysis/readiness, and settings/backup. Exact valuation is
authoritative even when a value cannot be represented by Number. Display
compaction is presentation only, with exact disclosure; tiny nonzero values
retain their sign. There is no public demo/laboratory mode or synthetic scenario
bundle imported by this entry.

One list exposes purchase lots and retained opening records. Opening records
are marked as missing purchase detail and edited without inventing lots, unit
prices, fees or payment currency. Tab changes keep the editor mounted. Details
separate partial totals and disclose observation times plus dated, unverified
USD basis sources. Both analysis horizons remain decision-unavailable when
registered inputs are missing. No decision method or execution permission is added.

The v1 manual receive/save/restore controls and browser-only latest-price record
belong to the preceding internal workbench, not the current unified workflow.
Existing browser records are not silently migrated or added to personal holdings;
the workspace offers retained portfolio drafts as a recovery download. Internal
synthetic/file test workbenches are not sources for personal valuation.
`financialUseAllowed` remains false.

Historical explicit-receipt evidence is in the
[earlier September 17 review](../10-project-state/PERSONAL_MARKET_REVIEW_2026-09-17.md),
not proof of a new managed acquisition. Current release/live-check evidence belongs
to [CURRENT_STATE.md](../10-project-state/CURRENT_STATE.md) and its latest linked
review. Regression contracts include
[`personal-market-usd.test.mjs`](../../apps/web/tests/personal-market-usd.test.mjs)
and existing personal valuation tests. Implementation/synthetic-test success is
not actual-price receipt, owner acceptance or hosted readiness.
