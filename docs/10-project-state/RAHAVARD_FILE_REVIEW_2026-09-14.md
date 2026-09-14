# Rahavard file route — 2026-09-14

Scope: Gold/Silver only, branch `codex/phase-2-decision-engine`, source baseline
`eb4f390b85eb3eabb1f3a4fc3a2a88f459c77eb8`. The pre-existing CURRENT_STATE conversation
correction is preserved and included. Personal Agent/tia is not touched in this unit.
Main, server, methods, source credentials and provider quota are unchanged.

## Backup and implementation

Full Git bundle `.cache/checkpoints/rahavard-file-20260914/before.bundle` verified;
source ZIP SHA-256 `9ff964c5839445860d01c39f733f46f60633976deb7f0aade00bd33f47099d9a`.
The initially incorrect archive argument failed without writing source files; it was
corrected and this archive/hash verified. Pre-change copies of CURRENT_STATE, NEXT_TASK
and affected source files remain in the same ignored directory. No data deletion or reset.

Official route, fresh-login/entitlement uncertainty, exact unresolved metadata,
support draft and contracts are recorded once in
[RAHAVARD_FILE_INTAKE.md](../05-data/RAHAVARD_FILE_INTAKE.md).
The existing official download is not an API and is not dismissed for that reason.
No real market record was received: access/license/sample gates remain unresolved.

Added a file-only fixture workspace connected to all nine existing navigation views.
It shares exact valuation arithmetic, but neither pretends to be Navasan nor merges
with a real/personal portfolio. One discovered UI contradiction was corrected: the
outer footer no longer claims all technical-workspace quotes are real. Real intake
remains disabled until the actual vendor profile is reviewed; this unit prepares
testable plumbing, not an invented vendor file layout.

## Verification

- 210 web tests passed (197 prior + 13 new), including exact arithmetic parity,
  UTF-8/BOM/CRLF, limits, missing timestamp, symbol/unit/purity/price failures,
  duplicates/history refusal, immutable real gate, separate storage, failed writes,
  original text/hash and canonical replay. Overall line/branch/function coverage:
  95.19% / 86.51% / 96.33%; new file contract 100% lines/functions, 99.03% branches.
  Initial artificial Navasan fixture fell below its existing range and was corrected;
  no range check was weakened. Type inference was corrected without changing math.
- Typecheck, lint, Worker production build and production dependency audit passed;
  zero known production vulnerabilities reported. After the final UI fixes, all
  23 targeted file/Navasan tests, typecheck, lint and build passed again. Exact-commit
  CI is checked separately. No new library or schema migration.
- Existing local launcher starts only this project's PostgreSQL and Node app.
  `http://127.0.0.1:4174/` passed all 15 local readiness checks, with financial use
  blocked and zero external API calls in that check. No Navasan refresh was requested.
- Real browser file chooser imported a **synthetic** TXT. Gold=1g, coin=1, silver=0,
  cash=100,000,000 IRR yielded 100,003,000 IRR (10,000,300 toman).
- Changing gold to 2.345g, silver to 5g and cash to 12,345 IRR yielded exactly
  17,690 IRR (1,769 toman). All nine navigation views retained that total; short=14,
  medium=90. The deliberately old prices show no fresh total; no decision is emitted.
- Invalid-unit TXT was rejected through the browser file chooser while retaining
  the 1,769-toman result. Save/restore and full page reload reproduced the saved input;
  coin=0.5 was rejected and Save disabled; restore recovered the valid state.
- A fabricated current-clock file produced 1,769 toman in the fresh-total field;
  missing price time changed that field to unavailable, and a one-asset file made
  the complete total unavailable. Restore returned the saved old fixture; no real
  timestamp or quote was claimed for these injected cases.
- At the actual narrow browser viewport (469px), a table leaked horizontal overflow
  to 763px. Scoped table scrolling fixed it to 469px; screenshot inspected, and all
  nine views checked again with the same total. Switching to the Navasan workspace
  did not transfer fixture prices; switching back restored the separate file state.
  Final browser error-log inspection returned no errors; other browsers/devices
  were not tested. No viewport, account or security preference was changed.
- Corrupt/denied/quota/concurrent-storage faults are covered in controlled automated
  tests, not claimed as browser fault injection. Real file, vendor desktop login,
  live timestamps, licensed retention and real financial acceptance are **untested/blocked**.

## Owner test / remaining work

Open `http://127.0.0.1:4174/` on this computer → «آزمون با قیمت بازار» →
«اتصال فایل TXT رهاورد / آزمون ساختگی». Expand «ورود TXT و بررسی قالب», choose
«قرار دادن نمونه ساختگی» and «اعتبارسنجی و ورود نمونه». Change holdings/cash in
«فهرست دارایی‌ها»; inspect analysis/risk/decision, then save/recover. The sample is
deliberately old and fictitious. Do not relabel a real file or clear old browser data.
This is local evaluation, not an independently hosted or financially approved release.

Real vendor acquisition and actual-file mapping remain next; unrelated hosting and
financial-method gates were not used as reasons to stop this independent work.
No support message, purchase, installer execution, credential transfer or recurring
task was performed. Final commit/push/three-job evidence is recorded after verification
in the delivery response and ignored local `delivery.json` next to the checkpoint
logs. Verify the same source SHA on GitHub rather than treating local tests as CI.
