# Project-only private passkey operations

Current execution evidence: [September21 delivery](../10-project-state/PRIVATE_PASSKEY_DELIVERY_2026-09-21.md).
Identity contract: [ADR0013](../08-decisions/ADR/0013-owner-passkey-private-domain.md).
These are scoped operator procedures, not permission to transfer owner data/keys.

## Fixed boundary

- Nonroot Linux account `wealthos_dev`; existing host/service users unchanged.
- Code release `/home/wealthos_dev/.goldsilver-service/releases/<exact40hexSHA>`;
  clean authorized branch with all three GitHub jobs verified for that SHA.
- Private state `/home/wealthos_dev/.asha-private/goldsilver`; private directories
 0700, configuration/backup files0600, owner-held, no links/shared write. Never
  document root, Git, log output or permissive inherited configuration.
- Dedicated PostgreSQL17.11 on127.0.0.1:15432, no Unix socket/remote listener;
  SCRAM, separate cluster/migration/runtime roles. Never reuse port5432.
- Gateway127.0.0.1:3012 with a built production UI on another loopback port.
  The project HTTPS proxy must meet the gateway's explicitly reviewed transport
  contract; arbitrary forwarded identity, client IP or host is never accepted.
  Production explicitly enables `goldsilver-loopback-v1`: loopback peer,
  transport Host exactly `127.0.0.1:3012`, one or two raw forwarded-host fields
  with at most two total identical `goldsilver.wealthos.ir` entries, and one exact `https`
  protocol header. Canonical application Host is reconstructed only after these
  checks. Forwarded identity/IP/host are stripped; original browser Origin and
  session/CSRF checks remain mandatory. Direct canonical Host is still supported.
- The existing public CDN has two project-only page rules on
  `goldsilver.wealthos.ir/**`: Cache Settings Off and Browser Caching Off. They
  preserve no-store from the application; no global/default/other-host rule was
  changed. Recheck public headers after any CDN change. Origin Control is not
  available in the current plan and is not required by this tested configuration.
  Never upgrade the plan or ignore cache-control as a workaround.

## Preparation and activation

1. Preserve current project proxy metadata/copy, existing crontab and any prior
   release identity privately. No unrelated configuration change or deletion.
2. Use only reviewed official PostgreSQL tools. `prepare-private-database.mjs
   --prepare` is explicit/fresh-only and requires8GiB free. It generates service
   database credentials on the server, applies reviewed migrations, checks exact
   runtime readiness and empty private tables. It creates no owner grant/key.
   A partial preparation is preserved and diagnosed; never blindly rerun/reset it.
   The reviewed `--resume-empty-initialization` exception is only for the exact
   retained three protected configurations plus preparation marker and an empty
   data directory. It preserves credentials, uses an exclusive persistent attempt
   marker, refuses any populated/unknown state and feeds initdb through a fixed
   kernel pipe with `--no-clean`. Back up that exact retained state first. A failed
   attempt is not automatically retried and its marker/data are not removed.
3. Locked full `npm ci` and `npm run build:private` on the clean exact branch/SHA.
   Runtime needs Vinext, currently in devDependencies; omit-dev alone is wrong.
   Full dependency review remains mandatory. No development server/operator route.
4. Run `private-server-backup.mjs`. It holds a DB advisory lock, dumps one exported
   snapshot, restores into its own newly created `asha_backup_verify_<8hex>` DB,
   compares all25persistent tables and verifies6authentication tables empty.
   Retain protected dump/receipt and verify its SHA; a receipt alone is inadequate.
   The temporary verification copy only is cleaned up; live DB/old backups remain.
5. `install-private-supervision.mjs --activate-reviewed-release` requires reviewed
   clean build, runtime readiness and a recent intact verified backup. Preserve
   existing crontab byte-for-byte outside this project's delimited additions.
   Project boot/minute supervision and daily verified backups are separate jobs;
   failures must not launch permissive local mode. Logs contain fixed labels only.
   To replace an already installed release, additionally specify
   `--replace-reviewed-release=<previous40hexSHA>`. The installer must recognize
   exactly the previous generated project block, preserve all unrelated bytes and
   validate the existing service lock without replacing or acquiring it. The old
   release and crontab backup remain available. A protected exclusive old-SHA
   upgrade marker prevents two targets replacing the same release concurrently;
   an ambiguous attempt remains for manual inspection, never automatic eviction.
   This operation changes the schedule, not the running process.
   Stop only the positively identified
   old project supervisor after the new schedule is verified; its child is stopped
   by that supervisor and the minute job starts the reviewed replacement. Do not
   signal PostgreSQL, another site's processes or an unverified PID.
6. Check public HTTPS root/assets/template, exact release health, private401s,
   operator404s, allowed passkey protocol and unavailable provider state. Verify
   process restart/admin-disconnect. Do not reboot a shared host to prove this;
   actual host reboot stays untested until coordinated separately.

## Actual owner enrollment and recovery

Owner activation is deferred to final acceptance under ADR0014. The procedures
below describe that final-stage handoff, not the next task or authority to issue
another grant while independent work continues.

There is no signup or first-login-wins. `private-passkey-administration.mjs
issue-bootstrap` is a separately approved operator action. It issues one grant
for at most5minutes, writes plaintext once to a new private0600server file, and
stores only its hash in DB. Delivery to an exact protected owner destination
requires specific authority. Never embed the grant in a URL, output or screenshot.
The owner enters/submits it and confirms the device's passkey prompt themselves.
Registration does not establish a session; then use normal passkey login.

### Windows direct-delivery boundary

