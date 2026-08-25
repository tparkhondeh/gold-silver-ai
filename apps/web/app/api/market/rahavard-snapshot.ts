export type RahavardSnapshotObservation = {
  instrumentCode:
    | "GOLD_18K_IRR"
    | "GOLD_24K_IRR"
    | "MESGHAL_IRR"
    | "EMAMI_COIN_IRR"
    | "AZADI_COIN_IRR"
    | "HALF_COIN_IRR"
    | "QUARTER_COIN_IRR"
    | "GRAM_COIN_IRR"
    | "SILVER_999_IRR"
    | "SILVER_925_IRR"
    | "USD_IRR"
    | "XAU_USD"
    | "XAG_USD";
  rawValue: number;
  rawCurrency: "IRR" | "USD";
  unit: "troy_ounce" | "gram" | "unit" | "usd";
  publishedAt: string | null;
  sourceUrl: string;
};

/**
 * Owner-approved, read-only snapshot captured from the signed-in Rahavard 365
 * browser session. It is not an API, is never refreshed automatically, and is
 * excluded from use once the deterministic freshness threshold is exceeded.
 */
export const rahavardManualSnapshot = {
  schemaVersion: 1,
  capturedAt: "2026-08-25T13:52:16.263Z",
  capturedAtLabel: "۱۴۰۵/۰۶/۰۳، ساعت ۱۷:۲۲ تهران",
  observations: [
    { instrumentCode: "GOLD_18K_IRR", rawValue: 214_807_000, rawCurrency: "IRR", unit: "gram", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "GOLD_24K_IRR", rawValue: 286_380_000, rawCurrency: "IRR", unit: "gram", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "MESGHAL_IRR", rawValue: 930_500_000, rawCurrency: "IRR", unit: "unit", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "EMAMI_COIN_IRR", rawValue: 2_125_000_000, rawCurrency: "IRR", unit: "unit", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "AZADI_COIN_IRR", rawValue: 2_105_000_000, rawCurrency: "IRR", unit: "unit", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "HALF_COIN_IRR", rawValue: 1_100_000_000, rawCurrency: "IRR", unit: "unit", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "QUARTER_COIN_IRR", rawValue: 585_000_000, rawCurrency: "IRR", unit: "unit", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "GRAM_COIN_IRR", rawValue: 300_000_000, rawCurrency: "IRR", unit: "unit", publishedAt: null, sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "SILVER_999_IRR", rawValue: 4_468_600, rawCurrency: "IRR", unit: "gram", publishedAt: null, sourceUrl: "https://rahavard365.com/silver" },
    { instrumentCode: "SILVER_925_IRR", rawValue: 4_133_410, rawCurrency: "IRR", unit: "gram", publishedAt: null, sourceUrl: "https://rahavard365.com/silver" },
    { instrumentCode: "USD_IRR", rawValue: 1_998_000, rawCurrency: "IRR", unit: "usd", publishedAt: "2026-08-25T13:43:00.000Z", sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "XAU_USD", rawValue: 4_612, rawCurrency: "USD", unit: "troy_ounce", publishedAt: "2026-08-25T13:45:00.000Z", sourceUrl: "https://rahavard365.com/gold" },
    { instrumentCode: "XAG_USD", rawValue: 67.6, rawCurrency: "USD", unit: "troy_ounce", publishedAt: "2026-08-25T13:46:00.000Z", sourceUrl: "https://rahavard365.com/silver" },
  ] satisfies RahavardSnapshotObservation[],
} as const;
