# Production Identity Recommendation

**Source of truth for:** the owner decision required before real portfolio data can
be separated by production user identity.

`STATUS: PROPOSAL` — `DECISION REQUIRED: YES` (Tier A: access model and provider).
No provider is selected and no production authentication is enabled.

## What is being decided

The system needs a trustworthy, stable identifier for the person who owns each
portfolio. Authentication means proving who a person is; authorization means deciding
which portfolio that proven person may access. They are separate controls.

The current `local-owner-v1` value is safe only on the owner's loopback computer. An
email address must not replace it as the database key: emails can change and should be
used only for display/contact. The database should receive an opaque provider subject
ID, verify it on the server, and continue enforcing forced row-level security.

## Options

### A. Private owner-only access gateway — recommended for the next production pilot

A trusted gateway authenticates the owner before traffic reaches the application. The
application accepts only a server-verified opaque subject ID; portfolio routes remain
closed if it is missing. Cloudflare Access is one example of this category and supports
protected self-hosted applications and identity policies, but naming it here is not a
vendor approval: [official Access application documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/).

- Advantages: smallest exposure, no password database in this codebase, easiest
  two-browser owner test, and reversible before a multi-user launch.
- Disadvantages: depends on the chosen gateway's availability, account terms and
  Iran accessibility; it is not yet a customer account system.
- Wrong-call cost: low to moderate because the application stores an opaque subject ID
  behind an adapter, but vendor outage or account restrictions could block access.

### B. Managed multi-user identity service

An external provider handles sign-in, recovery and optional MFA/passkeys while the
application maps the verified subject to PostgreSQL. Supabase Auth is one example that
documents JWT identity with PostgreSQL row-level security; it is not selected here:
[official Auth/RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security#auth).

- Advantages: faster invited-user/customer onboarding and less security machinery to
  operate personally.
- Disadvantages: recurring cost or limits, vendor lock-in, personal-data processing,
  legal/terms review and possible regional availability risk.
- Wrong-call cost: moderate to high after many real accounts exist because migration,
  recovery and user communication become material.

### C. Self-hosted identity server

The owner operates an OpenID Connect identity system on controlled infrastructure.
Keycloak is one established example and documents standard application integration;
it is not selected here: [official Keycloak guides](https://www.keycloak.org/guides#securing-apps).

- Advantages: maximum infrastructure control and less dependence on a hosted identity
  vendor.
- Disadvantages: highest operational burden; patching, email delivery, recovery,
  monitoring and incident response become the owner's responsibility.
- Wrong-call cost: high if operations are under-resourced, because identity downtime or
  a security mistake can expose or lock out sensitive financial data.

## Recommendation and decision needed

Use **Option A for an owner-only production pilot**, with MFA/passkey capability where
the chosen gateway supports it. Keep an adapter boundary so Option B or C can later
provide the same opaque subject ID without changing portfolio ownership rows.

Before implementation, the owner must answer:

1. Is the next real release only for the owner, for invited trusted users, or public
   customer accounts?
2. May a third party process login identifiers such as email, or must identity be
   self-hosted?
3. Which provider/account terms, recurring cost and Iran accessibility have been
   reviewed and accepted?

Until those answers are approved, the public review site remains demo/session-only,
real holdings remain on the loopback owner host, and no production identity headers
are trusted.
