# Next Task

**Source of truth for:** what should happen next.

## Immediate Next Step

Continue the first Phase 1 data vertical slice. Contracts, the first PostgreSQL
migration/repository, and the manual CSV validation/quarantine path are complete.
Next:

1. Configure an isolated local PostgreSQL runtime, apply migration 0001, seed only
   the approved instrument/source contracts, and run repository integration tests.
   No PostgreSQL, Docker, or `psql` runtime is currently present on the development
   host; installing one requires a separate system-level action.
2. After those tests pass, set the local-only database URL and explicit commit flag,
   then verify preview → commit → idempotent replay through the operator UI. The code
   path is implemented, action-matched, transactional, and fail-closed; it must not be
   enabled before the runtime and migration are verified.
3. Replace the expiring Rahavard manual snapshot with an official keyed source:
   configure Navasan and confirm `IRR`/`TOMAN`, or acquire the documented TGJU
   PersianAPI contract and token; then capture and quarantine-test observations.
4. Connect normalized observations to read-only freshness/status history without
   letting manual or informational data unlock financial decisions.
5. Add an independent licensed Iranian cross-check before any model uses the values.
6. Define and owner-approve an opportunity-alert methodology, evaluation protocol,
   uncertainty language, and false-positive limits before enabling real opportunity
   notifications.

## Explicitly Out of Scope

- Recommendations, trading, portfolio actions, bubble scores, and predictions.
- Any real market value without an approved, auditable source contract.
- Automated Rahavard scraping, reuse of the owner's browser session/cookies, or public
  redistribution of the manual snapshot.
- Merge to `main` without separate owner approval.
