# Private passkey delivery — 2026-09-21

## Authority and preservation

The owner made Google optional and authorized a secure independent implementation
and deployment of this project only. Actual owner access and sensitive transfers
remain separate. Working branch: `codex/phase-2-decision-engine`, initial clean
SHA `5b95ba0ae828213a57283bca44a42aaba1f10c62`. Verified pre-edit Git bundle:
`.cache/checkpoints/passkey-private-release-20260921/repository.bundle`.
No main change, local portfolio migration, market history/call, Google retry,
paid service or unrelated server modification is part of this delivery.

## Implemented

- [ADR0013](../08-decisions/ADR/0013-owner-passkey-private-domain.md): owner-bound
  WebAuthn/passkey, exact RP/origin and required presence/user verification, no
  first-visitor enrollment or fallback. A real bootstrap grant is a separate
  explicitly approved operator action. Additional keys require a fresh session.
- Four new forced-RLS auth tables, migration0014, durable admission limits,
  atomic one-use ceremonies and owner/session/counter checks. Admin reset never
  deletes the portfolio. Backups cannot resurrect credentials/grants/sessions.
- Existing private purchase/Excel/repository flow reused. Server authorization
  decides access; browser assertions do not unlock the portfolio by themselves.
- Fresh-only dedicated Linux database preparation, least-privilege runtime,
  fixed protected configuration and private supervision/verified-backup tooling.
  Tool implementation is not proof these operations ran successfully.

## Actual evidence so far

| Check | Result | Limit |
|---|---|---|
| Actual PostgreSQL integration | 37/37 pass after fixture corrections | Disposable integration DB, not owner device/server acceptance |
| Signed auth protocol | 32 focused tests pass, including14 passkey cryptographic cases | Synthetic authenticators, no actual owner key |
| UI regressions | 26 focused tests pass | Does not prove physical authenticator compatibility |
| Private built UI smoke | Google/passkey modes serve shell,8assets and blank XLSX; private/legacy routes denied | Controlled gates, not real login |
| Browser127.0.0.1:4177 | Persian shell, login-service failure, invalid synthetic grant, failed enrollment, collapse/reload tested; portfolio remains concealed | Failure-only isolated harness; no owner credential/database/provider access |
| Dependencies | Full graph:0critical/0high/4moderate in unused drizzle-kit/esbuild tooling chain | Not a blanket security certification; production tools never served |

Locked maintenance updates include Cloudflare Vite plugin1.57.0, Wrangler4.136.0
and compatible patched Browserslist/baseline/fflate transitives. npm production
audit reports0. No financial calculation dependency was added. First full build
and coverage regression passed617tests (96.39%lines/90.75%branches/92.37%functions);
final expanded regression passed634tests
(96.44%lines/90.90%branches/92.50%functions). Lint and TypeScript pass; after the
last cleanup-order hardening, all17 affected backup tests passed again.

Three specialists actually used: architecture/QA (protocol and independent ops
review), security/storage (durable store, backup/restore security), finance/data
(UI integration and fixed server preparation). Sensitive changes were reviewed
by a different agent. Independent review found and corrected the restore-DB HBA
gap, retained-dump integrity, recurring backup and restart-log findings. Focused
verification covers retained artifacts12, executed producer5 and supervision10
tests. Independent security/architecture cross-review found no remaining blocker
in these changes. Real-server execution remains distinct from these tests.

Implementation `a609337a5e87d232176e29a3fb96761a3f587053` was pushed and
[run35620404430](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/35620404430)
passed all three jobs: quality/build/audit, real PostgreSQL and Python laboratory.
Later follow-up commits require their own exact-SHA check; this is not activation.

## Actual server state

Fresh SSH metadata showed nonroot account wealthos_dev, a writable project-only
document root, existing proxy to127.0.0.1:3012 and no project backend. Public HTTPS
returned503. Unrelated port5432 was not reused. No sudo/Docker privilege was added.
crond is active; existing account crontab is nonempty and must be preserved.

Reviewed PostgreSQL17.11 official source, SHA256
`5367f6fb2ec97efe1eb2e0c7926bb33438e51b0bd3a9733b88498056a7dc9a7e`,
was compiled into `/home/wealthos_dev/.goldsilver-service/tools/postgresql-17.11`.
Fresh binary checks verified postgres/pg_dump/pg_restore17.11 and no15432listener.
The command transport appended a trailing CR after successful build and returned1;
the completed installation was verified separately, not rerun/overwritten.
Sources/build/log are retained privately. About10GiB free remained; preparation
and backup require at least8GiB free. No broad cleanup is authorized.

The same clean implementation SHA was cloned into its exact private release path;
locked Linux installation and production build succeeded. Initial database setup
stopped safely before database initialization: the data directory is empty, with
only private generated service configurations and preparation marker retained.
No owner credential, database listener, new service/crontab or proxy change occurred.
The original state/proxy were privately copied to
`/home/wealthos_dev/.goldsilver-service/checkpoints/pre-db-resume-20260921-a609337`.

