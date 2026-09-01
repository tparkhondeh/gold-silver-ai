# Asha Financial Laboratory

This package is the isolated Phase 2 laboratory approved in ADR 0009.

It accepts only machine-verifiably synthetic fixtures. Every result is
`evaluation_only`, keeps financial use and execution disabled, and carries exact
dataset/model/methodology/assumption references for deterministic replay.

It is not imported by the web runtime, does not call providers, and does not write to
production registries. Standard-library-only tests run with:

```text
python -m unittest discover -s tests -v
```

`schemas/v1` contains the versioned JSON exchange contracts. Parquet transport is a
separate implementation unit; no optional binary dependency is introduced silently.

`build_reference_dataset()` deterministically creates four explicitly synthetic index
paths over 120 ordinal periods. `evaluate_no_decision()` admits only rows available at
the requested cutoff and emits coverage metrics inside a permanently locked,
fingerprinted `no_decision` result. Neither function knows any market symbol, currency,
calendar date, provider, portfolio, or execution route.

Dataset and result artifacts are encoded as one canonical UTF-8 JSON representation.
The decoder rejects duplicate keys, invalid Unicode, non-canonical formatting,
oversized documents and contract violations. `replay_no_decision_artifacts()` then
recomputes the stored result and accepts it only when every byte-level input identity
and every output field agree exactly.

`evaluate_comparison_controls()` implements two laboratory rulers: the constant
`SYNTH_CASH` path and a 1/N path rebalanced at every ordinal period across every
synthetic fixture instrument. At each period it uses only the highest-period
observation whose `periodIndex` and `availableAtIndex` are both then known; a delayed
row is carried forward visibly and counted. It compounds arithmetic-mean period
returns under the registered synthetic full-liquidity/zero-cost assumptions, computes
maximum peak-to-trough drawdown, and rounds only the final percentages to eight decimal
places with half-even rounding. These are comparison controls, not an approved
allocation methodology or recommendation.
