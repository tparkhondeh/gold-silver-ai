# Open Decisions

**Source of truth for:** every unresolved `STATUS: TBD` / `DECISION REQUIRED: YES`
item across the documentation, centralized so nothing gets lost inside an
individual file. See `docs/00-governance/CHANGE_MANAGEMENT.md` § 1. When a decision
here is resolved, update the source document and remove (don't just strike through)
the item here.

Every item below is classified into one of the two tiers defined in
`docs/00-governance/PROJECT_RULES.md` § 3. This document applies that
classification; it does not redefine it — if the tiering criteria themselves ever
need to change, that's an edit to `PROJECT_RULES.md` § 3, not here.

## A) Owner-Critical Decisions

Decision owner for every item in this section: **the project owner**, presented
using the format in `docs/00-governance/PROJECT_RULES.md` § 2 (what/why/options/
pros/cons/recommendation/risk). Claude Code may still research and prepare a
recommendation ahead of time — Tier A means the *final call* is the owner's, not
that the owner has to start from a blank page.

| # | Decision | Detail Doc | Why This Is Owner-Critical | Blocks Phase 1? | Decide By | Status |
|---|---|---|---|---|---|---|
| A1 | Final asset universe (which gold/silver instruments are in scope) | `docs/03-market/ASSET_UNIVERSE.md` | Defines product scope against the owner's real financial interests | Yes | Before Phase 1 data work begins | Open |
| A2 | Data source(s) / vendor(s) selection | `docs/05-data/DATA_SOURCES.md` | Cost, trust, and legal terms of use; every downstream number depends on this | Partially — the Phase 1 adapter set is accepted in ADR 0003; Iranian unit/credentials and licensed redundancy remain open | Before operational analysis | Partially resolved |
| A3 | Foundational technology stack (primary language/runtime, overall architecture pattern) | `docs/02-architecture/SYSTEM_ARCHITECTURE.md` | Foundational and hard to reverse for a multi-year system; real long-term maintainability/hiring impact | Yes | Before Phase 1 implementation starts | Open |
| A4 | Data storage technology/paradigm | `docs/02-architecture/DATA_ARCHITECTURE.md` | Foundational infrastructure choice, hard to reverse once historical data accumulates | Yes | Before Phase 1 implementation starts | Open |
| A5 | Single-user vs. multi-user | `docs/01-product/USER_REQUIREMENTS.md` | Shapes access control and data-isolation architecture long-term | No | Before interface/access-layer design | Open |
| A6 | Interface language(s) | `docs/01-product/USER_REQUIREMENTS.md` | Owner-facing product decision — likely a quick confirmation (Persian-first is the evident default) rather than a heavy trade-off, but still the owner's call | No | Before interface design | Open |
| A7 | Access channel (web/desktop/chat/reports) | `docs/01-product/USER_REQUIREMENTS.md` | Significant product/architecture decision with long-term consequences | No | Before interface design | Open |
| A8 | Update cadence expectations | `docs/01-product/USER_REQUIREMENTS.md` | This is literally the owner's own preference — only they can state it | No | Before Phase 1 pipeline design finalizes | Open |
| A9 | Regulatory/compliance constraints in Iran | `docs/01-product/USER_REQUIREMENTS.md` | Legal risk; only the owner (or their counsel) can determine this | Partially — only if a chosen data source raises a compliance question | Before operational use; sooner if source selection raises it | Open |
| A10 | Bubble/premium methodology (definitions, lookback windows, "comparable conditions") | `docs/03-market/BUBBLE_MODEL.md` | Financial methodology — non-negotiable owner approval + ADR per `PROJECT_RULES.md` § 3 | No | Design step of the bubble-analysis phase | Open |
| A11 | Market regime definitions & detection method | `docs/03-market/MARKET_REGIME.md` | Financial methodology | No | Design step of the regime-analysis phase | Open |
| A12 | Backtesting & walk-forward validation methodology | `docs/03-market/HISTORICAL_ANALYSIS.md` | Financial methodology; also gates when any model is allowed to go operational | No — general point-in-time data capture (see `docs/02-architecture/DATA_ARCHITECTURE.md` § Point-in-Time Data) is now a standing architecture requirement independent of this decision, so Phase 1 doesn't need this resolved first | Design step of the first backtested model | Open |
| A13 | Portfolio analysis methodology + owner's actual portfolio & constraints | `docs/04-portfolio/PORTFOLIO_MODEL.md` | Financial methodology; also requires the owner's real holdings/constraints, which only they can supply | No | Design step of the portfolio-analysis phase | Open |
| A14 | Allocation engine methodology | `docs/04-portfolio/ALLOCATION_ENGINE.md` | Financial methodology | No | Design step of the allocation phase | Open |
| A15 | Rotation engine methodology (homogeneous/heterogeneous/overall output taxonomy approved; target selection, thresholds, and conviction rules unresolved) | `docs/04-portfolio/ROTATION_ENGINE.md` | Financial methodology | No | Design step of the rotation phase | Partially resolved |
| A16 | Risk model methodology + owner's risk tolerance | `docs/04-portfolio/RISK_MODEL.md` | Financial methodology; risk tolerance is inherently the owner's own input | No | Design step of the risk-model phase | Open |
| A17 | AI framework / model provider / orchestration approach | `docs/02-architecture/AI_ARCHITECTURE.md`, `docs/06-ai/AGENT_ARCHITECTURE.md` | Cost, vendor lock-in, and — critically — the owner's real portfolio/financial data would be sent to whichever provider is chosen | No | Design step of the agent-layer phase | Open |
| A18 | Project license & IP posture | `docs/07-engineering/DEPENDENCY_POLICY.md` | Legal/IP decision for the owner's proprietary financial system | No | Before any external code sharing or dependency ecosystem is finalized | Open |
| A19 | Phase 1 exact scope and timeline | `docs/01-product/ROADMAP.md` | Starting any phase requires explicit owner approval per `docs/00-governance/STABILITY_POLICY.md` | Yes, by definition | Immediately after Phase 0 is approved | Open |

## B) Implementation / Engineering Decisions

Decision owner for every item in this section: **Claude Code**, deciding directly
with a documented rationale per the Tier B criteria in
`docs/00-governance/PROJECT_RULES.md` § 3 (standards, performance, maintainability,
security, cost, Iran-specific constraints, token efficiency, long-term
scalability). Escalated to Tier A only if a serious architectural or risk impact
is discovered. None of these block owner approval of Phase 0 or of Phase 1's scope.

| # | Decision | Detail Doc | Basis for Claude's Call | Blocks Phase 1? | Decide By | Status |
|---|---|---|---|---|---|---|
| B1 | Data schema / dictionary | `docs/05-data/DATA_DICTIONARY.md` | Standard schema design once A1/A2 are resolved; must include the point-in-time fields required by `docs/02-architecture/DATA_ARCHITECTURE.md` § Point-in-Time Data | No — resolved within Phase 1 design, once A1/A2 land | Phase 1 design step | Open |
| B2 | Data pipeline scheduling & manual-update tooling | `docs/05-data/DATA_PIPELINE.md` | Standard ingestion-engineering practice once A2/A3 are set | No | Phase 1 design step | Open |
| B3 | Data quality thresholds & anomaly-detection methodology | `docs/05-data/DATA_QUALITY.md` | Standard statistical/data-hygiene practice; escalate if a threshold choice would materially change what counts as valid financial data | No | Phase 1 design step | Open |
| B4 | Historical data storage format, retention, backfill approach | `docs/05-data/HISTORICAL_DATA.md` | Follows the integrity principles already fixed in `docs/02-architecture/DATA_ARCHITECTURE.md`; escalate if a source's licensing restricts backfill | No | Phase 1 design step | Open |
| B5 | Decision-history storage format & retention | `docs/06-ai/DECISION_ENGINE.md` | Standard audit-log engineering practice | No | Design step that first produces a deterministic output | Open |
| B6 | Traceability/provenance enforcement mechanism (structured tool-calling, typed outputs, validation layer) | `docs/02-architecture/AI_ARCHITECTURE.md`, `docs/06-ai/DECISION_ENGINE.md` § Decision Provenance | Implementation of an already-fixed architecture requirement (the provenance chain itself is not optional — see § Decision Provenance) | No | Design step of the agent-layer phase | Open |
| B7 | Security tooling, hosting, authentication mechanics | `docs/02-architecture/SECURITY_ARCHITECTURE.md` | Standard security engineering practice; escalate if it involves handling real user credentials or PII beyond baseline secret hygiene | Partially — baseline secret handling should exist by Phase 1, full auth system is not needed yet | As needed, baseline by Phase 1 | Open |
| B8 | Git hosting platform & branch-protection enforcement | `docs/00-governance/STABILITY_POLICY.md` | Low-risk, reversible infrastructure choice | No | When a remote is actually set up | Open |
| B9 | Tagging/versioning scheme | `docs/00-governance/STABILITY_POLICY.md` | Standard practice (e.g. semantic versioning); easily changed later | No | First tag-worthy milestone | Open |
| B10 | Deployment target/approach | `docs/09-operations/DEPLOYMENT.md` | Standard practice once A3/A4 are set; escalate if it implies a recurring cost commitment | No | Before first deployment | Open |
| B11 | Monitoring tooling | `docs/09-operations/MONITORING.md` | Standard observability practice | No | Before first deployment | Open |
| B12 | Backup mechanism | `docs/09-operations/BACKUP.md` | Standard practice once A4 is set (append-only, offsite copy) | No | Once real data exists | Open |
| B13 | Incident-response tooling | `docs/09-operations/INCIDENT_RESPONSE.md` | Standard practice | No | Before first deployment | Open |
| B14 | Coding standards specifics (formatting, linting, naming) | `docs/07-engineering/CODING_STANDARDS.md` | Purely engineering convention, easily changed | No | Once A3 (stack) is set | Open |

## Why This Split Matters

Per the project owner's explicit instruction (2026-08-11), no unnecessary decision
should stop the owner — Tier B exists so routine, reversible, standards-driven
choices don't require a full options/pros/cons review. Tier A stays deliberately
conservative: anything foundational, hard to reverse, financially consequential,
or legally/product significant still requires the owner's explicit sign-off.

None of these were decided during Phase 0 itself — Phase 0's job was governance and
requirements, not making Tier A calls unilaterally. Several Tier B items describe
*how* Claude Code will decide once their inputs exist, not a decision made now.
