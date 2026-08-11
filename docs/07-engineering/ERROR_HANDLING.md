# Error Handling

**Source of truth for:** how the system handles failure. No code exists yet.

## Principles

1. **Fail visibly, not silently.** A data ingestion failure, validation failure,
   or calculation error is surfaced (logged, flagged) — never swallowed and
   presented as if nothing happened. Mirrors `docs/05-data/DATA_PIPELINE.md` §
   Failure Handling Requirement.
2. **Never substitute a guess for a real value on error.** If a calculation can't
   be completed correctly (e.g. due to missing data), the system reports that it
   can't, rather than returning a plausible-looking but fabricated result — this
   is the same anti-fabrication rule as `docs/06-ai/AI_ROLE.md`, applied to
   ordinary code paths too.
3. **Distinguish error types.** At minimum: data errors (bad/missing input),
   calculation errors (logic failure), and integration errors (external source
   unreachable) — so the right thing can be done about each.
4. **Errors are owner-legible where they surface to the owner.** Per
   `docs/00-governance/PROJECT_RULES.md` § 2, an error the owner sees should be
   explainable without assuming programming knowledge.

## Status

`STATUS: TBD` for concrete error-handling mechanisms, logging format, and
alerting — depends on the technology stack.

## Related Documents

- Data pipeline failure handling: `docs/05-data/DATA_PIPELINE.md`
- Data quality flags: `docs/05-data/DATA_QUALITY.md`
- Incident response (production-level failures): `docs/09-operations/INCIDENT_RESPONSE.md`
