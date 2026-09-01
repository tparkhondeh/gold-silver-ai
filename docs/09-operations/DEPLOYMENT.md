# Deployment

**Source of truth for:** how the system is deployed/run.

## Status

`STATUS: PARTIAL`. The Phase 1 working branch has an owner-authorized public Sites
deployment for interface review at
`https://asha-gold-silver-ai.taha-p.chatgpt.site`. It is not a stable release and is
not merged to `main`.

The review deployment has no server-side portfolio persistence, no account model,
and no production authentication. Portfolio/demo state is browser-session-local;
the loopback CSV operator is disabled on the public hostname. Reviewers must use
synthetic, non-sensitive inputs.

The local application remains the only approved operator surface. Its project-owned
PostgreSQL, protected persistence environment, one-step owner-local launcher, strict
readiness check and verified local backup are active. Hosted persistence, production
identity, offsite backup, alerting and a stable release process remain `STATUS: TBD`
or partial in their respective operations documents.

On the prepared owner Windows host, `npm run local:run` starts PostgreSQL, validates
the protected runtime boundary and starts the web application only on
`127.0.0.1:4174`. It runs in the foreground and does not make deployment or DNS
changes.

## Owner-hosted server preflight

`STATUS: NOT READY` for a Cloudflare access gateway. A read-only SSH preflight was
run on `2026-08-31` against the owner-provided server; it changed no file, service,
DNS record, deployment or account.

- Cloudflare's HTTPS trace identified the server connection as `loc=IR`.
- Certificate-verified HTTPS returned `200` for Cloudflare developer documentation,
  Supabase terms and the Keycloak site. Cloudflare dashboard and Access hostnames also
  completed TLS verification, so general outbound HTTPS is not wholly blocked.
- The server's existing `/etc/hosts` maps both `www.cloudflare.com` and
  `api.cloudflare.com` to `127.0.0.1`. The mapped `www` endpoint presents a self-signed
  non-Cloudflare certificate. Normal certificate validation therefore rejects it, and
  Cloudflare API readiness on this host is not established.

Do not remove or bypass those mappings merely to make a test pass. First obtain the
hosting administrator's explanation and authorization, then correct the host/network
configuration if appropriate and repeat certificate, API and tunnel tests. Passing
this technical preflight would still not prove account eligibility, legal availability
or email delivery from Iran; those remain owner/provider gates in
[`IDENTITY_RECOMMENDATION.md`](../02-architecture/IDENTITY_RECOMMENDATION.md).

## Principle (to hold regardless of eventual approach)

Only code that is on `main` (stable, owner-approved — see
`docs/00-governance/STABILITY_POLICY.md`) may be deployed anywhere the owner relies
on for real financial use. A branch-based public review must remain labelled and
treated as evaluation-only.

## Related Documents

- Stack decision: `docs/02-architecture/SYSTEM_ARCHITECTURE.md`
- Stability policy: `docs/00-governance/STABILITY_POLICY.md`
- Monitoring once deployed: `MONITORING.md`
