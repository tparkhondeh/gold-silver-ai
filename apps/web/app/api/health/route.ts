import { NextResponse } from "next/server";

import { inspectLedgerDatabaseHealth, inspectLocalPortfolioDatabaseHealth, inspectNavasanQuotaDatabaseHealth, inspectObservationDatabaseHealth, inspectProvenanceDatabaseHealth } from "../../../db/postgres-runtime";
import { decisionFramework } from "../../decision-support";
import { inspectNavasanConfiguration } from "../../navasan-adapter";
import { scenarioMethodology } from "../../scenario-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const navasanConfiguration = inspectNavasanConfiguration(process.env);
  const iranFeedConfigured = navasanConfiguration.ready;
  const database = await inspectObservationDatabaseHealth();
  const portfolioDatabase = await inspectLocalPortfolioDatabaseHealth();
  const provenanceDatabase = await inspectProvenanceDatabaseHealth();
  const ledgerDatabase = await inspectLedgerDatabaseHealth();
  const navasanQuotaDatabase = await inspectNavasanQuotaDatabaseHealth();
  const databaseReason = ({
    "operator database commit is not explicitly enabled": "Commit پایگاه داده صریحاً فعال نشده است",
    "DATABASE_URL is not configured": "آدرس PostgreSQL تنظیم نشده است",
    "DATABASE_URL is invalid": "آدرس PostgreSQL معتبر نیست",
    "DATABASE_URL must use PostgreSQL": "پایگاه داده باید PostgreSQL باشد",
    "Phase 1 operator database must be loopback-only": "پایگاه دادهٔ اپراتور Phase 1 باید فقط محلی باشد",
    "PostgreSQL URL options and fragments are not permitted": "پارامتر اضافی در آدرس دیتابیس مجاز نیست",
    "database_schema_missing": "اتصال برقرار است اما ساختار کامل دیتابیس موجود نیست",
    "database_role_too_privileged": "دسترسی حساب برنامه بیش از حد مجاز است",
    "database_unreachable_or_probe_failed": "اتصال یا بررسی واقعی دیتابیس ناموفق بود",
    "database_connected_schema_present": "اتصال واقعی برقرار است و ساختار اولیه موجود است؛ تکمیل قابلیت‌ها جداگانه ارزیابی می‌شود",
  }[database.reason] ?? "پایگاه دادهٔ اپراتور آماده نیست");

  return NextResponse.json({
    service: "asha-web",
    status: "evaluation_only",
    generatedAt: new Date().toISOString(),
    release: {
      phase: "phase_1_data_foundation",
      stableForFinancialUse: false,
    },
    engines: [
      { id: "web", state: "ready", reason: "رابط وب در دسترس است" },
      { id: "global-market", state: process.env.GOLD_API_TOKEN?.trim() ? "configured" : "fallback", reason: process.env.GOLD_API_TOKEN?.trim() ? "خوراک کلیددار پیکربندی شده" : "خوراک‌های عمومی فقط برای نمایش اطلاع‌رسانی" },
      { id: "iran-market", state: iranFeedConfigured ? "configured" : "blocked", reason: navasanConfiguration.ready ? `واحد قرارداد ${navasanConfiguration.unit}` : navasanConfiguration.reason === "key_rotation_required" ? "کلید قبلی باید لغو و با کلید جدید جایگزین شود" : "کلید و واحد قراردادی منبع ایرانی کامل نیست" },
      { id: "navasan-quota", state: navasanQuotaDatabase.state, reason: navasanQuotaDatabase.state === "quota_ready" ? "دفتر پایدار ۳۱روزهٔ سهمیه آماده است" : "دفتر پایدار سهمیه آماده نیست؛ درخواست نوسان متوقف می‌ماند" },
      { id: "observation-persistence", state: database.state, reason: databaseReason },
      { id: "portfolio-persistence", state: portfolioDatabase.state, reason: portfolioDatabase.state === "local_ready" ? "ذخیرهٔ محلیِ نسخه‌دار و تفکیک‌شده آماده است؛ ورود حساب تولیدی هنوز دروازهٔ جداگانه دارد" : "ذخیرهٔ محلی سبد یا سیاست امنیتی آن آماده نیست" },
      { id: "provenance-registry", state: provenanceDatabase.state, reason: provenanceDatabase.state === "registry_ready" ? "رجیستری نسخه‌دار و فقط‌خواندنی برای زنجیرهٔ منشأ آماده است؛ تصمیم مالی واقعی هنوز ثبت نمی‌شود" : "ساختار یا دسترسی رجیستری منشأ کامل نیست" },
      { id: "portfolio-ledger", state: ledgerDatabase.state, reason: ledgerDatabase.state === "ledger_ready" ? "قرارداد فقط‌خواندنی تراکنش و ارزش‌گذاری آزمایشگاهی آماده است؛ ورود تولیدی و روش مالی هنوز تأیید نشده‌اند" : "ساختار یا دسترسی دفتر تراکنش و ارزش‌گذاری کامل نیست" },
      { id: "scenario", state: "demo_only", reason: `${scenarioMethodology.id} هنوز کالیبره و بک‌تست نشده است` },
      { id: "financial-decision", state: "blocked", reason: `${decisionFramework.id} رابط دروازه‌هاست و توصیهٔ مالی تولید نمی‌کند` },
    ],
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
