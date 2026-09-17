# Rahavard entitlement and minimal-data review — 2026-09-17

## What was actually verified

Baseline: clean `8c1537d9dc3fb9207629be1351cb8f8d5de81a5e` on
`codex/phase-2-decision-engine`. Full Git bundle verified before changes at
ignored `.cache/checkpoints/rahavard-20260917/before.bundle`. No existing holdings,
purchase records, provider secrets, server, main or financial method are changed.

| Check | Fresh evidence and limit |
|---|---|
| Browser entitlement | The previously open authenticated support page's menu showed one active Gold subscription. After full navigation, the newly loaded terms/export pages instead showed sign-in; the sign-in form was verified and left for the owner. The old menu alone does not establish a currently valid session or export authorization. No credential/account/portfolio screen was extracted. |
| Official export | The current [export page](https://rahavard365.com/dataexport) still advertises the Gold desktop tool and use in other analysis applications; [support FAQ](https://rahavard365.com/support) confirms TXT. This establishes a real official route, not its exact file schema, physical-silver coverage, latest-only controls or retention scope. |
| Terms | [Article 2.1](https://rahavard365.com/terms-and-conditions) still limits copying/transferring information without express permission. The specific export entitlement and general terms must be read together; neither a blanket ban nor unlimited permission is inferred. The unresolved bounded permission gate in ADR 0011 remains. |
| Provider reply | The Gmail connector was disconnected. The existing authenticated Gmail browser search, narrowly scoped to Mabna/Rahavard and the export inquiry since September 15, returned only the original sent inquiry, not a matching reply/bounce. No new message, draft or follow-up was sent. This is not a claim that no reply exists in another channel/account. |
| Local export | Metadata-only check found zero files in the previously configured `.cache/rahavard-export/` folder. Native settings were not re-enabled or freshly verified; the last observed inactive state remains historical evidence, not a new attestation. No new acquisition, history, scheduled export or Navasan call was made. |

The owner was asked to complete fresh browser sign-in and provide any permission
reply received elsewhere, without credentials or private account details. Public
documentation did not establish a minimal latest-only export route. Current
physical-silver codes, exact unit/purity, adjustment/price kind, timestamp contract
and retention remain **TBD**. A fund/certificate must not fill those gaps by proxy.

## Useful independent work, not a guessed vendor adapter

The existing file intake already has a separate synthetic profile, byte/hash
provenance, duplicate-history rejection, explicit units/purity, replay validation
and guarded browser storage. It was reused, not rebuilt or relabeled as real.
The existing personal valuation still requires the validated Navasan contract.
Without a permitted actual Rahavard sample there is no justified real mapping or
source-disagreement comparison to enable. No arbitrary manual approval checkbox
or invented TXT columns can open that gate.

Specialist review reproduced two independent timing defects in the existing file
test path: receipt timestamps slightly after evaluation could support current
value, and a quote just past its TTL could remain displayed as fresh until the
60-second clock tick. The bounded fixes reject future local receipt and refresh
the active UI at validity boundaries, focus and visibility, without importing,
fetching, restoring, saving or rewriting source times automatically.

Ordinary valid stored v1 files retain identical replay. A formerly accepted file
whose receipt was after its recorded evaluation time is now rejected and kept
intact, not migrated/deleted; advancing the wall clock does not repair that
internally inconsistent historical record. Clock rollback can temporarily prevent
replay until the local time is consistent; this is an explicit error, not a
reason to overwrite the original record or weaken validation.

Finance/data owns the contract regression, architecture/QA the UI clock and
coordinator the actual browser workflow/docs. Security/storage independently
reviews preservation and effects; role names are not claims of vendor approval.

## Verification and acceptance

Local verification completed against this change set:

- TypeScript, full ESLint and production build passed.
- All **363 web tests** passed (0 failures), including 16 file-contract and
  8 component-clock tests. Coverage: 95.90% lines, 89.51% branches, 96.94%
  functions. Tests include exact TTL crossing, render/effect race, visibility,
  focus, inactive cleanup, future receipt, byte-identical valid v1 replay,
  invalid record preservation and zero storage writes on blocked replay/save.
- Local readiness passed with no violations and the financial-use lock intact.
- The coordinator tested the running app in the in-app browser: a visibly
  synthetic near-expiry file first supported current valuation, then was
  excluded after expiry without another import or save. The recorded total
  stayed unchanged. Duplicate instrument rows were rejected while the previous
  result remained. Restoring the original saved test snapshot succeeded, then
  the existing personal-portfolio page was reopened. No new test snapshot,
  personal purchase, provider request or database record was saved.
- Finance/data, architecture/QA and security/storage agents reviewed the bounded
  changes; security independently checked the sensitive time/storage behavior.
  No new dependency or persistence schema was added. The previous same-day
  19-test local PostgreSQL pass belongs to baseline `8c1537d`, not a new local
  run; fresh PostgreSQL integration and production audit are checked in CI for
  the delivery SHA. Existing development-only dependency advisories are not
  claimed resolved by this change.

| Path | Evidence classification |
|---|---|
| Fresh Rahavard sign-in and permitted latest-only sample | Blocked: owner sign-in and verified export scope/sample still required. |
| Real Rahavard symbol/unit mapping, personal valuation and source conflict | Blocked, not replaced by guessed metadata or synthetic factors. |
| File validation, future/expired price, duplicate rows, guarded replay/save | Controlled synthetic regression tests passed; actual browser expiry/rejection/restoration also passed. |
| Existing Navasan personal valuation | Existing real-price snapshot displayed; no new acquisition in this turn. The earlier receipt/freshness evidence remains separately dated. |
| Independent browser, mobile and server/deployment | Not tested or changed in this local-only turn. |

Real Rahavard receipt, actual-file valuation, cross-source comparison and
end-to-end real Rahavard acceptance remain **blocked**, not passed by synthetic
tests. Previously tested Navasan-to-personal functionality is not newly attributed
to Rahavard. No new production dependency or database schema is introduced.

Exact delivery SHA, Push and all three CI jobs must be checked at handoff and
recorded in the ignored checkpoint manifest. Owner acceptance and deployment
remain separate gates.

## Exact next action and unsent support question

Fresh sign-in restores access only; it does not by itself resolve the export
scope. Continue the already-sent inquiry rather than sending a duplicate. When a
provider answer exists, verify minimal latest-only acquisition and local retention,
obtain a permitted minimal sample into ignored storage, inspect its actual schema
and instrument identity, then implement a reviewed separate real-file profile.

Suggested clarification, **not sent**:

«لطفاً در پاسخ به درخواست قبلی مشخص کنید با اشتراک طلایی چگونه فقط آخرین رکورد
نمادهای طلای ۱۸ عیار، سکه امامی و نقرهٔ فیزیکی ۹۹۹ را، بدون تاریخچه و اجرای
خودکار، برای استفادهٔ شخصی در Gold/Silver AI دریافت کنیم؟ آیا نگهداری فقط آخرین
نسخه روی کامپیوتر شخصی مجاز است؟ کد دقیق نماد، واحد و ضریب قیمت، عیار، زمان و
نوع قیمت و نمونهٔ قالب TXT را هم اعلام کنید؛ منظور قیمت صندوق یا گواهی نیست.»

Local existing test entry: `http://127.0.0.1:4174/` → «سبد شخصی جداگانه» for the
already implemented Navasan valuation, or «آزمون با قیمت بازار» → «اتصال فایل TXT
رهاورد / آزمون ساختگی» for the explicitly synthetic file checks. Neither route is
evidence of a completed real Rahavard connection.
