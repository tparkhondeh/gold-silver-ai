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
  The existing project HTTPS proxy must preserve the exact public Host.

## Preparation and activation

1. Preserve current project proxy metadata/copy, existing crontab and any prior
   release identity privately. No unrelated configuration change or deletion.
2. Use only reviewed official PostgreSQL tools. `prepare-private-database.mjs
   --prepare` is explicit/fresh-only and requires8GiB free. It generates service
   database credentials on the server, applies reviewed migrations, checks exact
   runtime readiness and empty private tables. It creates no owner grant/key.
   A partial preparation is preserved and diagnosed; never rerun/init/reset it.
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
6. Check public HTTPS root/assets/template, exact release health, private401s,
   operator404s, allowed passkey protocol and unavailable provider state. Verify
   process restart/admin-disconnect. Do not reboot a shared host to prove this;
   actual host reboot stays untested until coordinated separately.

## Actual owner enrollment and recovery

There is no signup or first-login-wins. `private-passkey-administration.mjs
issue-bootstrap` is a separately approved operator action. It issues one grant
for at most5minutes, writes plaintext once to a new private0600server file, and
stores only its hash in DB. Delivery to an exact protected owner destination
requires specific authority. Never embed the grant in a URL, output or screenshot.
The owner enters/submits it and confirms the device's passkey prompt themselves.
Registration does not establish a session; then use normal passkey login.

After genuine login, verify purchase/Excel/save/reload/logout and a second
independent device with nonprivate acceptance records. Additional passkey creation
requires a fresh login (at most5minutes) and explicit user device confirmation.
Two credentials in the same sync ecosystem are not proof of independent recovery.

If every authenticator is lost, verified owner/admin approval is required before
`reset-owner --confirmed-owner-recovery`. It revokes credentials/grants/challenges/
sessions without deleting the portfolio, followed by a new deliberate enrollment.
Restored backups likewise require reenrollment; never restore stale auth data.

## Rollback and limitations

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
