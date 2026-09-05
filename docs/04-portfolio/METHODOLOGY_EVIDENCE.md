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

The original rubric deliberately contained no score or winner. On 2026-09-05 the
owner explicitly authorized a separate **laboratory-only** method selection. ADR 0010
therefore fixes ten engineering-fit criteria at equal 10% weights before looking at
synthetic comparison results. The 0/1/2 scores mean poor/partial/strong engineering
fit; they are not financial-performance scores. A strong synthetic result still
cannot establish real performance, and evidence from another country cannot replace
separate Iranian validation.

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

## Dated method comparison and laboratory selection

All sources below were checked on **2026-09-05**. The table summarizes the exact
machine-readable selection record; detailed assumptions, limitations and links are
also fingerprinted in `asha.synthetic.methodology_selection.v1`.

| Method | Primary source / year | Assumption and suitable use | Strength | Weakness / Iran boundary | Engineering fit (0–2) |
|---|---|---|---|---|---:|
| Equal weight 1/N | [DeMiguel, Garlappi & Uppal, 2009](https://doi.org/10.1093/rfs/hhm075) | Use as the indispensable low-estimation benchmark, especially with short samples | simplest and hard to overfit | ignores risk, valuation and costs; foreign evidence | 1.6 |
| Inverse volatility | [Maillard, Roncalli & Teïletche, 2010](https://doi.org/10.3905/jpm.2010.36.4.060) | useful when volatility is measurable and a simple risk scale is wanted | transparent, cheap | ignores correlation and has no native cost/valuation rule | 1.5 |
| HRP | [López de Prado, 2016](https://doi.org/10.3905/jpm.2016.42.4.059); [Trucios, 2026](https://doi.org/10.1007/s00181-026-02900-x) | enough history exists to estimate stable dependence and cluster choices are validated | no covariance inversion | tree/linkage choices add instability and explanation cost | 1.1 |
| Minimum-CVaR | [Rockafellar & Uryasev, 2000](https://doi.org/10.21314/JOR.2000.038); [BCBS, 2019](https://www.bis.org/bcbs/publ/d457.htm) | adequate tail samples and explicit loss/constraint choices exist | tail loss is explicit | data hungry; tail probability and optimizer can overfit | 0.9 |
| HCAA | [Raffinot, 2018](https://doi.org/10.3905/jpm.2018.44.2.089) | cluster allocation variants are being compared | separates within/across clusters | no native transaction-cost action and not yet implemented | 1.1 |
| Generalized risk parity | [Costa & Kwon, 2020](https://doi.org/10.1007/s10898-020-00915-x) | rich data and a reviewed solver justify joint return/risk/uncertainty objectives | flexible constraints | fragile expected-return inputs and higher solver complexity | 1.0 |
| Wasserstein robust mean-variance | [Blanchet, Chen & Zhou, 2022](https://doi.org/10.1287/mnsc.2021.4155) | ambiguity radius and return target can be calibrated independently | uncertainty is explicit | harder to explain; data-dependent radius and solver needed | 1.0 |
| Fast HRP | [Salas-Molina & Nin, 2026](https://doi.org/10.1007/s10479-026-07149-2) | very large universes make HRP speed a genuine bottleneck | lower large-universe computation | speed benefit is immaterial for this small universe | 1.2 |
| Transparent guarded factor-to-target v1 | supporting sources below; new synthesis, 2026 | owner prioritizes a hand-checkable proposal while final Iran calibration is unavailable | eight visible equal factors plus cash/cap/turnover/no-trade rules | not a published standalone strategy; every band needs Iran validation | **1.9** |

The selected laboratory proposal is
`ASHA_TRANSPARENT_GUARDED_DECISION_V1`. It was selected before and independently of
synthetic returns because it had the highest predeclared engineering-fit score. This
does **not** claim the best return, current-best research, fitness for Iran or
production approval.

## Evidence behind the eight factors

- Trend is an explicitly testable input, not a promise of predictability. The positive
  baseline is [Moskowitz, Ooi & Pedersen (2012)](https://doi.org/10.1016/j.jfineco.2011.11.003),
  while [Kim, Tse & Wald (2016)](https://doi.org/10.1016/j.finmar.2016.05.003) and
  [Huang, Li, Wang & Zhou (2020)](https://doi.org/10.1016/j.jfineco.2019.08.004)
  motivate the conservative banded use and mandatory local/out-of-sample retest.
- Volatility scaling is treated only as a risk-control hypothesis; see
  [Moreira & Muir (2017)](https://doi.org/10.1111/jofi.12513). Covariance shrinkage
  from [Ledoit & Wolf (2004)](https://doi.org/10.1016/S0047-259X(03)00096-4) remains
  a future comparator if the real universe/data dimension warrants it.
- Liquidity and conversion cost must enter the decision. Amihud's
  [illiquidity study (2002)](https://doi.org/10.1016/S1386-4181(01)00024-6) is a
  reference concept, not an Iranian calibration. The constrained cost/turnover
  structure follows the general approach in
  [Boyd et al. (2017)](https://stanford.edu/~boyd/papers/cvx_portfolio.html).
- Repeated method search is kept separate from results because
  [Bailey et al. (2016)](https://doi.org/10.21314/JCF.2016.322) documents backtest-
  selection risk. Synthetic results are therefore unranked and unaggregated.

## Exact v1 rule

Every non-cash asset receives integer points from -2 to +2 for concentration,
conversion cost, crisis resilience, drawdown, liquidity, trend/volatility,
valuation percentile and relative volatility. Each factor weight is exactly 0.125.
The decision score is `50 × sum(points × 0.125)`, so its range is -100 to +100.

The unconstrained preference is
`max(0.25, 1 + 0.25 × composite)`. A drawdown or stress breach halves that
preference and transfers half of the breached current weight toward cash. Preferences
are normalized from an equal-weight anchor, with a 15% cash floor, 35% single-asset
cap, 25% maximum one-way turnover and 2-percentage-point no-trade band in the pinned
reference fixture. Half-even rounding is fixed in the contract. The amount is
`total portfolio value × absolute applied weight change`; the overall conversion is
the smaller of the largest staged reduction and increase.

## What Iran must recalibrate

Real use remains blocked until licensed point-in-time Iranian history can separately
calibrate and validate: trend windows; all five factor bands; volatility and drawdown
regimes; crisis scenarios; gold/coin premium percentile; bid/ask spread, market depth
and exit time; tax, fee and physical conversion costs; cash floor, concentration cap,
turnover cap and no-trade band. Inflation, rial/FX discontinuities, sanctions and
political closures, thin trading, coin bubbles and non-synchronous prices must be
tested rather than borrowed from foreign evidence. Required evidence is out-of-sample
and walk-forward performance with overfit controls, stress tests, sensitivity tests,
shadow operation and explicit owner approval.

No new calculation library was added for this method: Python `decimal`, hashing and
the test framework are standard-library components. This avoids a new license,
security, maintenance or reproducibility dependency. Existing PyArrow remains only a
hash-locked Apache-2.0 serialization dependency and is not used in the decision math.

The exact future Iran evidence, minimum-history, point-in-time, split, freeze and
promotion requirements are now versioned in
`docs/05-data/IRAN_CALIBRATION_MANIFEST.md`. This records how validation must happen;
it does not perform calibration or alter the laboratory-v1 values.

`STATUS: IMPLEMENTED AS A LABORATORY PROPOSAL; NOT IRAN-VALIDATED OR FINANCIALLY APPROVED`.
