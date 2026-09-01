# Data Sources

**Source of truth for:** external market-data sources, their contracts, reliability,
and permitted product use. Source-selection rationale is recorded in ADR 0003.

## Integration Set and Current Readiness

| ID | Provider | Coverage | Access and cadence | Timestamp / unit contract | Product use | Status |
|---|---|---|---|---|---|---|
| `navasan` | [Navasan](https://www.navasan.tech/api/) | Iranian 18k gold, mesghal, Emami, Azadi, half, quarter and gram coins, and USD sell | Keyed HTTPS `latest`, `dailyCurrency`, and `ohlcSearch` APIs. Free plan: 120 requests/month and three-month validity. The free cadence is at least 24,000 seconds (6h40m), at most 112 scheduled calls in 31 days; PostgreSQL separately enforces a 115-call rolling ceiling and five-call provider reserve. | Unix `timestamp`; decimal strings. The tested mapping uses direct toman values for 18k/USD and a thousand-toman scale for mesghal/coins; current, intraday, and OHLC paths share strict unit/range checks. | Intended primary Iranian display feed; history is local-operator-only and remains excluded from financial decisions until licensed backfill and validation pass. | ACTIVE LOCALLY: the replacement key remains outside chat/Git. On ۱۴۰۵/۰۶/۱۰ one owner-authorized live check returned all eight approved valid quotes. A development reload later revealed and consumed one extra reservation before the durable cooldown fix; the counter is now 4 used and 111 remaining. Historical adapters stay locked and no historical request or write was made. |
| `goldapi-io` | [GoldAPI.io](https://www.goldapi.io/) | XAU/USD and XAG/USD | Keyed HTTPS JSON. Official live path plus ordered daily history in inclusive chunks of at most 90 days. Sandbox currently advertises 100 calls/month. | Exact requested metal/currency, provider Unix seconds for live values, Gregorian date for daily history; USD per troy ounce. | Preferred primary global-metals feed. | Official live contract corrected and strict live/history adapters, 90-day plan-only chunking, gap audit and local Persian planner implemented. No token, paid call or historical request has been used. See `API_PURCHASE_READINESS_FA.md`. |
| `xaus` | [XAUS](https://xaus.com/api/) | XAU/USD and XAG/USD | Public keyless JSON, approximately 30-second edge cache. | ISO-8601 UTC plus explicit `fresh` / `stale` / `unavailable` state. USD per troy ounce. | Informational local UI only. Never sufficient by itself for a recommendation, backtest, settlement, or execution. | Active keyless display feed when reachable. |
| `gold-api-com` | [Gold-API.com](https://gold-api.com/docs) | XAU/USD and XAG/USD | Public keyless JSON. | ISO-8601 `updatedAt`; USD per troy ounce. | Independent informational cross-check and display fallback only; provider terms disclaim accuracy and availability guarantees. | Active keyless cross-check on every refresh; becomes the displayed fallback only if XAUS fails. |
| `rahavard-manual` | [Rahavard 365](https://rahavard365.com/) | Iranian gold, coins, silver, free-market USD, XAU/USD, and XAG/USD | One owner-approved, read-only capture from the owner's signed-in browser tab. No cookie, credential, or automated scraper enters the application. | Raw Iranian values are retained as IRR and deterministically divided by 10 for display in toman. Page timestamps are stored when visible; otherwise `publishedAt=null` and freshness uses `collectedAt`. | Local personal preview and fresh portfolio valuation only. Never a recommendation, backtest, execution input, background feed, or redistribution source. | Snapshot captured 2026-08-25 and implemented under ADR 0004. It becomes stale after 60 minutes and does not refresh automatically. |
| `owner-local-csv` | Owner-operated local CSV | The six instruments accepted in ADR 0001 | Manual file/paste through the loopback-only Data Trust operator. On demand; one-megabyte request ceiling. | Versioned CSV schema with positive decimal strings, exact Source-contract version and explicit UTC point-in-time fields. Currency/unit must match the registry. | Preview and append-only local ingestion only. Manual quality cannot unlock financial decisions. | Preview and guarded commit active on the owner-local PostgreSQL runtime; no real market observation has been committed. |

## Considered but Not Automated

- [TGJU's official web-service order path](https://www.tgju.org/form/api) and its
  documented display widgets have been verified. The widget is not treated as a
  normalized data API, and the project has no licensed API contract or token yet. A
  pending source card now links to the official request path. Public-page scraping,
  endpoint probing, credential/session reuse, and security-control bypass remain
  prohibited; ingestion requires written access terms, response documentation,
  declared IRR/toman units, and a server-side token.
- Direct LBMA benchmark data is the preferred future cross-check for settlement-grade
  gold benchmarks; licensing and redistribution terms must be reviewed before use.

## Non-Negotiable Source Controls

- API keys remain server-side and are never exposed through `NEXT_PUBLIC_*`, logs, Git,
  or browser responses.
- `apps/web/scripts/configure-market-apis.ps1` accepts Navasan and GoldAPI.io secrets
  through hidden terminal input and writes only to Git-ignored `.env.local`; it never
  obtains, prints, validates by leaking, or commits a provider credential.
- Navasan still requires `NAVASAN_KEY_ROTATION_CONFIRMED=true`; the owner completed
  replacement on ۱۴۰۵/۰۶/۰۹. The acknowledgement remains an operator declaration,
  not cryptographic vendor proof. Tests use dummy credentials and mocked responses.
- Every application request must first reserve one immutable PostgreSQL ledger row.
  Missing database/grants or a full 115-call rolling window fails closed before the
  network. This local count does not prove the provider's account counter, so five
  calls remain unused as safety headroom.
- Missing or invalid plan/cadence configuration falls back to the free policy. A free
  refresh faster than 24,000 seconds is raised automatically, preventing the former
  six-hour setting from exhausting a 31-day window. The same interval is enforced
  inside PostgreSQL, so a process restart or browser reload cannot bypass it. A
  single mutable status row keeps only the latest success/failure metadata and never
  stores provider payloads, prices, credentials, or market history. `/api/health`
  and the loopback Data Trust card expose only plan, cadence and aggregate used/
  remaining counts; no credential or raw provider response is returned.
- The manual snapshot remains expired and Navasan is still the only active Iranian
  primary feed. Independent licensed cross-checking and validated point-in-time
  history remain required before operational analysis.
- A quote is displayed only after positive-number, plausible-range, timestamp, future-
  time, and freshness checks.
- GoldAPI live responses must match the requested XAU/XAG and USD pair. Historical
  responses additionally must match the exact requested range, contain no undocumented
  fields, stay ordered and unique, and remain inside each 90-day chunk. Omitted dates
  are recorded as gaps with zero interpolation; daily rows deliberately retain
  `publishedAt=null` because a calendar date is not a point-in-time timestamp.
- `publishedAt` and `collectedAt` are separately recorded in UTC.
- A stale or unavailable provider produces an explicit state, never a fabricated or
  silently reused number.
- Duplicate instruments use deterministic precedence: valid before stale, primary
  before informational/manual, provider priority, then latest observation time. A
  valid keyed Navasan quote therefore supersedes a valid Rahavard manual duplicate.
- IRR/toman conversion is impossible until the source contract explicitly declares the
  unit. This prevents a tenfold valuation error.
- Informational feeds cannot unlock recommendations or portfolio actions. Operational
  use requires a primary source, redundancy, historical point-in-time capture,
  backtesting, and walk-forward validation.

## Source Failure / No Single Point of Failure

The system must not depend on one provider. Iranian data currently has one active keyed
API plus one expired manual snapshot and is therefore still a known single-source risk.
Before operational analysis, add a licensed TGJU or equivalent independent cross-check
and define deterministic divergence/quarantine thresholds.

## Related Documents

- Field-level schema: `DATA_DICTIONARY.md`
- Ingestion mechanics: `DATA_PIPELINE.md`
- Validation rules: `DATA_QUALITY.md`
- Future API purchase checklist: `API_PURCHASE_READINESS_FA.md`
- Architectural data flow: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Decision record: `docs/08-decisions/ADR/0003-live-market-source-boundary.md`
- Manual snapshot decision: `docs/08-decisions/ADR/0004-rahavard-manual-snapshot.md`
