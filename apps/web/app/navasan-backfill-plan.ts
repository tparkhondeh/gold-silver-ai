import {
  normalizeNavasanJalaliDate,
  parseNavasanProviderCode,
} from "./navasan-history.ts";
import type { NavasanProviderCode } from "./navasan-adapter.ts";

export const navasanBackfillInstruments: ReadonlyArray<{
  providerCode: NavasanProviderCode;
  label: string;
}> = [
  { providerCode: "18ayar", label: "طلای ۱۸ عیار" },
  { providerCode: "abshodeh", label: "مثقال طلای آب‌شده" },
  { providerCode: "sekkeh", label: "سکه امامی" },
  { providerCode: "bahar", label: "سکه بهار آزادی" },
  { providerCode: "nim", label: "نیم‌سکه" },
  { providerCode: "rob", label: "ربع‌سکه" },
  { providerCode: "gerami", label: "سکه گرمی" },
  { providerCode: "usd_sell", label: "دلار تهران (فروش)" },
] as const;

export type NavasanBackfillPlan = {
  mode: "preview_only";
  endpoint: "ohlcSearch";
  start: string;
  end: string;
  items: NavasanProviderCode[];
  requestCount: number;
  canExecute: false;
  gates: Array<{
    id: "licensed_date_scope" | "gap_policy" | "continuity_audit" | "independent_cross_check";
    state: "blocked" | "recommended" | "ready";
    label: string;
    detail: string;
  }>;
};

export function buildNavasanBackfillPlan(
  input: { start: unknown; end: unknown; items: unknown[] },
  todayJalali: string,
): NavasanBackfillPlan {
  const start = normalizeNavasanJalaliDate(input.start);
  const end = normalizeNavasanJalaliDate(input.end);
  const today = normalizeNavasanJalaliDate(todayJalali);
  if (start > end) throw new Error("Backfill start must not be after end");
  if (end > today) throw new Error("Backfill end must not be in the future");

  const items = [...new Set(input.items.map(parseNavasanProviderCode))];
  if (items.length === 0) throw new Error("At least one approved instrument is required");

  return {
    mode: "preview_only",
    endpoint: "ohlcSearch",
    start,
    end,
    items,
    requestCount: items.length,
    canExecute: false,
    gates: [
      {
        id: "licensed_date_scope",
        state: "blocked",
        label: "اجازهٔ کتبی بازهٔ تاریخ",
        detail: "نوسان هنوز محدودهٔ مجاز نگهداری تاریخچه را به‌صورت مکتوب تأیید نکرده است.",
      },
      {
        id: "gap_policy",
        state: "recommended",
        label: "رفتار با روزهای بدون داده",
        detail: "پیشنهاد امن: فاصله‌ها ثبت شوند و هیچ قیمت ساختگی یا میان‌یابی‌شده‌ای جای آن‌ها ننشیند.",
      },
      {
        id: "continuity_audit",
        state: "ready",
        label: "کنترل فاصله و تکرار",
        detail: "موتور آزمایشی روزهای مشاهده‌نشده، تاریخ تکراری، خروج از بازه و اختلاف تاریخ/زمان را بدون ساختن قیمت گزارش می‌کند.",
      },
      {
        id: "independent_cross_check",
        state: "blocked",
        label: "منبع مستقل ایرانی",
        detail: "برای استفادهٔ تحلیلی، یک منبع مجاز دوم باید اختلاف قیمت‌ها را کنترل کند.",
      },
    ],
  };
}
