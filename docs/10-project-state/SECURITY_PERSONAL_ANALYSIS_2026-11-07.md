# Security maintenance and personal analysis — November 7, 2026

## نتیجه و محدوده

هشدارهای بالای ممیزی کامل وابستگی‌ها از ۸ به صفر رسید؛ ۱۱ هشدار متوسط
باقی است. تحلیل توصیفی اکنون از همان نسخهٔ ذخیره‌شدهٔ سبد و همان محاسبهٔ
ارزش‌گذاری استفاده می‌کند. اتصال کامل تصمیم عملیاتی R2 تمام نشده است.
نقد مستقل، مدت میان‌مدت، تاریخچه و عوامل معتبرِ روش هنوز کافی نیستند؛
هیچ سفارش، بودجهٔ فرضی یا توصیهٔ مالی ساخته نمی‌شود.

این مرحله فقط توسعهٔ محلی روی `codex/phase-2-decision-engine` است.
سرور، نسخهٔ مستقر `d588a8c`، `main`، VPN، کلیدها و سهمیهٔ نوسان تغییر نکردند.
هیچ دریافت قیمت/تاریخچه، ورود مالک یا انتقال سبد انجام نشد. سندهای ثبت‌نشدهٔ
ممیزی پیشین حفظ و بازبینی شدند. اجازهٔ «صرفاً بررسی» مربوط به نوبت قبلی بود؛
درخواست بعدی مالک صریحاً توسعه، تست، Commit و Push همین مرحله را مجاز کرد.

## Backup and review boundary

Before edits, a verified all-ref Git bundle, original dirty status/handoff/routing
documents and original package manifests were retained in ignored
`.cache/checkpoints/security-r2-20261107`. Restoring means inspect that separate
bundle/copy first, never a destructive reset over subsequent work.

Three actual specialist agents contributed: security dependency/lock review,
personal-analysis implementation and independent calculations/security review.
They had disjoint edit ownership. The independent reviewer also examined the
Worker test correction; coordinator integrated and tested the real browser path.

## Minimal dependency correction

Fresh full npm audit before changes: **23 affected package entries: 8 high,
15 moderate, zero critical**. These are affected dependency entries, not 23
independent exploitable runtime defects. A zero omit-dev result was insufficient:
the private server imports Vinext from devDependencies.

| Selected correction | Why / relevant boundary |
|---|---|
| Vinext beta.8 → 1.2.0 and plugin-rsc 0.5.34 → 0.5.37 | First maintainer-supported paired fix for inline server-function/cache advisories; direct Vinext advisories were absent from npm's report. Existing project has no inline server functions/cache and gateway reduces exposure, but this is not an exemption for its runtime. |
| Vite 8.2.2 → 8.2.4 | Supported patch for current dev-server findings; local binding remains loopback, no TLS/security bypass. |
| Miniflare's Undici 7.29.1 → 7.30.1; Sharp → 0.35.5 | Scoped overrides for affected development/Worker tooling; includes matching optional native binaries. |
| fast-uri 3.1.9; source-map-js 1.2.2; Zod 4.6.6 | Exact compatible fixes, no broad parent toolchain upgrades. |
| Satori's fflate 0.7.5 | Scoped patched compression dependency. Vinext's required OG/Satori upgrade is retained rather than forcing an unsupported old renderer. |

Manifest/lock independently reviewed: 48 changed/new package records plus one
peer-metadata flag; exact registry integrity/download/license metadata matched for
all 48. All 23 applicable peer checks passed; declared engines accept CI Node
22.13.1. Optional Windows32 Sharp retains a pre-existing Node20 restriction,
irrelevant to Windows x64/Linux CI. Four new module paths are MIT; existing
MPL/LGPL-containing dependencies do not introduce a new license class. Root
dependency registry remains the manifest/lockfile, not this historical table.
Installation used locked metadata and disabled install lifecycle scripts locally.

Maintainer evidence checked November7:

