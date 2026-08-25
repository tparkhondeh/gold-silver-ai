import { NextResponse } from "next/server";
import { rahavardManualSnapshot } from "./rahavard-snapshot";

export const dynamic = "force-dynamic";

type Quote = {
  instrumentCode: string;
  value: number;
  currency: "USD" | "TOMAN";
  unit: "troy_ounce" | "gram" | "unit" | "usd";
  publishedAt: string | null;
  collectedAt: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  quality: "primary" | "informational" | "manual_snapshot";
  status: "valid" | "stale";
};

type SourceState = {
  id: string;
  name: string;
  status: "connected" | "fallback" | "snapshot" | "needs_key" | "needs_unit" | "unavailable";
  message: string;
};

type FeedResult = {
  collectedAt: string;
  quotes: Quote[];
  sources: SourceState[];
};

type GoldApiComPayload = {
  name?: unknown;
  price?: unknown;
  symbol?: unknown;
  updatedAt?: unknown;
};

type GoldApiIoPayload = {
  price?: unknown;
  timestamp?: unknown;
  metal?: unknown;
  currency?: unknown;
};

type XausPayload = {
  spot_usd_oz?: unknown;
  silver_usd_oz?: unknown;
  updated_at?: unknown;
  price_as_of?: unknown;
  stale?: unknown;
  data_state?: { status?: unknown; as_of?: unknown };
};

type NavasanItem = { value?: unknown; timestamp?: unknown };
type NavasanPayload = Record<string, NavasanItem>;

const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;
let cached: { expiresAt: number; payload: FeedResult } | null = null;

