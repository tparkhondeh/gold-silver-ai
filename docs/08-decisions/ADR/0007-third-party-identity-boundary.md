# ADR 0007: Third-Party Identity Boundary for the Owner-Only Release

- **Status:** Accepted
- **Date:** 2026-08-31
- **Decision owner:** Project owner

## Context

ADR 0006 limits the next real release to the project owner. Before selecting or
integrating a production identity provider, the owner also needed to decide whether
login could be handled by an external company and what information that company may
process.

## Problem

The project needs secure login without making the project owner operate a complete
identity system. At the same time, portfolio and financial information must not be
exposed to an identity provider merely because it handles login.

## Options Considered

1. **External identity service with a minimal data boundary:** the provider handles
   login identifiers and session evidence only; financial data remains inside the
   application boundary.
2. **Self-hosted identity service:** the project operates login, recovery, email,
   security updates, monitoring and incident response on its own server.

## Decision

The owner-only release may use an **external identity service** for authentication.
The provider may process only the minimum information required to identify and
authenticate the owner: an email address when required for login/contact, a stable
opaque provider subject identifier, and authentication/session metadata.

The identity provider must not receive portfolio holdings, transactions, valuations,
financial calculations, constraints, analyses, market-source credentials or database
records. Authorization remains a separate server-side control: successful login alone
does not grant portfolio access.

This decision does not select or activate a provider, approve a price or contract,
confirm availability from Iran, migrate holdings, or authorize a public/stable
deployment. Those remain separate gates.

## Rationale

The owner does not have an operations team. A focused external identity service can
reduce password, recovery and security-maintenance burden while strict data
minimization keeps the owner's financial information outside that provider.

## Trade-offs

- Login depends on an external company's availability, account rules and regional
  access.
- The provider will process limited personal information, so its terms, cost and Iran
  eligibility must be checked before selection.
- Changing providers later may require login migration, although the portfolio owner
  key remains independent from email and provider-specific identifiers.

## Consequences

- The production identity adapter must return a server-verified opaque subject; email
  is never the portfolio ownership key.
- The server must allowlist exactly one owner and deny anonymous or non-owner access.
- Public registration and invited-user flows remain out of scope.
- Financial and portfolio payloads must never be sent to the identity provider.
- No provider is integrated until its terms, cost and Iran availability are accepted
  and its deployment preflight passes.
- Before real holdings are migrated, two independent authenticated browser sessions
  must map to the same owner while anonymous and non-owner requests fail closed.
- The fixed `local-owner-v1` subject remains local-development-only and must not become
  a production identity.
