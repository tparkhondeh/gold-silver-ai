import { navasanInstrumentMappings, normalizeNavasanTimestamp, normalizeNavasanValue, type NavasanDeclaredUnit } from "./navasan-adapter.ts";

export const MARKET_TEST_VERSION = "asha.market_technical_test.v1";
export const MARKET_TEST_STORAGE = "asha-real-market-test-v1";
export const MARKET_TTL_MS = 60 * 60_000;
export const marketTestAssets = [
  { id: "GOLD_18K_IRR", name: "طلای ۱۸ عیار", unit: "gram", purityPermille: 750 },
  { id: "EMAMI_COIN_IRR", name: "سکه امامی", unit: "unit", purityPermille: null },
  { id: "SILVER_999_IRR", name: "نقره ۹۹۹", unit: "gram", purityPermille: 999 },
] as const;

export type MarketObservation = {
  source: "navasan"; sourceUrl: "https://www.navasan.tech/api/";
  providerSymbol: string; instrumentCode: string; unit: "gram" | "unit" | "usd";
  rawValue: string; rawCurrency: NavasanDeclaredUnit; providerScale: number;
  priceRial: string; purityPermille: number | null;
  publishedAt: string; receivedAt: string;
};
export type MarketSnapshot = {
  version: "asha.navasan.latest_snapshot.v1"; datasetKind: "real_market_snapshot";
  receivedAt: string; observations: MarketObservation[];
};
export type MarketTestPortfolio = {
  version: typeof MARKET_TEST_VERSION; holdingsKind: "synthetic_test_positions";
  revision: number; selectedAsset: string; cashRial: string;
  quantitiesMilli: Record<string, number>; shortDays: number; mediumDays: number;
  minimumCashBps: number; maximumAssetBps: number; snapshot: MarketSnapshot | null;
};

function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== keys.sort().join("|")) throw new Error("ساختار داده ناسازگار است؛ ورودی قبلی حفظ شد.");
}
function integer(value: unknown, min: number, max: number): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error("مقدار یا محدودیت نامعتبر است.");
}
function timestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("زمان داده نامعتبر است.");
  return Date.parse(value);
}
function rial(value: unknown, zero = false): asserts value is string {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,17})$/.test(value) || (!zero && value === "0")) throw new Error("مبلغ صحیح ریالی لازم است.");
}
// Exact decimal conversion; no floating-point rounding may invent a fraction of a rial.
export function navasanRawRial(raw: string, currency: NavasanDeclaredUnit, scale: number) {
  if (!/^\d{1,15}(\.\d{1,6})?$/.test(raw)) throw new Error("قیمت خام نامعتبر است.");
  const [whole, fraction = ""] = raw.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * BigInt(scale) * (currency === "TOMAN" ? 10n : 1n);
  if (numerator <= 0n || numerator % denominator !== 0n) throw new Error("قیمت به ریال صحیح قابل تبدیل نیست.");
  return (numerator / denominator).toString();
}

export function makeNavasanSnapshot(payload: unknown, currency: NavasanDeclaredUnit, receivedAt: string): MarketSnapshot {
  const now = timestamp(receivedAt);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("پاسخ منبع نامعتبر است.");
  const observations: MarketObservation[] = [];
  for (const mapping of navasanInstrumentMappings) {
    const item = (payload as Record<string, unknown>)[mapping.providerCode];
    if (item === undefined) continue;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("ردیف منبع نامعتبر است.");
    const { value, timestamp: published } = item as Record<string, unknown>;
    if (typeof value !== "string" && typeof value !== "number") throw new Error("قیمت منبع مفقود است.");
    if ((typeof published !== "number" && typeof published !== "string") || !/^\d{1,12}$/.test(String(published))) throw new Error("زمان انتشار منبع باید عدد ثانیه باشد.");
    const rawValue = String(value).replaceAll(",", "");
    normalizeNavasanValue(mapping.providerCode, rawValue, currency);
    observations.push({ source: "navasan", sourceUrl: "https://www.navasan.tech/api/", providerSymbol: mapping.providerCode,
      instrumentCode: mapping.instrumentCode, unit: mapping.unit, rawValue, rawCurrency: currency, providerScale: mapping.providerScale,
      priceRial: navasanRawRial(rawValue, currency, mapping.providerScale), purityPermille: mapping.providerCode === "18ayar" ? 750 : null,
      publishedAt: normalizeNavasanTimestamp(published, now), receivedAt });
  }
  const result: MarketSnapshot = { version: "asha.navasan.latest_snapshot.v1", datasetKind: "real_market_snapshot", receivedAt, observations };
  validateMarketSnapshot(result, now);
  return result;
}

