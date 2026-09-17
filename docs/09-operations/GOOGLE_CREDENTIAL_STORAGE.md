# Private Google credential retention preflight

This is a local, metadata-only storage check, not Google login activation or a
credential importer. The [September 17 incident](../10-project-state/GOOGLE_IDENTITY_SETUP_2026-09-17.md)
remains authoritative: the exposed unused client was deleted and must never be
restored or reused. No replacement credential is supplied by this procedure.

## Fixed destination and commands

The current helper targets only the repository's ignored
`.cache/identity/google-owner-login/credentials.json`. From `apps/web`:

```powershell
node --experimental-strip-types scripts/identity-storage.mjs --check
node --experimental-strip-types scripts/identity-storage.mjs --prepare
```

`--check` reads filesystem/Git/permission metadata only. `--prepare` may create
missing `identity` and `google-owner-login` directories **only below a verified
safe existing `.cache` parent**, with owner+SYSTEM permissions attached at the
instant of creation. Neither command reads/imports/writes credential contents,
changes an existing ACL, repairs an unsafe path, scans Downloads, starts a server,
uses the network, or configures the application. There is no arbitrary path or
environment override. Output contains fixed status strings and booleans only;
exit code 1 means stop, not permission to bypass a guard.

Checks cover ignored and untracked Git location, every existing path component's
directory/reparse status, ancestor mutation rights, protected owner+SYSTEM-only
private directory ACLs and correct child inheritance. An existing credential
must be a regular single-link file, 1–16 KiB, owned by the current account and
readable only by that account and SYSTEM. Inherited file permissions are accepted
only when they contain exactly these same permissions; an unsafe file is never
rewritten. Unexpected directory entries block readiness without printing names.
No content/schema, client identity, callback, secret validity or provider state
is verified. Local administrators/SYSTEM and a compromised owner session remain
outside this filesystem isolation guarantee.

## Current safe-path limitation

The existing Google leaf directory is empty and has a protected owner+SYSTEM ACL.
Fresh metadata review nevertheless found ancestor mutation grants to the intended
Codex sandbox principal and additional non-admin principals. This is not evidence
of public internet exposure, but it prevents certifying the complete fixed path.
The helper therefore reports `blocked`; it must not modify broad workspace ACLs.

Read-only review of `C:\Users\pc\.asha-private\google-owner-login` found a safer
existing parent chain: drive, Users and profile had no applicable mutation grants
outside the owner/SYSTEM/Administrators boundary and no reparse points. The proposed
directories were absent. This path is **not supported or created by the current
helper**. Preparing it needs explicit owner approval and a separately reviewed
fixed-path update. Do not create a replacement OAuth client while retention is
blocked. Recheck all metadata when that approval is available; these observations
are not a permanent permission guarantee.

## Owner-operated direct Save As

Only after a reviewed destination reports `ready_for_direct_save_as`:

1. First verify manually, using a harmless file, that the selected browser can ask
   for a download destination before writing bytes. This check does not authorize
   an agent to read credentials or claim it can choose a native Save As path.
2. Obtain the specific authorization required for the replacement Google client.
   Use only the official provider interface. Never restore the exposed client.
3. The owner chooses **Save As directly in the verified private folder**, with the
   exact filename `credentials.json`. Do not first save in Downloads and move it,
   use clipboard/chat, paste into a terminal, or use a custom capture web server.
   If the browser cannot guarantee direct destination selection, stop before
   generating/downloading a new secret and request a different reviewed method.
4. Do not overwrite an existing file. After completion, run `--check` again. Require
   `stored_file_metadata_safe`; a failure must not trigger import, login or ACL
   repair. Keep any credential-bearing provider modal out of DOM snapshots,
   accessibility dumps, screenshots, logs and shared screen captures.
5. Metadata success means only private local retention. Do not open/print the file
   for confirmation, send it to a server, commit it, or infer completed login.

The helper performs no backup or retention rotation. Protecting an eventual
backup and importing a credential require their own explicit scope.

## Environment separation

The intended hosted client has one callback,
`https://goldsilver.wealthos.ir/auth/google/callback`, no JavaScript origins and no
localhost redirect. Retention is local preparation, not permission to deploy it.
Synthetic login tests require no real credential. Any later real local login must
use a separately approved development client and separate private destination;
never add localhost to the hosted client or copy its secret into browser code,
test fixtures or public runtime configuration. The minimum intended identity
scope is `openid email`, not contacts, Gmail, Drive or financial data.
