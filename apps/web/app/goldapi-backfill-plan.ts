import {
  normalizeGoldApiDate,
  parseGoldApiMetal,
  type GoldApiMetal,
} from "./goldapi-adapter.ts";

export const goldApiBackfillMetals: ReadonlyArray<{ metal: GoldApiMetal; label: string }> = [
  { metal: "XAU", label: "طلای جهانی" },
  { metal: "XAG", label: "نقرهٔ جهانی" },
];

export type GoldApiHistoryChunk = {
  metal: GoldApiMetal;
  from: string;
  to: string;
  inclusiveDays: number;
  requestPath: string;
};

export type GoldApiBackfillPlan = {
  mode: "preview_only";
  endpoint: "/api/history/{metal}/USD";
  start: string;
  end: string;
  metals: GoldApiMetal[];
  requestCount: number;
  chunks: GoldApiHistoryChunk[];
  canExecute: false;
  gates: Array<{
    id: "licensed_storage_scope" | "subscription_and_quota" | "gap_policy" | "continuity_audit";
    state: "blocked" | "recommended" | "ready";
    label: string;
    detail: string;
  }>;
};

function epochDay(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
}
function dateFromEpochDay(value: number) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

export function buildGoldApiBackfillPlan(
  input: { start: unknown; end: unknown; metals: unknown[] },
  todayUtc: string,
): GoldApiBackfillPlan {
  const start = normalizeGoldApiDate(input.start);
  const end = normalizeGoldApiDate(input.end);
  const today = normalizeGoldApiDate(todayUtc);
  if (start > end) throw new Error("GoldAPI backfill start must not be after end");
  if (end > today) throw new Error("GoldAPI backfill end must not be in the future");

  const metals = [...new Set(input.metals.map(parseGoldApiMetal))];
  if (metals.length === 0) throw new Error("At least one approved GoldAPI metal is required");

  const startDay = epochDay(start);
  const endDay = epochDay(end);
  const rangeChunks: Array<{ from: string; to: string; inclusiveDays: number }> = [];
  for (let chunkStart = startDay; chunkStart <= endDay; chunkStart += 90) {
    if (rangeChunks.length >= 1_000) throw new Error("GoldAPI backfill range exceeds the safety limit");
    const chunkEnd = Math.min(chunkStart + 89, endDay);
    rangeChunks.push({
      from: dateFromEpochDay(chunkStart),
      to: dateFromEpochDay(chunkEnd),
      inclusiveDays: chunkEnd - chunkStart + 1,
    });
  }

  const chunks = metals.flatMap((metal) => rangeChunks.map((chunk) => ({
    metal,
    ...chunk,
    requestPath: `/api/history/${metal}/USD?from=${chunk.from}&to=${chunk.to}`,
  })));

  return {
    mode: "preview_only",
    endpoint: "/api/history/{metal}/USD",
    start,
    end,
    metals,
    requestCount: chunks.length,
    chunks,
    canExecute: false,
    gates: [
      {
        id: "licensed_storage_scope",
        state: "blocked",
        label: "مجوز نگهداری داده",
        detail: "شرایط تجاری و حق نگهداری بلندمدت خروجی تاریخچه باید پیش از دریافت واقعی ثبت شود.",
      },
      {
        id: "subscription_and_quota",
        state: "blocked",
        label: "پلن و سهمیهٔ مناسب",
        detail: "تعداد تماس‌ها محاسبه شده است؛ انتخاب یا خرید پلن فقط پس از تأیید مالک انجام می‌شود.",
      },
      {
        id: "gap_policy",
        state: "ready",
        label: "روزهای بدون داده",
        detail: "قرارداد رسمی ممکن است بعضی تاریخ‌ها را حذف کند؛ فاصله ثبت می‌شود و هیچ قیمت ساختگی ساخته نمی‌شود.",
      },
      {
        id: "continuity_audit",
        state: "ready",
        label: "کنترل ترتیب و محدوده",
        detail: "پاسخ خارج از بازه، تکراری، نامرتب یا با نماد و ارز اشتباه رد می‌شود.",
      },
    ],
  };
}
