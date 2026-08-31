"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";

import { currentJalaliParts } from "./jalali-calendar";
import {
  buildNavasanBackfillPlan,
  navasanBackfillInstruments,
  type NavasanBackfillPlan,
} from "./navasan-backfill-plan";
import type { NavasanProviderCode } from "./navasan-adapter";

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

function todayJalaliIso() {
  const { year, month, day } = currentJalaliParts();
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function NavasanBackfillReadiness() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState<NavasanProviderCode[]>(
    navasanBackfillInstruments.map((item) => item.providerCode),
  );
  const [plan, setPlan] = useState<NavasanBackfillPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLoopback = useSyncExternalStore(subscribeToLocation, getLoopbackSnapshot, getServerLoopbackSnapshot);

  function toggleInstrument(providerCode: NavasanProviderCode) {
    setSelected((current) => current.includes(providerCode)
      ? current.filter((item) => item !== providerCode)
      : [...current, providerCode]);
    setPlan(null);
  }

  function createPlan(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setPlan(buildNavasanBackfillPlan({ start, end, items: selected }, todayJalaliIso()));
    } catch {
      setPlan(null);
      setError("بازهٔ تاریخ شمسی یا انتخاب دارایی معتبر نیست؛ تاریخ‌ها را به شکل ۱۴۰۴-۰۱-۰۱ وارد کنید.");
    }
  }

  if (isLoopback !== true) {
    return (
      <section className="panel operator-import" aria-labelledby="backfill-readiness-title">
        <div className="panel-head operator-import-head">
          <div className="section-title">
            <span>HISTORY READINESS</span>
            <h2 id="backfill-readiness-title">آماده‌سازی تاریخچهٔ نوسان</h2>
            <p>{isLoopback === null ? "در حال بررسی محیط محلی…" : "این ابزار فقط در رایانهٔ مالک نمایش داده می‌شود."}</p>
          </div>
          <span className="status-chip warning">فقط محیط محلی</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel operator-import backfill-planner" aria-labelledby="backfill-readiness-title">
      <div className="panel-head operator-import-head">
        <div className="section-title">
          <span>HISTORY READINESS</span>
          <h2 id="backfill-readiness-title">برنامه‌ریزی امن تاریخچهٔ نوسان</h2>
          <p>قبل از مصرف سهمیه یا ورود داده، بازه و تعداد تماس‌ها را ببین. این بخش عمداً امکان دریافت واقعی ندارد.</p>
        </div>
        <span className="status-chip safe">صفر درخواست واقعی</span>
      </div>

      <form className="operator-form" onSubmit={createPlan}>
        <div className="backfill-date-grid">
          <label htmlFor="backfill-start">تاریخ شروع شمسی
            <input id="backfill-start" dir="ltr" inputMode="numeric" placeholder="1404-01-01" value={start} onChange={(event) => { setStart(event.target.value); setPlan(null); }} />
          </label>
          <label htmlFor="backfill-end">تاریخ پایان شمسی
            <input id="backfill-end" dir="ltr" inputMode="numeric" placeholder="1405-01-01" value={end} onChange={(event) => { setEnd(event.target.value); setPlan(null); }} />
          </label>
        </div>

        <fieldset className="backfill-instruments">
          <legend>دارایی‌های موردنظر</legend>
          {navasanBackfillInstruments.map((instrument) => (
            <label key={instrument.providerCode}>
              <input
                type="checkbox"
                checked={selected.includes(instrument.providerCode)}
                onChange={() => toggleInstrument(instrument.providerCode)}
              />
              <span>{instrument.label}</span>
            </label>
          ))}
        </fieldset>

        <p className="field-help">هر دارایی با مسیر آرشیو روزانه در یک درخواست برنامه‌ریزی می‌شود؛ اجرای واقعی تا تکمیل مجوز و منبع دوم قفل می‌ماند.</p>
        <div className="operator-actions">
          <button className="primary-button" type="submit">ساخت برنامهٔ بدون مصرف سهمیه</button>
          <button className="ghost-button" type="button" disabled title="پس از تأیید مجوز داده و منبع مستقل فعال می‌شود">اجرای ورود تاریخچه</button>
        </div>
      </form>

      <div className="operator-feedback" aria-live="polite">
        {error && <div className="feed-error">{error}</div>}
        {plan && <>
          <div className="operator-counts backfill-counts">
            <article><small>دارایی انتخاب‌شده</small><strong>{plan.items.length.toLocaleString("fa-IR")}</strong></article>
            <article><small>درخواست برنامه‌ریزی‌شده</small><strong>{plan.requestCount.toLocaleString("fa-IR")}</strong></article>
            <article className="accepted"><small>درخواست ارسال‌شده</small><strong>۰</strong></article>
            <article className="quarantined"><small>اجازهٔ اجرا</small><strong>قفل</strong></article>
          </div>
          <p className="backfill-range">بازهٔ بررسی: <b dir="ltr">{plan.start}</b> تا <b dir="ltr">{plan.end}</b></p>
          <div className="backfill-gates">
            {plan.gates.map((gate) => <article className={gate.state} key={gate.id}>
              <span>{gate.state === "blocked" ? "×" : "i"}</span>
              <div><b>{gate.label}</b><p>{gate.detail}</p></div>
            </article>)}
          </div>
        </>}
      </div>
    </section>
  );
}
