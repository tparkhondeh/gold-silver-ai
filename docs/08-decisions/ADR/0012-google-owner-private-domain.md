# 0012. Google identity for the owner-only private domain

Status: Accepted (explicit owner instruction, 2026-09-20)
Date: 2026-09-20

## Context

ADR 0006 restricts the next real release to its owner. ADR 0007 permits only
minimal identity information at an external identity provider. ADR 0008 deferred
provider selection until private hosted use. The owner now explicitly requests
Google login, persistent account storage and project-only domain deployment.

## Problem

Provide an identity that survives browser/device changes without publishing the
portfolio, trusting the first visitor or exposing a local-only database route.

## Options Considered

Continue local-only identity (does not meet the requested access goal); select
another vendor (not the owner's current choice); integrate Google OIDC using the
existing reviewed adapter and a server-side owner allowlist (selected).

## Decision

Use Google OpenID Connect, `openid email` only, on the existing owner domain.
Authorization binds verified issuer and stable subject to an explicit private
portfolio subject on the server. No public registration, first-login-wins or
email-only owner binding. Reuse PostgreSQL and the existing portfolio contracts.
This supersedes ADR 0008's timing/provider-selection deferral for this bounded
stage only; the safety boundaries of ADRs 0006/0007 remain unchanged.

## Rationale

Implements the owner's selected access route while keeping financial data out of
Google identity processing and reusing the existing tested identity adapter.
Server-side sessions and RLS provide identity-independent storage continuity.

## Trade-offs

Login depends on Google availability, account eligibility and secure key retention.
Branding/terms completion does not prove successful real login. Third-party
dependency and deployment/security checks remain necessary.

## Consequences

New-client/key creation, key transfer, private-data migration and any new terms
retain separate action-time approvals. The previously exposed, deleted client is
never reused. No credential or personal portfolio is introduced by this ADR.
Runtime activation, server persistence, independent-device acceptance and owner
acceptance remain uncompleted operational gates, not implied by this decision.
Current proof is in the [September 20 readiness checkpoint](../../10-project-state/PRIVATE_DOMAIN_READINESS_2026-09-20.md).

Primary references reviewed 2026-09-20:
[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[reference](https://developers.google.com/identity/openid-connect/reference),
[identity best practices](https://developers.google.com/identity/siwg/best-practices).