- [Vinext inline cache capture](https://github.com/cloudflare/vinext/security/advisories/GHSA-8969-277p-8rrm),
  [cache collision](https://github.com/cloudflare/vinext/security/advisories/GHSA-2956-r8mj-w5c4).
- [Vite 8.2.4](https://github.com/vitejs/vite/releases/tag/v8.2.4),
  [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw).
- [Undici 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1),
  [Sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
  [fast-uri 3.1.9](https://github.com/fastify/fast-uri/releases/tag/v3.1.9),
  [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
  [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
  [Satori](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp),
  [fflate](https://github.com/advisories/GHSA-px8p-9vwx-vf98).

### Explicit remaining warnings

Fresh complete audit after installation: **11 moderate, zero high/critical**:

- Seven propagated entries from [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)
  under typescript-eslint/estree. Installed 10.2.5; first patched 11.0.1 lies outside
  the parent's supported range. Advisory condition `optimizationLevel >= 2` is
  absent in the inspected call (only `dot: true`); current lint configuration
  does not enable its project-service/default-project path. No demonstrated
  exploitable project path; still reported, not suppressed or declared fixed.
- Four entries under Drizzle Kit → esbuild-kit →
  [esbuild 0.18.20](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).
  Advisory concerns esbuild's development serve endpoint. Inspected tooling uses
  transform/version, not serve; private runtime does not execute Drizzle Kit.
  Current stable parent still carries the chain. No forced downgrade or broad
  migration is justified for this bounded patch.

Do not expose these tooling servers or enable the affected optional lint path.
Review a supported parent release before enabling either; any incompatible
toolchain migration needs a separate compatibility assessment. The deployed
server has **not** received these fixes. CI now audits the **entire** dependency
tree at high severity instead of omitting development dependencies; moderate
findings remain visible. No warning suppression or `audit fix --force` was used.

### Compatibility corrections found by real tests

Vinext 1.2's Worker build imports `cloudflare:workers`; the previous test tried to
import that Worker into Node. The corrected test runs the actual built bundle and
assets in local workerd/Miniflare, with synthetic bindings and every outbound
request intercepted as 503. Existing assertions remain; enabled → populated cache
→ disabled behavior is now explicitly checked in the same isolate. No production
route or security policy changed. The normal local launcher also required the
supported `--host 127.0.0.1` flag in place of removed `--hostname`; actual startup
was tested, retaining strict port and loopback restrictions.

## Bounded R2 acceptance and implementation

Acceptance for this unit: edits that have been saved, exact purchase totals,
eligible quotes, saved concentration limit and provenance must reach the same
overview/analysis result; missing cash/factors must never become an action.

`asha.personal_portfolio_analysis.v1` validates the saved portfolio and reuses the
existing exact valuation once. That result feeds both overview and analysis.
Per-asset quantity, complete/partial purchase basis, quote source/timestamps,
missing purchase inputs and saved portfolio version are traceable. Percentages
use **all registered holdings' valid current value** as denominator; if any row
cannot be valued, percentages and limit comparisons stay unavailable. The priced
subset is never silently renormalized to100%. Limit comparisons are descriptive,
not instructions to sell or hold. Unsaved settings never affect the result.

Two horizons remain separate with one unavailable shared budget. Cash, spendable
cash and prospective fees are `null`; no order is produced. Zero proposed spend
means no proposal, not known zero cash. Existing long-term years never become a
medium-term duration. The financial/execution flags remain false. Original
financial formulas, weights, methods, thresholds and seven-method laboratory are
unchanged. Synthetic quote fixtures exist only in tests, never as real inputs.

Remaining R2: authoritative cash/medium-horizon input contracts, eligible real
history/cost/liquidity/features and their validated binding to existing methods;
action quantities/conditions, costs, before/after allocation, alternatives,
invalidation and persisted decision replay. This descriptive unit does not claim
those outcomes. Licensed evidence/calibration R5/R6 and conversation layer R7
also remain; final owner enrollment is not the sole unfinished item.

## Executed validation

| Check | Actual result |
|---|---|
| TypeScript and lint | Passed |
| Private Node build + smoke | Both Google/passkey configurations passed; assets, Excel template and anonymous denials checked; no real login |
| Default Worker build/full coverage | 889 tests: 884 passed, zero failed, 5 Linux-only checks skipped on Windows; lines95.78%, branches91.71%, functions91.82% |
| PostgreSQL integration/backup-restore | 74/74 passed on isolated local PostgreSQL17.11; owner database was not the integration target |
| Normal local launch after acceptance | Loopback4174 healthy; existing backup supervisor completed a fresh backup and separate restore verification without deleting owner data |
| Python financial laboratory | 260/260 passed; methods unchanged |
| Independent calculation/panel review | 47 focused calculation checks and 17 panel/workspace tests passed; exact decimals, completeness, expiry, saved-only settings and no-action boundary reviewed |
| Browser | Headless Chromium156.0.8078.4, separate context and new isolated acceptance DB; no provider key/network or owner records |

Browser exercised manual multiple buys, invalid negative input, saved constraints,
small quantity `0.000001`, empty/malformed Excel, preview-before-save, successful
import, duplicate rejection, failed-save draft retention, reload, second-context
restoration, exact backup download and public-evaluation separation. Controlled
fresh/expired quote responses exercised valuation/share removal with no orders.
They are **simulated provider transport**, not newly acquired real market prices.
No browser page errors were observed. The screenshot was visually reviewed.

Actual ordinary Chrome launch failed with `GetCursorPos: Access is denied`; that
is not claimed tested. Firefox/mobile/real owner login/cross-device private access
remain untested. Separate contexts on one computer are not separate-device proof.
The isolated acceptance DB is retained; it was not merged into the owner DB.

Evidence logs/audits and nonprivate browser results remain ignored in the local
checkpoint directory above. GitHub evidence must be the three checks on the exact
Commit being delivered, not earlier green runs; see that Commit's Actions page.
Passing local tests alone does not imply remote CI or deployment.

## آزمون مالک و ادامه

نسخهٔ محلی: `http://127.0.0.1:4174/`. بعد از آزمون جدا، راه‌انداز معمول پروژه
دوباره اجرا و سلامت آن تأیید شد؛ اطلاعات آزمون به سبد اصلی اضافه نشدند. در «تحلیل و
تصمیم»، مقدار و بهای خرید باید با نمای سبد یکسان باشند. تغییر تنظیمات فقط پس
از ثبت اثر دارد؛ بدون قیمت معتبر، ارزش و درصد نامشخص می‌مانند. برای ثبت
غیرخصوصیِ موقت، مسیر قدیمی `/evaluation` همچنان جدا و بدون قیمت است؛ این مسیر
عمومی پنل شخصی جدید را جایگزین نمی‌کند. دادهٔ خصوصی را در آن وارد نکنید.

قدم بعدی: قرارداد نسخه‌دارِ نقد قابل‌خرج و مدت میان‌مدت را به همان ذخیرهٔ
سبد اضافه و مهاجرت/بازیابی را بدون حدس یا دست‌کاری خریدها آزمایش کنیم؛ سپس
ورودی‌های معتبرِ روش‌های موجود متصل شوند. انتشار اصلاح امنیت روی سرور،
اعتبارسنجی بازار و آزمون خصوصی نهایی، مراحل جدا هستند.
