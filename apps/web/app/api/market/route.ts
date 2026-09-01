import { NextResponse } from "next/server";
import { fingerprintNavasanRequest } from "../../../data/navasan-quota-ledger.ts";
import { resolveNavasanRefreshPolicy } from "../../../data/navasan-refresh-policy.ts";
import { resolveNavasanQuotaLedger } from "../../../db/postgres-runtime.ts";
import { inspectNavasanConfiguration, normalizeNavasanPayload, type NavasanPayload } from "../../navasan-adapter";
import { goldApiLiveRequestUrl, normalizeGoldApiLivePayload } from "../../goldapi-adapter";
import { selectPreferredQuotes } from "../../quote-priority";
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

type XausPayload = {
  spot_usd_oz?: unknown;
  silver_usd_oz?: unknown;
  updated_at?: unknown;
  price_as_of?: unknown;
  stale?: unknown;
  data_state?: { status?: unknown; as_of?: unknown };
};

const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;
let cached: { expiresAt: number; payload: FeedResult } | null = null;
let cachedIran: { expiresAt: number; quotes: Quote[] } | null = null;

class NavasanQuotaError extends Error {
  readonly code: "ledger_unavailable" | "quota_exhausted" | "refresh_cooldown";

  constructor(code: "ledger_unavailable" | "quota_exhausted" | "refresh_cooldown") {
    super(code);
    this.name = "NavasanQuotaError";
    this.code = code;
  }
}

function navasanRefreshSeconds() {
  return resolveNavasanRefreshPolicy(process.env).effectiveRefreshSeconds;
}

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

