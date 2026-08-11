# Security Architecture

**Source of truth for:** the security posture and principles of the system.

## Status

No specific security tooling, hosting, or authentication mechanism has been chosen.
`STATUS: TBD` — `DECISION REQUIRED: YES`, deferred until an implementation phase
requires it.

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
