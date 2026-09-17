# Personal portfolio current-market valuation

Owner-authorized local connection, 2026-09-17. Contract:
`asha.personal_market_valuation.v1`. This extends the existing
[purchase book](PURCHASE_LOTS.md), not the financial methodology or hosted access.

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
- Today's USD equivalent = current rial value ÷ fresh current rial/USD quote.
  This is neither historical USD purchase cost nor USD investment performance.

Sale fees, executable bid/ask spreads, taxes on disposal and unregistered cash
are not invented or included. Legacy recorded costs remain identifiable; they
do not prove complete landed fees. Partial cost-covered P&L, when shown in
details, uses the value and cost of exactly the same covered purchase subset.
Its denominator is not the cost or value of the entire asset/portfolio.

The known-price subtotal is explicitly separate from the full portfolio total.
Any unpriced holding makes the full current total unknown. Whole-portfolio P&L
also requires complete costs. Coverage is a count of priced assets, not a
percentage of portfolio value. Empty or unavailable values are not zero.

## Freshness, requests and persistence

Freshness retains the existing 60-minute technical TTL from source publication.
Future source/receipt timestamps cannot support current value. Reopening,
receiving or saving old data never advances publication time. Local clocks update
on the boundary, every 30 seconds, focus and visibility; these are not API polls.

Only an explicit button posts to the existing local `/api/market-test` route.
The key stays server-side. The request contains no purchase book or holdings.
Its existing shared durable quota, cooldown and local-only policy remain intact.
The client adds bounded responses, timeout, one in-flight action and safe errors.
Disabling the personal mode/unmounting aborts or discards obsolete results.

The free plan's declared two-hour refresh is not a live feed. The application's
conservative call cadence can leave periods with no fresh quote; it must display
that limitation rather than increase quota or silently extend TTL.

Only explicit save writes `asha.personal_latest_market.v1` under browser key
`asha-personal-latest-market-v1`. The latest-only record is bounded and validated;
Web Locks plus compare-and-swap prevent stale-tab overwrites. Corrupt/conflicting
storage is preserved and blocks writes pending explicit recovery. No history or
automatic price archive is created. Purchases retain their separate local
PostgreSQL save/restore boundary; prices are not synchronized across devices.

## Views and limits

Overview, portfolio, asset center, analysis and decision readiness consume this
same evaluation. Main numbers use at most one decimal with exact disclosure;
tiny nonzero values retain their sign and are not rendered as zero. Sorting,
group values and P&L colors use exact values. If a purchase cannot project safely
into an older Number-based view, that view is explicitly withheld while the exact
all-assets panel, purchase editor and persistence controls remain available.

Price-only market tables use their existing display adapter, not its Number
values for personal portfolio calculations. Generic feed data, synthetic prices,
synthetic scenario factors and historical price-notification storage are excluded
from personal valuation. Analytical inputs still missing (history, independent
cross-check, liquidity, execution costs, approved methodology/validation) are
reported, not fabricated. Existing synthetic exercises remain in the separate
laboratory. `financialUseAllowed` remains false.

Receipt and test evidence: [September 17 review](../10-project-state/PERSONAL_MARKET_REVIEW_2026-09-17.md).
