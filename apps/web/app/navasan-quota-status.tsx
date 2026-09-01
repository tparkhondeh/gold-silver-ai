"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { parseNavasanQuotaHealth, type NavasanQuotaView } from "./navasan-quota-view";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function subscribeToLocation() {
  return () => undefined;
}

function getLoopbackSnapshot(): boolean | null {
  return typeof window === "undefined" ? null : LOOPBACK_HOSTS.has(window.location.hostname);
}

function getServerLoopbackSnapshot(): boolean | null {
  return null;
}

function cadenceLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours.toLocaleString("fa-IR")} ساعت و ${remainingMinutes.toLocaleString("fa-IR")} دقیقه`
    : `${hours.toLocaleString("fa-IR")} ساعت`;
}

function latestOutcomeLabel(outcome: NonNullable<NavasanQuotaView["details"]>["latestOutcome"]) {
  if (!outcome) return "هنوز نتیجه‌ای با نسخهٔ جدید ثبت نشده است؛ تماس اضافه‌ای برای پر کردن این بخش ارسال نمی‌شود.";
  const completedAt = new Date(outcome.completedAt).toLocaleString("fa-IR");
  return outcome.outcome === "success"
    ? `آخرین تماس ثبت‌شده در ${completedAt} موفق بود و ${outcome.quoteCount?.toLocaleString("fa-IR")} قیمت معتبر داشت.`
    : `آخرین تماس ثبت‌شده در ${completedAt} ناموفق بود؛ دادهٔ قدیمی جایگزین نتیجهٔ تازه نشد.`;
}

export function NavasanQuotaStatus() {
  const [quota, setQuota] = useState<NavasanQuotaView>({ state: "loading", message: "در حال خواندن شمارندهٔ محلی…" });
  const isLoopback = useSyncExternalStore(subscribeToLocation, getLoopbackSnapshot, getServerLoopbackSnapshot);

  useEffect(() => {
    if (isLoopback !== true) return;
    let active = true;
    void fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as unknown;
        if (active) setQuota(response.ok ? parseNavasanQuotaHealth(payload) : { state: "blocked", message: "بررسی سهمیه ناموفق بود." });
      })
      .catch(() => {
        if (active) setQuota({ state: "blocked", message: "ارتباط با شمارندهٔ محلی برقرار نشد." });
      });
    return () => { active = false; };
  }, [isLoopback]);

  if (isLoopback !== true) return null;

  return (
    <section className="panel operator-import" aria-labelledby="navasan-quota-title">
      <div className="panel-head operator-import-head">
        <div className="section-title">
          <span>FREE API BUDGET</span>
          <h2 id="navasan-quota-title">سهمیهٔ نسخهٔ رایگان نوسان</h2>
          <p>{quota.message}</p>
        </div>
        <span className={`status-chip ${quota.state === "ready" ? "safe" : "warning"}`}>{quota.state === "loading" ? "در حال بررسی" : quota.state === "ready" ? "امن و فعال" : "متوقف"}</span>
      </div>
      {quota.details && <>
        <div className="operator-counts">
          <article><small>مصرف ۳۱ روز اخیر</small><strong>{quota.details.used.toLocaleString("fa-IR")}</strong></article>
          <article className="accepted"><small>باقی‌ماندهٔ امن</small><strong>{quota.details.remaining.toLocaleString("fa-IR")}</strong></article>
          <article><small>سقف امن برنامه</small><strong>{quota.details.limit.toLocaleString("fa-IR")}</strong></article>
          <article><small>سقف رسمی رایگان</small><strong>{quota.details.providerPlanLimit.toLocaleString("fa-IR")}</strong></article>
        </div>
        <p className="field-help">فاصلهٔ دریافت: حداقل {cadenceLabel(quota.details.refreshSeconds)} · حداکثر برنامه‌ریزی‌شده: {quota.details.maximumScheduledCallsInWindow.toLocaleString("fa-IR")} تماس در {quota.details.windowDays.toLocaleString("fa-IR")} روز · پنج تماس رسمی هم به‌عنوان حاشیهٔ امن مصرف نمی‌شود.</p>
        <p className="field-help">{latestOutcomeLabel(quota.details.latestOutcome)}</p>
      </>}
    </section>
  );
}
