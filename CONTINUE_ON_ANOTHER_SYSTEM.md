# ادامهٔ توسعهٔ اشا روی سیستم دیگر

**Version 1.0.0** · ASHA · ۱۴۰۵/۰۶/۰۸ · Development handoff, not a production release

## AI READING INSTRUCTION

Read `[SPEC]` as transfer instructions and `[?]` as unresolved gates. A successful
push, local unit tests or CI do not constitute financial approval.

## 1. دریافت شاخهٔ درست

**[SPEC]**

- ریپوی خصوصی: `tparkhondeh/gold-silver-ai`؛ ورود با حساب مجاز GitHub لازم است.
- شاخهٔ ادامه: `codex/phase-1-data-ui`، نه `main` و نه کپی‌های قدیمی OneDrive.
- در یک پوشهٔ جدید، با Git نصب‌شده:

```sh
git clone --branch codex/phase-1-data-ui --single-branch https://github.com/tparkhondeh/gold-silver-ai.git
cd gold-silver-ai
git status --short
git log -1 --oneline
```

- اگر clone قبلاً وجود دارد، ابتدا تغییرات محلی آن را حفظ کنید؛ فقط با working tree تمیز:

```sh
git fetch origin
git switch codex/phase-1-data-ui
git pull --ff-only origin codex/phase-1-data-ui
```

- در صورت تعارض یا واگرایی توقف کنید؛ reset، force push یا merge به `main` مجاز نیست.

## 2. اجرای رابط و آزمون‌ها

**[SPEC]**

- Node.js حداقل `22.13` همراه npm لازم است؛ CI پروژه روی `22.13.1` تنظیم شده است.
- وابستگی‌ها از lockfile نصب می‌شوند؛ `node_modules` یا build دستگاه قبلی را کپی نکنید.

```sh
cd apps/web
npm ci
npm run typecheck
npm run lint
npm test
npm run dev -- --port 4174
```

- رابط: [localhost:4174](http://localhost:4174/)، وضعیت سرویس: [/api/health](http://localhost:4174/api/health).
- حالت پیش‌فرض آزمایشگاهی و دارای داده‌های صریحاً ساختگی است؛ سبد مشترک بین مرورگرها هنوز کامل نیست.
- عامل توسعه ابتدا `AGENTS.md`، `CLAUDE.md`، `docs/10-project-state/CURRENT_STATE.md` و `NEXT_TASK.md` را بخواند؛ مسیر checkout همین سیستم مبناست، نه مسیر مطلق دستگاه قبلی در گزارش‌های تاریخی.

## 3. چیزهایی که Git منتقل نمی‌کند

**[SPEC]**

- `.env.local`، کلیدهای API، رمزها، دیتابیس، پشتیبان‌ها، نصب‌کننده‌ها و `.cache` عمداً منتقل نمی‌شوند.
- سبد شخصی و مشخصات تصمیم ذخیره‌شده در مرورگر بخشی از Git نیستند؛ clone یا pull آن‌ها را منتقل نمی‌کند. مرورگر دستگاه قبلی را برای بازیابی احتمالی حفظ کنید.
- Pluginها و تنظیمات شخصی Codex نیز با کد پروژه نصب نمی‌شوند؛ قواعد پروژه در `AGENTS.md` و `CLAUDE.md` باقی می‌مانند.
- کلید افشاشدهٔ نوسان نباید کپی یا استفاده شود. ابتدا در پنل تأمین‌کننده لغو/تعویض شود و جایگزین فقط از ورودی امن محلی وارد شود، نه چت یا Git.

## 4. PostgreSQL و نقطهٔ ادامه

**[SPEC]**

- PostgreSQL روی سیستم جدید باید مستقل آماده شود؛ دیتابیس آزمون فقط `asha_integration` است، هرگز دیتابیس شخصی.
- migrationها و آزمون واقعی در `apps/web/db/` و `apps/web/tests/integration/` هستند. `npm run test:db` بدون تنظیم صریح دیتابیس تست شکست می‌خورد، نه اینکه skipped را موفق اعلام کند.
- `apps/web/scripts/local-postgres.mjs` مخصوص Windows است و بستهٔ تأییدشدهٔ 17.11 را در `.cache/postgres-17.11/runtime/bin` انتظار دارد. با حساب مالک اجرا شود، نه sandbox؛ راه‌اندازی کامل آن هنوز تأیید نشده است.
- خطای ACL دستگاه قبلی با Git منتقل نمی‌شود. اصلاح آن روی همان دستگاه نیازمند اجازهٔ درخواست‌شده است؛ روی سیستم جدید مسیر یا SID دستگاه قبلی اعمال نشود.
- جزئیات آزمون و محدودیت‌ها: [PostgreSQL checkpoint](docs/10-project-state/POSTGRES_FOUNDATION_CHECKPOINT.md).

**[?]**

- تست محلی دیتابیس/بازیابی، احراز هویت، جداسازی کاربران، سبد ماندگار و انتقال غیرمخرب دادهٔ مرورگر تکمیل نشده‌اند.
- provenance کامل، سهمیه/کش ماندگار و تاریخچهٔ مجاز پیش‌نیاز مرحلهٔ موتور واقعی هستند.
- موتور `ASHA_DETERMINISTIC_BASELINE_V1`، ارزیابی واقعی و تأیید استفادهٔ مالی هنوز انجام نشده‌اند؛ انتقال کد این دروازه‌ها را دور نمی‌زند.

## 5. Changelog

**[SPEC]**

- 1.0.0: راهنمای دریافت شاخه، اجرای رابط، مرز انتقال داده و ادامهٔ توسعه بدون اعلام آمادگی عملیاتی.
