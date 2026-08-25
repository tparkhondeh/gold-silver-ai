# Next Task

**Source of truth for:** what should happen next.

## Immediate Next Step

Complete the first Phase 1 data vertical slice:

1. Define versioned instrument, source, observation, validation-result, and
   quarantine contracts with UTC timestamp semantics.
2. Implement PostgreSQL migrations and repository tests without loading market
   values.
3. Add a manual CSV ingestion path with provenance, idempotency, deterministic
   validation, and quarantine audit fields.
4. Replace the expiring Rahavard manual snapshot with an official keyed source:
   configure Navasan and confirm `IRR`/`TOMAN`, or acquire the documented TGJU
   PersianAPI contract and token; then capture and quarantine-test observations.
5. Add persistence for normalized observations and read-only freshness/status history.
6. Add an independent licensed Iranian cross-check before any model uses the values.
7. Define and owner-approve an opportunity-alert methodology, evaluation protocol,
   uncertainty language, and false-positive limits before enabling real opportunity
   notifications.

## Explicitly Out of Scope

- Recommendations, trading, portfolio actions, bubble scores, and predictions.
- Any real market value without an approved, auditable source contract.
- Automated Rahavard scraping, reuse of the owner's browser session/cookies, or public
  redistribution of the manual snapshot.
- Merge to `main` without separate owner approval.
