# Data Sources

**Source of truth for:** which external data sources the system uses, their
reliability, and how they're tracked. No sources have been selected yet.

## Status

No external data provider, vendor, or API has been chosen. Per the project
instruction not to select data providers prematurely, this remains
`STATUS: TBD` — `DECISION REQUIRED: YES` until a data-foundation phase is scoped
and approved (`docs/01-product/ROADMAP.md`). Selection must go through the decision
format in `docs/00-governance/PROJECT_RULES.md` § 2 (what/why/options/pros/cons/
recommendation/risk), since source choice materially affects data quality and
therefore every downstream analysis.

## Required Metadata Per Source (once sources exist)

Every data source, once added, must have the following tracked — this is the
requirement; no source currently exists to populate it:

| Field | Purpose |
|---|---|
| Source name/identifier | Traceability |
| What it provides (instrument(s), fields) | Scope |
| Update frequency | Freshness expectations |
| Reliability/track record | Trust weighting |
| Access method (manual, API, file) | Pipeline design — see `DATA_PIPELINE.md` |
| Known limitations | Honest caveats, not hidden |
| Date added / date last verified | Governance |

## Selection Criteria (to apply when a source is actually proposed)

- Accuracy and track record for the Iranian market specifically.
- Update frequency matching the system's needs.
- Transparency about methodology (can we tell how their number is derived?).
- Cost and terms of use.
- Redundancy potential (can it be cross-checked against another source?).

## Related Documents

- Field-level schema: `DATA_DICTIONARY.md`
- Ingestion mechanics: `DATA_PIPELINE.md`
- Validation rules: `DATA_QUALITY.md`
- Architectural data flow: `docs/02-architecture/DATA_ARCHITECTURE.md`
