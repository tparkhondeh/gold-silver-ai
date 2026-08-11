# Open Decisions

**Source of truth for:** every unresolved `STATUS: TBD` / `DECISION REQUIRED: YES`
item across the documentation, centralized so nothing gets lost inside an
individual file. See `docs/00-governance/CHANGE_MANAGEMENT.md` § 1. When a decision
here is resolved, update the source document and remove (don't just strike through)
the item here.

## Blocking for Phase 1 (data foundation is the likely first candidate — see `docs/01-product/ROADMAP.md`)

| # | Decision | Where it lives | Depends on |
|---|---|---|---|
| 1 | Final asset universe (which gold/silver instruments are in scope) | `docs/03-market/ASSET_UNIVERSE.md` | Owner input / market research |
| 2 | Data source(s) / vendor(s) selection | `docs/05-data/DATA_SOURCES.md` | #1 |
| 3 | Technology stack | `docs/02-architecture/SYSTEM_ARCHITECTURE.md` | Phase 1 scope |
| 4 | Data storage technology | `docs/02-architecture/DATA_ARCHITECTURE.md` | #3 |
| 5 | Data schema / dictionary | `docs/05-data/DATA_DICTIONARY.md` | #1, #2 |
| 6 | Data pipeline scheduling & manual-update tooling | `docs/05-data/DATA_PIPELINE.md` | #2, #3 |
| 7 | Data quality thresholds & anomaly-detection methodology | `docs/05-data/DATA_QUALITY.md` | #2 |
| 8 | Historical data storage format, retention, backfill approach | `docs/05-data/HISTORICAL_DATA.md` | #2, #4 |

## Blocking for User-Facing Design

| # | Decision | Where it lives |
|---|---|---|
| 9 | Single-user vs. multi-user | `docs/01-product/USER_REQUIREMENTS.md` |
| 10 | Interface language(s) | `docs/01-product/USER_REQUIREMENTS.md` |
| 11 | Access channel (web/desktop/chat/reports) | `docs/01-product/USER_REQUIREMENTS.md` |
| 12 | Update cadence expectations | `docs/01-product/USER_REQUIREMENTS.md` |
| 13 | Regulatory/compliance constraints in Iran | `docs/01-product/USER_REQUIREMENTS.md` |

## Blocking for Analytical Methodology (each needs Iran-specific validation, not just design — see `docs/03-market/IRAN_MARKET_MODEL.md`)

| # | Decision | Where it lives |
|---|---|---|
| 14 | Bubble/premium methodology (definitions, lookback windows, "comparable conditions") | `docs/03-market/BUBBLE_MODEL.md` |
| 15 | Market regime definitions & detection method | `docs/03-market/MARKET_REGIME.md` |
| 16 | Backtesting & walk-forward validation methodology | `docs/03-market/HISTORICAL_ANALYSIS.md` |
| 17 | Portfolio analysis methodology + owner's actual portfolio & constraints | `docs/04-portfolio/PORTFOLIO_MODEL.md` |
| 18 | Allocation engine methodology | `docs/04-portfolio/ALLOCATION_ENGINE.md` |
| 19 | Rotation engine methodology (thresholds, conviction communication) | `docs/04-portfolio/ROTATION_ENGINE.md` |
| 20 | Risk model methodology + owner's risk tolerance | `docs/04-portfolio/RISK_MODEL.md` |

## Blocking for AI Layer (depends on deterministic core existing first)

| # | Decision | Where it lives |
|---|---|---|
| 21 | AI framework / model provider / orchestration approach | `docs/02-architecture/AI_ARCHITECTURE.md`, `docs/06-ai/AGENT_ARCHITECTURE.md` |
| 22 | Decision-history storage format & retention | `docs/06-ai/DECISION_ENGINE.md` |
| 23 | Traceability enforcement mechanism (structured tool-calling, typed outputs, etc.) | `docs/02-architecture/AI_ARCHITECTURE.md` |

## Lower Priority / Later

| # | Decision | Where it lives |
|---|---|---|
| 24 | Security tooling, hosting, authentication | `docs/02-architecture/SECURITY_ARCHITECTURE.md` |
| 25 | Git hosting platform & branch-protection enforcement | `docs/00-governance/STABILITY_POLICY.md` |
| 26 | Tagging/versioning scheme | `docs/00-governance/STABILITY_POLICY.md` |
| 27 | Project license & dependency ecosystem | `docs/07-engineering/DEPENDENCY_POLICY.md` |
| 28 | Deployment target/approach | `docs/09-operations/DEPLOYMENT.md` |
| 29 | Monitoring tooling | `docs/09-operations/MONITORING.md` |
| 30 | Backup mechanism | `docs/09-operations/BACKUP.md` |
| 31 | Incident-response tooling | `docs/09-operations/INCIDENT_RESPONSE.md` |
| 32 | Coding standards specifics (formatting, linting, naming) | `docs/07-engineering/CODING_STANDARDS.md` |
| 33 | Phase 1 exact scope and timeline | `docs/01-product/ROADMAP.md` |

None of these were decided during Phase 0, by design — Phase 0's job was to
establish governance and record requirements, not to make product or technical
choices unilaterally (`docs/00-governance/PROJECT_RULES.md` § 3).