export function validateMarketSnapshot(value: unknown, nowMs: number): asserts value is MarketSnapshot {
  exactKeys(value, ["version", "datasetKind", "receivedAt", "observations"]);
  if (value.version !== "asha.navasan.latest_snapshot.v1" || value.datasetKind !== "real_market_snapshot") throw new Error("برچسب یا نسخهٔ منبع ناسازگار است.");
  const received = timestamp(value.receivedAt);
  if (!Number.isFinite(nowMs) || received > nowMs + 300_000) throw new Error("زمان دریافت در آینده است.");
  if (!Array.isArray(value.observations) || value.observations.length < 1 || value.observations.length > 8) throw new Error("پاسخ فاقد قیمت معتبر است.");
  const symbols = new Set<string>();
  for (const raw of value.observations) {
    exactKeys(raw, ["source", "sourceUrl", "providerSymbol", "instrumentCode", "unit", "rawValue", "rawCurrency", "providerScale", "priceRial", "purityPermille", "publishedAt", "receivedAt"]);
    const mapping = navasanInstrumentMappings.find((item) => item.providerCode === raw.providerSymbol);
    if (!mapping || symbols.has(mapping.providerCode) || raw.source !== "navasan" || raw.sourceUrl !== "https://www.navasan.tech/api/" || raw.instrumentCode !== mapping.instrumentCode || raw.unit !== mapping.unit || raw.providerScale !== mapping.providerScale || raw.purityPermille !== (mapping.providerCode === "18ayar" ? 750 : null)) throw new Error("نماد، منبع، واحد یا عیار ناسازگار است.");
    symbols.add(mapping.providerCode);
    if ((raw.rawCurrency !== "IRR" && raw.rawCurrency !== "TOMAN") || typeof raw.rawValue !== "string") throw new Error("واحد پول نامشخص است.");
    normalizeNavasanValue(mapping.providerCode, raw.rawValue, raw.rawCurrency);
    if (raw.priceRial !== navasanRawRial(raw.rawValue, raw.rawCurrency, mapping.providerScale)) throw new Error("تبدیل قیمت با دادهٔ خام تطبیق ندارد.");
    rial(raw.priceRial);
    if (raw.receivedAt !== value.receivedAt || timestamp(raw.publishedAt) > received + 300_000) throw new Error("زمان انتشار ناسازگار است.");
  }
}

export function createMarketTestPortfolio(): MarketTestPortfolio {
  return { version: MARKET_TEST_VERSION, holdingsKind: "synthetic_test_positions", revision: 0, selectedAsset: "GOLD_18K_IRR", cashRial: "100000000",
    quantitiesMilli: { GOLD_18K_IRR: 1000, EMAMI_COIN_IRR: 1000, SILVER_999_IRR: 0 },
    shortDays: 30, mediumDays: 180, minimumCashBps: 2000, maximumAssetBps: 5000, snapshot: null };
}
export function validateMarketTestPortfolio(value: unknown, nowMs: number): asserts value is MarketTestPortfolio {
  exactKeys(value, ["version", "holdingsKind", "revision", "selectedAsset", "cashRial", "quantitiesMilli", "shortDays", "mediumDays", "minimumCashBps", "maximumAssetBps", "snapshot"]);
  if (value.version !== MARKET_TEST_VERSION || value.holdingsKind !== "synthetic_test_positions" || !marketTestAssets.some((a) => a.id === value.selectedAsset)) throw new Error("سبد آزمون با سبد شخصی یا ساختگی مخلوط شده است.");
  integer(value.revision, 0, 1_000_000_000); rial(value.cashRial, true);
  exactKeys(value.quantitiesMilli, marketTestAssets.map((a) => a.id));
  for (const a of marketTestAssets) { integer(value.quantitiesMilli[a.id], 0, 1_000_000_000); if (a.unit === "unit" && (value.quantitiesMilli[a.id] as number) % 1000 !== 0) throw new Error("تعداد سکه باید صحیح باشد."); }
  integer(value.shortDays, 1, 90); integer(value.mediumDays, value.shortDays + 1, 730);
  integer(value.minimumCashBps, 0, 10_000); integer(value.maximumAssetBps, 1, 10_000);
  if (value.snapshot !== null) validateMarketSnapshot(value.snapshot, nowMs);
}

export function evaluateMarketTest(portfolio: MarketTestPortfolio, nowMs: number) {
  validateMarketTestPortfolio(portfolio, nowMs);
  return evaluateQuotedTestPositions(portfolio, portfolio.snapshot?.observations ?? [], nowMs);
}

