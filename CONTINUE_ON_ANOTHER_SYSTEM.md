# ادامهٔ توسعهٔ اشا روی سیستم دیگر

**Version 1.1.0** · ASHA · ۱۴۰۵/۰۶/۱۰ · Development handoff, not a production release

## AI READING INSTRUCTION

Read `[SPEC]` as transfer instructions and `[?]` as unresolved gates. A successful
push, local unit tests or CI do not constitute financial approval.

## 1. دریافت شاخهٔ درست

**[SPEC]**

- ریپو: `tparkhondeh/gold-silver-ai`؛ مخزن فعلاً عمومی است، اما برای push همچنان
  ورود با حساب مجاز GitHub لازم است.
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
npm run ops:check-local
```

- پس از آماده‌سازی PostgreSQL محافظت‌شده روی Windows، `npm run local:run` راه سادهٔ
  اجرای هم‌زمان دیتابیس و برنامه است. در سیستم کاملاً جدید ابتدا باید راه‌اندازی
  دیتابیس طبق بخش ۴ انجام شود.

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
- `apps/web/scripts/local-postgres.mjs` مخصوص Windows است و PostgreSQL 17.11 را در
  حافظهٔ محلی و نادیده‌گرفته‌شدهٔ Git مدیریت می‌کند. روی میزبان فعلی با حساب مالک
  نصب، مهاجرت، دسترسی حداقلی، آزمون و بازیابی آن تأیید شده است.
- `npm run db:backup` پشتیبان محلی می‌سازد و قبل از اعلام موفقیت آن را در یک دیتابیس
  موقت کامل بازیابی می‌کند. این فایل‌ها محلی، بدون رمزنگاری و خارج از Git هستند.
- محدودیت‌های امنیتی هر سیستم باید با هویت همان مالک ساخته شوند؛ مسیر یا SID یک
  دستگاه دیگر را کپی یا بازسازی نکنید.
- جزئیات آزمون و محدودیت‌ها: [PostgreSQL checkpoint](docs/10-project-state/POSTGRES_FOUNDATION_CHECKPOINT.md).

**[?]**

- تست محلی دیتابیس/بازیابی، جداسازی مالک، سبد ماندگار، رجیستری منشأ و سهمیهٔ پایدار
  تکمیل شده‌اند؛ ورود تولیدی و انتقال غیرمخرب دادهٔ مرورگر هنوز دروازهٔ جداگانه‌اند.
- تاریخچهٔ مجاز و منبع مستقل ایرانی پیش‌نیاز مرحلهٔ موتور واقعی هستند.
- موتور `ASHA_DETERMINISTIC_BASELINE_V1`، ارزیابی واقعی و تأیید استفادهٔ مالی هنوز انجام نشده‌اند؛ انتقال کد این دروازه‌ها را دور نمی‌زند.

## 5. Changelog

**[SPEC]**

- 1.0.0: راهنمای دریافت شاخه، اجرای رابط، مرز انتقال داده و ادامهٔ توسعه بدون اعلام آمادگی عملیاتی.
- 1.1.0: وضعیت واقعی میزبان منتقل‌شده، دیتابیس، پشتیبان و بررسی آمادگی محلی را
  جایگزین محدودیت‌های قدیمی کرد.
