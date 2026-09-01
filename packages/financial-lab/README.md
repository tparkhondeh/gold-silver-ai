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

