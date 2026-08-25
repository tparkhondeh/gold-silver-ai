"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "overview" | "portfolio" | "market" | "analysis" | "risk" | "data" | "agents";

type Holding = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  costToman: number | null;
  purchaseDate: string | null;
  note: string;
};

type Instrument = {
  code: string;
  name: string;
  market: string;
  unit: string;
  icon: string;
  tone: "gold" | "silver" | "copper" | "blue";
  sourceState: "blocked" | "planned";
};

type LiveQuote = {
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

type FeedResponse = {
  collectedAt: string;
  quotes: LiveQuote[];
  sources: Array<{ id: string; name: string; status: string; message: string }>;
};

type NotificationKind = "volatility" | "opportunity" | "data";
type NotificationFilter = "all" | NotificationKind;

type MarketNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  demo: boolean;
};

type PublicXausPayload = {
  spot_usd_oz?: unknown;
  silver_usd_oz?: unknown;
  updated_at?: unknown;
  price_as_of?: unknown;
  stale?: unknown;
  data_state?: { status?: unknown; as_of?: unknown };
};

const instruments: Instrument[] = [
  { code: "GOLD_18K_IRR", name: "طلای ۱۸ عیار", market: "بازار ایران", unit: "تومان / گرم", icon: "Au", tone: "gold", sourceState: "blocked" },
  { code: "GOLD_24K_IRR", name: "طلای ۲۴ عیار", market: "بازار ایران", unit: "تومان / گرم", icon: "Au", tone: "gold", sourceState: "blocked" },
  { code: "MESGHAL_IRR", name: "مثقال طلا", market: "بازار ایران", unit: "تومان / مثقال", icon: "Au", tone: "gold", sourceState: "blocked" },
  { code: "EMAMI_COIN_IRR", name: "سکه امامی", market: "بازار ایران", unit: "تومان / عدد", icon: "●", tone: "gold", sourceState: "blocked" },
  { code: "AZADI_COIN_IRR", name: "سکه بهار آزادی", market: "بازار ایران", unit: "تومان / عدد", icon: "●", tone: "gold", sourceState: "blocked" },
  { code: "HALF_COIN_IRR", name: "نیم‌سکه", market: "بازار ایران", unit: "تومان / عدد", icon: "●", tone: "gold", sourceState: "blocked" },
  { code: "QUARTER_COIN_IRR", name: "ربع‌سکه", market: "بازار ایران", unit: "تومان / عدد", icon: "●", tone: "gold", sourceState: "blocked" },
  { code: "GRAM_COIN_IRR", name: "سکه یک‌گرمی", market: "بازار ایران", unit: "تومان / عدد", icon: "●", tone: "gold", sourceState: "blocked" },
  { code: "SILVER_999_IRR", name: "نقره ۹۹۹", market: "بازار ایران", unit: "تومان / گرم", icon: "Ag", tone: "silver", sourceState: "blocked" },
  { code: "SILVER_925_IRR", name: "نقره ۹۲۵", market: "بازار ایران", unit: "تومان / گرم", icon: "Ag", tone: "silver", sourceState: "blocked" },
  { code: "USD_IRR", name: "دلار آزاد", market: "بازار ایران", unit: "تومان / دلار", icon: "$", tone: "blue", sourceState: "blocked" },
  { code: "XAU_USD", name: "اونس جهانی طلا", market: "بازار جهانی", unit: "دلار / اونس", icon: "Au", tone: "gold", sourceState: "planned" },
  { code: "XAG_USD", name: "اونس جهانی نقره", market: "بازار جهانی", unit: "دلار / اونس", icon: "Ag", tone: "silver", sourceState: "planned" },
  { code: "COPPER_USD", name: "مس جهانی", market: "بازار جهانی", unit: "دلار", icon: "Cu", tone: "copper", sourceState: "planned" },
];

const marketPreviewCodes = new Set(["GOLD_18K_IRR", "EMAMI_COIN_IRR", "SILVER_999_IRR", "USD_IRR", "XAU_USD"]);
const marketPreviewInstruments = instruments.filter((instrument) => marketPreviewCodes.has(instrument.code));

const assetOptions = [
  "طلای ۱۸ عیار", "طلای ۲۴ عیار", "مثقال طلا", "سکه امامی", "سکه بهار آزادی", "نیم سکه", "ربع سکه", "سکه یک گرمی", "شمش نقره ۹۹۹",
  "گواهی سپرده کالایی", "ارز خارجی", "وجه نقد و سپرده بانکی", "سهام",
  "صندوق سرمایه‌گذاری و ETF", "رمزارز", "ملک و زمین", "کسب‌وکار خصوصی",
  "خودرو و تجهیزات", "طلب و وام پرداختی", "دارایی دیجیتال و مالکیت فکری",
];

const assetUnitOptions: Record<string, string[]> = {
  "طلای ۱۸ عیار": ["گرم"],
  "طلای ۲۴ عیار": ["گرم"],
  "مثقال طلا": ["مثقال"],
  "سکه امامی": ["عدد"],
  "سکه بهار آزادی": ["عدد"],
  "نیم سکه": ["عدد"],
  "ربع سکه": ["عدد"],
  "سکه یک گرمی": ["عدد"],
  "شمش نقره ۹۹۹": ["گرم"],
  "گواهی سپرده کالایی": ["واحد"],
  "ارز خارجی": ["واحد ارزی"],
  "وجه نقد و سپرده بانکی": ["تومان"],
  "سهام": ["سهم"],
  "صندوق سرمایه‌گذاری و ETF": ["واحد"],
  "رمزارز": ["واحد"],
  "ملک و زمین": ["متر مربع"],
  "کسب‌وکار خصوصی": ["درصد مالکیت"],
  "خودرو و تجهیزات": ["عدد"],
  "طلب و وام پرداختی": ["تومان"],
  "دارایی دیجیتال و مالکیت فکری": ["درصد مالکیت"],
};

const demoPortfolioVersion = "2-diversified";

const demoHoldings: Holding[] = [
  { id: "demo-gold-18k", name: "طلای ۱۸ عیار", amount: 12.5, unit: "گرم", costToman: 235_000_000, purchaseDate: "2026-03-18", note: "نمونهٔ آزمایشی · فلز گران‌بها" },
  { id: "demo-emami", name: "سکه امامی", amount: 2, unit: "عدد", costToman: 382_000_000, purchaseDate: "2026-04-09", note: "نمونهٔ آزمایشی · سکه فیزیکی" },
  { id: "demo-silver", name: "شمش نقره ۹۹۹", amount: 500, unit: "گرم", costToman: 178_000_000, purchaseDate: "2026-02-12", note: "نمونهٔ آزمایشی · فلز صنعتی" },
  { id: "demo-fx", name: "ارز خارجی", amount: 1_200, unit: "واحد ارزی", costToman: 170_000_000, purchaseDate: "2026-01-25", note: "نمونهٔ آزمایشی · ارز" },
  { id: "demo-deposit", name: "وجه نقد و سپرده بانکی", amount: 300_000_000, unit: "تومان", costToman: 300_000_000, purchaseDate: "2026-01-05", note: "نمونهٔ آزمایشی · نقد و کم‌ریسک" },
  { id: "demo-stocks", name: "سهام", amount: 12_000, unit: "سهم", costToman: 250_000_000, purchaseDate: "2026-05-20", note: "نمونهٔ آزمایشی · بازار سهام" },
  { id: "demo-etf", name: "صندوق سرمایه‌گذاری و ETF", amount: 2_500, unit: "واحد", costToman: 210_000_000, purchaseDate: "2026-06-15", note: "نمونهٔ آزمایشی · صندوق بورسی" },
  { id: "demo-crypto", name: "رمزارز", amount: 0.06, unit: "واحد", costToman: 160_000_000, purchaseDate: "2026-07-02", note: "نمونهٔ آزمایشی · دارایی پرنوسان" },
  { id: "demo-property", name: "ملک و زمین", amount: 18, unit: "متر مربع", costToman: 1_050_000_000, purchaseDate: "2025-11-10", note: "نمونهٔ آزمایشی · دارایی غیرنقد" },
  { id: "demo-business", name: "کسب‌وکار خصوصی", amount: 15, unit: "درصد مالکیت", costToman: 450_000_000, purchaseDate: "2025-09-21", note: "نمونهٔ آزمایشی · سرمایه‌گذاری خصوصی" },
];