A harmless server probe reproduced the cause: Node child stdin uses a socket,
while PostgreSQL initdb opens `/dev/stdin` as a file. Direct opening fails ENXIO;
a fixed kernel-pipe bridge works with nonsecret text. PostgreSQL's
[17.11 source](https://raw.githubusercontent.com/postgres/postgres/REL_17_11/src/bin/initdb/initdb.c)
confirms the file-open behavior. The bounded correction must preserve existing
configuration and allow continuation only for this verified empty state, never
reinitialize a populated/partial PostgreSQL directory. No deployed SHA is claimed
until actual service activation and external checks pass.

The correction now has22 focused passing tests plus one Linux-only pipe test
(skipped on Windows), including executed controller tests of unchanged retained
credentials, unsafe/nonempty rejection, concurrent exclusion and preservation
after failure. A second specialist reviewed it independently with no blocker.
Linux CI and actual empty-state continuation remain separate acceptance checks.

A separate30-second nonprivate503 probe behind the existing project proxy showed
loopback transport, Host `127.0.0.1:3012`, two identical canonical public hosts in
`X-Forwarded-Host`, and `X-Forwarded-Proto: https`. The probe exited and changed no
proxy files or other service. The gateway's original direct-Host-only contract
therefore needs a narrowly configured adapter before this deployment can work.
This is Apache/nginx behind the public edge, not a presumed LiteSpeed setup.
The explicit adapter is now implemented with18 passing adjacent/proxy tests:
one/two identical canonical hosts, duplicate/malformed/hostile chains, exact HTTPS,
loopback-only transport, stripped identity/IP forwarding and unchanged session/
Origin enforcement. It does not change the shared proxy or accept arbitrary hosts.

Follow-up release `00f5a20b36986fe5189f219486fba04c8cba2ee3` passed all three
exact-SHA jobs in [run35622921802](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/35622921802).
Its separate clean Linux checkout and locked private production build succeeded.
The explicit empty-state continuation succeeded: dedicated15432 PostgreSQL,
14migrations, runtime readiness and empty private tables were verified. Retained
service configuration was reused; no owner grant or local portfolio was copied.
The actual server backup command succeeded, restored a separate disposable copy,
matched25persistent tables, excluded6auth datasets, verified retained dump SHA and
removed only its own verification database. This first hosted backup contains an
empty portfolio; seeded-data behavior is separately covered by integration tests.

Project supervision was installed for this exact release after these gates.
The pre-existing account crontab was preserved and privately backed up at
`/home/wealthos_dev/.asha-private/goldsilver/crontab-before-1790006685434.txt`.
Boot/minute recovery and daily03:17(server-local) verified backups are configured;
the first scheduled daily run and actual shared-host reboot are not yet observed.
No public proxy file, other site or previous release was changed.

The first public acceptance returned400, not success: a follow-up harmless raw
probe showed two separate canonical forwarded-host fields (Node's normalized
property had joined them). The corrected representation keeps the same aggregate
maximum of two matching hosts and rejects all conflicting/additional values;
19focused tests and independent security review pass. It still requires the one
exact HTTPS protocol and loopback peer; no session/Origin rule is relaxed.
The scoped runtime interruption also verified real automatic recovery: original
PID130944 was replaced, and fixed events show exits/start requests15seconds apart.
This does not prove a host reboot or working owner login. The corrected release
and external acceptance are still required before claiming domain availability.

The next corrective batch also provides an exact prior-release supervision
upgrade: preserve the live lock and unrelated cron bytes, retain a protected
per-prior-SHA attempt marker and require the new release's verified backup before
replacing its schedule. The running supervisor is not restarted by the installer.
Independent review passed19 tests; the coordinator's combined gateway, application,
market-composition and supervision run passed45 tests.

An optional authenticated market-adapter composition seam is prepared in both
runtime factories. Seven new tests and a separate security review cover guards,
immutable authorization proof, exact response validation before/after serialization,
64KiB output limits and logout/expiry suppression. Startup supplies no adapter,
so this does not activate hosted prices, transfer a key or consume quota. The
operations runbook records the remaining quota-authority/cache/grant requirements.

## Owner gates and remaining acceptance

One concise approval was requested for creating one five-minute bootstrap grant
and transferring it only to
`C:\Users\pc\.goldsilver-private\passkey-owner-login\bootstrap-grant.txt`.
No response/grant/transfer is recorded yet. Recheck destination protection before
delivery; never display the code in tools/chat/screenshots/URLs/logs. The owner
must perform actual device-unlock/passkey creation. Do not automate that handoff.

Hosted market configuration remains `missing_key`; no provider key or local
portfolio has been transferred. Missing prices/analytical inputs stay explicit;
no synthetic factors enter real analysis. Financial-use lock remains on.

Actual owner login, independent Chrome/Edge/Firefox/mobile, cross-device recovery,
host reboot, off-host disaster recovery and final owner acceptance remain unproven.
Continue only useful permitted work via the linked operations runbook. Do not
claim background work, full project completion or financial validation.
