# Current State

**Source of truth for:** where the project stands right now.

_Last updated in the product calendar: ۱۴۰۵/۰۶/۰۴ (Phase 1 active)_

## Snapshot

- **Phase:** Phase 0 is owner-approved. Phase 1 — Data Foundation — is active.
- **Branch:** Phase 1 work is isolated on `codex/phase-1-data-ui`; `main` remains
  untouched pending a separate owner-approved merge.
- **Application:** a Persian RTL personal-wealth dashboard exists in `apps/web` with
  portfolio session entry with asset-specific units and purchase dates, market watch,
  deterministic per-holding and total profit/loss calculation, market watch,
  sortable holdings and market tables (numeric columns default descending), a compact
  asset workflow split into List, Asset Center, Analysis, and Decisions, risk/data readiness surfaces, and
  explicit source/freshness labels. The analysis workspace now separates summary,
  geopolitical, political/policy, macroeconomic, industry/supply-demand, technical,
  bubble/valuation, and portfolio/risk lenses across short- and long-term horizons.
  A deterministic, version-labelled multi-driver what-if engine reports per-holding
  and portfolio impacts, but its disclosed UI sensitivities are not calibrated or
  approved as forecasts. An opt-in, clearly labelled
  ten-position, cross-asset demo portfolio spans precious metals, currency, cash/deposit,
  equities, ETF, crypto, property, and private business. It supports realistic UI
  evaluation without presenting synthetic holdings or cost basis as user or market data.
  In demo mode, scenario
  presets, sample analytical states, portfolio weights, concentration, return display,
  and an adjustable stress test are interactive; each remains explicitly non-operational
  and synthetic. The UI uses a warm boho
  system of cream, pastel olive, natural gold, organic radii, and accessible contrast.
  The oversized overview slogan has been replaced by a compact command bar; card,
  table, panel, and guardrail spacing is tightened to reduce scrolling without hiding
  provenance or safety state. Every monetary UI output is paired as IRR and USD. The
  conversion rate comes from the labelled `USD_IRR` observation; demo portfolio values
  use an explicit synthetic rate, and a missing rate yields an unknown counterpart
  instead of a fabricated conversion.
- **Dashboard priority:** the first page now prioritizes the owner's portfolio and
  a high-importance opportunity surface. Market watch is removed from the overview
  and remains available through its own tab. Opportunity absence is explicit; only
  already-labelled demo opportunity notifications can appear as synthetic examples.
- **Information architecture:** selecting a holding carries its context into a
  three-column Asset Center (information, analysis readiness, decision readiness),
  the multi-lens analysis tab, and the dedicated per-asset decision tab. The overview
  retains only a compact decision brief so the daily dashboard stays scannable.
- **Assistant identity:** the owner-facing decision assistant is named **Asha / اشا**;
  Gold/Silver AI remains the repository and product identity.
- **Decision taxonomy:** the owner-approved UI separates homogeneous comparisons
  within an asset class, heterogeneous conversion comparisons across classes, and
  a best overall portfolio action. `DECISION_FRAMEWORK_UI_V1` deterministically
  reports readiness gates and currently fails closed; it does not rank targets or
  produce financial actions while methodology, owner constraints, Iranian history,
  backtesting, and walk-forward validation remain unresolved.
- **Bubble boundary:** for supported gram-based gold and silver holdings, the UI can
  compute a raw current metal-content premium only when the domestic quote, global
  ounce quote, and USD/IRR quote are all present and valid. Historical minimum,
  average, and maximum remain explicitly unavailable until Iranian point-in-time
  history and an owner-approved, backtested methodology exist. Coins are excluded
  from this interim calculation because their exact reference specification is not
  yet approved.
- **Calendar boundary:** all user-facing dates use the Persian calendar and Tehran
  time. New purchase dates are entered as Jalali `YYYY/MM/DD`. Provider timestamps and
  audit storage remain ISO-8601 UTC so ingestion, ordering, and provenance stay
  interoperable; they are converted only at the presentation boundary.
- **Notifications:** a session-local notification center detects severe moves only by
  comparing two newer, valid, same-unit observations within 24 hours. Instrument-specific
  thresholds are deterministic. Stale-data alerts fail closed. Opportunity alerts are
  available as clearly synthetic demo content only; real opportunity claims remain
  disabled until an approved, backtested, walk-forward-validated methodology exists.
- **Live data:** the normalized `/api/market` boundary supports keyed Navasan and
  GoldAPI.io adapters. XAUS is enabled as an informational browser fallback for global
  XAU/XAG. An owner-approved Rahavard browser capture supplies a local-only manual
  snapshot for 13 instruments; raw IRR provenance is retained, display values use an
  exact IRR/10 conversion, and every observation becomes stale after 60 minutes. It is
  not an automated feed and stale values are excluded from portfolio valuation. No
  fabricated market values are present.
  The official TGJU web-service/order path is exposed as a pending licensed source;
  no page scraping, credential reuse, hidden endpoint abuse, or third-party script
  injection is used.
- **Repository:** private GitHub origin is configured. Remote authentication and
  branch publication must be verified before claiming this branch is stored.
- **Decision record:** Phase 1 scope, wealth UI scope, live-source boundary, and the
  temporary Rahavard manual-snapshot boundary are in ADR 0001 through ADR 0004.

## Immediate Next Step

See `NEXT_TASK.md`.