const demoCurrentValuesToman: Record<string, number> = {
  "demo-gold-18k": 268_508_750,
  "demo-emami": 425_000_000,
  "demo-silver": 223_430_000,
  "demo-fx": 192_000_000,
  "demo-deposit": 310_000_000,
  "demo-stocks": 285_000_000,
  "demo-etf": 228_000_000,
  "demo-crypto": 175_000_000,
  "demo-property": 1_180_000_000,
  "demo-business": 480_000_000,
};

const volatilityThresholdPercent: Record<string, number> = {
  XAU_USD: 2.5,
  XAG_USD: 4,
  GOLD_18K_IRR: 3,
  GOLD_24K_IRR: 3,
  MESGHAL_IRR: 3,
  EMAMI_COIN_IRR: 4,
  AZADI_COIN_IRR: 4,
  HALF_COIN_IRR: 5,
  QUARTER_COIN_IRR: 5,
  GRAM_COIN_IRR: 5,
  SILVER_999_IRR: 5,
  SILVER_925_IRR: 5,
  USD_IRR: 3,
};

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "نمای کلی", icon: "⌂" },
  { id: "portfolio", label: "دارایی‌های من", icon: "◫" },
  { id: "market", label: "فلزات و بازار", icon: "⌁" },
  { id: "analysis", label: "تحلیل و سناریو", icon: "◉" },
  { id: "risk", label: "ریسک و تخصیص", icon: "△" },
  { id: "data", label: "کیفیت داده", icon: "▤" },
  { id: "agents", label: "هیئت بررسی", icon: "◇" },
];

const demoUsdIrrRate = 1_600_000;

function formatIrr(value: number) {
  return `${Math.round(value).toLocaleString("fa-IR")} ریال`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("fa-IR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function isUsableUsdIrrRate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function formatTomanInIrrAndUsd(valueToman: number, usdIrrRate: number | null) {
  const valueIrr = valueToman * 10;
  return `${formatIrr(valueIrr)} · ${isUsableUsdIrrRate(usdIrrRate) ? formatUsd(valueIrr / usdIrrRate) : "معادل دلاری نامشخص"}`;
}

function toEnglishDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = "۰۱۲۳۴۵۶۷۸۹".indexOf(digit);
    return String(persianIndex >= 0 ? persianIndex : "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
  });
}

