export type NavasanDeclaredUnit = "IRR" | "TOMAN";

type NavasanEnvironment = {
  [name: string]: string | undefined;
  NAVASAN_API_KEY?: string;
  NAVASAN_VALUE_UNIT?: string;
  NAVASAN_KEY_ROTATION_CONFIRMED?: string;
};

export function inspectNavasanConfiguration(environment: NavasanEnvironment):
  | { ready: true; unit: NavasanDeclaredUnit }
  | { ready: false; reason: "missing_key" | "key_rotation_required" | "invalid_unit" } {
  if (!environment.NAVASAN_API_KEY?.trim()) return { ready: false, reason: "missing_key" };
  // The previously pasted credential is compromised. A configured key alone is
  // deliberately insufficient; the operator must revoke it and install a new one.
  if (environment.NAVASAN_KEY_ROTATION_CONFIRMED !== "true") {
    return { ready: false, reason: "key_rotation_required" };
  }
  const unit = environment.NAVASAN_VALUE_UNIT?.trim().toUpperCase();
  if (unit !== "IRR" && unit !== "TOMAN") return { ready: false, reason: "invalid_unit" };
  return { ready: true, unit };
}

export type NavasanItem = {
  value?: unknown;
  timestamp?: unknown;
};

export type NavasanPayload = Record<string, NavasanItem>;

export type NormalizedNavasanQuote = {
  instrumentCode: string;
  value: number;
  currency: "TOMAN";
  unit: "gram" | "unit" | "usd";
  publishedAt: string;
  collectedAt: string;
  sourceId: "navasan";
  sourceName: "Navasan";
  sourceUrl: "https://www.navasan.tech/api/";
  quality: "primary";
  status: "valid" | "stale";
};

export const navasanInstrumentMappings = [
  { providerCode: "18ayar", instrumentCode: "GOLD_18K_IRR", unit: "gram", providerScale: 1, rangeToman: [1_000_000, 100_000_000] },
  { providerCode: "abshodeh", instrumentCode: "MESGHAL_IRR", unit: "unit", providerScale: 1_000, rangeToman: [5_000_000, 500_000_000] },
  { providerCode: "sekkeh", instrumentCode: "EMAMI_COIN_IRR", unit: "unit", providerScale: 1_000, rangeToman: [5_000_000, 1_000_000_000] },
  { providerCode: "bahar", instrumentCode: "AZADI_COIN_IRR", unit: "unit", providerScale: 1_000, rangeToman: [5_000_000, 1_000_000_000] },
  { providerCode: "nim", instrumentCode: "HALF_COIN_IRR", unit: "unit", providerScale: 1_000, rangeToman: [2_000_000, 500_000_000] },
  { providerCode: "rob", instrumentCode: "QUARTER_COIN_IRR", unit: "unit", providerScale: 1_000, rangeToman: [1_000_000, 300_000_000] },
  { providerCode: "gerami", instrumentCode: "GRAM_COIN_IRR", unit: "unit", providerScale: 1_000, rangeToman: [500_000, 150_000_000] },
  { providerCode: "usd_sell", instrumentCode: "USD_IRR", unit: "usd", providerScale: 1, rangeToman: [10_000, 1_000_000] },
] as const;

export function positiveNavasanNumber(value: unknown, label: string) {
  const parsed = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} is not a positive number`);
  return parsed;
}

export function normalizeNavasanTimestamp(value: unknown, nowMs = Date.now()) {
  const seconds = positiveNavasanNumber(value, "Navasan timestamp");
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("Navasan timestamp is invalid");
  if (date.getTime() > nowMs + 5 * 60_000) throw new Error("Navasan timestamp is in the future");
  return date.toISOString();
}

export type NavasanProviderCode = (typeof navasanInstrumentMappings)[number]["providerCode"];

export function normalizeNavasanValue(
  providerCode: NavasanProviderCode,
  rawValue: unknown,
  declaredUnit: NavasanDeclaredUnit,
) {
  const mapping = navasanInstrumentMappings.find((candidate) => candidate.providerCode === providerCode);
  if (!mapping) throw new Error("Navasan item is not approved");
  const denominationScale = declaredUnit === "IRR" ? 0.1 : 1;
  const value = positiveNavasanNumber(rawValue, providerCode) * mapping.providerScale * denominationScale;
  if (!Number.isSafeInteger(Math.round(value))) throw new Error(`${providerCode} exceeds safe integer range`);
  if (value < mapping.rangeToman[0] || value > mapping.rangeToman[1]) {
    throw new Error(`${providerCode} failed declared-unit range validation`);
  }
  return { mapping, value };
}

export function normalizeNavasanPayload(
  payload: NavasanPayload,
  declaredUnit: NavasanDeclaredUnit,
  collectedAt: string,
  nowMs = Date.now(),
): NormalizedNavasanQuote[] {
  return navasanInstrumentMappings.flatMap(({ providerCode }) => {
    const item = payload[providerCode];
    if (!item) return [];

    const { mapping, value } = normalizeNavasanValue(providerCode, item.value, declaredUnit);
    const publishedAt = normalizeNavasanTimestamp(item.timestamp, nowMs);
    const status = nowMs - new Date(publishedAt).getTime() > 60 * 60_000 ? "stale" : "valid";
    return [{
      instrumentCode: mapping.instrumentCode,
      value,
      currency: "TOMAN" as const,
      unit: mapping.unit,
      publishedAt,
      collectedAt,
      sourceId: "navasan" as const,
      sourceName: "Navasan" as const,
      sourceUrl: "https://www.navasan.tech/api/" as const,
      quality: "primary" as const,
      status,
    }];
  });
}
