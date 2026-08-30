"use client";

import { useEffect, useId, useState } from "react";
import {
  currentJalaliParts,
  daysInJalaliMonth,
  formatJalaliDate,
  isFutureJalaliDate,
  JALALI_MONTH_NAMES,
  toPersianDigits,
  type JalaliDateParts,
} from "./jalali-calendar";

export function PersianDatePicker({ name, initialValue = "" }: { name: string; initialValue?: string }) {
  const today = currentJalaliParts();
  const initialParts = initialValue.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(initialParts ? Number(initialParts[1]) : today.year);
  const [visibleMonth, setVisibleMonth] = useState(initialParts ? Number(initialParts[2]) : today.month);
  const id = useId();
  const calendarId = `${id}-calendar`;
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const dayCount = daysInJalaliMonth(visibleYear, visibleMonth);
  const yearOptions = Array.from({ length: 101 }, (_, index) => today.year - index);
  const canGoForward = visibleYear < today.year || visibleMonth < today.month;

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function changeMonth(offset: number) {
    const serialMonth = visibleYear * 12 + visibleMonth - 1 + offset;
    const nextYear = Math.floor(serialMonth / 12);
    const nextMonth = (serialMonth % 12) + 1;
    if (nextYear < today.year - 100 || isFutureJalaliDate({ year: nextYear, month: nextMonth, day: 1 }, today)) return;
    setVisibleYear(nextYear);
    setVisibleMonth(nextMonth);
  }

  function chooseDay(day: number) {
    const selected = { year: visibleYear, month: visibleMonth, day };
    if (isFutureJalaliDate(selected, today)) return;
    setValue(formatJalaliDate(selected));
    setOpen(false);
  }

  function chooseToday() {
    setVisibleYear(today.year);
    setVisibleMonth(today.month);
    setValue(formatJalaliDate(today));
    setOpen(false);
  }

  function changeYear(year: number) {
    setVisibleYear(year);
    if (year === today.year && visibleMonth > today.month) setVisibleMonth(today.month);
  }

  function changeVisibleMonth(month: number) {
    if (visibleYear === today.year && month > today.month) return;
    setVisibleMonth(month);
  }

  return (
    <div className="persian-date-field" role="group" aria-labelledby={labelId}>
      <span className="persian-date-label" id={labelId}>تاریخ خرید <small>(اختیاری)</small></span>
      <input type="hidden" name={name} value={value} readOnly />
      <button type="button" className={`persian-date-trigger${value ? " has-value" : ""}`} aria-labelledby={`${labelId} ${valueId}`} aria-expanded={open} aria-controls={calendarId} onClick={() => setOpen((current) => !current)}>
        <span id={valueId}>{value ? `${toPersianDigits(value)} شمسی` : "انتخاب از تقویم"}</span>
      </button>
      {open && <div className="persian-calendar" id={calendarId} role="group" aria-label="انتخاب تاریخ خرید در تقویم شمسی">
        <div className="persian-calendar-head">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="ماه قبل">‹</button>
          <div>
            <select aria-label="ماه" value={visibleMonth} onChange={(event) => changeVisibleMonth(Number(event.target.value))}>
              {JALALI_MONTH_NAMES.map((month, index) => <option key={month} value={index + 1} disabled={visibleYear === today.year && index + 1 > today.month}>{month}</option>)}
            </select>
            <select aria-label="سال" value={visibleYear} onChange={(event) => changeYear(Number(event.target.value))}>
              {yearOptions.map((year) => <option key={year} value={year}>{toPersianDigits(year)}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => changeMonth(1)} disabled={!canGoForward} aria-label="ماه بعد">›</button>
        </div>
        <div className="persian-calendar-days" aria-label={`${JALALI_MONTH_NAMES[visibleMonth - 1]} ${toPersianDigits(visibleYear)}`}>
          {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => {
            const date: JalaliDateParts = { year: visibleYear, month: visibleMonth, day };
            const normalized = formatJalaliDate(date);
            const selected = normalized === value;
            const future = isFutureJalaliDate(date, today);
            return <button type="button" key={day} disabled={future} aria-pressed={selected} aria-label={`${toPersianDigits(day)} ${JALALI_MONTH_NAMES[visibleMonth - 1]} ${toPersianDigits(visibleYear)}`} onClick={() => chooseDay(day)}>{toPersianDigits(day)}</button>;
          })}
        </div>
        <div className="persian-calendar-actions">
          <button type="button" onClick={chooseToday}>امروز</button>
          {value && <button type="button" onClick={() => { setValue(""); setOpen(false); }}>پاک‌کردن تاریخ</button>}
        </div>
      </div>}
      <small className="field-help">در صورت تمایل انتخاب کنید؛ نیازی به تایپ نیست.</small>
    </div>
  );
}
