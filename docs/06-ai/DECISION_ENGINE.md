# Decision Engine

**Source of truth for:** the requirement for a deterministic decision engine and
an auditable decision history. Not implemented in Phase 0.

## Requirement

The deterministic core that produces valuation, allocation, rotation, and risk
outputs (`docs/03-market/BUBBLE_MODEL.md`, `docs/04-portfolio/`) must:

- Be implemented in code, not inferred by an LLM (`AI_ROLE.md`).
- Be deterministic — the same inputs produce the same outputs, every time.
- Be traceable — every output can be explained by the specific inputs and logic
  that produced it.

Phase 1 includes `DECISION_FRAMEWORK_UI_V1`, a deterministic readiness-gate and
presentation shell for homogeneous, heterogeneous, and overall decision views.
It is not the financial decision engine: it does not rank assets, select targets,
set weights, or produce buy/sell/convert actions, and it fails closed while the
requirements below remain unimplemented.

## Full-experience simulation boundary

Phase 1 also includes the clearly labelled `ASHA_SANDBOX_DECISION_V1` experience
engine. It is the default in a fresh browser session so the complete product can be
evaluated immediately; an explicit switch returns that browser to personal mode.
It uses only the fixed `ASHA_SYNTHETIC_MARKET_V1` dataset and deterministic,
versioned demonstration rules to populate the market, analysis, scenario, risk,
homogeneous-decision, heterogeneous-decision, and overall-decision surfaces. Its
six displayed gates are UI fixtures, not evidence that real validation gates have
passed. Every sandbox surface is labelled as synthetic and non-operational,
`executionAllowed` is permanently `false`, and leaving the sandbox restores the
browser-session portfolio that was present before activation. The selected mode and
portfolio remain browser-session-local and are not synchronized across browsers.

The same boundary now provides `ASHA_SYNTHETIC_INTELLIGENCE_V1`: eight deterministic
analysis lenses calculated from a 90-observation synthetic price history, cost-basis
return, premium distance/range, multi-driver scenario impacts, asset risk, portfolio
weight, liquidity reserve, and concentration constraints. Short- and long-horizon
scores use disclosed weights and thresholds. Each selected asset exposes the numeric
score breakdown, best/worst scenario, homogeneous route, heterogeneous route, amount,
reason, and invalidation rule; the overall route is constrained by the cash target,
concentration cap, score ordering, and a maximum rotation size. Scenario loss beyond
the owner's tolerated drawdown forces a sandbox risk-reduction route even when
momentum is positive. The UI does not fabricate VaR, Sharpe, or statistical confidence
from this uncalibrated history. A separate 90-observation synthetic premium fixture
supports the gold, silver, and coin examples, and an in-browser CSV preview/commit exercise remains available. The CSV exercise
is intentionally memory-only: it demonstrates accepted, duplicate, and quarantined
rows without calling the persistence API or claiming that a database write occurred.

The sandbox must never be promoted into the real decision path, used as historical
evidence, represented as current market data, or connected to execution. The real
`DECISION_FRAMEWORK_UI_V1` gates continue to fail closed independently.

## Phase 2 independent laboratory boundary

ADR 0009 authorizes a separate Python laboratory for deterministic evaluation with
machine-verifiably synthetic fixtures only. It belongs to the Decision Engines layer
and does not import from, or run inside, the web interface or provider-ingestion path.

The first versioned contract must require:

- an explicit synthetic dataset identity and synthetic instrument namespace;
- ordered point-in-time availability fields that make look-ahead detectable;
- canonical fingerprints for exact replay;
- structured results with model, methodology, dataset, assumptions, and risk-state
  references; and
- permanent `evaluation_only`, financial-use-disabled, and execution-disabled flags.