function asFiniteNumber(value: unknown, label: string) {
  const parsed = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} is not a positive number`);
  return parsed;
}

function asPublishedAt(value: unknown) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("provider timestamp is invalid");
  if (date.getTime() > Date.now() + 5 * 60_000) throw new Error("provider timestamp is in the future");
  return date.toISOString();
}

function quoteStatus(publishedAt: string | null, collectedAt?: string): "valid" | "stale" {
  const freshnessBasis = publishedAt ?? collectedAt;
  if (!freshnessBasis) return "stale";
  return Date.now() - new Date(freshnessBasis).getTime() > 60 * 60_000 ? "stale" : "valid";
}

const rahavardRangesToman: Record<string, readonly [number, number]> = {
  GOLD_18K_IRR: [1_000_000, 100_000_000],
  GOLD_24K_IRR: [1_000_000, 150_000_000],
  MESGHAL_IRR: [5_000_000, 500_000_000],
  EMAMI_COIN_IRR: [5_000_000, 1_000_000_000],
  AZADI_COIN_IRR: [5_000_000, 1_000_000_000],
  HALF_COIN_IRR: [2_000_000, 500_000_000],
  QUARTER_COIN_IRR: [1_000_000, 300_000_000],
  GRAM_COIN_IRR: [500_000, 150_000_000],
  SILVER_999_IRR: [10_000, 10_000_000],
  SILVER_925_IRR: [10_000, 10_000_000],
  USD_IRR: [10_000, 1_000_000],
};

function readRahavardSnapshot(): Quote[] {
  const collectedAt = asPublishedAt(rahavardManualSnapshot.capturedAt);

  return rahavardManualSnapshot.observations.map((observation) => {
    const rawValue = asFiniteNumber(observation.rawValue, observation.instrumentCode);
    const value = observation.rawCurrency === "IRR" ? rawValue / 10 : rawValue;
    const publishedAt = observation.publishedAt ? asPublishedAt(observation.publishedAt) : null;

    if (observation.instrumentCode === "XAU_USD" || observation.instrumentCode === "XAG_USD") {
      validateMetalPrice(observation.instrumentCode === "XAU_USD" ? "XAU" : "XAG", value);
    } else {
      const range = rahavardRangesToman[observation.instrumentCode];
      if (!range || value < range[0] || value > range[1]) {
        throw new Error(observation.instrumentCode + " failed snapshot range validation");
      }
      if (!Number.isSafeInteger(Math.round(value))) {
        throw new Error(observation.instrumentCode + " exceeds safe integer range");
      }
    }

    return {
      instrumentCode: observation.instrumentCode,
      value,
      currency: observation.rawCurrency === "IRR" ? "TOMAN" as const : "USD" as const,
      unit: observation.unit,
      publishedAt,
      collectedAt,
      sourceId: "rahavard-manual",
      sourceName: "Rahavard 365",
      sourceUrl: observation.sourceUrl,
      quality: "manual_snapshot" as const,
      status: quoteStatus(publishedAt, collectedAt),
    };
  });
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { accept: "application/json", ...headers }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`provider returned HTTP ${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function validateMetalPrice(symbol: "XAU" | "XAG", value: number) {
  const [minimum, maximum] = symbol === "XAU" ? [300, 10_000] : [2, 1_000];
  if (value < minimum || value > maximum) throw new Error(`${symbol} price failed range validation`);
}

async function fetchGoldApiIo(symbol: "XAU" | "XAG", token: string, collectedAt: string): Promise<Quote> {
  const payload = await fetchJson(`https://www.goldapi.io/api/${symbol}/USD`, { "x-access-token": token }) as GoldApiIoPayload;
  const value = asFiniteNumber(payload.price, `${symbol} price`);
  validateMetalPrice(symbol, value);
  const publishedAt = asPublishedAt(payload.timestamp);
  return {
    instrumentCode: `${symbol}_USD`, value, currency: "USD", unit: "troy_ounce",
    publishedAt, collectedAt, sourceId: "goldapi-io", sourceName: "GoldAPI.io",
    sourceUrl: "https://www.goldapi.io/", quality: "primary", status: quoteStatus(publishedAt),
  };
}

async function fetchGoldApiCom(symbol: "XAU" | "XAG", collectedAt: string): Promise<Quote> {
  const payload = await fetchJson(`https://api.gold-api.com/price/${symbol}`) as GoldApiComPayload;
  const value = asFiniteNumber(payload.price, `${symbol} price`);
  validateMetalPrice(symbol, value);
  const publishedAt = asPublishedAt(payload.updatedAt);
  return {
    instrumentCode: `${symbol}_USD`, value, currency: "USD", unit: "troy_ounce",
    publishedAt, collectedAt, sourceId: "gold-api-com", sourceName: "Gold-API.com",
    sourceUrl: "https://gold-api.com/", quality: "informational", status: quoteStatus(publishedAt),
  };
}

async function fetchXaus(collectedAt: string): Promise<Quote[]> {
  const payload = await fetchJson("https://xaus.com/api/v1/spot?compact=1") as XausPayload;
  const gold = asFiniteNumber(payload.spot_usd_oz, "XAU price");
  const silver = asFiniteNumber(payload.silver_usd_oz, "XAG price");
  validateMetalPrice("XAU", gold);
  validateMetalPrice("XAG", silver);
  const goldPublishedAt = asPublishedAt(payload.data_state?.as_of ?? payload.price_as_of ?? payload.updated_at);
  const silverPublishedAt = asPublishedAt(payload.updated_at);
  const explicitlyStale = payload.stale === true || payload.data_state?.status === "stale";
  const makeQuote = (symbol: "XAU" | "XAG", value: number, publishedAt: string): Quote => ({
    instrumentCode: `${symbol}_USD`, value, currency: "USD", unit: "troy_ounce",
    publishedAt, collectedAt, sourceId: "xaus", sourceName: "XAUS",
    sourceUrl: "https://xaus.com/api/", quality: "informational",
    status: explicitlyStale ? "stale" : quoteStatus(publishedAt),
  });
  return [makeQuote("XAU", gold, goldPublishedAt), makeQuote("XAG", silver, silverPublishedAt)];
}

async function fetchIranQuotes(apiKey: string, declaredUnit: "IRR" | "TOMAN", collectedAt: string): Promise<Quote[]> {
  const payload = await fetchJson(`https://api.navasan.tech/latest/?api_key=${encodeURIComponent(apiKey)}`) as NavasanPayload;
  const scale = declaredUnit === "IRR" ? 0.1 : 1;
  const mappings = [
    ["18ayar", "GOLD_18K_IRR", "gram"],
    ["abshodeh", "MESGHAL_IRR", "unit"],
    ["sekkeh", "EMAMI_COIN_IRR", "unit"],
    ["usd_sell", "USD_IRR", "usd"],
  ] as const;

  return mappings.flatMap(([providerCode, instrumentCode, unit]) => {
    const item = payload[providerCode];
    if (!item) return [];
    const rawValue = asFiniteNumber(item.value, providerCode);
    const value = rawValue * scale;
    if (!Number.isSafeInteger(Math.round(value))) throw new Error(`${providerCode} exceeds safe integer range`);
    const publishedAt = asPublishedAt(item.timestamp);
    return [{
      instrumentCode, value, currency: "TOMAN" as const, unit,
      publishedAt, collectedAt, sourceId: "navasan", sourceName: "Navasan",
      sourceUrl: "https://www.navasan.tech/api/", quality: "primary" as const,
      status: quoteStatus(publishedAt),
    }];
  });
}

export async function GET() {
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, { headers: { "Cache-Control": "private, max-age=30" } });
  }

  const collectedAt = new Date().toISOString();
  const quotes: Quote[] = [];
  const sources: SourceState[] = [];
  const goldApiToken = process.env.GOLD_API_TOKEN?.trim();

  try {
    quotes.push(...readRahavardSnapshot());
    sources.push({
      id: "rahavard-manual",
      name: "Rahavard 365",
      status: "snapshot",
      message: "Snapshot دستی نشست مرورگر در " + rahavardManualSnapshot.capturedAtLabel + "؛ خودکار به‌روزرسانی نمی‌شود",
    });
  } catch {
    sources.push({
      id: "rahavard-manual",
      name: "Rahavard 365",
      status: "unavailable",
      message: "Snapshot دستی از اعتبارسنجی قطعی عبور نکرد و نمایش داده نشد",
    });
  }

  try {
    if (goldApiToken) {
      quotes.push(...await Promise.all([fetchGoldApiIo("XAU", goldApiToken, collectedAt), fetchGoldApiIo("XAG", goldApiToken, collectedAt)]));
      sources.push({ id: "goldapi-io", name: "GoldAPI.io", status: "connected", message: "خوراک کلیددار طلا و نقره جهانی" });
    } else {
      try {
        quotes.push(...await fetchXaus(collectedAt));
        sources.push({ id: "xaus", name: "XAUS", status: "fallback", message: "خوراک رایگان با وضعیت تازگی و منشأ؛ قیمت‌ها صرفاً اطلاع‌رسانی‌اند" });
      } catch {
        quotes.push(...await Promise.all([fetchGoldApiCom("XAU", collectedAt), fetchGoldApiCom("XAG", collectedAt)]));
        sources.push({ id: "gold-api-com", name: "Gold-API.com", status: "fallback", message: "خوراک رایگان ثانویه؛ برای تصمیم نهایی کافی نیست" });
      }
      sources.push({ id: "goldapi-io", name: "GoldAPI.io", status: "needs_key", message: "برای خوراک کلیددار، GOLD_API_TOKEN تنظیم شود" });
    }
  } catch {
    sources.push({ id: goldApiToken ? "goldapi-io" : "global-metals", name: goldApiToken ? "GoldAPI.io" : "خوراک جهانی", status: "unavailable", message: "دریافت یا اعتبارسنجی خوراک جهانی ناموفق بود" });
  }

  const navasanKey = process.env.NAVASAN_API_KEY?.trim();
  const navasanUnit = process.env.NAVASAN_VALUE_UNIT?.trim().toUpperCase();
  if (!navasanKey) {
    sources.push({ id: "navasan", name: "Navasan", status: "needs_key", message: "برای بازار ایران، NAVASAN_API_KEY لازم است" });
  } else if (navasanUnit !== "IRR" && navasanUnit !== "TOMAN") {
    sources.push({ id: "navasan", name: "Navasan", status: "needs_unit", message: "واحد قرارداد باید با NAVASAN_VALUE_UNIT مشخص شود" });
  } else {
    try {
      quotes.push(...await fetchIranQuotes(navasanKey, navasanUnit, collectedAt));
      sources.push({ id: "navasan", name: "Navasan", status: "connected", message: `خوراک ایران با واحد قراردادی ${navasanUnit}` });
    } catch {
      sources.push({ id: "navasan", name: "Navasan", status: "unavailable", message: "دریافت یا اعتبارسنجی خوراک ایران ناموفق بود" });
    }
  }

  sources.push({
    id: "tgju",
    name: "TGJU",
    status: "needs_key",
    message: "وب‌سرویس رسمی شناسایی شده؛ فعال‌سازی به قرارداد، مجوز و کلید سروری TGJU نیاز دارد",
  });

  const deduplicatedQuotes = Array.from(new Map(quotes.map((quote) => [quote.instrumentCode, quote])).values());
  const payload = { collectedAt, quotes: deduplicatedQuotes, sources } satisfies FeedResult;
  cached = { expiresAt: Date.now() + CACHE_MS, payload };
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=30", "X-Content-Type-Options": "nosniff" } });
}
