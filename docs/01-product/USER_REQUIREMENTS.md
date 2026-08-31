# User Requirements

**Source of truth for:** who the system serves and what they specifically need from
it. This is distinct from `PRODUCT_SPECIFICATION.md` (the capability list) — this
document is about the user(s) driving those capabilities.

## Known

- The initial and primary user is the project owner.
- The next real release is owner-only. It has no public registration, customer
  accounts or invited-user access; any later multi-user expansion requires a new
  owner-critical decision. See `docs/08-decisions/ADR/0006-owner-only-real-release.md`.
- For that owner-only release, an external identity service may process only the
  minimum login identifiers and session evidence. Portfolio holdings, transactions,
  valuations, financial calculations and analyses must not be sent to that service.
  The exact provider remains unresolved. See
  `docs/08-decisions/ADR/0007-third-party-identity-boundary.md`.
- The owner has no programming background — see
  `docs/00-governance/PROJECT_RULES.md` § 2 for how technical material must be
  communicated.
- The owner's underlying need, as stated in the project mission, is to understand
  and make better decisions about gold/silver exposure in an Iranian market
  context — see `docs/01-product/PRODUCT_VISION.md`.
- For the current Persian web dashboard, the owner wants the first page centered on
  their own portfolio and only high-importance opportunities. Market watch remains
  available as a separate tab instead of occupying dashboard space.
- The asset workflow must remain minimal and predictable: a sortable asset list,
  asset-focused analysis, asset-focused decisions, and a separate combined
  **Asset Center** that shows the selected asset's information, analysis readiness,
  and decision readiness in one compact view. Selecting an asset must carry context
  between these views.
- Decision support must present three distinct views: a homogeneous comparison
  within the current asset's class, a heterogeneous conversion comparison across
  asset classes, and a best overall portfolio action that considers the combined
  conditions. This is an owner-approved output taxonomy, not an approved financial
  methodology or permission to produce operational recommendations.
- The owner has named the decision-support agent **Asha / اشا**. The product name
  remains Gold/Silver AI; Asha is the user-facing assistant identity.

## Unknown — `STATUS: TBD`

The following have not been specified by the owner and must not be assumed:

- **Interface language:** Persian, English, or both? `DECISION REQUIRED: YES`.
- **Access channel:** web app, desktop app, chat interface, report/document output,
  or some combination? `DECISION REQUIRED: YES`.
- **Update cadence expectations:** how often the owner expects data/analysis to
  refresh (real-time, daily, on-demand). `DECISION REQUIRED: YES`.
- **The owner's actual current portfolio composition and risk tolerance** — not
  needed until the portfolio-analysis phase, and even then, per
  `docs/00-governance/PROJECT_RULES.md` non-negotiable #4, not used operationally
  until the relevant models are validated.
- **Regulatory/compliance constraints** relevant to the owner's use of the system
  in Iran (if any). `DECISION REQUIRED: YES` if/when the system approaches
  operational use.

## How This Document Gets Filled In

These items are resolved through direct questions to the owner, presented using the
decision format in `docs/00-governance/PROJECT_RULES.md` § 2, at the point in the
roadmap (`ROADMAP.md`) where they first become blocking — not invented now for
completeness.