function navasanFailureMessage(error: unknown) {
  if (error instanceof NavasanQuotaError) {
    return error.code === "quota_exhausted"
      ? "سقف امن سهمیهٔ نوسان در پنجرهٔ ۳۱روزه پر شده است؛ هیچ درخواست تازه‌ای ارسال نشد"
      : error.code === "refresh_cooldown"
        ? "فاصلهٔ امن دریافت هنوز تمام نشده است؛ راه‌اندازی مجدد یا تازه‌کردن صفحه سهمیهٔ تازه مصرف نمی‌کند"
      : "دفتر پایدار سهمیهٔ نوسان آماده نیست؛ برای جلوگیری از مصرف کنترل‌نشده هیچ درخواستی ارسال نشد";
  }
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const networkFailure = name === "AbortError"
    || name === "TimeoutError"
    || message.includes("fetch")
    || message.includes("network")
    || message.includes("timeout");
  return networkFailure
    ? "اتصال شبکه یا پاسخ نوسان در مهلت مقرر برقرار نشد؛ نرخ قدیمی جایگزین نمی‌شود"
    : "پاسخ نوسان از اعتبارسنجی واحد، مقیاس، دامنه یا زمان عبور نکرد";
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
  const payload = await fetchJson(
    goldApiLiveRequestUrl(symbol),
    { "x-access-token": token },
  );
  const normalized = normalizeGoldApiLivePayload(payload, symbol, collectedAt);
  return {
    ...normalized,
    sourceName: "GoldAPI.io",
    sourceUrl: "https://www.goldapi.io/",
    quality: "primary",
    status: quoteStatus(normalized.publishedAt),
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
  if (cachedIran && cachedIran.expiresAt > Date.now()) {
    return cachedIran.quotes.map((quote) => ({ ...quote, status: quoteStatus(quote.publishedAt, quote.collectedAt) }));
  }

  const quota = await resolveNavasanQuotaLedger();
  if (!quota.available) throw new NavasanQuotaError("ledger_unavailable");
  const requestHash = fingerprintNavasanRequest("latest", { item: "approved-phase-1-set" });
  const reservation = await quota.ledger.reserve("latest", requestHash, navasanRefreshSeconds());
  if (!reservation.allowed) {
    throw new NavasanQuotaError(reservation.retryAfterSeconds ? "refresh_cooldown" : "quota_exhausted");
  }
  if (!reservation.reservationId) throw new NavasanQuotaError("ledger_unavailable");

  const startedAt = performance.now();
  const durationMs = () => Math.max(0, Math.min(120_000, Math.round(performance.now() - startedAt)));
  let quotes: Quote[];
  try {
    const payload = await fetchJson(`https://api.navasan.tech/latest/?api_key=${encodeURIComponent(apiKey)}`) as NavasanPayload;
    quotes = normalizeNavasanPayload(payload, declaredUnit, collectedAt);
  } catch (error) {
    try {
      await quota.ledger.recordLatestOutcome({
        reservationId: reservation.reservationId,
        outcome: "failure",
        quoteCount: null,
        durationMs: durationMs(),
      });
    } catch {
      throw new NavasanQuotaError("ledger_unavailable");
    }
    throw error;
  }
  try {
    await quota.ledger.recordLatestOutcome({
      reservationId: reservation.reservationId,
      outcome: "success",
      quoteCount: quotes.length,
      durationMs: durationMs(),
    });
  } catch {
    throw new NavasanQuotaError("ledger_unavailable");
  }
  cachedIran = { expiresAt: Date.now() + navasanRefreshSeconds() * 1000, quotes };
  return quotes;
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

  const [xausResult, goldApiComResult, goldApiIoResult] = await Promise.allSettled([
    fetchXaus(collectedAt),
    Promise.all([fetchGoldApiCom("XAU", collectedAt), fetchGoldApiCom("XAG", collectedAt)]),
    goldApiToken
      ? Promise.all([fetchGoldApiIo("XAU", goldApiToken, collectedAt), fetchGoldApiIo("XAG", goldApiToken, collectedAt)])
      : Promise.resolve<Quote[]>([]),
  ]);

  if (xausResult.status === "fulfilled") {
    sources.push({ id: "xaus", name: "XAUS", status: "fallback", message: "خوراک عمومی جهانی فعال؛ قیمت‌ها صرفاً اطلاع‌رسانی‌اند" });
  } else {
    sources.push({ id: "xaus", name: "XAUS", status: "unavailable", message: "دریافت یا اعتبارسنجی خوراک عمومی XAUS ناموفق بود" });
  }

  if (goldApiComResult.status === "fulfilled") {
    sources.push({ id: "gold-api-com", name: "Gold-API.com", status: "fallback", message: "کراس‌چک عمومی طلا و نقره فعال؛ وارد تصمیم مالی نمی‌شود" });
  } else {
    sources.push({ id: "gold-api-com", name: "Gold-API.com", status: "unavailable", message: "کراس‌چک عمومی Gold-API.com در دسترس نبود" });
  }

  if (goldApiToken) {
    if (goldApiIoResult.status === "fulfilled") {
      quotes.push(...goldApiIoResult.value);
      sources.push({ id: "goldapi-io", name: "GoldAPI.io", status: "connected", message: "خوراک کلیددار طلا و نقره جهانی" });
    } else {
      sources.push({ id: "goldapi-io", name: "GoldAPI.io", status: "unavailable", message: "توکن موجود است اما دریافت یا اعتبارسنجی خوراک کلیددار ناموفق بود" });
    }
  } else {
    sources.push({ id: "goldapi-io", name: "GoldAPI.io", status: "needs_key", message: "برای خوراک کلیددار، GOLD_API_TOKEN تنظیم شود" });
  }

  if (goldApiIoResult.status !== "fulfilled" || goldApiIoResult.value.length === 0) {
    if (xausResult.status === "fulfilled") quotes.push(...xausResult.value);
    else if (goldApiComResult.status === "fulfilled") quotes.push(...goldApiComResult.value);
  }

  const navasanKey = process.env.NAVASAN_API_KEY?.trim();
  const navasanConfiguration = inspectNavasanConfiguration(process.env);
  if (!navasanConfiguration.ready && navasanConfiguration.reason === "missing_key") {
    sources.push({ id: "navasan", name: "Navasan", status: "needs_key", message: "برای بازار ایران، NAVASAN_API_KEY لازم است" });
  } else if (!navasanConfiguration.ready && navasanConfiguration.reason === "key_rotation_required") {
    sources.push({ id: "navasan", name: "Navasan", status: "needs_key", message: "کلید قبلی افشاشده محسوب می‌شود؛ تا لغو آن و ثبت امن کلید جدید، دریافت نوسان متوقف است" });
  } else if (!navasanConfiguration.ready) {
    sources.push({ id: "navasan", name: "Navasan", status: "needs_unit", message: "واحد قرارداد باید با NAVASAN_VALUE_UNIT مشخص شود" });
  } else if (navasanKey) {
    try {
      const navasanUnit = navasanConfiguration.unit;
      const iranQuotes = await fetchIranQuotes(navasanKey, navasanUnit, collectedAt);
      quotes.push(...iranQuotes);
      sources.push({ id: "navasan", name: "Navasan", status: "connected", message: `خوراک ایران با واحد قراردادی ${navasanUnit}، مقیاس ثابت هر نماد، ${iranQuotes.length} نماد و بازخوانی ${navasanRefreshSeconds()} ثانیه‌ای` });
    } catch (error) {
      sources.push({ id: "navasan", name: "Navasan", status: "unavailable", message: navasanFailureMessage(error) });
    }
  }

  sources.push({
    id: "tgju",
    name: "TGJU",
    status: "needs_key",
    message: "وب‌سرویس رسمی شناسایی شده؛ فعال‌سازی به قرارداد، مجوز و کلید سروری TGJU نیاز دارد",
  });

  const deduplicatedQuotes = selectPreferredQuotes(quotes);
  const payload = { collectedAt, quotes: deduplicatedQuotes, sources } satisfies FeedResult;
  cached = { expiresAt: Date.now() + CACHE_MS, payload };
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=30", "X-Content-Type-Options": "nosniff" } });
}
