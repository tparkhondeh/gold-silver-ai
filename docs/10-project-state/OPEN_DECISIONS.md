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
| A1 | Final asset universe (ADR 0001 fixes the initial Phase 1 registry; later expansion remains open) | `docs/03-market/ASSET_UNIVERSE.md` | Defines product scope against the owner's real financial interests | No for the accepted slice | Before later expansion | Partially resolved |
| A2 | Data source(s) / vendor(s) selection | `docs/05-data/DATA_SOURCES.md` | Cost, trust, and legal terms of use; every downstream number depends on this | Partially — the Phase 1 adapter set is accepted in ADR 0003; Iranian unit/credentials and licensed redundancy remain open | Before operational analysis | Partially resolved |
| A3 | Foundational technology stack | `docs/02-architecture/SYSTEM_ARCHITECTURE.md` | Foundational and hard to reverse | No | Accepted in ADR 0001 | Resolved for Phase 1: TypeScript/React server-rendered web boundary |
| A4 | Data storage technology/paradigm | `docs/02-architecture/DATA_ARCHITECTURE.md` | Foundational infrastructure choice | No | Accepted in ADR 0001 | Resolved for Phase 1: PostgreSQL behind repositories |
| A5 | Single-user vs. multi-user (owner-only initial product accepted; future expansion open) | `docs/01-product/USER_REQUIREMENTS.md` | Shapes access control and isolation | No for local Phase 1 | Before multi-user work | Partially resolved |
| A6 | Interface language(s) (Persian-first accepted for Phase 1) | `docs/01-product/USER_REQUIREMENTS.md` | Owner-facing product decision | No | Before multilingual expansion | Partially resolved |
| A7 | Access channel (browser-based local web accepted for Phase 1) | `docs/01-product/USER_REQUIREMENTS.md` | Significant product/architecture decision | No | Before adding another channel | Partially resolved |
| A8 | Update cadence (on-demand accepted until a source contract defines cadence) | `docs/01-product/USER_REQUIREMENTS.md` | Owner preference and provider constraint | No for current slice | Before scheduled ingestion | Partially resolved |
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
| A19 | Phase 1 exact scope | `docs/01-product/ROADMAP.md` | Starting a phase requires explicit owner approval | No | Accepted in ADR 0001 | Resolved |

## B) Implementation / Engineering Decisions

Decision owner for every item in this section: **Claude Code**, deciding directly
with a documented rationale per the Tier B criteria in
`docs/00-governance/PROJECT_RULES.md` § 3 (standards, performance, maintainability,
security, cost, Iran-specific constraints, token efficiency, long-term
scalability). Escalated to Tier A only if a serious architectural or risk impact
is discovered. None of these block owner approval of Phase 0 or of Phase 1's scope.

| # | Decision | Detail Doc | Basis for Claude's Call | Blocks Phase 1? | Decide By | Status |
|---|---|---|---|---|---|---|
| B1 | Data schema / dictionary | `docs/05-data/DATA_DICTIONARY.md` | Point-in-time, provenance, quarantine, and schema evolution | No | Schema version 1 implemented | Resolved for first slice |
| B2 | Data pipeline scheduling & manual-update tooling | `docs/05-data/DATA_PIPELINE.md` | Standard ingestion-engineering practice | No | Manual CSV core and protected preview UI implemented; PostgreSQL commit/scheduling pending | Partially resolved |
| B3 | Data quality thresholds & anomaly-detection methodology | `docs/05-data/DATA_QUALITY.md` | Standard statistical/data-hygiene practice | No | Structural validation implemented; empirical thresholds pending | Partially resolved |
| B4 | Historical data storage format, retention, backfill approach | `docs/05-data/HISTORICAL_DATA.md` | Append-only PostgreSQL point-in-time records accepted; retention/backfill may be license-bound | No | Before backfill | Partially resolved |
| B5 | Decision-history storage format & retention | `docs/06-ai/DECISION_ENGINE.md` | Standard audit-log engineering practice | No | Immutable versioned storage implemented; retention pending | Partially resolved |
| B6 | Traceability/provenance enforcement mechanism (structured tool-calling, typed outputs, validation layer) | `docs/02-architecture/AI_ARCHITECTURE.md`, `docs/06-ai/DECISION_ENGINE.md` § Decision Provenance | Implementation of an already-fixed architecture requirement (the provenance chain itself is not optional — see § Decision Provenance) | No | Typed database chain implemented; engine/tool enforcement pending | Partially resolved |
| B7 | Security tooling, hosting, authentication mechanics | `docs/02-architecture/SECURITY_ARCHITECTURE.md`, `docs/02-architecture/IDENTITY_RECOMMENDATION.md` | Mechanics are Tier B; production access model/provider is escalated to Tier A because it handles real identity/financial data and may add cost or lock-in | Preliminary official pricing/terms review recorded; owner must approve audience, third-party handling and provider after written Iran-access confirmation | Before production persistence | DECISION REQUIRED: YES |
| B8 | Git hosting platform & branch-protection enforcement | `docs/00-governance/STABILITY_POLICY.md` | Private GitHub chosen; authentication/publication and protection verification remain | No | Before merge | Partially resolved |
| B9 | Tagging/versioning scheme | `docs/00-governance/STABILITY_POLICY.md` | Standard practice (e.g. semantic versioning); easily changed later | No | First tag-worthy milestone | Open |
| B10 | Deployment target/approach | `docs/09-operations/DEPLOYMENT.md` | Standard practice once A3/A4 are set; escalate if it implies a recurring cost commitment | No | Public Sites review target selected; stable/persistent deployment still pending | Partially resolved |
| B11 | Monitoring tooling | `docs/09-operations/MONITORING.md` | Standard observability practice | No | Before first deployment | Open |
| B12 | Backup mechanism | `docs/09-operations/BACKUP.md` | Standard practice once A4 is set (append-only, offsite copy) | No | Once real data exists | Open |
| B13 | Incident-response tooling | `docs/09-operations/INCIDENT_RESPONSE.md` | Standard practice | No | Before first deployment | Open |
| B14 | Coding standards specifics | `docs/07-engineering/CODING_STANDARDS.md` | TypeScript strict mode, ESLint, typecheck, and Node tests active; formatter/coverage target pending | No | Before CI | Partially resolved |

## Why This Split Matters

Per the project owner's explicit instruction (2026-08-11), no unnecessary decision
should stop the owner — Tier B exists so routine, reversible, standards-driven
choices don't require a full options/pros/cons review. Tier A stays deliberately
conservative: anything foundational, hard to reverse, financially consequential,
or legally/product significant still requires the owner's explicit sign-off.

None of these were decided during Phase 0 itself — Phase 0's job was governance and
requirements, not making Tier A calls unilaterally. Several Tier B items describe
*how* Claude Code will decide once their inputs exist, not a decision made now.
