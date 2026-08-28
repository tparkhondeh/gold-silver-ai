import { NextResponse } from "next/server";

import { inspectOperatorDatabaseEnvironment } from "../../../db/postgres-runtime";
import { decisionFramework } from "../../decision-support";
import { scenarioMethodology } from "../../scenario-engine";

export const dynamic = "force-dynamic";

export function GET() {
  const navasanKeyConfigured = Boolean(process.env.NAVASAN_API_KEY?.trim());
  const navasanUnit = process.env.NAVASAN_VALUE_UNIT?.trim().toUpperCase();
  const iranFeedConfigured = navasanKeyConfigured && (navasanUnit === "IRR" || navasanUnit === "TOMAN");
  const database = inspectOperatorDatabaseEnvironment();
  const databaseReason = database.available ? "PostgreSQL محلی و دروازهٔ Commit آماده‌اند" : ({
    "operator database commit is not explicitly enabled": "Commit پایگاه داده صریحاً فعال نشده است",
    "DATABASE_URL is not configured": "آدرس PostgreSQL تنظیم نشده است",
    "DATABASE_URL is invalid": "آدرس PostgreSQL معتبر نیست",
    "DATABASE_URL must use PostgreSQL": "پایگاه داده باید PostgreSQL باشد",
    "Phase 1 operator database must be loopback-only": "پایگاه دادهٔ اپراتور Phase 1 باید فقط محلی باشد",
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
      { id: "iran-market", state: iranFeedConfigured ? "configured" : "blocked", reason: iranFeedConfigured ? `واحد قرارداد ${navasanUnit}` : "کلید و واحد قراردادی منبع ایرانی کامل نیست" },
      { id: "portfolio-persistence", state: database.available ? "configured" : "blocked", reason: databaseReason },
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
