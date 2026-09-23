# Deployment

**Source of truth for:** how the system is deployed/run.

## Status

Active scope: [September23 public evaluation](../10-project-state/PUBLIC_EVALUATION_2026-09-23.md).
ADR0014 permits only an isolated `/evaluation` public route, not anonymous private
portfolio access. Owner activation is deferred to final acceptance. Fresh server
capacity is below the backup reserve; no new deployment until that gate is restored.

Current execution: [September 21 passkey delivery](../10-project-state/PRIVATE_PASSKEY_DELIVERY_2026-09-21.md)
and [project-only passkey operations](PRIVATE_PASSKEY_OPERATIONS.md).
The owner has authorized an independent provider-free private login and scoped
server deployment under ADR 0013. The earlier Google-only sequence below is
historical; it must not trigger another Google client/secret or repeat access403.
Only the linked current execution record establishes what is actually deployed.

### Historical September 20 status (superseded)

Latest scope and fresh read-only evidence (2026-09-20):
[private-domain checkpoint](../10-project-state/PRIVATE_DOMAIN_READINESS_2026-09-20.md).
The owner authorizes project-only deployment, but key creation/transfer and existing
portfolio transfer have separate gates. Public HTTPS is 503, the project backend
is absent, and no deployed SHA is verified. No server file/service was changed.

Private authorization, durable PostgreSQL sessions and a Node production entry
are implemented and tested with isolated nonprivate inputs. Actual Google login,
server database/supervision and independent-device acceptance remain incomplete.
The external Windows secret destination is prepared; browser direct Save As and
replacement credential creation remain pending. The deleted exposed client must
never be reused. See [credential procedure](GOOGLE_CREDENTIAL_STORAGE.md).

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

### Private Node activation plan — prior Google version

This is a **not-yet-executed** project-only plan. Stop at each missing permission,
unsafe path or unverified dependency; do not route the public proxy to local mode.

1. Prepare the Google credential and verified owner issuer/sub using the private
   handoff, then request exact transfer approval. Proposed destination:
   `/home/wealthos_dev/.asha-private/goldsilver/runtime.json`, outside the served
   project. Inspect all ancestors; directories must be private 0700 and the regular
   single-link file 0600, owned by the non-root service account, with no symlinks or
   shared write permissions. Do not alter broad existing directories/ACLs to pass.
   Never place configuration in document root, environment output, Git or logs.
2. Server administrator must provision or identify an explicitly project-dedicated
   PostgreSQL 17 database `asha_private` and tools for verified backup/restore.
   Use loopback only, separate migration/backup authority, and the non-owner,
   non-superuser `asha_private_runtime` role with no inherited role membership.
   Do not repurpose the unidentified existing port 5432 service. Bind an explicit
   hosted portfolio subject distinct from `local-owner-v1`; no owner-data import.
   Apply reviewed migrations, including 0013, with the migration authority.
   Grant only required runtime CRUD and journal read. Runtime startup checks the
   full journal and private table/RLS/privilege boundary and never migrates itself.
3. Reserve sufficient build/backup disk space. Review the complete private-runtime
   dependency graph (Vinext is currently a devDependency and requires the reviewed
   locked full install, not `npm ci --omit=dev`); fix applicable advisories
   before activation. An omit-dev audit alone is insufficient. Build a **clean
   committed** working-branch release with locked dependencies using
   `npm run build:private`; retain its `dist-private/release.json`. Both runtime TS
   checkout and build must match that SHA. Default Worker build is a separate target.
   Never deploy ignored `.cache`, local env, provider keys or local database files.
4. Before changing a release/proxy/service, privately back up the exact affected
   project files and dedicated database, record previous service/release identity,
   and test restore into a separate disposable DB. Exclude ephemeral login/session
   data using `scripts/private-backup-policy.ts`; ensure restored auth tables are
   empty. Define a restore/restart rollback that does not undo unrelated services.
   Do not delete old releases/backups automatically. Establish regular protected
   backup storage and retention appropriate to remaining disk space; local launcher
   backup is not the hosted solution.
5. Administrator must provide project-only supervision under `wealthos_dev`:
   a reviewed system service, or specifically authorized user lingering, restarting
   on failure and enabled after boot. `Linger=no` is not sufficient. Entry is
   `npm run start:private` in the verified release's `apps/web`; no root runtime,
   development command, shared key environment or fallback. The gateway binds only
   `127.0.0.1:3012`, UI upstream uses another loopback port, database stays private.
   Keep logs generic/private; no credential values in service definitions or output.
6. Verify that the existing project-only HTTPS proxy preserves the exact public
   Host and does not expose the upstream directly. Test anonymous/other-user denial,
   real owner login and callback, logout/expiry, stable-subject save/recovery after
   another login, stale-write conflict and disconnected/failed-save behavior with
   invented acceptance records. Test service process restart and administrative
   disconnect; coordinate a server reboot rather than rebooting other services.
   Record untested devices explicitly. Only then report actual deployed SHA and
   owner-ready access; server transfer/owner acceptance are not automatic.

The administrator handoff is limited to this project's DB/tools and durable service;
it is not a request to grant unrestricted sudo, weaken authentication or expose a DB.

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
