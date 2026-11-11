"use client";

import { useRef, useState } from "react";
import { NumberValue } from "./number-value";
import { canonicalPersonalCashToman, emptyPersonalPlanning, validatePersonalPlanning, type PersonalPlanning } from "./personal-planning";

/** The same explicit owner input is used by private storage and isolated evaluation. */
export function PersonalPlanningPanel({ planning, onCommit, busy }: {
  planning?: PersonalPlanning;
  onCommit: (planning: PersonalPlanning) => Promise<void>;
  busy: boolean;
}) {
  const saved = planning ?? emptyPersonalPlanning();
  const base = JSON.stringify(saved);
  const [draft, setDraft] = useState<{ cash: string; months: string; base: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const writing = useRef(false);
  const stale = draft !== null && draft.base !== base;
  const values = draft ?? { cash: saved.spendableCashToman ?? "", months: saved.mediumTermMonths?.toString() ?? "", base };
  const edit = (key: "cash" | "months", value: string) => { setDraft({ ...values, [key]: value }); setError(""); };
  return <section className="panel" data-testid="personal-planning-panel">
    <h2>نقد و افق میان‌مدت</h2>
    <p>نقد را جدا از ارزش دارایی‌ها و خریدهای گذشته ثبت کن؛ این مبلغ برای هر دو افق مشترک است.</p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy || stale || writing.current) return;
      writing.current = true; setSaving(true); setError("");
      try {
        const cash = values.cash.trim(), months = values.months.trim();
        if (months !== "" && !/^[1-9]\d{0,4}$/.test(months)) throw new Error("مدت میان‌مدت باید تعداد صحیح و مثبت ماه باشد.");
        const candidate = validatePersonalPlanning({ ...emptyPersonalPlanning(),
          spendableCashToman: cash === "" ? null : canonicalPersonalCashToman(cash),
          mediumTermMonths: months === "" ? null : Number(months),
        });
        await onCommit(candidate); setDraft(null);
      } catch {
        setError("ثبت تأیید نشد؛ ورودی حفظ شد. نقد باید نامنفی با حداکثر دو رقم اعشار و مدت، تعداد صحیح ماه از ۱ تا ۳۲۷۶۷ باشد. در صورت خطای اتصال، وضعیت ذخیره را بررسی کن.");
      } finally { writing.current = false; setSaving(false); }
    }}>
      <fieldset disabled={busy || saving || stale}>
        <label>نقد قابل‌خرج (تومان)<input data-testid="planning-cash" inputMode="decimal" value={values.cash} onChange={event => edit("cash", event.target.value)} aria-describedby="planning-cash-note" /></label>
        <small id="planning-cash-note">خالی یعنی نامشخص؛ صفر یعنی نقدی برای خرج‌کردن ندارم. خریدهای قبلی این مبلغ را خودکار کم نمی‌کنند.</small>
        <label>افق میان‌مدت (ماه)<input data-testid="planning-medium-months" inputMode="numeric" value={values.months} onChange={event => edit("months", event.target.value)} /></label>
        <button className="primary-button" type="submit" data-testid="planning-save">{saving ? "در حال ثبت…" : "ثبت نقد و افق"}</button>
      </fieldset>
    </form>
    {error && <p role="alert">{error}</p>}
    {stale && <p role="alert">نسخهٔ ذخیره‌شده تغییر کرده است؛ ویرایش شما حفظ شده ولی ثبت آن بسته است. نسخهٔ ذخیره‌شده را ببین و تغییرت را دوباره اعمال کن.</p>}
    {draft && <button className="ghost-button" disabled={busy || saving} onClick={() => { setDraft(null); setError(""); }}>کنار گذاشتن ویرایش نقد و افق</button>}
    <details><summary>مقادیر ثبت‌شده</summary>
      <p>نقد: {saved.spendableCashToman === null ? "نامشخص" : <NumberValue value={saved.spendableCashToman} unit="تومان" />}</p>
      <p>میان‌مدت: {saved.mediumTermMonths === null ? "نامشخص" : <NumberValue value={saved.mediumTermMonths} unit="ماه" />}</p>
      <p>سقف عدد ماه صرفاً حد ذخیره‌سازی است؛ مدت پیشنهادی یا تأیید روش مالی نیست.</p>
    </details>
  </section>;
}
