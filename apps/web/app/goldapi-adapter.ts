export type GoldApiMetal = "XAU" | "XAG";

export type NormalizedGoldApiLiveQuote = {
  instrumentCode: "XAU_USD" | "XAG_USD";
  value: number;
  currency: "USD";
  unit: "troy_ounce";
  publishedAt: string;
  collectedAt: string;
  sourceId: "goldapi-io";
};

const livePriceRanges: Record<GoldApiMetal, readonly [number, number]> = {
  XAU: [300, 10_000],
  XAG: [2, 1_000],
};

const historicalPriceRanges: Record<GoldApiMetal, readonly [number, number]> = {
  XAU: [10, 100_000],
  XAG: [0.1, 10_000],
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeIsoInstant(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a normalized UTC ISO timestamp`);
  }
  return value;
}

function normalizeUnixTimestamp(value: unknown, nowMs: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("GoldAPI timestamp must be positive Unix seconds");
  }
  const timestampMs = value * 1000;
  if (!Number.isSafeInteger(timestampMs)) throw new Error("GoldAPI timestamp exceeds the safe range");
  if (timestampMs > nowMs + 5 * 60_000) throw new Error("GoldAPI timestamp is in the future");
  return new Date(timestampMs).toISOString();
}

export function parseGoldApiMetal(value: unknown): GoldApiMetal {
  if (value !== "XAU" && value !== "XAG") throw new Error("GoldAPI metal is not approved");
  return value;
}

export function goldApiLiveRequestUrl(metal: GoldApiMetal) {
  const approvedMetal = parseGoldApiMetal(metal);
  return `https://www.goldapi.io/api/price/${approvedMetal}/USD?melt_price=false&currency_info=false`;
}

export function normalizeGoldApiDate(value: unknown) {
  if (typeof value !== "string") throw new Error("GoldAPI date is required");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("GoldAPI date must be Gregorian YYYY-MM-DD");
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) {
    throw new Error("GoldAPI date is invalid");
  }
  return value;
}

export function normalizeGoldApiPrice(
  value: unknown,
  metal: GoldApiMetal,
  mode: "live" | "historical",
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`GoldAPI ${metal} price must be a positive number`);
  }
  const [minimum, maximum] = mode === "live" ? livePriceRanges[metal] : historicalPriceRanges[metal];
  if (value < minimum || value > maximum) {
    throw new Error(`GoldAPI ${metal} price failed ${mode} range validation`);
  }
  return value;
}

export function normalizeGoldApiLivePayload(
  payload: unknown,
  requestedMetal: GoldApiMetal,
  collectedAt: string,
  nowMs = Date.now(),
): NormalizedGoldApiLiveQuote {
  const record = asObject(payload, "GoldAPI live response");
  if (parseGoldApiMetal(record.metal) !== requestedMetal) {
    throw new Error("GoldAPI live metal does not match the request");
  }
  if (record.currency !== "USD") throw new Error("GoldAPI live currency is not USD");

  return {
    instrumentCode: `${requestedMetal}_USD`,
    value: normalizeGoldApiPrice(record.price, requestedMetal, "live"),
    currency: "USD",
    unit: "troy_ounce",
    publishedAt: normalizeUnixTimestamp(record.timestamp, nowMs),
    collectedAt: normalizeIsoInstant(collectedAt, "GoldAPI collectedAt"),
    sourceId: "goldapi-io",
  };
}
