import {
  normalizeGoldApiDate,
  parseGoldApiMetal,
  type GoldApiMetal,
} from "./goldapi-adapter.ts";
import type { NormalizedGoldApiHistoryPoint } from "./goldapi-history.ts";

export type GoldApiHistoricalContinuityIssue = {
  kind: "duplicate_provider_date" | "outside_requested_range" | "mixed_provider_code";
  providerDateGregorian: string;
  detail: string;
};

export type GoldApiHistoricalContinuityReport = {
  mode: "validation_only";
  status: "complete" | "gaps_recorded" | "quarantine_required";
  requestedStart: string;
  requestedEnd: string;
  calendarDatesInRange: number;
  observedProviderDates: number;
  unobservedProviderDates: string[];
  issues: GoldApiHistoricalContinuityIssue[];
  interpolatedPoints: 0;
  marketCalendarKnown: false;
  canAuthorizeStorage: false;
};

function epochDay(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
}

function dateFromEpochDay(value: number) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

export function auditGoldApiHistoricalContinuity(
  points: NormalizedGoldApiHistoryPoint[],
  input: { metal: GoldApiMetal; start: unknown; end: unknown },
): GoldApiHistoricalContinuityReport {
  const requestedStart = normalizeGoldApiDate(input.start);
  const requestedEnd = normalizeGoldApiDate(input.end);
  const metal = parseGoldApiMetal(input.metal);
  if (requestedStart > requestedEnd) throw new Error("GoldAPI continuity start must not be after end");
  const startDay = epochDay(requestedStart);
  const endDay = epochDay(requestedEnd);
  if (endDay - startDay + 1 > 90) throw new Error("GoldAPI continuity range exceeds one 90-day chunk");

  const calendarDates = Array.from(
    { length: endDay - startDay + 1 },
    (_, index) => dateFromEpochDay(startDay + index),
  );
  const seenDates = new Set<string>();
  const observedDates = new Set<string>();
  const issues: GoldApiHistoricalContinuityIssue[] = [];

  for (const point of points) {
    const providerDateGregorian = normalizeGoldApiDate(point.providerDateGregorian);
    const expectedMetal = point.providerCode === metal;
    const insideRange = providerDateGregorian >= requestedStart && providerDateGregorian <= requestedEnd;
    if (!expectedMetal) {
      issues.push({
        kind: "mixed_provider_code",
        providerDateGregorian,
        detail: "A response contains a different GoldAPI metal code.",
      });
    }
    if (!insideRange) {
      issues.push({
        kind: "outside_requested_range",
        providerDateGregorian,
        detail: "A GoldAPI provider date falls outside the requested chunk.",
      });
    }
    if (seenDates.has(providerDateGregorian)) {
      issues.push({
        kind: "duplicate_provider_date",
        providerDateGregorian,
        detail: "More than one GoldAPI price was returned for the same date.",
      });
    }
    seenDates.add(providerDateGregorian);
    if (expectedMetal && insideRange) observedDates.add(providerDateGregorian);
  }

  const unobservedProviderDates = calendarDates.filter((date) => !observedDates.has(date));
  return {
    mode: "validation_only",
    status: issues.length > 0
      ? "quarantine_required"
      : unobservedProviderDates.length > 0 ? "gaps_recorded" : "complete",
    requestedStart,
    requestedEnd,
    calendarDatesInRange: calendarDates.length,
    observedProviderDates: observedDates.size,
    unobservedProviderDates,
    issues,
    interpolatedPoints: 0,
    marketCalendarKnown: false,
    canAuthorizeStorage: false,
  };
}

