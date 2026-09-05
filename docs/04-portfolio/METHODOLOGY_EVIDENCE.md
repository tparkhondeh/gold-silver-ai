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

`STATUS: TBD` for the real evidence entries. The next research unit must review and
record primary sources for the existing inverse-volatility, HRP and minimum-CVaR
comparison controls, including a currentness/supersession check. Recording those
sources still will not select or approve any method.

