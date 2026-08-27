# Completed

**Source of truth for:** what has actually been finished and (where applicable)
merged to `main`. This is a log, not a plan — see `docs/01-product/ROADMAP.md` for
what's ahead.

## Phase 0 — Foundation & Governance

**Status:** Complete on branch `phase-0-foundation`. **Not yet merged to `main`** —
pending owner review and approval per `docs/00-governance/QUALITY_GATES.md`.

Delivered:
- Git repository initialized; `main` (empty, stable) and `phase-0-foundation`
  (this work) branches established.
- `CLAUDE.md` — concise operating rules and source-of-truth index.
- `README.md`, `CHANGELOG.md`.
- Full documentation architecture under `docs/` (governance, product,
  architecture, market, portfolio, data, AI, engineering, decisions, operations,
  project state) — see `PHASE_0_AUDIT.md` for the complete file list.
- Governance: development workflow, quality gates, stability policy, change
  management, project rules.
- All known product/technical requirements from the project brief recorded as
  documented requirements (not implemented).
- All unresolved decisions explicitly marked and centralized in
  `OPEN_DECISIONS.md`.

**Pre-stability refinement pass (2026-08-11):**
- Split all open decisions into Tier A (Owner-Critical) / Tier B
  (Implementation/Engineering) per a new decision-tiering framework in
  `docs/00-governance/PROJECT_RULES.md` § 3.
- Fixed a contradiction this introduced in `CLAUDE.md` § 9 (it previously said
  any technology/vendor choice always stops for owner approval).
- Established Decision Provenance and the Assumption Registry as fixed
  architecture requirements in `docs/06-ai/DECISION_ENGINE.md`.
- Established Point-in-Time Data as a fixed architecture requirement in
  `docs/02-architecture/DATA_ARCHITECTURE.md`, with cross-references from
  `docs/03-market/HISTORICAL_ANALYSIS.md`, `docs/05-data/HISTORICAL_DATA.md`, and
  `docs/05-data/DATA_DICTIONARY.md`.
- Sharpened the LLM/Deterministic Engine boundary in
  `docs/02-architecture/AI_ARCHITECTURE.md` into an explicit call chain and
  Financial Engine Contract.
- Full details: `PHASE_0_AUDIT.md` refinement-pass addendum.

**Pre-Stable Foundation audit (2026-08-11):** final general-Foundation audit
across decision governance, architecture governance, data governance, financial
safety, engineering governance, long-term maintainability, Iran-specific
constraints, operational safety, and documentation architecture. Real gaps found
and fixed (all as edits to existing documents, no new files): reversibility
classification tied to decision tiering; a Breaking vs. Non-Breaking Architecture
& Contract Change cycle; a Component/Feature Lifecycle and New Capability
Checklist; Data Lineage and an explicit correction-provenance chain; an explicit
Quarantine state for flagged data; Schema Evolution rules; a No-Single-Point-of-
Failure requirement for data sources; explicit Iran operational constraints
(sanctions, IP/payment/licensing instability); an explicit Analysis →
Recommendation → Approval → Execution boundary; Operational Safety States
(Automation On/Paused, Execution Disabled, Safe Mode); a Dependency Registry
clarification; Environment Separation; and Backup Restore-testing + RPO/RTO
requirements. Full details: `PHASE_0_AUDIT.md` § 15.

## Phase 1 — Completed Units on the Working Branch

**Status:** completed units below are on `codex/phase-1-data-ui`, not merged to
`main` and not yet confirmed on the private remote.

- Accepted Phase 1 stack/scope, portfolio UI, source boundary, manual snapshot, and
  notification-safety decisions in ADR 0001–0005.
- Persian local application, portfolio/asset/analysis/decision workspaces, explicit
  demo mode, normalized read-only market boundary, and deterministic UI calculations.
- Data Foundation schema version 1 contracts, strict manual CSV ingestion,
  deterministic validation, idempotency, append-only quarantine design, PostgreSQL
  migration/repository, and isolated tests without loading market values.
- Loopback/same-origin CSV operator preview in the Persian Data Trust workspace,
  including accepted/duplicate/quarantine counts and an explicit persistence lock.
- Asha pastel-violet/matte-white visual token layer plus custom SVG mark and favicon.
- Category-first asset registration that narrows the asset-type selector while
  preserving all twenty supported portfolio asset types and their unit mappings.
- Expandable asset-category groups on the overview, with per-category valuation
  state and direct access to each holding's focused workspace.
- Optional Persian purchase-date calendar with month/year navigation, future-date
  blocking, today/clear actions, and no required typing.
- Bundled Vazirmatn variable font and a consistent Persian typography scale with no
  supporting UI text below 12px.
- Guarded PostgreSQL runtime adapter and preview-to-commit operator path with exact
  request-intent matching, loopback-only database configuration, atomic rollback,
  and idempotent repository delegation. A live database remains pending.