function toPersianDigits(value: string) {
  return value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function currentJalaliDate() {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return `${part("year").toString().padStart(4, "0")}/${part("month").toString().padStart(2, "0")}/${part("day").toString().padStart(2, "0")}`;
}

function normalizeJalaliDate(value: string) {
  const match = toEnglishDigits(value).trim().replace(/[.-]/g, "/").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = month >= 1 && month <= 6 ? 31 : month >= 7 && month <= 11 ? 30 : month === 12 ? 30 : 0;
  if (year < 1300 || year > 1600 || day < 1 || day > maxDay) return null;
  const normalized = `${year.toString().padStart(4, "0")}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
  return normalized <= currentJalaliDate() ? normalized : null;
}

function isValidPurchaseDate(value: string) {
  if (normalizeJalaliDate(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && value <= new Date().toISOString().slice(0, 10);
}

function formatPurchaseDate(value: string | null | undefined) {
  if (!value || !isValidPurchaseDate(value)) return "تاریخ خرید نامشخص";
  const jalali = normalizeJalaliDate(value);
  if (jalali) return `${toPersianDigits(jalali)} شمسی`;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(value));
}

function notificationKindLabel(kind: NotificationKind) {
  if (kind === "volatility") return "نوسان شدید";
  if (kind === "opportunity") return "فرصت قابل بررسی";
  return "کیفیت داده";
}

function quoteObservedAt(quote: LiveQuote) {
  return quote.publishedAt ?? quote.collectedAt;
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return <div className="section-title"><span>{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>;
}

function EmptyLock({ title, text }: { title: string; text: string }) {
  return <div className="empty-lock"><span>⌁</span><strong>{title}</strong><p>{text}</p></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [portfolioMode, setPortfolioMode] = useState<"personal" | "demo">("personal");
  const [holdingsLoaded, setHoldingsLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAssetName, setSelectedAssetName] = useState("");
  const [baseValue, setBaseValue] = useState("");
  const [marketMove, setMarketMove] = useState("-10");
  const [stressMove, setStressMove] = useState("-18");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const [notifications, setNotifications] = useState<MarketNotification[]>([]);
  const previousQuotesRef = useRef<Map<string, LiveQuote>>(new Map());

  const pushNotifications = useCallback((incoming: MarketNotification[]) => {
    if (incoming.length === 0) return;
    setNotifications((current) => {
      const existingIds = new Set(current.map((notification) => notification.id));
      const unique = incoming.filter((notification) => !existingIds.has(notification.id));
      return [...unique, ...current].slice(0, 50);
    });
  }, []);

  const refreshMarket = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const response = await fetch("/api/market", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as FeedResponse;
      const hasGlobalQuote = payload.quotes.some((quote) => quote.instrumentCode === "XAU_USD");
      if (!hasGlobalQuote) {
        try {
          const publicResponse = await fetch("https://xaus.com/api/v1/spot?compact=1", { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
          if (!publicResponse.ok) throw new Error(`HTTP ${publicResponse.status}`);
          const publicPayload = await publicResponse.json() as PublicXausPayload;
          payload.quotes.push(...normalizePublicXaus(publicPayload));
          payload.sources = payload.sources.filter((source) => source.id !== "global-metals");
          payload.sources.unshift({ id: "xaus", name: "XAUS", status: "fallback", message: "خوراک عمومی مرورگر با کنترل تازگی؛ صرفاً اطلاع‌رسانی" });
        } catch {
          // Fail closed: the UI keeps explicit empty states when the public feed is unreachable.
        }
      }
      setFeed(payload);
    } catch {
      setFeedError("دریافت قیمت‌ها ناموفق بود؛ عدد قبلی جایگزین نمی‌شود.");
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = sessionStorage.getItem("gold-silver-holdings");
      if (saved) {
        try {
          const restored = JSON.parse(saved) as Array<Holding & { purchaseDate?: string | null }>;
          setHoldings(restored.map((holding) => ({ ...holding, purchaseDate: holding.purchaseDate ?? demoHoldings.find((demo) => demo.id === holding.id)?.purchaseDate ?? null })));
        } catch { sessionStorage.removeItem("gold-silver-holdings"); }
      }
      const savedPortfolioMode = sessionStorage.getItem("gold-silver-portfolio-mode");
      if (savedPortfolioMode === "demo") {
        setPortfolioMode("demo");
        if (sessionStorage.getItem("gold-silver-demo-version") !== demoPortfolioVersion) setHoldings(demoHoldings.map((holding) => ({ ...holding })));
      }
      const savedNotifications = sessionStorage.getItem("gold-silver-notifications");
      if (savedNotifications) {
        try { setNotifications(JSON.parse(savedNotifications) as MarketNotification[]); } catch { sessionStorage.removeItem("gold-silver-notifications"); }
      }
      const savedQuotes = sessionStorage.getItem("gold-silver-alert-baseline");
      if (savedQuotes) {
        try {
          const restoredQuotes = JSON.parse(savedQuotes) as LiveQuote[];
          previousQuotesRef.current = new Map(restoredQuotes.map((quote) => [quote.instrumentCode, quote]));
        } catch { sessionStorage.removeItem("gold-silver-alert-baseline"); }
      }
      setHoldingsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!holdingsLoaded) return;
    sessionStorage.setItem("gold-silver-holdings", JSON.stringify(holdings));
    sessionStorage.setItem("gold-silver-portfolio-mode", portfolioMode);
    if (portfolioMode === "demo") sessionStorage.setItem("gold-silver-demo-version", demoPortfolioVersion);
  }, [holdings, holdingsLoaded, portfolioMode]);

  useEffect(() => {
    if (!holdingsLoaded) return;
    sessionStorage.setItem("gold-silver-notifications", JSON.stringify(notifications));
  }, [holdingsLoaded, notifications]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshMarket(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshMarket]);

  useEffect(() => {
    if (!feed) return;
    const incoming: MarketNotification[] = [];
    const nextBaseline = new Map(previousQuotesRef.current);
    const usdIrrQuote = feed.quotes.find((quote) => quote.instrumentCode === "USD_IRR" && quote.currency === "TOMAN");
    const alertUsdIrrRate = usdIrrQuote && usdIrrQuote.value > 0 ? usdIrrQuote.value * 10 : null;

    for (const quote of feed.quotes) {
      if (quote.status !== "valid") continue;
      const previous = previousQuotesRef.current.get(quote.instrumentCode);
      const currentObservedAt = new Date(quoteObservedAt(quote)).getTime();
      const previousObservedAt = previous ? new Date(quoteObservedAt(previous)).getTime() : Number.NaN;

      if (previous && previous.status === "valid" && previous.currency === quote.currency && previous.unit === quote.unit && Number.isFinite(currentObservedAt) && Number.isFinite(previousObservedAt) && currentObservedAt > previousObservedAt) {
        const elapsedMs = currentObservedAt - previousObservedAt;
        const changePercent = ((quote.value - previous.value) / previous.value) * 100;
        const threshold = volatilityThresholdPercent[quote.instrumentCode] ?? 5;
        if (elapsedMs <= 24 * 60 * 60_000 && Math.abs(changePercent) >= threshold) {
          const instrumentName = instruments.find((instrument) => instrument.code === quote.instrumentCode)?.name ?? quote.instrumentCode;
          const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60_000));
          const windowText = elapsedMinutes < 60 ? `${elapsedMinutes.toLocaleString("fa-IR")} دقیقه` : `${Math.round(elapsedMinutes / 60).toLocaleString("fa-IR")} ساعت`;
          incoming.push({
            id: `volatility-${quote.instrumentCode}-${quoteObservedAt(quote)}`,
            kind: "volatility",
            title: `نوسان شدید ${instrumentName}`,
            message: `${changePercent > 0 ? "رشد" : "افت"} ${Math.abs(changePercent).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪ در ${windowText}؛ از ${formatQuote(previous, alertUsdIrrRate)} به ${formatQuote(quote, alertUsdIrrRate)}.`,
            createdAt: feed.collectedAt,
            read: false,
            demo: false,
          });
        }
      }

      if (!previous || !Number.isFinite(previousObservedAt) || currentObservedAt >= previousObservedAt) nextBaseline.set(quote.instrumentCode, quote);
    }

    const staleCount = feed.quotes.filter((quote) => quote.status === "stale").length;
    if (staleCount > 0) incoming.push({
      id: "data-stale-market",
      kind: "data",
      title: "بخشی از داده‌های بازار منقضی است",
      message: `${staleCount.toLocaleString("fa-IR")} قیمت از حد تازگی عبور کرده و وارد ارزش‌گذاری یا هشدار فرصت نمی‌شود.`,
      createdAt: feed.collectedAt,
      read: false,
      demo: false,
    });

    previousQuotesRef.current = nextBaseline;
    sessionStorage.setItem("gold-silver-alert-baseline", JSON.stringify(Array.from(nextBaseline.values())));
    const timer = window.setTimeout(() => pushNotifications(incoming), 0);
    return () => window.clearTimeout(timer);
  }, [feed, pushNotifications]);

  const knownCost = useMemo(() => holdings.reduce((sum, item) => sum + (item.costToman ?? 0), 0), [holdings]);
  const costCoverage = holdings.length ? Math.round((holdings.filter((item) => item.costToman !== null).length / holdings.length) * 100) : 0;
  const scenarioValue = Number(baseValue) > 0 ? Number(baseValue) * (1 + Number(marketMove || 0) / 100) : null;
  const quoteMap = useMemo(() => new Map((feed?.quotes ?? []).map((quote) => [quote.instrumentCode, quote])), [feed]);
  const usdIrrQuote = quoteMap.get("USD_IRR");
  const marketUsdIrrRate = usdIrrQuote?.currency === "TOMAN" && usdIrrQuote.value > 0 ? usdIrrQuote.value * 10 : null;
  const portfolioUsdIrrRate = portfolioMode === "demo" ? demoUsdIrrRate : marketUsdIrrRate;
  const marketRateStatus = !isUsableUsdIrrRate(marketUsdIrrRate) ? "نرخ دلار ناموجود" : `۱ دلار = ${formatIrr(marketUsdIrrRate)} (${usdIrrQuote?.status === "valid" ? "تازه" : "منقضی"})`;
  const portfolioRateStatus = portfolioMode === "demo" ? `۱ دلار = ${formatIrr(demoUsdIrrRate)} (نرخ ساختگی سبد نمایشی)` : marketRateStatus;
  const formatPortfolioMoney = (valueToman: number) => formatTomanInIrrAndUsd(valueToman, portfolioUsdIrrRate);
  const formatScenarioMoney = (valueToman: number) => formatTomanInIrrAndUsd(valueToman, marketUsdIrrRate);
  const holdingValues = useMemo(() => new Map(holdings.map((holding) => [holding.id, portfolioMode === "demo" ? (demoCurrentValuesToman[holding.id] ?? null) : calculateHoldingValue(holding, quoteMap)])), [holdings, portfolioMode, quoteMap]);
  const valuedHoldingCount = Array.from(holdingValues.values()).filter((value) => value !== null).length;
  const portfolioMarketValue = holdings.length > 0 && valuedHoldingCount === holdings.length
    ? Array.from(holdingValues.values()).reduce((sum, value) => sum + (value ?? 0), 0)
    : null;
  const portfolioProfitLoss = portfolioMarketValue !== null && costCoverage === 100 ? portfolioMarketValue - knownCost : null;
  const portfolioProfitPercent = portfolioProfitLoss !== null && knownCost > 0 ? (portfolioProfitLoss / knownCost) * 100 : null;
  const allocationRows = holdings.map((holding) => ({ holding, value: holdingValues.get(holding.id) ?? null }));
  const largestAllocation = portfolioMarketValue === null ? null : allocationRows.reduce<{ holding: Holding; value: number } | null>((largest, row) => row.value === null || (largest && largest.value >= row.value) ? largest : { holding: row.holding, value: row.value }, null);
  const largestAllocationPercent = largestAllocation && portfolioMarketValue ? Math.round((largestAllocation.value / portfolioMarketValue) * 100) : null;
  const stressScenarioValue = portfolioMarketValue === null ? null : portfolioMarketValue * (1 + Number(stressMove) / 100);
  const liveQuoteCount = feed?.quotes.filter((quote) => quote.status === "valid").length ?? 0;
  const displayQuoteCount = feed?.quotes.length ?? 0;
  const coverage = Math.round((liveQuoteCount / instruments.length) * 100);
  const connectedSourceCount = feed?.sources.filter((source) => source.status === "connected" || source.status === "fallback" || source.status === "snapshot").length ?? 0;
  const pricingReady = portfolioMode === "demo" || liveQuoteCount > 0;
  const readinessScore = 1 + (holdings.length ? 1 : 0) + (pricingReady ? 1 : 0);
  const availableUnits = selectedAssetName ? (assetUnitOptions[selectedAssetName] ?? ["واحد"]) : [];
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  const visibleNotifications = notificationFilter === "all" ? notifications : notifications.filter((notification) => notification.kind === notificationFilter);

  function addHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const rawCost = String(data.get("cost") ?? "").trim();
    const purchaseDateInput = String(data.get("purchaseDate") ?? "").trim();
    const purchaseDate = normalizeJalaliDate(purchaseDateInput) ?? purchaseDateInput;
    if (!Number.isFinite(amount) || amount <= 0 || !isValidPurchaseDate(purchaseDate)) return;
    setHoldings((current) => [...current, {
      id: crypto.randomUUID(),
      name: String(data.get("name")),
      amount,
      unit: String(data.get("unit")),
      costToman: rawCost ? Number(rawCost) : null,
      purchaseDate,
      note: String(data.get("note") ?? "").trim(),
    }]);
    event.currentTarget.reset();
    setSelectedAssetName("");
    setModalOpen(false);
  }

  function loadDemoPortfolio() {
    activateDemoPortfolio("portfolio");
  }

  function activateDemoPortfolio(destination: View) {
    setHoldings(demoHoldings.map((holding) => ({ ...holding })));
    setPortfolioMode("demo");
    setBaseValue(String(Object.values(demoCurrentValuesToman).reduce((sum, value) => sum + value, 0)));
    const createdAt = new Date().toISOString();
    pushNotifications([
      { id: "demo-volatility-silver", kind: "volatility", title: "نوسان شدید نقره · نمایشی", message: "افت ساختگی ۷٫۲٪ در سه ساعت؛ این اعلان فقط برای آزمون تجربهٔ کاربری است.", createdAt, read: false, demo: true },
      { id: "demo-opportunity-gold", kind: "opportunity", title: "فرصت جذاب قابل بررسی · نمایشی", message: "طلای ۱۸ عیار در سناریوی ساختگی وارد محدودهٔ بررسی شده است؛ این اعلان سیگنال خرید نیست.", createdAt, read: false, demo: true },
    ]);
    setView(destination);
  }

  function clearDemoPortfolio() {
    setHoldings([]);
    setPortfolioMode("personal");
    setBaseValue("");
    setNotifications((current) => current.filter((notification) => !notification.demo));
  }

  function markNotificationRead(id: string) {
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, read: true } : notification));
  }

  function markAllNotificationsRead() {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }

  const headerTitle = navItems.find((item) => item.id === view)?.label ?? "نمای کلی";

  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#top" onClick={() => setView("overview")}>
          <span className="brand-mark">ز</span>
          <span><strong>دیدبان زر و سیم</strong><small>هوش ثروت شخصی</small></span>
        </a>
        <nav aria-label="بخش‌های سامانه">
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMenuOpen(false); }}><i>{item.icon}</i>{item.label}</button>)}
        </nav>
        <div className="sidebar-status"><i /><span><strong>حالت امن فعال</strong><small>بدون معاملهٔ خودکار</small></span></div>
        <p className="sidebar-version">PHASE 1 · LOCAL</p>
      </aside>

      <main className="workspace" id="top">
        <header className="topbar">
          <div className="top-title"><button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="باز کردن منو">☰</button><div><h1>{headerTitle}</h1><p>بازار، دارایی و کیفیت داده در یک نمای قابل‌ردیابی</p></div></div>
          <div className="top-actions"><span className={displayQuoteCount ? "offline-state online" : "offline-state"}><i /><span><strong>{feedLoading ? "در حال دریافت قیمت" : displayQuoteCount ? `${liveQuoteCount.toLocaleString("fa-IR")} قیمت تازه از ${displayQuoteCount.toLocaleString("fa-IR")}` : "منبع قابل نمایش نیست"}</strong><small>{feedError ? `${feedError} · ${marketRateStatus}` : marketRateStatus}</small></span></span><button className="notification-trigger" data-testid="notification-center" onClick={() => setNotificationOpen(true)} aria-label={`اعلان‌ها؛ ${unreadNotificationCount.toLocaleString("fa-IR")} خوانده‌نشده`} aria-expanded={notificationOpen}><span>اعلان‌ها</span>{unreadNotificationCount > 0 && <b>{unreadNotificationCount.toLocaleString("fa-IR")}</b>}</button><button className="primary-button" onClick={() => setModalOpen(true)}>＋ افزودن دارایی</button></div>
        </header>

        <div className="page-content">
          {view === "overview" && <>
            <section className="overview-toolbar">
              <div><span>داشبورد ثروت شخصی</span><strong>{holdings.length ? `${holdings.length.toLocaleString("fa-IR")} موقعیت · آمادگی ${readinessScore.toLocaleString("fa-IR")} از ۴` : "برای شروع، دارایی ثبت یا سبد نمایشی را فعال کن"}</strong><small>{portfolioRateStatus}</small></div>
              <div><button className="primary-button" onClick={() => setModalOpen(true)}>＋ ثبت دارایی</button>{holdings.length === 0 && <button className="ghost-button" data-testid="load-demo-portfolio" onClick={loadDemoPortfolio}>سبد نمایشی</button>}<button className="text-button" onClick={() => setView("data")}>کیفیت داده ←</button></div>
            </section>

            <section className="metric-grid">
              <article><span className="metric-icon gold">◈</span><div><small>ارزش روز سبد</small><strong>{portfolioMarketValue === null ? (holdings.length ? "پوشش ناقص" : "دارایی ثبت نشده") : formatPortfolioMoney(portfolioMarketValue)}</strong><p>{holdings.length ? `${valuedHoldingCount.toLocaleString("fa-IR")} از ${holdings.length.toLocaleString("fa-IR")} دارایی قیمت‌گذاری شده` : "پس از ثبت دارایی محاسبه می‌شود"}</p></div></article>
              <article><span className="metric-icon green">◫</span><div><small>موقعیت‌های ثبت‌شده</small><strong>{holdings.length.toLocaleString("fa-IR")}</strong><p>{portfolioMode === "demo" ? "سبد ساختگی برای آزمون تجربهٔ کاربری" : "فقط در نشست فعلی این مرورگر"}</p></div></article>
              <article><span className="metric-icon blue">◎</span><div><small>بهای خرید ثبت‌شده</small><strong>{knownCost ? formatPortfolioMoney(knownCost) : "ثبت نشده"}</strong><p>پوشش اطلاعات: {costCoverage.toLocaleString("fa-IR")}٪</p></div></article>
              <article><span className="metric-icon neutral">⌁</span><div><small>پوشش قیمت بازار</small><strong>{coverage.toLocaleString("fa-IR")}٪</strong><p>{liveQuoteCount.toLocaleString("fa-IR")} از {instruments.length.toLocaleString("fa-IR")} نماد تازه</p></div></article>
            </section>

            <section className="split-grid">
              <article className="panel portfolio-panel"><div className="panel-head"><SectionTitle eyebrow="PORTFOLIO" title="دارایی‌های من"/><button className="text-button" onClick={() => setView("portfolio")}>مشاهده همه ←</button></div>
                {holdings.length === 0 ? <EmptyLock title="سبد شما هنوز خالی است" text="نوع دارایی، مقدار و بهای خرید را ثبت کن تا پایهٔ تحلیل شخصی ساخته شود."/> : <div className="mini-holdings">{holdings.slice(0, 4).map((item) => { const currentValue = holdingValues.get(item.id); return <div key={item.id}><span className="asset-dot">◈</span><span><strong>{item.name}</strong><small>{item.amount.toLocaleString("fa-IR")} {item.unit} · {formatPurchaseDate(item.purchaseDate)}</small></span><b>{currentValue === null || currentValue === undefined ? "بدون قیمت تازه" : formatPortfolioMoney(currentValue)}</b></div>; })}</div>}
              </article>
              <aside className="panel readiness"><div className="panel-head"><SectionTitle eyebrow="READINESS" title="آمادگی تحلیل"/><b className="score">{readinessScore.toLocaleString("fa-IR")} از ۴</b></div><div className="progress"><i style={{ width: `${readinessScore * 25}%` }} /></div><ol><li className="done"><span>✓</span><div><b>دامنهٔ دارایی</b><small>نمادهای پایه تعریف شده‌اند</small></div></li><li className={holdings.length ? "done" : ""}><span>{holdings.length ? "✓" : "۲"}</span><div><b>دارایی‌های شما</b><small>{holdings.length ? `${holdings.length.toLocaleString("fa-IR")} مورد ثبت شده` : "در انتظار ثبت اطلاعات"}</small></div></li><li className={pricingReady ? "done" : ""}><span>{pricingReady ? "✓" : "۳"}</span><div><b>{portfolioMode === "demo" ? "ارزش‌گذاری نمایشی" : "قیمت تازه"}</b><small>{portfolioMode === "demo" ? "اعداد ساختگی فقط برای آزمون ابزار" : liveQuoteCount ? "Snapshot دستی/خوراک معتبر در دسترس" : "در انتظار منبع تازه"}</small></div></li><li><span>۴</span><div><b>مدل تأییدشده</b><small>{portfolioMode === "demo" ? "ابزارها فقط در حالت آزمایشی بازند" : "پس از بک‌تست و walk-forward"}</small></div></li></ol></aside>
            </section>

            <section className="panel market-preview"><div className="panel-head"><SectionTitle eyebrow="MARKET WATCH" title="دیده‌بان بازار"/><button className="text-button" onClick={() => setView("market")}>نمای کامل ←</button></div><MarketTable rows={marketPreviewInstruments} quotes={quoteMap} usdIrrRate={marketUsdIrrRate}/></section>
          </>}

          {view === "portfolio" && <section className="view-stack"><div className="view-hero"><SectionTitle eyebrow="MY ASSETS" title="دفتر دارایی‌های من" text="اطلاعات این نسخه فقط در نشست مرورگر شما نگه‌داری می‌شود و به سرویس بیرونی ارسال نمی‌شود."/><div className="market-actions">{portfolioMode === "demo" && <span className="status-chip warning">حالت نمایشی</span>}{holdings.length === 0 && <button className="ghost-button" data-testid="load-demo-portfolio" onClick={loadDemoPortfolio}>بارگذاری سبد نمایشی</button>}{portfolioMode === "demo" && <button className="ghost-button" onClick={clearDemoPortfolio}>پاک‌کردن داده‌های نمایشی</button>}<button className="primary-button" onClick={() => setModalOpen(true)}>＋ ثبت دارایی</button></div></div>
            {portfolioMode === "demo" && <section className="guardrail"><span>i</span><div><b>این سبد کاملاً ساختگی است</b><p>مقدار دارایی‌ها و بهای خرید فقط برای تجربه و بررسی رابط کاربری ساخته شده‌اند. قیمت‌های بازار همچنان از منابع واقعی و دارای برچسب تازگی می‌آیند و این سبد هیچ پیشنهاد خرید یا فروشی نیست.</p></div></section>}
            <section className="conversion-strip"><b>مبنای نمایش دوارزی</b><span>{portfolioRateStatus}</span></section>
            <section className="panel"><div className="portfolio-summary"><div><small>تعداد موقعیت‌ها</small><strong>{holdings.length.toLocaleString("fa-IR")}</strong></div><div><small>جمع بهای خرید ثبت‌شده</small><strong>{knownCost ? formatPortfolioMoney(knownCost) : "—"}</strong></div><div><small>ارزش روز</small><strong className={portfolioMarketValue === null ? "muted-value" : ""}>{portfolioMarketValue === null ? "پوشش ناقص" : formatPortfolioMoney(portfolioMarketValue)}</strong></div><div><small>سود و زیان</small><strong className={portfolioProfitLoss === null ? "muted-value" : portfolioProfitLoss < 0 ? "negative" : "positive"}>{portfolioProfitLoss === null ? "محاسبه نشده" : formatPortfolioMoney(portfolioProfitLoss)}</strong></div></div>
              {holdings.length === 0 ? <EmptyLock title="هنوز دارایی ثبت نشده است" text="افزودن دارایی به معنی پیشنهاد خرید نیست؛ فقط اطلاعاتی است که خودتان وارد می‌کنید."/> : <div className="holdings-table"><div className="table-row table-head"><span>دارایی</span><span>مقدار</span><span>بهای خرید (ریال · دلار)</span><span>ارزش فعلی (ریال · دلار)</span><span>سود/زیان (ریال · دلار)</span><span /></div>{holdings.map((item) => { const currentValue = holdingValues.get(item.id); const holdingProfitLoss = typeof currentValue === "number" && item.costToman !== null ? currentValue - item.costToman : null; const holdingProfitPercent = holdingProfitLoss !== null && item.costToman !== null && item.costToman > 0 ? (holdingProfitLoss / item.costToman) * 100 : null; return <div className="table-row" key={item.id}><span><b>{item.name}</b><small>{formatPurchaseDate(item.purchaseDate)} · {item.note || "ثبت‌شده توسط شما"}</small></span><span>{item.amount.toLocaleString("fa-IR")} {item.unit}</span><span>{item.costToman !== null ? formatPortfolioMoney(item.costToman) : "—"}</span><span className={currentValue === null || currentValue === undefined ? "no-data" : "positive"}>{currentValue === null || currentValue === undefined ? "—" : formatPortfolioMoney(currentValue)}</span><span className={`holding-profit ${holdingProfitLoss === null ? "muted-value" : holdingProfitLoss < 0 ? "negative" : "positive"}`}><b>{holdingProfitLoss === null ? "نامشخص" : formatPortfolioMoney(holdingProfitLoss)}</b><small>{holdingProfitPercent === null ? "—" : `${holdingProfitPercent > 0 ? "+" : ""}${holdingProfitPercent.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`}</small></span><button className="remove-button" onClick={() => setHoldings((current) => current.filter((row) => row.id !== item.id))} aria-label={`حذف ${item.name}`}>حذف</button></div>; })}</div>}
            </section>
          </section>}

          {view === "market" && <section className="view-stack"><div className="view-hero"><SectionTitle eyebrow="MARKET INTELLIGENCE" title="فلزات و بازارهای مرجع" text="هر قیمت با منبع، زمان انتشار، زمان دریافت و وضعیت اعتبارسنجی نمایش داده می‌شود."/><div className="market-actions"><span className={liveQuoteCount ? "status-chip safe" : "status-chip warning"}>{feedLoading ? "در حال بروزرسانی" : `${liveQuoteCount.toLocaleString("fa-IR")} قیمت تازه`}</span><button className="ghost-button refresh-button" onClick={() => void refreshMarket()} disabled={feedLoading}>{feedLoading ? "لطفاً صبر کنید" : "بروزرسانی منابع آنلاین"}</button></div></div>{feedError && <div className="feed-error">{feedError}</div>}<section className="conversion-strip"><b>مبنای تبدیل قیمت‌ها</b><span>{marketRateStatus}</span></section><section className="guardrail snapshot-note"><span>i</span><div><b>رهاورد فعلاً Snapshot دستی است</b><p>اعداد رهاورد از نشست مرورگر شما ثبت شده‌اند و با این دکمه خودکار تازه نمی‌شوند. پس از تهیه API، همین مرز داده بدون تغییر ظاهری به خوراک مستقیم متصل می‌شود.</p></div></section><section className="panel"><MarketTable rows={instruments} quotes={quoteMap} usdIrrRate={marketUsdIrrRate}/></section><section className="source-grid">{(feed?.sources ?? []).map((source) => <article key={source.id}><div><strong>{source.name}</strong><span className={`source-status ${source.status}`}>{sourceLabel(source.status)}</span></div><p>{source.message}</p>{source.id === "tgju" && <a className="source-action" href="https://www.tgju.org/form/api" target="_blank" rel="noreferrer">درخواست رسمی API از TGJU ↗</a>}</article>)}</section><section className="info-grid"><article><span>۱</span><h3>قیمت خام</h3><p>دریافت بدون تغییر همراه با زمان و شناسهٔ منبع.</p></article><article><span>۲</span><h3>اعتبارسنجی</h3><p>کنترل نوع، دامنه، تازگی و سازگاری رکورد.</p></article><article><span>۳</span><h3>قرنطینه</h3><p>عدد مشکوک هیچ‌وقت وارد تحلیل نمی‌شود.</p></article><article><span>۴</span><h3>نمایش</h3><p>فقط دادهٔ معتبر و قابل‌ردیابی نمایش داده می‌شود.</p></article></section></section>}

          {view === "analysis" && <section className="view-stack">
            <div className="view-hero"><SectionTitle eyebrow="SCENARIO LAB" title="آزمایش سناریو، بدون پیش‌بینی" text="این ابزار اثر یک فرض عددی را محاسبه می‌کند؛ آینده را پیش‌بینی و خرید یا فروش پیشنهاد نمی‌کند."/><div className="market-actions">{portfolioMode === "demo" ? <span className="status-chip warning">آزمایش با دادهٔ ساختگی</span> : <button className="primary-button" onClick={() => activateDemoPortfolio("analysis")}>فعال‌سازی ابزارهای نمایشی</button>}<span className="status-chip safe">محاسبهٔ قطعی</span></div></div>
            <div className="split-grid analysis-grid">
              <section className="panel scenario-card"><h3>اگر بازار تغییر کند چه می‌شود؟</h3><p>یک ارزش مبنا و درصد تغییر فرضی وارد کن.</p><label>ارزش مبنا (ورودی تومان؛ خروجی ریال و دلار)<input inputMode="numeric" value={baseValue} onChange={(event) => setBaseValue(event.target.value.replace(/[^0-9]/g, ""))} placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰"/></label><label>تغییر فرضی بازار<input type="range" min="-40" max="40" step="1" value={marketMove} onChange={(event) => setMarketMove(event.target.value)}/><span className={Number(marketMove) < 0 ? "negative" : "positive"}>{Number(marketMove).toLocaleString("fa-IR")}٪</span></label><div className="scenario-presets" aria-label="سناریوهای سریع">{[-30, -20, -10, 10, 20, 30].map((move) => <button type="button" className={marketMove === String(move) ? "active" : ""} key={move} onClick={() => setMarketMove(String(move))}>{move > 0 ? "+" : ""}{move.toLocaleString("fa-IR")}٪</button>)}</div><div className="scenario-result"><small>ارزش پس از سناریو</small><strong>{scenarioValue === null ? "—" : formatScenarioMoney(scenarioValue)}</strong><p>{scenarioValue === null ? "برای محاسبه، ارزش مبنا را وارد کنید." : `تغییر: ${formatScenarioMoney(scenarioValue - Number(baseValue))}`}</p></div></section>
              <section className="panel locked-models"><h3>مدل‌های تحلیلی</h3>{portfolioMode === "demo" ? <><div><span>بازده سبد نسبت به بهای خرید</span><b>{portfolioProfitPercent === null ? "—" : `${portfolioProfitPercent.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪ نمایشی`}</b></div><div><span>حباب و پریمیوم بازار ایران</span><b>۷٫۴٪ ساختگی</b></div><div><span>رژیم بازار نمونه</span><b>نوسانی</b></div><div><span>سطوح مواجهه در رابط</span><b>۳ پلهٔ آزمایشی</b></div><p>این خروجی‌ها فقط برای بررسی تجربهٔ کاربری ساخته شده‌اند و مدل مالی، سیگنال یا پیشنهاد سرمایه‌گذاری نیستند.</p></> : <><div><span>صدک تاریخی و محدوده ارزش‌گذاری</span><b>قفل</b></div><div><span>حباب و پریمیوم بازار ایران</span><b>قفل</b></div><div><span>تشخیص رژیم بازار</span><b>قفل</b></div><div><span>نقاط افزایش یا کاهش مواجهه</span><b>قفل</b></div><p>برای تجربهٔ همهٔ ابزارها، حالت نمایشی را فعال کن. فعال‌سازی واقعی همچنان نیازمند دادهٔ point-in-time، بک‌تست و اعتبارسنجی walk-forward است.</p></>}</section>
            </div>
            <section className="guardrail"><span>!</span><div><b>{portfolioMode === "demo" ? "تمام خروجی‌های این صفحه آزمایشی‌اند" : "محدودهٔ امن با «نقطهٔ تضمینی» فرق دارد"}</b><p>{portfolioMode === "demo" ? "مقادیر ساختگی فقط برای کلیک، مقایسه و اعلام تغییرات رابط هستند؛ از آن‌ها برای تصمیم مالی استفاده نکن." : "هیچ قیمت یا زمان ورود تضمین‌شده‌ای وجود ندارد. نسخهٔ نهایی باید محدوده‌ها را همراه با عدم‌قطعیت، سناریوی خلاف و کیفیت داده توضیح دهد."}</p></div></section>
          </section>}

          {view === "risk" && <section className="view-stack">
            <div className="view-hero"><SectionTitle eyebrow="RISK & ALLOCATION" title="ریسک قبل از بازده" text={portfolioMode === "demo" ? "ابزارهای این صفحه با یک سبد کاملاً ساختگی باز شده‌اند تا رفتار رابط را بررسی کنی." : "برای ارزیابی واقعی، تحمل ریسک، تاریخچه معتبر و روش مصوب لازم است."}/><div className="market-actions">{portfolioMode === "demo" ? <span className="status-chip warning">آزمایش با دادهٔ ساختگی</span> : <button className="primary-button" onClick={() => activateDemoPortfolio("risk")}>فعال‌سازی ابزارهای نمایشی</button>}<span className="status-chip safe">بدون پیشنهاد معامله</span></div></div>
            <section className="risk-grid">{portfolioMode === "demo" ? <><article><span>◫</span><h3>تمرکز سبد</h3><p>{largestAllocation ? `${largestAllocation.holding.name} بزرگ‌ترین موقعیت سبد است.` : "—"}</p><b>{largestAllocationPercent === null ? "—" : `${largestAllocationPercent.toLocaleString("fa-IR")}٪ از سبد`}</b></article><article><span>⌁</span><h3>بازده نمایشی</h3><p>اختلاف ارزش ساختگی امروز با بهای خرید نمونه.</p><b>{portfolioProfitPercent === null ? "—" : `${portfolioProfitPercent.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`}</b></article><article><span>◉</span><h3>نقدشوندگی نمونه</h3><p>برچسب آزمایشی برای بررسی نمایش ریسک خروج.</p><b>متوسط · ساختگی</b></article><article><span>△</span><h3>سناریوی فشار</h3><p>اثر یک شوک یکسان روی کل ارزش سبد نمونه.</p><b>{Number(stressMove).toLocaleString("fa-IR")}٪</b></article></> : <><article><span>◫</span><h3>تمرکز سبد</h3><p>وزن هر دارایی و وابستگی بیش‌ازحد به یک بازار.</p><b>نیازمند ارزش روز کامل</b></article><article><span>⌁</span><h3>نوسان و افت</h3><p>نوسان، افت تاریخی و زمان بازیابی در دادهٔ ایران.</p><b>نیازمند تاریخچه معتبر</b></article><article><span>◉</span><h3>نقدشوندگی</h3><p>اثر فاصلهٔ خرید و فروش و امکان خروج در فشار بازار.</p><b>نیازمند دادهٔ بازار</b></article><article><span>△</span><h3>سناریوی فشار</h3><p>ارز، اونس، پریمیوم داخلی و شوک‌های هم‌زمان.</p><b>نیازمند مدل مصوب</b></article></>}</section>
            {portfolioMode === "demo" ? <div className="split-grid analysis-grid"><section className="panel allocation-panel"><div className="panel-head"><SectionTitle eyebrow="DEMO ALLOCATION" title="ترکیب سبد نمایشی"/><b className="score">جمع ۱۰۰٪</b></div><div className="allocation-list">{allocationRows.map((row) => { const weight = row.value !== null && portfolioMarketValue ? Math.round((row.value / portfolioMarketValue) * 100) : 0; return <div key={row.holding.id}><div><span>{row.holding.name}</span><b>{weight.toLocaleString("fa-IR")}٪</b></div><span className="allocation-track"><i style={{ width: `${weight}%` }}/></span></div>; })}</div></section><section className="panel scenario-card"><h3>آزمایش فشار سبد</h3><p>درصد شوک فرضی را تغییر بده و نتیجه را فوراً ببین.</p><label>شوک یکسان به سبد<input type="range" min="-50" max="0" step="1" value={stressMove} onChange={(event) => setStressMove(event.target.value)}/><span className="negative">{Number(stressMove).toLocaleString("fa-IR")}٪</span></label><div className="scenario-presets" aria-label="سناریوهای فشار سریع">{[-10, -20, -30, -40].map((move) => <button type="button" className={stressMove === String(move) ? "active" : ""} key={move} onClick={() => setStressMove(String(move))}>{move.toLocaleString("fa-IR")}٪</button>)}</div><div className="scenario-result"><small>ارزش پس از شوک نمایشی</small><strong>{stressScenarioValue === null ? "—" : formatPortfolioMoney(stressScenarioValue)}</strong><p>{stressScenarioValue === null || portfolioMarketValue === null ? "سبد نمایشی را فعال کن." : `افت فرضی: ${formatPortfolioMoney(stressScenarioValue - portfolioMarketValue)}`}</p></div></section></div> : <section className="panel"><EmptyLock title="ابزارهای ریسک آمادهٔ تجربه‌اند" text="با فعال‌کردن سبد نمایشی، وزن دارایی‌ها، تمرکز، بازده نمونه و سناریوی فشار قابل استفاده می‌شوند؛ حالت واقعی همچنان قفل می‌ماند."/></section>}
            {portfolioMode === "demo" && <section className="guardrail"><span>i</span><div><b>این ارزیابی ریسک واقعی نیست</b><p>ارزش‌ها، برچسب نقدشوندگی و شوک‌ها برای آزمون رابط ساخته شده‌اند و روش تخصیص یا پیشنهاد سرمایه‌گذاری محسوب نمی‌شوند.</p></div></section>}
          </section>}

          {view === "data" && <section className="view-stack"><div className="view-hero"><SectionTitle eyebrow="DATA TRUST" title="کیفیت، تازگی و منشأ داده" text="این صفحه دلیل قابل استفاده بودن یا نبودن هر عدد را به زبان ساده نشان می‌دهد."/><span className="status-chip safe">حالت fail-closed فعال</span></div><section className="data-cards"><article><small>منابع در دسترس</small><strong>{connectedSourceCount.toLocaleString("fa-IR")}</strong><p>API، خوراک موقت و Snapshot دستی تفکیک می‌شوند.</p></article><article><small>رکوردهای تازه</small><strong>{liveQuoteCount.toLocaleString("fa-IR")}</strong><p>فقط رکورد عبورکرده از اعتبارسنجی نمایش داده می‌شود.</p></article><article><small>رکورد قرنطینه</small><strong>۰</strong><p>خطا جایگزین عدد قبلی یا عدد ساختگی نمی‌شود.</p></article><article><small>نرخ تبدیل دلار</small><strong className="rate-card-value">{isUsableUsdIrrRate(marketUsdIrrRate) ? `۱ USD = ${formatIrr(marketUsdIrrRate)}` : "نامشخص"}</strong><p>{isUsableUsdIrrRate(marketUsdIrrRate) ? `وضعیت نرخ: ${usdIrrQuote?.status === "valid" ? "تازه" : "منقضی"}` : "معادل دلاری بدون نرخ معتبر ساخته نمی‌شود."}</p></article><article><small>آخرین دریافت</small><strong>{feed ? formatFreshness(feed.collectedAt) : "نامشخص"}</strong><p>زمان دریافت مستقل از زمان انتشار ثبت می‌شود.</p></article></section><section className="panel audit-timeline"><h3>زنجیرهٔ اعتماد هر قیمت</h3>{["شناسه ابزار و واحد", "شناسه و قرارداد منبع", "زمان انتشار به UTC", "زمان دریافت به UTC", "اعتبارسنجی قطعی", "نسخهٔ تبدیل و اثر انگشت رکورد"].map((item, index) => <div key={item}><span>{(index + 1).toLocaleString("fa-IR")}</span><p>{item}</p><b>{index < 5 && liveQuoteCount ? "ثبت شده" : index < 2 ? "تعریف شده" : "در انتظار داده"}</b></div>)}</section></section>}

          {view === "agents" && <section className="view-stack"><div className="view-hero"><SectionTitle eyebrow="REVIEW BOARD" title="هیئت بررسی چندتخصصی" text="ایجنت‌ها می‌توانند کد و طراحی را بررسی کنند؛ به حساب مالی، معامله یا کلیدهای خصوصی دسترسی ندارند."/><span className="status-chip safe">فقط بررسی</span></div><section className="agent-grid"><article><span>⌘</span><h3>امنیت</h3><p>رازها، دسترسی، زنجیره تأمین و مرز دادهٔ شخصی.</p><b>Plugin نصب شده</b></article><article><span>▦</span><h3>داده و مالی</h3><p>منشأ، point-in-time، صحت محاسبات و سوگیری آزمون.</p><b>Plugin نصب شده</b></article><article><span>◫</span><h3>محصول و UI</h3><p>RTL، دسترس‌پذیری و فهم‌پذیری برای مالک پروژه.</p><b>Plugin نصب شده</b></article><article><span>✓</span><h3>تست و بازبینی</h3><p>رفتار قطعی، رگرسیون و کنترل کیفیت انتشار.</p><b>Plugin نصب شده</b></article></section><section className="guardrail"><span>i</span><div><b>نصب به معنی اجرای دائمی نیست</b><p>در هر Task، Codex تخصص مرتبط را بر اساس درخواست فراخوانی می‌کند. خروجی مالی همچنان باید از موتور قطعی و آزموده‌شده بیاید.</p></div></section></section>}
        </div>
        <footer><span>دیدبان زر و سیم · محیط خصوصی توسعه</span><span>بدون قیمت ساختگی · بدون معاملهٔ خودکار · <b>حالت امن</b></span></footer>
      </main>

      {notificationOpen && <div className="notification-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setNotificationOpen(false); }}>
        <aside className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title">
          <div className="notification-head"><div><span>MARKET ALERTS</span><h2 id="notification-title">مرکز نوتیفیکیشن</h2><p>هشدارها هنگام دریافت یا بروزرسانی قیمت‌ها بررسی می‌شوند.</p></div><button onClick={() => setNotificationOpen(false)} aria-label="بستن اعلان‌ها">×</button></div>
          <div className="notification-toolbar"><div className="notification-filters">{(["all", "volatility", "opportunity", "data"] as NotificationFilter[]).map((filter) => <button key={filter} className={notificationFilter === filter ? "active" : ""} onClick={() => setNotificationFilter(filter)}>{filter === "all" ? "همه" : notificationKindLabel(filter)}</button>)}</div>{unreadNotificationCount > 0 && <button className="text-button" onClick={markAllNotificationsRead}>خواندن همه</button>}</div>
          <div className="notification-list">{visibleNotifications.length > 0 ? visibleNotifications.map((notification) => <button className={`notification-item ${notification.read ? "read" : "unread"}`} key={notification.id} onClick={() => markNotificationRead(notification.id)}><span className={`notification-symbol ${notification.kind}`}>{notification.kind === "volatility" ? "!" : notification.kind === "opportunity" ? "◇" : "i"}</span><span><span className="notification-meta"><b>{notificationKindLabel(notification.kind)}</b>{notification.demo && <em>نمایشی</em>}<time>{formatNotificationTime(notification.createdAt)}</time></span><strong>{notification.title}</strong><small>{notification.message}</small></span></button>) : <div className="notification-empty"><span>◇</span><strong>{notificationFilter === "opportunity" ? "فرصت تأییدشده‌ای وجود ندارد" : "اعلانی در این بخش نیست"}</strong><p>{notificationFilter === "opportunity" ? "اعلان فرصت واقعی فقط پس از تعریف روش، دادهٔ تاریخی، بک‌تست و walk-forward فعال می‌شود." : "با بروزرسانی قیمت یا فعال‌کردن سبد نمایشی، اعلان‌های مرتبط اینجا ظاهر می‌شوند."}</p></div>}</div>
          <div className="notification-policy"><b>مرز ایمنی اعلان فرصت</b><p>افت قیمت به‌تنهایی «فرصت جذاب» نیست. سیستم واقعی تا قبل از مدل تأییدشده فقط نوسان شدید و مشکل کیفیت داده را هشدار می‌دهد.</p></div>
        </aside>
      </div>}

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setModalOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
          <div className="modal-head"><div><span>MY PORTFOLIO</span><h2 id="asset-dialog-title">ثبت دارایی من</h2></div><button onClick={() => setModalOpen(false)} aria-label="بستن">×</button></div>
          <p className="modal-note">این اطلاعات فقط در نشست فعلی مرورگر ذخیره می‌شود و به هیچ سرویس بیرونی ارسال نمی‌شود.</p>
          <form onSubmit={addHolding}>
            <label>نوع دارایی<select name="name" required value={selectedAssetName} onChange={(event) => setSelectedAssetName(event.target.value)}><option value="" disabled>انتخاب کنید</option>{assetOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="form-row">
              <label>مقدار<input name="amount" type="number" min="0.000001" step="any" required placeholder="مثلاً ۲.۵"/></label>
              <label>واحد<select key={selectedAssetName} name="unit" required disabled={!selectedAssetName} defaultValue={availableUnits[0] ?? ""}>{availableUnits.length === 0 && <option value="">ابتدا دارایی را انتخاب کنید</option>}{availableUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>بهای خرید کل (تومان)<input name="cost" type="number" min="0" step="1000" placeholder="اختیاری"/></label>
              <label>تاریخ خرید (شمسی)<input name="purchaseDate" inputMode="numeric" dir="ltr" required placeholder={`مثلاً ${toPersianDigits(currentJalaliDate())}`} aria-describedby="purchase-date-help"/><small id="purchase-date-help" className="field-help">با قالب ۱۴۰۵/۰۶/۰۳ وارد کنید.</small></label>
            </div>
            <label>یادداشت<input name="note" maxLength={80} placeholder="مثلاً نگهداری بلندمدت"/></label>
            <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setModalOpen(false)}>انصراف</button><button className="primary-button" type="submit">ثبت در نشست فعلی</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}

function MarketTable({ rows, quotes, usdIrrRate }: { rows: Instrument[]; quotes: Map<string, LiveQuote>; usdIrrRate: number | null }) {
  return <div className="market-table"><div className="market-row market-head"><span>نماد</span><span>بازار</span><span>آخرین قیمت (ریال · دلار)</span><span>تازگی</span><span>منشأ</span></div>{rows.map((row) => {
    const quote = quotes.get(row.code);
    return <div className="market-row" key={row.code}><span className="instrument"><i className={row.tone}>{row.icon}</i><span><strong>{row.name}</strong><small>{row.code}</small></span></span><span>{row.market}</span>{quote ? <strong className="live-value">{formatQuote(quote, usdIrrRate)}</strong> : <strong className="no-data">—</strong>}{quote ? <span className={quote.status === "valid" ? "fresh" : "pending"}>{formatFreshness(quote.publishedAt ?? quote.collectedAt)}</span> : <span className="pending">در انتظار</span>}{quote ? <a className="source-link" href={quote.sourceUrl} target="_blank" rel="noreferrer"><span>{quote.sourceName}</span><small>{sourceQualityLabel(quote.quality)}</small></a> : <span className="source-none">تعریف نشده</span>}</div>;
  })}</div>;
}

function formatQuote(quote: LiveQuote, usdIrrRate: number | null) {
  if (quote.currency === "USD") return `${formatUsd(quote.value)} · ${isUsableUsdIrrRate(usdIrrRate) ? formatIrr(quote.value * usdIrrRate) : "معادل ریالی نامشخص"}`;
  return formatTomanInIrrAndUsd(quote.value, usdIrrRate);
}

function formatFreshness(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "کمتر از یک دقیقه";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  return `${hours.toLocaleString("fa-IR")} ساعت پیش`;
}

function sourceLabel(status: string) {
  const labels: Record<string, string> = { connected: "متصل", fallback: "موقت", snapshot: "Snapshot دستی", needs_key: "نیازمند کلید", needs_unit: "نیازمند تعیین واحد", unavailable: "در دسترس نیست" };
  return labels[status] ?? status;
}

function sourceQualityLabel(quality: LiveQuote["quality"]) {
  if (quality === "primary") return "خوراک اصلی";
  if (quality === "manual_snapshot") return "Snapshot دستی";
  return "اطلاع‌رسانی";
}

const holdingValuationRules: Record<string, { instrumentCode: string; unit: string }> = {
  "طلای ۱۸ عیار": { instrumentCode: "GOLD_18K_IRR", unit: "گرم" },
  "طلای ۲۴ عیار": { instrumentCode: "GOLD_24K_IRR", unit: "گرم" },
  "مثقال طلا": { instrumentCode: "MESGHAL_IRR", unit: "مثقال" },
  "سکه امامی": { instrumentCode: "EMAMI_COIN_IRR", unit: "عدد" },
  "سکه بهار آزادی": { instrumentCode: "AZADI_COIN_IRR", unit: "عدد" },
  "نیم سکه": { instrumentCode: "HALF_COIN_IRR", unit: "عدد" },
  "ربع سکه": { instrumentCode: "QUARTER_COIN_IRR", unit: "عدد" },
  "سکه یک گرمی": { instrumentCode: "GRAM_COIN_IRR", unit: "عدد" },
  "شمش نقره ۹۹۹": { instrumentCode: "SILVER_999_IRR", unit: "گرم" },
};

function calculateHoldingValue(holding: Holding, quotes: Map<string, LiveQuote>) {
  const rule = holdingValuationRules[holding.name];
  if (!rule || holding.unit !== rule.unit) return null;
  const quote = quotes.get(rule.instrumentCode);
  if (!quote || quote.currency !== "TOMAN" || quote.status !== "valid") return null;
  const value = holding.amount * quote.value;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizePublicXaus(payload: PublicXausPayload): LiveQuote[] {
  const gold = Number(payload.spot_usd_oz);
  const silver = Number(payload.silver_usd_oz);
  if (!Number.isFinite(gold) || gold < 300 || gold > 10_000) return [];
  if (!Number.isFinite(silver) || silver < 2 || silver > 1_000) return [];
  const publishedValue = payload.data_state?.as_of ?? payload.price_as_of ?? payload.updated_at;
  const publishedAt = new Date(String(publishedValue));
  const collectedAt = new Date();
  if (!Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() > collectedAt.getTime() + 5 * 60_000) return [];
  const stale = payload.stale === true || payload.data_state?.status === "stale" || collectedAt.getTime() - publishedAt.getTime() > 60 * 60_000;
  const makeQuote = (instrumentCode: "XAU_USD" | "XAG_USD", value: number): LiveQuote => ({
    instrumentCode, value, currency: "USD", unit: "troy_ounce",
    publishedAt: publishedAt.toISOString(), collectedAt: collectedAt.toISOString(),
    sourceId: "xaus", sourceName: "XAUS", sourceUrl: "https://xaus.com/api/",
    quality: "informational", status: stale ? "stale" : "valid",
  });
  return [makeQuote("XAU_USD", gold), makeQuote("XAG_USD", silver)];
}
