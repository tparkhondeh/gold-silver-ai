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

## Decision History Requirement

Every analysis or recommendation the system produces must be recorded: what was
analyzed, what inputs were used, what the output was, and when. This creates an
auditable trail so that:

- Past recommendations can be reviewed against what actually happened.
- Model or data changes over time are visible, not silently overwritten.
- The owner (or future maintainers) can reconstruct why a given recommendation was
  made.

## Decision Provenance

**Architecture requirement, established 2026-08-11. Not implemented in Phase 0.**
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
happened" to "exactly why, and against which version of everything."

**How this should eventually be implemented (not now):** each decision-producing
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

## Status

`STATUS: TBD` for storage format and retention of decision history, the internal
structure of the decision engine, and the concrete implementation of Decision
Provenance and the Assumption Registry (Tier B — see
`docs/10-project-state/OPEN_DECISIONS.md`). The *requirement* that these exist and
take this shape is fixed as of this document; only the implementation mechanics
are open. Deferred to the implementation phase that first produces a real
deterministic output.

## Related Documents

- AI/LLM boundary: `AI_ROLE.md`
- LLM / deterministic engine call chain and Financial Engine Contract:
  `docs/02-architecture/AI_ARCHITECTURE.md`
- What gets computed: `docs/03-market/BUBBLE_MODEL.md`, `docs/04-portfolio/`
- Agent layer that will present these decisions conversationally: `AGENT_ARCHITECTURE.md`
- Point-in-time data feeding Decision Provenance: `docs/02-architecture/DATA_ARCHITECTURE.md`
- Iran-specific hypotheses that become registry entries: `docs/03-market/IRAN_MARKET_MODEL.md`
