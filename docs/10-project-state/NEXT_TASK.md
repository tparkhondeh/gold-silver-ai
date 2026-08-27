# Next Task

**Source of truth for:** what should happen next.

## Immediate Next Step

Continue the first Phase 1 data vertical slice. Contracts, the first PostgreSQL
migration/repository, and the manual CSV validation/quarantine path are complete.
Next:

1. Configure a local PostgreSQL runtime, apply the migration, and run repository
   integration tests. No PostgreSQL, Docker, or `psql` runtime is currently present
   on the development host.
2. Connect the protected local CSV operator's currently working preview to the
   PostgreSQL repository, then enable commit only after a successful transaction.
   Preview already reports accepted, duplicate, and quarantined counts and the API
   rejects non-loopback/cross-origin requests.
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
