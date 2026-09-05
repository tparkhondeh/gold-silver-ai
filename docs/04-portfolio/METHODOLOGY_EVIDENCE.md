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

The versioned evidence-gap report now projects those exact records into 30 separate
method/criterion cells. Each cell shows `documented`, `synthetic_only` or
`not_evaluated`, the evidence references, retained limitations and explicit unresolved
requirements. It also carries each method's data needs, Iranian gaps, robustness checks
and known failure modes without producing a completeness score, rank or selection.
Its machine-readable schema and canonical fingerprint make omissions or resealed
changes fail closed.

A separate research-candidate intake contract now governs how newer methods may be
added for study. It requires a dated, manually recorded search, human review, at least
one authoritative source that is not superseded, a narrow mechanism/comparison scope,
explicit non-equivalence limits and ten untouched evidence-gap cells. Marketing pages
cannot qualify as sources. A listed candidate remains unimplemented, untested for
Iran, unranked and ineligible for selection; the contract performs no network search
and is not connected to application runtime.

The first bounded discovery record was reviewed on 2026-09-05 and preserves four
primary-publication candidates without calling any of them best or complete:

| Research-only candidate | Primary publication | Boundary retained now |
|---|---|---|
| HCAA | [Raffinot, *Hierarchical Clustering-Based Asset Allocation*](https://doi.org/10.3905/jpm.2018.44.2.089) | Not the existing HRP control; foreign evidence is not Iranian validation |
| Generalized risk parity with ADMM | [Costa & Kwon, *Generalized risk parity portfolio optimization: an ADMM approach*](https://doi.org/10.1007/s10898-020-00915-x) | Expected returns, bounds, uncertainty and short-selling rules are undecided |
| Wasserstein robust mean-variance | [Blanchet, Chen & Zhou, *Distributionally Robust Mean-Variance Portfolio Selection with Wasserstein Distances*](https://doi.org/10.1287/mnsc.2021.4155) | Target return, ambiguity radius, constraints and estimation are undecided |
| Fast HRP | [Salas-Molina & Nin, *Fast hierarchical risk parity methods for portfolio selection*](https://doi.org/10.1007/s10479-026-07149-2) | Not the existing single-linkage HRP control; speed may not matter for this small universe |

This was a bounded 2017–2026 search, not an exhaustive proof of the newest or most
effective method. Publication identifiers are recorded, but post-review supersession
monitoring remains required. All four candidates are `not_implemented`; their 36
non-source evidence cells remain `not_evaluated`. No performance comparison, score,
rank, selection, Iran-fitness claim or runtime integration exists.

`STATUS: TBD` for a real method decision. Recording these sources does not select or
approve any method.