Benchmark implementations inside the laboratory are comparison controls, not selected
financial methodology. They cannot produce a real recommendation, register a real
decision, call a provider, or unlock the Phase 1 financial-decision engine. Real-data
admission and any methodology promotion require a later owner-approved contract/ADR.
The first controls are a constant synthetic-cash path, period-rebalanced synthetic
1/N path, and an initially equal synthetic no-trade path. Their calculation rules are
documented with the isolated package; all permanently emit `no_decision` and exist
only to test point-in-time mechanics.
The laboratory also has a dataset-bound point-in-time synthetic return matrix. It
records carried-forward delayed observations explicitly and performs no fitting,
forecast, ranking or recommendation. Its train-only standardizer now fits population
z-score statistics solely from the training membership of one validated walk-forward
fold and binds the result to the exact dataset, matrix, plan and fold. It still emits
no forecast, ranking or recommendation. The corresponding transform applies those
frozen statistics to the complete test interval without refitting; its output remains
an evaluation-only feature artifact, not a score or decision.
The same train-only boundary now produces a deterministic population-covariance
matrix for synthetic returns. It records zero-variance paths and exact provenance but
does not choose a portfolio model. Inverse-volatility comparison weights and their
single- or multi-fold evaluations remain permanently no-decision; the multi-fold
report deliberately makes no aggregate performance claim.
The covariance output can also produce a train-only Pearson-correlation matrix for
non-zero-variance synthetic paths. Undefined zero-variance correlations are excluded
and disclosed, not silently replaced by invented values.

## Decision History Requirement

Every analysis or recommendation the system produces must be recorded: what was
analyzed, what inputs were used, what the output was, and when. This creates an
auditable trail so that:

- Past recommendations can be reviewed against what actually happened.
- Model or data changes over time are visible, not silently overwritten.
- The owner (or future maintainers) can reconstruct why a given recommendation was
  made.

## Decision Provenance

**Architecture requirement, established 2026-08-11. Storage foundation implemented
in Phase 1; no real decision engine is implemented.**
This section is a formal, binding reference — it is not to be deleted, only
superseded by an ADR if the project's traceability approach fundamentally changes.

Every future decision the system produces (a valuation read, an allocation
proposal, a rotation suggestion, a risk figure) must be reconstructable through an
unbroken chain:

```
Decision
  → Decision Version        (which run/edition of this specific decision)
  → Model Version            (which version of the underlying model, if any)
  → Methodology Version       (which version of the methodology/ADR it followed)
  → Input Dataset             (exact data snapshot used — see § Point-in-Time Data
                                requirement in docs/02-architecture/DATA_ARCHITECTURE.md)
  → Data Sources               (which provider(s), per docs/05-data/DATA_SOURCES.md)
  → Timestamp                  (when the decision was produced)
  → Assumptions                (which registry entries were in effect — see
                                 § Assumption Registry below)
  → Risk State                 (what risk context applied at decision time)
  → Decision Output            (the actual structured result)
```

**Why this is required:** without this chain, a past recommendation can't be
audited — if it turns out to have been wrong, there's no way to tell whether the
data was bad, the methodology was flawed, an assumption expired, or the model
changed. This directly extends the Decision History Requirement above from "what
happened" to "exactly why, and against which version of everything." Concretely,
the goal is **reproducibility**: given a past decision's provenance record, it
must be possible to re-run it against the same data, model version, methodology
version, and assumptions and get the same output — that reproducibility is what
"auditable" actually means here, not just "logged."

**Implementation boundary:** each future decision-producing
component should emit its output already attached to this chain (e.g. as
structured metadata alongside the result), not have provenance reconstructed after
the fact from logs. The exact storage mechanism is Tier B
(`docs/10-project-state/OPEN_DECISIONS.md` item B5/B6) — engineering-level, decided
when the first real decision engine is built.

## Assumption Registry

**Architecture requirement, established 2026-08-11. Not implemented in Phase 0.**

