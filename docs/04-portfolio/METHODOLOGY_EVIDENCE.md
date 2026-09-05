# Methodology Evidence

**Source of truth for:** how candidate financial methods are researched and made
comparable before the owner is asked to choose one.

## Evidence order

The evidence process starts from primary material: peer-reviewed original research,
standards or regulatory guidance, and official method documentation. Blogs, marketing
pages, search summaries and LLM text may help locate a source, but cannot be the
authoritative evidence record.

Every accepted source record must preserve its stable identity, exact version, title,
authoring body, locator, publication/revision date, review date and whether a newer or
superseding source is known. The contract records this review; it cannot itself prove
that a human researcher classified the source correctly. That limitation remains
visible.

## Predeclared comparison boundary

The v1 machine-readable rubric is fixed before real evaluation. It asks for evidence
about source authority/currentness, mathematical replay, point-in-time integrity,
data sufficiency, Iran-specific validation, out-of-sample behavior, stress/regime
behavior, costs/liquidity/constraints, explainability/auditability and safe failure.
The exact fields live in the versioned JSON Schema under
`packages/financial-lab/schemas/v1`.

No score, criterion weight, pass threshold, ranking or winner exists yet. Defining
those values or selecting a financial method is a Tier-A owner decision and requires
an ADR. A strong synthetic result cannot establish real performance, and evidence
from another country cannot replace separate Iranian validation.

## Current status

The deterministic rubric and evidence-registry contracts are implemented only in the
isolated laboratory. They require a versioned source record, assumptions,
explainability, data requirements, Iran gaps, robustness requirements and one separate
evidence cell for every criterion. Canonical replay rejects omissions or attempts to
enable selection.

The first exact research registry now records these primary publications, reviewed on
2026-09-05:

| Laboratory control | Primary source | Exact limitation retained in the registry |
|---|---|---|
| HRP-style | [López de Prado, *Building Diversified Portfolios that Outperform Out-of-Sample*](https://doi.org/10.3905/jpm.2016.42.4.059) | The laboratory implements one explicit linkage/bisection variant, not every later extension |
| Inverse volatility | [Maillard, Roncalli & Teïletche, *The Properties of Equally Weighted Risk Contribution Portfolios*](https://doi.org/10.3905/jpm.2010.36.4.060) | Inverse volatility ignores correlations and is not full equal-risk contribution when correlations differ |
| Minimum CVaR | [Rockafellar & Uryasev, *Optimization of Conditional Value-at-Risk*](https://doi.org/10.21314/JOR.2000.038) | The bounded discrete grid tests mechanics; it is not the paper's full continuous optimizer |

`current_at_review_date` means the exact cited publication and locator were checked; it
does not mean the method is the newest or best. Later alternatives were not ranked.
The registry keeps Iranian data sufficiency, Iran-specific validation and real
cost/liquidity evidence explicitly `not_evaluated` for all three controls.

`STATUS: TBD` for a real method decision. Recording these sources does not select or
approve any method.
