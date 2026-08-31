import { daysInJalaliMonth } from "./jalali-calendar.ts";
import {
  navasanInstrumentMappings,
  normalizeNavasanTimestamp,
  normalizeNavasanValue,
  type NavasanDeclaredUnit,
  type NavasanProviderCode,
} from "./navasan-adapter.ts";

export type NavasanHistoryEndpoint = "dailyCurrency" | "ohlcSearch";

type DailyRow = { timestamp?: unknown; date?: unknown; value?: unknown; change?: unknown };
type OhlcRow = { timestamp?: unknown; date?: unknown; open?: unknown; high?: unknown; low?: unknown; close?: unknown };

export type NormalizedNavasanDailyPoint = {
  instrumentCode: string;
  providerCode: NavasanProviderCode;
  value: number;
  currency: "TOMAN";
  unit: "gram" | "unit" | "usd";
  publishedAt: string;
  collectedAt: string;
  sourceId: "navasan";
};

export type NormalizedNavasanOhlcPoint = {
  instrumentCode: string;
  providerCode: NavasanProviderCode;
  open: number;
  high: number;
  low: number;
  close: number;
  currency: "TOMAN";
  unit: "gram" | "unit" | "usd";
  publishedAt: string;
  collectedAt: string;
  sourceId: "navasan";
};

const approvedProviderCodes = new Set<string>(navasanInstrumentMappings.map((item) => item.providerCode));

export function parseNavasanProviderCode(value: unknown): NavasanProviderCode {
  if (typeof value !== "string" || !approvedProviderCodes.has(value)) {
    throw new Error("Navasan history item is not approved");
  }
  return value as NavasanProviderCode;
}

export function normalizeNavasanJalaliDate(value: unknown) {
  if (typeof value !== "string") throw new Error("Navasan history date is required");
  const match = /^(1[34]\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value);
  if (!match) throw new Error("Navasan history date must be Jalali YYYY-MM-DD");
  const [year, month, day] = match.slice(1).map(Number);
  if (day > daysInJalaliMonth(year, month)) throw new Error("Navasan history date is invalid");
  return value;
}

function historyRows(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) throw new Error("Navasan history response must be an array");
  if (payload.length > 100_000) throw new Error("Navasan history response exceeds the safety limit");
  return payload.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Navasan history row is invalid");
    return row as Record<string, unknown>;
  });
}

export function normalizeNavasanDailyPayload(
  payload: unknown,
  providerCode: NavasanProviderCode,
  declaredUnit: NavasanDeclaredUnit,
  collectedAt: string,
  nowMs = Date.now(),
): NormalizedNavasanDailyPoint[] {
  return historyRows(payload).map((row) => {
    const daily = row as DailyRow;
    const { mapping, value } = normalizeNavasanValue(providerCode, daily.value, declaredUnit);
    return {
      instrumentCode: mapping.instrumentCode,
      providerCode,
      value,
      currency: "TOMAN",
      unit: mapping.unit,
      publishedAt: normalizeNavasanTimestamp(daily.timestamp, nowMs),
      collectedAt,
      sourceId: "navasan",
    };
  });
}

export function normalizeNavasanOhlcPayload(
  payload: unknown,
  providerCode: NavasanProviderCode,
  declaredUnit: NavasanDeclaredUnit,
  collectedAt: string,
  nowMs = Date.now(),
): NormalizedNavasanOhlcPoint[] {
  return historyRows(payload).map((row) => {
    const ohlc = row as OhlcRow;
    const normalized = {
      open: normalizeNavasanValue(providerCode, ohlc.open, declaredUnit).value,
      high: normalizeNavasanValue(providerCode, ohlc.high, declaredUnit).value,
      low: normalizeNavasanValue(providerCode, ohlc.low, declaredUnit).value,
      close: normalizeNavasanValue(providerCode, ohlc.close, declaredUnit).value,
    };
    if (normalized.high < Math.max(normalized.open, normalized.close, normalized.low)
      || normalized.low > Math.min(normalized.open, normalized.close, normalized.high)) {
      throw new Error("Navasan OHLC ordering is invalid");
    }
    const mapping = navasanInstrumentMappings.find((item) => item.providerCode === providerCode)!;
    return {
      instrumentCode: mapping.instrumentCode,
      providerCode,
      ...normalized,
      currency: "TOMAN",
      unit: mapping.unit,
      publishedAt: normalizeNavasanTimestamp(ohlc.timestamp, nowMs),
      collectedAt,
      sourceId: "navasan",
    };
  });
}
