# Deployment

**Source of truth for:** how the system is deployed/run.

## Status

Latest scope and read-only evidence (2026-09-17):
[unified-portfolio checkpoint](../10-project-state/UNIFIED_PORTFOLIO_REVIEW_2026-09-17.md).
The owner permits private deployment preparation, but a working owner-domain
release is not established. Fresh inspection still found public HTTPS 503, no
backend listener on 3012, and a writable project directory. No server file,
service or setting was changed, and no deployed commit SHA was verified.

Google branding/terms setup is complete after manual owner acceptance. Subsequent
credential incident and verified deletion of that unused client are recorded in the
[current identity checkpoint](../10-project-state/GOOGLE_IDENTITY_SETUP_2026-09-17.md).
No safe credential, completed authentication, credential transfer or permission
to expose an unauthenticated app is established. Keep existing loopback
controls intact: the new isolated identity boundary is tested but not integrated
with the real portfolio or a durable hosted runtime. See the
[identity acceptance record](../10-project-state/PRIVATE_IDENTITY_REVIEW_2026-09-17.md)
and [blocked credential retention check](GOOGLE_CREDENTIAL_STORAGE.md).
The observed `Linger=no` also leaves user-service
survival after logout/reboot unproven; writable files and available service tools
do not establish persistent runtime supervision.

The linked checkpoint owns command-level evidence and remaining actions. The
[September 13 review](../10-project-state/R2_DOMAIN_REVIEW_2026-09-13.md) and the
older URLs/observations below are historical context, not proof of a current
working or private release.

### Permanent independent-access acceptance criteria

Publication is accepted only when the exact deployed commit is identifiable,
valid HTTPS works independently of the developer computer/conversation/local
process, and the owner can use ordinary supported browsers. Test actual login,
non-owner/anonymous denial, logout and session expiry, save/replay and the stated
scope of storage. Same-browser persistence must never be called cross-device sync.
Record which browsers/devices were actually tested; OS HTTP and an in-app browser
are not substitutes for all independent-browser tests. No login bypass, shared
PIN, temporary tunnel or exposure of loopback-only operators is acceptable.
Runtime supervision after administrative disconnect, safe restart/recovery,
scoped backups/rollback and preservation of other hosted services are mandatory.
Secret/private-data transfer and production identity selection retain their
separate authorization gates. Domain publication alone is not project completion.

### Historical Sites review

`STATUS: HISTORICAL REVIEW`. The Phase 1 working branch had an owner-authorized
public Sites deployment for interface review at
`https://asha-gold-silver-ai.taha-p.chatgpt.site`. It is not a stable release and is
not merged to `main`.

That review had no server-side portfolio persistence, account model or production
authentication. Portfolio/demo state was browser-session-local and the loopback
CSV operator was disabled on the public hostname. It was for synthetic,
non-sensitive inputs only; its current availability/features were not reverified
as part of the unified-workspace rollout.

## Owner-local run

The local application remains the only approved operator surface. Its project-owned
PostgreSQL, protected persistence environment, one-step owner-local launcher, strict
readiness check and verified local backup are active. Hosted persistence, production
identity, offsite backup, alerting and a stable release process remain `STATUS: TBD`
or partial in their respective operations documents.

On the prepared owner Windows host, `npm run local:run` starts PostgreSQL, validates
the protected runtime boundary and starts the web application only on
`127.0.0.1:4174`. The unified interface uses local PostgreSQL as portfolio storage
and a protected, latest-only managed market cache. Neither is hosted sync.
The launcher runs in the foreground and makes no deployment or DNS changes;
its readiness-gated, lifetime-bound backup behavior is defined in [BACKUP.md](BACKUP.md).

This Windows launcher is not a Linux production service or a deployment recipe.
The local Node runtime mode must not be exposed through the domain proxy as an
identity workaround. Before any hosted activation, verify the selected production
runtime, exact release identity, private access, supervision, rollback and scoped
storage under the independent-access criteria above.

## Historical owner-domain read-only review, 2026-09-09

The owner conditionally permitted a private evaluation deployment on 2026-09-06.
The 2026-09-09 request is inspection/documentation-only and does not authorize a
deployment or repair in this turn. No server file, service or setting was changed.

Observed at approximately 17:07–17:09 UTC (20:37–20:39 Asia/Tehran):

- SSH to `wealthos_dev@62.204.61.18:2490` succeeded with existing host-key checking.
- `/home/wealthos/goldsilver.wealthos.ir` now grants the account effective `rwx`;
  its ACL mask is `rwx` and the read-only `test -w` check returned yes. The earlier
  `r-x`/no-write blocker is resolved as observed; no test file was written.
- The domain's `.htaccess` preserves `.well-known/` and proxies other paths to
  `http://127.0.0.1:3012/`. Its recorded mtime is
  `2026-09-07 18:42:54 +03:30`. This is file-metadata evidence, not proof of who
  changed it or when the separate ACL changed.
- `ss -lntH sport = :3012` returned no listener. An HTTP request from the server
  itself to `127.0.0.1:3012/api/health` was refused. Node `v22.23.2` exists.
- Certificate-verified public HTTPS to `https://goldsilver.wealthos.ir/` returned
  `503 Service Unavailable`. It did not display a working Gold/Silver application.
- No Gold/Silver release appeared in the accessible account's `apps/` listing.
  Other accounts, protected host-wide configuration and inaccessible paths were
  not inventoried; absence of deployment everywhere on the host is not claimed.

Diagnosis at that checkpoint: the configured backend was not running/listening on its target
port, consistent with the observed 503. Restored filesystem permission is not
successful deployment. Proxy semantics, production build/runtime compatibility,
private owner access, restart supervision, scoped backup and rollback must still
be tested before a future release. Do not bypass loopback-only portfolio/operator
controls or copy local databases, backups, API keys or runtime secrets to publish
the synthetic preview. Any temporary access design must respect ADR 0008; a shared
PIN/password must not be used as a substitute for the required owner identity gate.

The older Sites URL above is a separate historical review deployment, not evidence
that this commit is deployed at the owner's domain; it was not reverified here.

## Historical Cloudflare gateway preflight, 2026-08-31

At that date, `STATUS: NOT READY` for a Cloudflare access gateway. A read-only SSH preflight was
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
