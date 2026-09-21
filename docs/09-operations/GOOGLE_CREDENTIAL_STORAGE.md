# Private Google credential retention preflight

This is a local, metadata-only storage check, not Google login activation or a
credential importer. The [September 17 incident](../10-project-state/GOOGLE_IDENTITY_SETUP_2026-09-17.md)
remains authoritative: the exposed unused client was deleted and must never be
restored or reused. No replacement credential is supplied by this procedure.

## Fixed destination and commands

On 2026-09-21 the owner explicitly approved a NEW isolated private destination
`C:\Users\pc\.goldsilver-private\google-owner-login`, leaving the previous shared
parent and protected leaf untouched. The helper now targets exactly
`C:\Users\pc\.goldsilver-private\google-owner-login\credentials.json`, outside the
workspace. It does not derive a destination from an environment variable or
accept a caller-selected path. From `apps/web`:

```powershell
node --experimental-strip-types scripts/identity-storage.mjs --check
node --experimental-strip-types scripts/identity-storage.mjs --prepare
```

`--check` reads filesystem/permission metadata only. `--prepare` may create
missing `.goldsilver-private` and `google-owner-login` directories **only below the
verified existing `C:\Users\pc` profile**, with owner+SYSTEM permissions attached at the
instant of creation. Neither command reads/imports/writes credential contents,
changes an existing ACL, repairs an unsafe path, scans Downloads, starts a server,
uses the network, or configures the application. There is no arbitrary path or
environment override. Output contains fixed status strings and booleans only;
exit code 1 means stop, not permission to bypass a guard.

Version 2 reports `outsideRepository` and `gitBoundarySafe` instead of the obsolete
workspace ignore/index checks. It rejects a `.git` marker anywhere in the
destination ancestry by checking metadata only, not reading Git files or using
environment-sensitive Git commands. Checks also cover every existing path component's
directory/reparse status, ancestor mutation rights, protected owner+SYSTEM-only
private directory ACLs and correct child inheritance. An existing credential
must be a regular single-link file, 1–16 KiB, owned by the current account and
readable only by that account and SYSTEM. Inherited file permissions are accepted
only when they contain exactly these same permissions; an unsafe file is never
rewritten. The only optional additional entry is exactly `save-as-probe.txt`, a
regular single-link, owner+SYSTEM-only, nonempty file no larger than 1 KiB for the
owner's harmless Save As test. Its content is never read or certified; presence
does not itself prove browser behavior. All other directory entries block
readiness without printing names.
No content/schema, client identity, callback, secret validity or provider state
is verified. Local administrators/SYSTEM and a compromised owner session remain
outside this filesystem isolation guarantee. The exact Windows TrustedInstaller
identity is accepted as **owner of the volume root only**, because Windows servicing
owns that root on this machine. It is not an accepted profile/private-folder owner
and receives no exception for write/delete/permission-changing access rules.

## Preserved old path and preparation gate

The old workspace `.cache/identity/google-owner-login` leaf was empty and had a
protected owner+SYSTEM ACL at the September 17 check. Its ancestors had mutation grants to the intended
Codex sandbox principal and additional non-admin principals. This is not evidence
of public internet exposure, but it prevents certifying the complete fixed path.
That old path is not repaired, reused, deleted, or accessed by the new helper;
the authorized scope does not include changing broad workspace ACLs.

The intermediate `.asha-private\google-owner-login` destination is also preserved
and is no longer accessed by the helper. Its September 21 shared-parent permission
failure did not establish exposure of the separately protected leaf. The owner
approved isolation at the new fixed destination, not removal of shared grants.

Owner approval now permits the exact outside-workspace path, but creation must
follow the reviewed implementation and a fresh successful preflight. `canPrepare`
means that the missing private directories can be created; it is not proof they
already exist or that Save As was tested. Before creation, `status` remains
`blocked` and `readyForDirectSaveAs` remains false. Preparation never changes an
existing unsafe directory/file or retries elsewhere. Partial failure can leave
only newly created private empty directories; it never deletes them automatically.
Recheck after creation. These point-in-time checks are not a permanent permission
guarantee or proof of protection from an already compromised owner session.

## Owner-operated direct Save As

Current execution evidence and outstanding direct-Save-As proof are recorded in
the [September 21 destination checkpoint](../10-project-state/PRIVATE_CREDENTIAL_DESTINATION_2026-09-21.md).
Do not substitute an earlier path's metadata check for the active destination.

Only after a reviewed destination reports `ready_for_direct_save_as`:

1. First verify manually, using a harmless plain-text file of at most 1 KiB, that
   the selected browser can ask for a download destination before writing bytes.
   Save it directly as `save-as-probe.txt` in the approved folder without
   overwriting an existing file. It may remain there; `--check` will verify its
   metadata but never its contents or how the browser saved it. This check does
   not authorize an agent to read credentials or claim it can choose a native
   Save As path. If no separate harmless file is available, request one rather
   than using a real credential as the probe.
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
