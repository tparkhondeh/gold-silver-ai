# Architecture Decision Records (ADRs)

**Source of truth for:** why significant architecture and product decisions were
made. Do not create an ADR for a decision that hasn't actually been made; see
`docs/00-governance/PROJECT_RULES.md` § 1, non-negotiable #8.

## When to Write One

Write an ADR when a decision is made that is architecturally or product
significant and hard to reverse — e.g. technology stack choice, data source
selection, a financial methodology (valuation, allocation, risk approach), or a
structural change to the system. Routine implementation choices don't need one.

## Lifecycle

`Proposed → Accepted → (optionally, later) Superseded / Deprecated`

An ADR is never deleted or edited to reverse its own decision. A later decision
that changes course gets a **new** ADR, which references the one it supersedes.

## Naming

`NNNN-short-title.md`, zero-padded sequential number, e.g. `0001-choose-primary-language.md`.

## Template

```markdown
# NNNN. Title

Status: Proposed | Accepted | Superseded by NNNN | Deprecated
Date: YYYY-MM-DD

## Context
What situation/problem made this decision necessary?

## Problem
What specifically needs to be decided?

## Options Considered
List each option with a short description.

## Decision
Which option was chosen.

## Rationale
Why this option, in terms the owner reviewed and approved
(see docs/00-governance/PROJECT_RULES.md § 2).

## Trade-offs
What was given up by choosing this option.

## Consequences
What this decision implies for future work — including what it forecloses.
```

## Current State

- ADR 0001: Phase 1 foundation
- ADR 0002: personal wealth scope
- ADR 0003: live-market source boundary
- ADR 0004: temporary Rahavard manual snapshot
- ADR 0005: notification and opportunity-alert safety boundary
- ADR 0006: owner-only audience for the next real release
- ADR 0007: third-party identity boundary for the owner-only release
- ADR 0008: defer production identity until the real-data gate
