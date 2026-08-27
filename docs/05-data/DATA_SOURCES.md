# Data Sources

**Source of truth for:** external market-data sources, their contracts, reliability,
and permitted product use. Source-selection rationale is recorded in ADR 0003.

## Active Integration Set

| ID | Provider | Coverage | Access and cadence | Timestamp / unit contract | Product use | Status |
|---|---|---|---|---|---|---|
| `navasan` | [Navasan](https://www.navasan.tech/api/) | Iranian 18k gold, mesghal, Emami coin, USD sell | Keyed JSON API. Free plan: 120 requests/month and two-hour updates; paid plans provide live updates. | Unix `timestamp`. The public guide does not state whether `value` is IRR or toman, so `NAVASAN_VALUE_UNIT=IRR|TOMAN` is mandatory and conversion is deterministic. | Primary candidate for the Phase 1 Iranian vertical slice after key and contract-unit confirmation. | Adapter implemented; inactive until server-side key and unit are configured. |
| `goldapi-io` | [GoldAPI.io](https://www.goldapi.io/) | XAU/USD and XAG/USD | Keyed HTTPS JSON. Sandbox quota is provider-plan dependent. | Provider Unix timestamp; USD per troy ounce. | Preferred primary global-metals feed. | Adapter implemented; inactive until `GOLD_API_TOKEN` is configured. |
| `xaus` | [XAUS](https://xaus.com/api/) | XAU/USD and XAG/USD | Public keyless JSON, approximately 30-second edge cache. | ISO-8601 UTC plus explicit `fresh` / `stale` / `unavailable` state. USD per troy ounce. | Informational local UI only. Never sufficient by itself for a recommendation, backtest, settlement, or execution. | Active browser fallback when reachable. |
| `gold-api-com` | [Gold-API.com](https://gold-api.com/docs) | XAU/USD and XAG/USD | Public keyless JSON. | ISO-8601 `updatedAt`; USD per troy ounce. | Secondary informational fallback only; provider terms disclaim accuracy and availability guarantees. | Server fallback implemented; current local Node network cannot reach it reliably. |
| `rahavard-manual` | [Rahavard 365](https://rahavard365.com/) | Iranian gold, coins, silver, free-market USD, XAU/USD, and XAG/USD | One owner-approved, read-only capture from the owner's signed-in browser tab. No cookie, credential, or automated scraper enters the application. | Raw Iranian values are retained as IRR and deterministically divided by 10 for display in toman. Page timestamps are stored when visible; otherwise `publishedAt=null` and freshness uses `collectedAt`. | Local personal preview and fresh portfolio valuation only. Never a recommendation, backtest, execution input, background feed, or redistribution source. | Snapshot captured 2026-08-25 and implemented under ADR 0004. It becomes stale after 60 minutes and does not refresh automatically. |
| `owner-local-csv` | Owner-operated local CSV | The six instruments accepted in ADR 0001 | Manual file/paste through the loopback-only Data Trust operator. On demand; one-megabyte request ceiling. | Versioned CSV schema with positive decimal strings and explicit UTC point-in-time fields. Currency/unit must match the registry. | Preview and eventual append-only local ingestion only. Manual quality cannot unlock financial decisions. | Preview active; commit locked until PostgreSQL is connected. |

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
- A quote is displayed only after positive-number, plausible-range, timestamp, future-
  time, and freshness checks.
- `publishedAt` and `collectedAt` are separately recorded in UTC.
- A stale or unavailable provider produces an explicit state, never a fabricated or
  silently reused number.
- IRR/toman conversion is impossible until the source contract explicitly declares the
  unit. This prevents a tenfold valuation error.
- Informational feeds cannot unlock recommendations or portfolio actions. Operational
  use requires a primary source, redundancy, historical point-in-time capture,
  backtesting, and walk-forward validation.

## Source Failure / No Single Point of Failure

The system must not depend on one provider. Iranian data currently has one inactive API
candidate plus one expiring manual snapshot and is therefore a known single-source risk.
Before operational analysis, add a licensed TGJU or equivalent independent cross-check
and define deterministic divergence/quarantine thresholds.

## Related Documents

- Field-level schema: `DATA_DICTIONARY.md`
- Ingestion mechanics: `DATA_PIPELINE.md`
- Validation rules: `DATA_QUALITY.md`
- Architectural data flow: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Decision record: `docs/08-decisions/ADR/0003-live-market-source-boundary.md`
- Manual snapshot decision: `docs/08-decisions/ADR/0004-rahavard-manual-snapshot.md`
