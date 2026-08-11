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

Nothing else has been completed. No data, no code, no technology choices.
