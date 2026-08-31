import { currentJalaliParts, daysInJalaliMonth } from "./jalali-calendar.ts";
import {
  normalizeNavasanJalaliDate,
  type NormalizedNavasanOhlcPoint,
} from "./navasan-history.ts";
import type { NavasanProviderCode } from "./navasan-adapter.ts";

export type HistoricalContinuityIssue = {
  kind: "duplicate_provider_date" | "outside_requested_range" | "timestamp_date_mismatch" | "mixed_provider_code";
  providerDateJalali: string;
  detail: string;
};

export type HistoricalContinuityReport = {
  mode: "validation_only";
  status: "complete" | "gaps_recorded" | "quarantine_required";
  requestedStart: string;
  requestedEnd: string;
  calendarDatesInRange: number;
  observedProviderDates: number;
  unobservedProviderDates: string[];
  issues: HistoricalContinuityIssue[];
  interpolatedPoints: 0;
  marketCalendarKnown: false;
  canAuthorizeStorage: false;
};

function nextJalaliDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const monthLength = daysInJalaliMonth(year, month);
  if (day < monthLength) return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${(day + 1).toString().padStart(2, "0")}`;
  if (month < 12) return `${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}-01`;
  return `${(year + 1).toString().padStart(4, "0")}-01-01`;
}

function jalaliDatesInRange(start: string, end: string) {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    if (dates.length > 100_000) throw new Error("Historical continuity range exceeds the safety limit");
    cursor = nextJalaliDate(cursor);
  }
  return dates;
}

function jalaliDateForTimestamp(publishedAt: string) {
  const date = new Date(publishedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Historical point timestamp is invalid");
  const { year, month, day } = currentJalaliParts(date);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function auditHistoricalContinuity(
  points: NormalizedNavasanOhlcPoint[],
  input: { providerCode: NavasanProviderCode; start: unknown; end: unknown },
): HistoricalContinuityReport {
  const requestedStart = normalizeNavasanJalaliDate(input.start);
  const requestedEnd = normalizeNavasanJalaliDate(input.end);
  if (requestedStart > requestedEnd) throw new Error("Historical continuity start must not be after end");

  const calendarDates = jalaliDatesInRange(requestedStart, requestedEnd);
  const observed = new Set<string>();
  const seenProviderDates = new Set<string>();
  const issues: HistoricalContinuityIssue[] = [];

  for (const point of points) {
    const providerDateJalali = normalizeNavasanJalaliDate(point.providerDateJalali);
    const expectedProvider = point.providerCode === input.providerCode;
    const insideRange = providerDateJalali >= requestedStart && providerDateJalali <= requestedEnd;
    const timestampMatches = jalaliDateForTimestamp(point.publishedAt) === providerDateJalali;
    if (!expectedProvider) {
      issues.push({
        kind: "mixed_provider_code",
        providerDateJalali,
        detail: "A response contains a different provider instrument code.",
      });
    }
    if (!insideRange) {
      issues.push({
        kind: "outside_requested_range",
        providerDateJalali,
        detail: "A provider date falls outside the requested range.",
      });
    }
    if (seenProviderDates.has(providerDateJalali)) {
      issues.push({
        kind: "duplicate_provider_date",
        providerDateJalali,
        detail: "More than one OHLC bar was returned for the same provider date.",
      });
    }
    if (!timestampMatches) {
      issues.push({
        kind: "timestamp_date_mismatch",
        providerDateJalali,
        detail: "The provider date does not match the timestamp in Tehran time.",
      });
    }
    seenProviderDates.add(providerDateJalali);
    if (expectedProvider && insideRange && timestampMatches) observed.add(providerDateJalali);
  }

  const unobservedProviderDates = calendarDates.filter((date) => !observed.has(date));
  return {
    mode: "validation_only",
    status: issues.length > 0
      ? "quarantine_required"
      : unobservedProviderDates.length > 0 ? "gaps_recorded" : "complete",
    requestedStart,
    requestedEnd,
    calendarDatesInRange: calendarDates.length,
    observedProviderDates: observed.size,
    unobservedProviderDates,
    issues,
    interpolatedPoints: 0,
    marketCalendarKnown: false,
    canAuthorizeStorage: false,
  };
}
