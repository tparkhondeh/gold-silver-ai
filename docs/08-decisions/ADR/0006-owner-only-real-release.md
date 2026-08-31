# ADR 0006: Owner-Only Audience for the Next Real Release

- **Status:** Accepted
- **Date:** 2026-08-31
- **Decision owner:** Project owner

## Context

The local application already stores one owner's portfolio behind a fixed local
subject and forced row-level security. Moving toward a real hosted identity requires
an explicit audience decision before authentication, account recovery or portfolio
migration can be designed safely.

## Problem

The next real release could serve only the owner, invited trusted users, or public
customer accounts. Each option changes product scope, identity handling, security
exposure, operating cost and recovery requirements.

## Options Considered

1. **Owner only:** one verified owner identity, with no registration or invited-user
   workflow.
2. **Invited trusted users:** multiple isolated identities and an invitation/recovery
   lifecycle.
3. **Public customer accounts:** open registration plus customer-facing identity,
   legal, support and abuse controls.

## Decision

The next real release is **owner-only**. It will not provide public registration,
customer accounts or invited-user access. Any later multi-user expansion requires a
new owner-critical decision and architecture review.

This decision sets the audience only. It does **not** select an identity provider,
authorize third-party processing of login identifiers, approve recurring cost,
establish Iran account eligibility, enable production authentication, migrate browser
holdings or authorize a stable/public financial deployment.

## Rationale

Owner-only access satisfies the immediate personal-wealth use case with the smallest
exposure and operational burden. It makes the first authenticated-session tests
bounded and keeps future multi-user work reversible before any real customer accounts
exist.

## Trade-offs

- Other people cannot receive accounts or see separate portfolios in this release.
- The product cannot yet validate invitation, customer recovery, support or abuse
  workflows.
- A later multi-user release will require additional schema, authorization, privacy,
  operations and migration review rather than being enabled as a configuration flag.

## Consequences

- Every protected request must fail closed unless a server-verified identity maps to
  the one approved owner subject.
- Email may be used for contact/display but not as the stable portfolio ownership key.
- Authorization remains server-side and forced row-level security remains mandatory.
- Before any real holding is migrated, two independent authenticated browser sessions
  must map to the same owner while anonymous or non-owner access is denied.
- Provider, third-party data handling, cost, Iran availability and the current server
  preflight remain separate unresolved gates.
