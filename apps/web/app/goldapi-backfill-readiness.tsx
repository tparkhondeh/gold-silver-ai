"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";

import {
  buildGoldApiBackfillPlan,
  goldApiBackfillMetals,
  type GoldApiBackfillPlan,
} from "./goldapi-backfill-plan";
import type { GoldApiMetal } from "./goldapi-adapter";

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

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function GoldApiBackfillReadiness() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState<GoldApiMetal[]>(goldApiBackfillMetals.map((item) => item.metal));
  const [plan, setPlan] = useState<GoldApiBackfillPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLoopback = useSyncExternalStore(subscribeToLocation, getLoopbackSnapshot, getServerLoopbackSnapshot);

  function toggleMetal(metal: GoldApiMetal) {
    setSelected((current) => current.includes(metal)
      ? current.filter((item) => item !== metal)
      : [...current, metal]);
    setPlan(null);
  }

  function createPlan(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setPlan(buildGoldApiBackfillPlan({ start, end, metals: selected }, todayUtc()));
    } catch {
      setPlan(null);
      setError("بازهٔ تاریخ میلادی یا انتخاب فلز معتبر نیست؛ تاریخ‌ها را به شکل 2025-01-01 وارد کنید.");
    }
  }

  if (isLoopback !== true) {
    return (
      <section className="panel operator-import" aria-labelledby="goldapi-backfill-readiness-title">
        <div className="panel-head operator-import-head">
          <div className="section-title">
            <span>GLOBAL HISTORY READINESS</span>
            <h2 id="goldapi-backfill-readiness-title">آماده‌سازی تاریخچهٔ جهانی</h2>
            <p>{isLoopback === null ? "در حال بررسی محیط محلی…" : "این ابزار فقط در رایانهٔ مالک نمایش داده می‌شود."}</p>
          </div>
          <span className="status-chip warning">فقط محیط محلی</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel operator-import backfill-planner" aria-labelledby="goldapi-backfill-readiness-title">
      <div className="panel-head operator-import-head">
        <div className="section-title">
          <span>GLOBAL HISTORY READINESS</span>
          <h2 id="goldapi-backfill-readiness-title">برنامه‌ریزی امن تاریخچهٔ GoldAPI</h2>
          <p>بازه‌های طولانی به قطعه‌های حداکثر ۹۰روزه تقسیم می‌شوند. این بخش فقط پیش‌نمایش است و هیچ تماس واقعی ندارد.</p>
        </div>
        <span className="status-chip safe">صفر درخواست واقعی</span>
      </div>

      <form className="operator-form" onSubmit={createPlan}>
        <div className="backfill-date-grid">
          <label htmlFor="goldapi-backfill-start">تاریخ شروع میلادی
            <input id="goldapi-backfill-start" dir="ltr" inputMode="numeric" placeholder="2025-01-01" value={start} onChange={(event) => { setStart(event.target.value); setPlan(null); }} />
          </label>
          <label htmlFor="goldapi-backfill-end">تاریخ پایان میلادی
            <input id="goldapi-backfill-end" dir="ltr" inputMode="numeric" placeholder="2025-12-31" value={end} onChange={(event) => { setEnd(event.target.value); setPlan(null); }} />
          </label>
        </div>

        <fieldset className="backfill-instruments">
          <legend>فلزهای موردنظر</legend>
          {goldApiBackfillMetals.map((instrument) => (
            <label key={instrument.metal}>
              <input type="checkbox" checked={selected.includes(instrument.metal)} onChange={() => toggleMetal(instrument.metal)} />
              <span>{instrument.label} ({instrument.metal})</span>
            </label>
          ))}
        </fieldset>

        <p className="field-help">هر قطعه و هر فلز یک درخواست آینده است؛ خرید پلن و دریافت واقعی تا ثبت مجوز و تأیید شما قفل می‌ماند.</p>
        <div className="operator-actions">
          <button className="primary-button" type="submit">محاسبهٔ بدون مصرف سهمیه</button>
          <button className="ghost-button" type="button" disabled title="پس از ثبت مجوز و تأیید خرید فعال می‌شود">اجرای ورود تاریخچه</button>
        </div>
      </form>

      <div className="operator-feedback" aria-live="polite">
        {error && <div className="feed-error">{error}</div>}
        {plan && <>
          <div className="operator-counts backfill-counts">
            <article><small>فلز انتخاب‌شده</small><strong>{plan.metals.length.toLocaleString("fa-IR")}</strong></article>
            <article><small>درخواست برنامه‌ریزی‌شده</small><strong>{plan.requestCount.toLocaleString("fa-IR")}</strong></article>
            <article className="accepted"><small>درخواست ارسال‌شده</small><strong>۰</strong></article>
            <article className="quarantined"><small>اجازهٔ اجرا</small><strong>قفل</strong></article>
          </div>
          <p className="backfill-range">بازهٔ بررسی: <b dir="ltr">{plan.start}</b> تا <b dir="ltr">{plan.end}</b> · {plan.chunks.length.toLocaleString("fa-IR")} قطعه</p>
          <div className="backfill-gates">
            {plan.gates.map((gate) => <article className={gate.state} key={gate.id}>
              <span>{gate.state === "blocked" ? "×" : gate.state === "ready" ? "✓" : "i"}</span>
              <div><b>{gate.label}</b><p>{gate.detail}</p></div>
            </article>)}
          </div>
        </>}
      </div>
    </section>
  );
}