// Shared arithmetic only. Each source must validate its own contract before calling;
// no source or dataset label is changed to reuse portfolio valuation.
export function evaluateQuotedTestPositions<T extends { instrumentCode: string; priceRial: string; publishedAt: string | null }>(
  portfolio: MarketTestPortfolio, observations: T[], nowMs: number,
) {
  let complete = true; let fresh = true; let total = BigInt(portfolio.cashRial);
  const rows = marketTestAssets.map((asset) => {
    const observation = observations.find((q) => q.instrumentCode === asset.id) ?? null;
    const qty = portfolio.quantitiesMilli[asset.id];
    const state: "missing" | "unknown_time" | "future" | "stale" | "fresh" = !observation ? "missing" : observation.publishedAt === null ? "unknown_time" : Date.parse(observation.publishedAt) > nowMs ? "future" : nowMs - Date.parse(observation.publishedAt) > MARKET_TTL_MS ? "stale" : "fresh";
    const valueRial = observation ? (BigInt(observation.priceRial) * BigInt(qty) / 1000n).toString() : qty === 0 ? "0" : null;
    if (qty > 0 && !observation) complete = false;
    if (qty > 0 && state !== "fresh") fresh = false;
    if (valueRial !== null) total += BigInt(valueRial);
    return { asset, observation, quantityMilli: qty, valueRial, state };
  });
  const observedTotalRial = complete ? total.toString() : null;
  const weightsBps = Object.fromEntries(rows.map((row) => [row.asset.id, complete && total > 0n && row.valueRial !== null ? Number(BigInt(row.valueRial) * 10_000n / total) : null]));
  return { rows, observedTotalRial, currentTotalRial: complete && fresh ? observedTotalRial : null, weightsBps,
    cashWeightBps: complete && total > 0n ? Number(BigInt(portfolio.cashRial) * 10_000n / total) : null,
    minimumCashRial: complete ? ((total * BigInt(portfolio.minimumCashBps) + 9999n) / 10_000n).toString() : null,
    decision: { state: "undecidable", financialUseAllowed: false, amountRial: null, quantityMilli: null, costRial: null, cashAfterRial: null,
      reasons: ["تاریخچهٔ مجاز و عوامل واقعی روش موجود نیست.", "قیمت قطعی خرید و فروش، هزینه و ظرفیت معامله کامل نیست.", "اعتبارسنجی بازار ایران و قفل استفادهٔ مالی برقرار است."] } as const };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function encodeMarketTest(portfolio: MarketTestPortfolio, nowMs: number) {
  const evaluatedAt = new Date(nowMs).toISOString();
  return canonical({ version: "asha.market_test_document.v1", evaluatedAt, portfolio, result: evaluateMarketTest(portfolio, nowMs) });
}
export function decodeMarketTest(text: string, nowMs: number): MarketTestPortfolio {
  if (text.length > 100_000) throw new Error("نسخه بیش از اندازه بزرگ است.");
  const document: unknown = JSON.parse(text);
  exactKeys(document, ["version", "evaluatedAt", "portfolio", "result"]);
  if (document.version !== "asha.market_test_document.v1" || canonical(document) !== text) throw new Error("نسخه ناسازگار، تکراری یا دست‌کاری شده است.");
  const evaluated = timestamp(document.evaluatedAt);
  if (evaluated > nowMs + 300_000) throw new Error("زمان ذخیره در آینده است.");
  validateMarketTestPortfolio(document.portfolio, evaluated);
  if (canonical(document.result) !== canonical(evaluateMarketTest(document.portfolio, evaluated))) throw new Error("نتیجهٔ ذخیره با محاسبه تطبیق ندارد.");
  return document.portfolio;
}

export function displayRialAsToman(value: string | null) {
  if (value === null) return "قابل محاسبه نیست";
  const amount = BigInt(value); const remainder = amount % 10n;
  return `${(amount / 10n).toLocaleString("fa-IR")}${remainder ? `٫${remainder.toLocaleString("fa-IR")}` : ""} تومان`;
}

export function tomanInputToRial(value: string) {
  if (!/^\d{1,17}(\.\d)?$/.test(value)) throw new Error("مبلغ تومان باید حداکثر یک رقم اعشار داشته باشد.");
  const [whole, fraction = "0"] = value.split(".");
  const result = (BigInt(whole) * 10n + BigInt(fraction)).toString(); rial(result, true); return result;
}
export function rialToTomanInput(value: string) {
  rial(value, true); const amount = BigInt(value);
  return `${amount / 10n}${amount % 10n === 0n ? "" : `.${amount % 10n}`}`;
}