After explicit one-grant authority, use the fixed local entry point
`node scripts/passkey-handoff.mjs --check`, then `--prepare` if safe. These two
operations do not contact the server or issue a grant. They must never change
shared/parent ACLs. Preserve the Google credential directory and its own stricter
storage policy. The new passkey leaf and files use protected owner/SYSTEM-only
ACLs at creation; no permissive create-then-repair interval is acceptable.
The existing parent may have explicit read/list/execute-only additional entries,
but must remain protected, owned by the current account, with current/SYSTEM full
control and no foreign create/write/delete/ACL/ownership capability. Extra parent
read permissions cannot enter the protected leaf. This handoff-only parent rule
does not relax the original Google guard or the exact two-entry leaf/file checks.

Only when owner handoff is ready, the separately authorized
`--issue-and-deliver-once` claims an exclusive persistent nonsecret attempt marker
and an exclusive final-file handle before contacting the pinned SSH peer. The
fixed deployed administration script issues one grant. Only the token's43ASCII
bytes enter the final file; expiry is returned as nonsecret metadata. The secret
pipe stays inside the helper processes, never tool output. Never run
`passkey-handoff-remote.mjs`'s delivery function directly from an interactive tool.

An existing grant/attempt, failed or ambiguous delivery is a hard no-retry state,
not permission to delete a marker, overwrite a file or mint a second grant. Keep
all artifacts and diagnose first. Finish tests/CI before consuming the five-minute
window. Starting registration consumes the grant at the options step; cancelling
the device prompt may therefore require a separately authorized recovery action.

After genuine login, verify purchase/Excel/save/reload/logout and a second
independent device with nonprivate acceptance records. Additional passkey creation
requires a fresh login (at most5minutes) and explicit user device confirmation.
Two credentials in the same sync ecosystem are not proof of independent recovery.

If every authenticator is lost, verified owner/admin approval is required before
`reset-owner --confirmed-owner-recovery`. It revokes credentials/grants/challenges/
sessions without deleting the portfolio, followed by a new deliberate enrollment.
Restored backups likewise require reenrollment; never restore stale auth data.

Use the [short Persian owner acceptance guide](PRIVATE_OWNER_ACCEPTANCE.md) for
the actual browser/device handoff. Do not infer authenticated behavior from the
already completed anonymous/public checks.

## Rollback and limitations

### Read-only operator check

Run `npm run ops:check-private` from the exact reviewed Linux release's `apps/web`
directory. It accepts no path/environment/flag override and makes no service,
database, provider, configuration, schedule or cleanup change. It validates the
clean branch/SHA and bounded, nonlinked built manifest, available bytes against
the existing8GiB reserve, and the existing protected-file retained-backup verifier
(freshness, same-release binding, actual retained dump digest). Failed/unknown
checks exit nonzero with fixed reasons; raw errors, dump paths and secrets are
not printed. A Windows/development checkout deliberately cannot pass this check.

This is a manual point-in-time check, not background alerting, a new backup or a
substitute for the upgrade installer's gates. Passing does NOT prove browser/login,
database health, spare build headroom, private-use readiness or off-host recovery.
The existing public health endpoint remains availability/release-only.

### Prepared but inactive market-cache storage

`scripts/private-market-cache-storage.ts` provides fixed Linux owner-only inspection
and explicit preparation of `PRIVATE_DATA_ROOT/latest-market`. It reuses the
existing latest-cache names; no provider/cache contents or key are read. Inspection
does not create a missing leaf; explicit preparation can create only that leaf
with0700 permissions under already-safe pinned ancestors. Unsafe/linked/writable
state, unknown files and races are rejected, preserved and never repaired/deleted.
Its metadata-safe result is NOT quote validity, quota readiness or activation;
existing lock/pending markers remain visible, not automatically evicted. No startup
or production service is attached to this preparer. Actual production execution
and narrow database grants still require the remaining documented gates below.

Before any deployment, retain the previous exact code/config/crontab and verified
data backup. On an unsafe initial activation, disable ONLY this project's new
supervision/backup entries and stop ONLY its positively identified processes;
leave data/config/backups for diagnosis, and leave domain fail-closed. On upgrade,
restart only a previously verified compatible release after checking migrations;
do not blindly downgrade schema or overwrite newer portfolio data. Recovery into
a separate database is preferable to destructive in-place restoration.

Backups retained on the same host are not off-host disaster recovery. No automatic
deletion/rotation is authorized; monitor8GiB reserve and arrange capacity/retention
before it is exhausted. Provider configuration and portfolio import are separate
gates; until approved, hosted prices remain unavailable instead of guessed.

For hosted prices, key copying alone is insufficient. The authenticated runtime
can accept a validated server-supplied market adapter, but production currently
supplies none. The inactive `auth/private-managed-market.ts` factory composes the
existing service/ledger with a live owner check before cache access and another
session-locked authorization inside quota reservation. Each invocation owns its
proof; outcome accounting after a committed reservation uses bounded ordinary
transactions, not a revoked session and never a refund/retry. HTTP pre/post-owner
checks remain mandatory. Dependencies are explicit; it loads no environment,
files or keys and is not imported by the production entry. Controlled transport
and disposable-database tests are not a provider activation or live owner login.

Linux private latest-cache preparation, narrow quota/outcome table
grants/readiness, protected provider configuration and one audited account-level
quota authority are still required. Reuse existing service/cache/ledger code,
never the local-only route or its development flags. Reconcile the existing
31-day reservations/cooldown and disable the old acquisition authority before
enabling another; a fresh hosted ledger or key rotation is not a quota reset.
