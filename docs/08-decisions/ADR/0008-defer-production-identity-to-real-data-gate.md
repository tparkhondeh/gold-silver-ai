# ADR 0008: Defer Production Identity Until the Real-Data Gate

- **Status:** Accepted
- **Date:** 2026-08-31
- **Decision owner:** Project owner

## Context

The current application is still a development and review environment. Its public
review surface uses synthetic or browser-session data, while owner persistence is
restricted to the owner's local computer. ADR 0006 fixed the next real audience as
owner-only, and ADR 0007 approved a minimal external-identity data boundary without
selecting a provider.

The owner asked to keep the current experience simple and introduce stricter identity
controls when the project enters operational use with exact, real personal data.

## Problem

Selecting and integrating production identity now would add setup and maintenance
before any hosted real portfolio data needs it. Deferring identity without an exact
security gate, however, could allow sensitive data to reach an insufficiently
protected environment later.

## Options Considered

1. **Integrate production identity now:** complete provider selection and login before
   continuing development.
2. **Defer identity with a fail-closed real-data gate:** keep the current local/demo
   workflow simple, but prohibit hosted real data until strong owner authentication is
   complete and tested.
3. **Defer identity without a fixed gate:** add security after real-data use begins.

## Decision

Use option 2. No new production login is added during the current local/demo stage.
The public review must remain synthetic or browser-session-only and must not transmit
the owner's real financial information to, or persist it on, any shared server.

Before any real holding, transaction, constraint, valuation or analysis is hosted,
synced between devices, or exposed through production persistence, the project must
first select and activate the production identity provider and pass the complete
owner-only security gate.

This timing decision does not weaken current loopback restrictions, row-level
security, secret handling, source licensing, or any other existing control. The exact
identity provider remains unresolved until the pre-real-data review.

## Rationale

This keeps the present experience understandable and avoids premature account setup.
The explicit fail-closed gate preserves the important security property: sensitive
financial data never arrives before reliable owner identity and authorization.

## Trade-offs

- Remote real-portfolio testing and cross-device synchronization remain unavailable.
- Provider selection and integration work still has to be completed before operational
  use, so that transition will take additional time.
- The current public review cannot be treated as a private financial application.

## Consequences

- Current work may continue with synthetic, temporary or owner-device-local data only.
- No fixed PIN, shared password or trusted client-supplied identity may be introduced as
  a shortcut.
- The pre-real-data gate requires a server-verified stable owner identifier, an exact
  one-owner allowlist, secure sessions, server-side authorization, forced row-level
  security, and denial of anonymous or non-owner access.
- Two independent authenticated browser sessions must map to the same owner before any
  real holding is migrated.
- Multi-factor authentication or a passkey must be enabled when the selected provider
  supports it.
- If real-data transfer or hosted persistence is attempted before this gate passes,
  the application must fail closed rather than send data beyond the owner's device.
