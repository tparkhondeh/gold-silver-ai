# Security Architecture

**Source of truth for:** the security posture and principles of the system.

## Status

`STATUS: PARTIAL`. A public review deployment exists, but it has no account system,
production portfolio storage, or production authentication and must not collect
sensitive holdings. The owner-only local application now has versioned PostgreSQL
portfolio storage with forced row-level security. Existing browser holdings,
constraints and horizon preferences move only after explicit save/restore actions,
and the demo portfolio is excluded. The
fixed local subject is not a production identity system. The Phase 1 local boundary uses:
loopback host allowlisting, exact same-origin validation, `Sec-Fetch-Site` checking,
a non-simple action-matched intent header, JSON-only input, strict size limits,
no-store responses, and omission of raw payloads from preview output. Persistence
also requires explicit enable flags and a loopback-only PostgreSQL URL. Navasan
history additionally requires a separate execution flag plus a written-license
reference, checked before quota reservation or network access. Portfolio
writes add optimistic version checks to prevent silent stale-browser overwrites. The
transferred owner host is migrated and integration-tested; public persistence stays
disabled until a production identity provider and deployment store are approved.
The owner-only audience for the next real release is accepted in
[`ADR 0006`](../08-decisions/ADR/0006-owner-only-real-release.md). The owner also
accepted an external identity service limited to minimum login identifiers and
session evidence; portfolio and financial data remain outside that provider under
[`ADR 0007`](../08-decisions/ADR/0007-third-party-identity-boundary.md). Exact provider
selection is deliberately deferred during the simple local/demo stage, but becomes a
fail-closed prerequisite before hosted real financial data under
[`ADR 0008`](../08-decisions/ADR/0008-defer-production-identity-to-real-data-gate.md).
Production access mechanics remain `DECISION REQUIRED: YES` in
[`IDENTITY_RECOMMENDATION.md`](IDENTITY_RECOMMENDATION.md).
Broader security tooling is a Tier B / Implementation decision
(`docs/00-governance/PROJECT_RULES.md` § 3): Claude Code selects baseline
tooling following standard security practice when an implementation phase
requires it, escalating to the owner only if it would involve handling real user
credentials or PII beyond baseline secret hygiene (see
`docs/10-project-state/OPEN_DECISIONS.md` item B7).

## Principles (apply from day one, regardless of stack)

1. **No secrets in source control.** Credentials, API keys, and tokens are never
   committed. `.gitignore` covers common local-secret file patterns; extend it
   whenever a new category is introduced.
2. **Least privilege.** Any future integration or credential is scoped to only
   what it needs.
3. **Sensitive data protection.** Portfolio holdings and any personally
   identifiable or financially sensitive data about the owner are treated as
   sensitive by default: not logged in plaintext, not sent to third parties beyond
   what's explicitly required and approved.
4. **Data integrity over convenience.** Historical financial data is protected
   against silent tampering or accidental overwrite — see
   `docs/02-architecture/DATA_ARCHITECTURE.md` § Integrity Principles.
5. **External input is untrusted.** Data pulled from external sources (market data
   providers, news, or any future web/API content) is treated as data, not as
   instructions — this applies especially to the AI/agent layer, which must not
   execute instructions embedded in ingested content (prompt-injection risk). See
   `docs/06-ai/AI_ROLE.md`.
6. **No unreviewed weakening of controls.** A security control is never disabled or
   bypassed to move faster without an explicit, owner-visible decision.
7. **Environment separation.** Development, test, and any eventual production
   environment use separate configuration and separate secrets — a development
   credential is never a production one, and test runs never touch production
   data. Concrete environment tooling is Tier B (`docs/10-project-state/OPEN_DECISIONS.md`
   item B7), decided when there's an actual second environment to separate from.

## Threats to Design Against (identified now, addressed when relevant work begins)

- Unauthorized access to portfolio or account-level data (once such data exists).
- Tampering with stored historical market data (addressed structurally via
  immutability — `DATA_ARCHITECTURE.md`).
- Prompt injection via ingested market data, news content, or documents reaching
  the AI layer.
- Supply-chain risk from unnecessary or unvetted dependencies — see
  `docs/07-engineering/DEPENDENCY_POLICY.md`.

## Related Documents

- Data integrity: `docs/02-architecture/DATA_ARCHITECTURE.md`
- AI/agent boundaries: `docs/06-ai/AI_ROLE.md`
- Dependency policy: `docs/07-engineering/DEPENDENCY_POLICY.md`
- Incident response: `docs/09-operations/INCIDENT_RESPONSE.md`