Every material financial or analytical assumption used anywhere in the system
(e.g. a lookback window, a currency-inflation adjustment, a liquidity discount, a
regime threshold) must be a registered, addressable entry — never a bare literal
buried inside code, a prompt, or a model's own reasoning. This is what makes an
assumption visible, reviewable, and swappable without a code archaeology exercise.

Required metadata per assumption, once the registry exists:

| Field | Purpose |
|---|---|
| Assumption ID | Stable identifier other records (e.g. Decision Provenance) can reference |
| Description | Plain-language statement of what's being assumed |
| Value | The actual assumed value |
| Unit | Unit the value is expressed in |
| Source | Where the assumption came from (research, an ADR, owner input) |
| Source Date | When that source was established |
| Confidence | How well-supported the assumption is |
| Valid From / Valid Until | The period this assumption is considered applicable |
| Status | e.g. active, expired, superseded |
| Version | So a later change produces a new version, not a silent overwrite |

**Why this is required:** it's the direct enforcement mechanism for the Iran-
calibration rule in `docs/03-market/IRAN_MARKET_MODEL.md` — every hypothesis listed
there becomes a registry entry once validated, with its own confidence and
validity window, rather than a permanent hard-coded belief.

## Operational Safety States

**Architecture requirement, established 2026-08-11. Not implemented in Phase 0.**
Once the decision engine and any future automation exist, the system must be able
to be in exactly one of these states, and the state must be checkable, not
implicit:

| State | Meaning |
|---|---|
| Automation On | Scheduled/automatic analysis and recommendation generation runs normally |
| Automation Paused | No new automatic runs; existing recommendations remain visible; resumes without data loss |
| Execution Disabled | (Once an execution capability exists — see `docs/06-ai/AI_ROLE.md` § Analysis → Recommendation → Approval → Execution) recommendations may still be produced, but nothing can be executed from them |
| Safe Mode | Triggered by a critical data failure or insufficient confidence — see below |

**Entering Safe Mode:** on a critical data-quality failure (e.g. a source
contradicts itself, required data is missing beyond an acceptable staleness
threshold — see `docs/05-data/DATA_QUALITY.md`) or when confidence in an input is
too low to trust, the system must:

1. Stop producing new recommendations (not produce one anyway on bad data).
2. Preserve the last known-good state (nothing already valid is lost or hidden).
3. Log the condition that triggered Safe Mode.
4. Raise an alert (`docs/09-operations/MONITORING.md`).

This is the same "fail visibly, never guess" principle as
`docs/07-engineering/ERROR_HANDLING.md`, applied specifically to the point where
a bad decision could otherwise reach the owner looking like a normal one.

## Status

`STATUS: PARTIAL`. Migration 0005 and the provenance repository implement immutable
Source, Dataset, Assumption, Feature, Model, Methodology, and evaluation-only Decision
version records, exact observation membership, point-in-time dataset cutoffs,
content/input/output fingerprints, risk state, and typed cross-version references.
The runtime account is read-only for these registries. Retention, operational state
transition governance, and the real deterministic engine remain `STATUS: TBD`; no
financial output has been registered or unlocked by this storage foundation.

## Related Documents

- AI/LLM boundary: `AI_ROLE.md`
- LLM / deterministic engine call chain and Financial Engine Contract:
  `docs/02-architecture/AI_ARCHITECTURE.md`
- What gets computed: `docs/03-market/BUBBLE_MODEL.md`, `docs/04-portfolio/`
- Agent layer that will present these decisions conversationally: `AGENT_ARCHITECTURE.md`
- Point-in-time data feeding Decision Provenance: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Iran-specific hypotheses that become registry entries: `docs/03-market/IRAN_MARKET_MODEL.md`
- Data conditions that trigger Safe Mode: `docs/05-data/DATA_QUALITY.md`
- Alerting for Safe Mode / Operational Safety States: `docs/09-operations/MONITORING.md`
- General fail-visibly principle: `docs/07-engineering/ERROR_HANDLING.md`
