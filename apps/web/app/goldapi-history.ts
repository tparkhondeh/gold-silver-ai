import {
  normalizeGoldApiDate,
  normalizeGoldApiPrice,
  parseGoldApiMetal,
  type GoldApiMetal,
} from "./goldapi-adapter.ts";

export type NormalizedGoldApiHistoryPoint = {
  instrumentCode: "XAU_USD" | "XAG_USD";
  providerCode: GoldApiMetal;
  providerDateGregorian: string;
  value: number;
  currency: "USD";
  unit: "troy_ounce";
  publishedAt: null;
  collectedAt: string;
  sourceId: "goldapi-io";
};

const responseKeys = new Set(["metal", "currency", "from", "to", "prices"]);
const priceKeys = new Set(["date", "price"]);

function asExactObject(value: unknown, allowedKeys: Set<string>, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new Error(`${label} contains undocumented fields`);
  }
  return record;
}

function utcDay(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
}

function normalizeCollectedAt(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("GoldAPI collectedAt must be a normalized UTC ISO timestamp");
  }
  return value;
}

export function normalizeGoldApiHistoryPayload(
  payload: unknown,
  requested: { metal: GoldApiMetal; from: unknown; to: unknown },
  collectedAt: string,
): NormalizedGoldApiHistoryPoint[] {
  const from = normalizeGoldApiDate(requested.from);
  const to = normalizeGoldApiDate(requested.to);
  if (from > to) throw new Error("GoldAPI history start must not be after end");
  if (utcDay(to) - utcDay(from) + 1 > 90) throw new Error("GoldAPI history range exceeds 90 inclusive days");

  const record = asExactObject(payload, responseKeys, "GoldAPI history response");
  if (parseGoldApiMetal(record.metal) !== requested.metal) {
    throw new Error("GoldAPI history metal does not match the request");
  }
  if (record.currency !== "USD") throw new Error("GoldAPI history currency is not USD");
  if (normalizeGoldApiDate(record.from) !== from || normalizeGoldApiDate(record.to) !== to) {
    throw new Error("GoldAPI history response range does not match the request");
  }
  if (!Array.isArray(record.prices)) throw new Error("GoldAPI history prices must be an array");
  if (record.prices.length > 90) throw new Error("GoldAPI history response exceeds 90 points");

  const normalizedCollectedAt = normalizeCollectedAt(collectedAt);
  let previousDate: string | null = null;

  return record.prices.map((value) => {
    const row = asExactObject(value, priceKeys, "GoldAPI history price");
    const providerDateGregorian = normalizeGoldApiDate(row.date);
    if (providerDateGregorian < from || providerDateGregorian > to) {
      throw new Error("GoldAPI history price falls outside the requested range");
    }
    if (previousDate !== null && providerDateGregorian <= previousDate) {
      throw new Error("GoldAPI history prices are duplicate or out of order");
    }
    previousDate = providerDateGregorian;

    return {
      instrumentCode: `${requested.metal}_USD`,
      providerCode: requested.metal,
      providerDateGregorian,
      value: normalizeGoldApiPrice(row.price, requested.metal, "historical"),
      currency: "USD",
      unit: "troy_ounce",
      publishedAt: null,
      collectedAt: normalizedCollectedAt,
      sourceId: "goldapi-io",
    };
  });
}

