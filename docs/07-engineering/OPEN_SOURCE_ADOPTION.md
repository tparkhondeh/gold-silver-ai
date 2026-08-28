# Open-Source Adoption Review

**Source of truth for:** which same-concept public projects were evaluated and
what may be reused safely while project license decision A18 remains open.

_Reviewed: ۱۴۰۵/۰۶/۰۶_

## Decision Rule

Until A18 is resolved, do not copy source code from another product into this
private repository. Architectural ideas may be reimplemented independently;
runtime packages or GitHub actions may be adopted only when their license,
version, purpose, and verification boundary are explicit.

## Evaluated Projects

| Project | License observed | Useful pattern | Decision |
| --- | --- | --- | --- |
| [OpenBB](https://github.com/OpenBB-finance/OpenBB) | AGPL-3.0 | provider adapters and connect-once data boundaries | concept only; no code copied |
| [Ghostfolio](https://github.com/ghostfolio/ghostfolio) | AGPL-3.0 | explicit self-hosting, account/persistence, and provider configuration boundaries | concept only; no code copied |
| [Microsoft Qlib](https://github.com/microsoft/qlib) | MIT | point-in-time research data and reproducible experiment discipline | deferred; Python research stack and datasets do not match this Phase 1 slice |
| [AI Hedge Fund](https://github.com/virattt/ai-hedge-fund) | MIT | pluggable research lenses and backtesting separation | recommendation engine rejected; upstream identifies itself as educational, not real trading |
| [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) | Apache-2.0 with attribution requirements | performant financial time-series visualization | deferred until licensed historical series and an attribution plan exist |
| [TanStack Table](https://github.com/TanStack/table) | MIT | headless sorting/table state | deferred; current small tables already sort deterministically without another dependency |
| [GitHub checkout/setup-node actions](https://github.com/actions) | MIT | reproducible CI quality gate | adopted in `.github/workflows/phase1-quality.yml` |

## Implemented From the Review

- A machine-readable `/api/health` readiness surface that separates web uptime,
  provider configuration, persistence, scenario status, and financial-decision status.
- A visible engine-readiness panel in Data Trust; it never equates an available UI
  with an operational financial engine.
- A session-local owner constraint profile so the owner can explicitly provide the
  decision inputs already required by the six-gate framework.
- A read-only GitHub Actions quality workflow covering locked install, lint,
  typecheck, build, tests, and production dependency audit.
- Response security headers applied at the Worker boundary.

All implementation above is original to Asha. No source from the evaluated financial
products was copied, vendored, or translated.
