"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculatePortfolioScenario,
  calculatePremiumPercent,
  emptyScenarioShocks,
  scenarioDrivers,
  scenarioMethodology,
  scenarioPresets,
  type ScenarioDriver,
  type ScenarioShocks,
} from "./scenario-engine";
import {
  decisionFramework,
  emptyOwnerDecisionConstraints,
  evaluateDecisionGates,
  evaluateOwnerDecisionConstraints,
  getAssetClass,
  getSameClassCandidates,
  ownerConstraintFields,
  type DecisionMode,
  type OwnerDecisionConstraints,
} from "./decision-support";
import { navItems, type View } from "./workspace-navigation";
import { formatToman, formatTomanAndUsd, formatUsd, isUsableUsdTomanRate } from "./currency-display";
import { OperatorCsvImport } from "./operator-csv-import";
import { assetCategories, assetOptions, getAssetCategoryForAsset, getAssetOptionsForCategory } from "./asset-catalog";
import { currentJalaliDate, currentJalaliParts, formatJalaliDate, toPersianDigits } from "./jalali-calendar";
import { PersianDatePicker } from "./persian-date-picker";
import {
  buildSandboxQuotes,
  buildSandboxPremiumMetrics,
  calculateSandboxDecision,
  sandboxMethodology,
  sandboxPremiumMethodology,
  sandboxReadinessGates,
} from "./simulation-engine";
import {
  buildSandboxAnalysisLens,
  calculateSandboxIntelligence,
  sandboxIntelligenceMethodology,
} from "./sandbox-intelligence-engine";

type Holding = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  costToman: number | null;
  purchaseDate: string | null;
  note: string;
};

type PortfolioSnapshot = {
  version: number;
  holdings: Holding[];
  preferences: OwnerDecisionConstraints & {
    analysisHorizon: "short" | "long";
    decisionHorizon: "short" | "long";
  };
};

type PortfolioPersistenceState =
  | { state: "checking" }
  | { state: "unavailable"; message: string }
  | { state: "ready"; snapshot: PortfolioSnapshot; message: string }
  | { state: "saving"; snapshot: PortfolioSnapshot; message: string }
  | { state: "error"; snapshot: PortfolioSnapshot; message: string };

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
type SortDirection = "asc" | "desc";
type HoldingSortKey = "name" | "amount" | "cost" | "current" | "profit";
type MarketSortKey = "instrument" | "market" | "price" | "freshness" | "source";
type BubbleSortKey = "name" | "current" | "minimum" | "average" | "maximum";
type AnalysisHorizon = "short" | "long";
type AnalysisCategory = "summary" | "geopolitical" | "political" | "economic" | "industry" | "technical" | "bubble" | "portfolio";

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
const portfolioPreferenceKey = "asha-portfolio-preference-v1";

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

function createDemoNotifications(createdAt: string): MarketNotification[] {
  return [
    { id: "demo-volatility-silver", kind: "volatility", title: "نوسان شدید نقره · نمایشی", message: "افت ساختگی ۷٫۲٪ در سه ساعت؛ این اعلان فقط برای آزمون تجربهٔ کاربری است.", createdAt, read: false, demo: true },
    { id: "demo-opportunity-gold", kind: "opportunity", title: "فرصت جذاب قابل بررسی · نمایشی", message: "طلای ۱۸ عیار در سناریوی ساختگی وارد محدودهٔ بررسی شده است؛ این اعلان سیگنال خرید نیست.", createdAt, read: false, demo: true },
  ];
}

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

const analysisCategories: Array<{ id: AnalysisCategory; label: string; short: string; long: string; evidence: string }> = [
  { id: "summary", label: "خلاصهٔ جامع", short: "جمع‌بندی وضعیت داده، بازار و سبد برای افق روزانه تا یک‌ماهه.", long: "جمع‌بندی ساختاری برای افق فصلی تا چندساله، بدون تبدیل فرضیه به پیش‌بینی.", evidence: "تمام خروجی‌های قابل اتکا" },
  { id: "geopolitical", label: "ژئوپلیتیک", short: "رویداد، مسیر انتقال شوک و اثر محتمل بر ارز، فلز و نقدشوندگی.", long: "تغییرات ساختاری در تحریم، تجارت، دسترسی به ارز و زنجیرهٔ تأمین.", evidence: "نیازمند خوراک رویداد زمان‌مند و طبقه‌بندی‌شده" },
  { id: "political", label: "سیاسی و سیاست‌گذاری", short: "تصمیم‌های پولی، ارزی، معاملاتی و مقرراتی با زمان اثر مشخص.", long: "پایداری سیاست، تغییر رژیم مقررات و پیامدهای سناریویی برای بازار ایران.", evidence: "نیازمند منبع رسمی، تاریخ اثر و نسخهٔ مصوبه" },
  { id: "economic", label: "اقتصادی و کلان", short: "تورم، نقدینگی، نرخ ارز، نرخ بهره و انتظارات در افق کوتاه.", long: "روندهای حقیقی/اسمی، چرخهٔ کلان و قدرت خرید در افق بلند.", evidence: "نیازمند سری زمانی point-in-time اقتصاد ایران" },
  { id: "industry", label: "صنعت و عرضه/تقاضا", short: "موجودی، عرضهٔ فیزیکی، اسپرد و اختلال بازار هر ابزار.", long: "ظرفیت، هزینهٔ تولید، جانشینی و تغییر ساختار تقاضای طلا و نقره.", evidence: "نیازمند دادهٔ صنعت، موجودی و نقدشوندگی" },
  { id: "technical", label: "تکنیکال و رفتار قیمت", short: "روند، مومنتوم، دامنه، نوسان و سطوح فقط بر تاریخچهٔ معتبر.", long: "رژیم‌های روند/بازگشت و شکست‌های تاریخی با آزمون خارج از نمونه.", evidence: "نیازمند OHLCV تاریخی، بک‌تست و walk-forward" },
  { id: "bubble", label: "ارزش‌گذاری و حباب", short: "حباب جاری و رتبهٔ آن نسبت به توزیع تاریخی همان ابزار.", long: "حداقل، میانگین، میانه، حداکثر، دوام و پیامدهای تاریخی شرایط مشابه.", evidence: "نیازمند قیمت مرجع، فرمول مصوب و تاریخچهٔ ایران" },
  { id: "portfolio", label: "سبد، ریسک و نقدشوندگی", short: "تمرکز، پوشش قیمت، نقدشوندگی و اثر سناریو بر هر موقعیت.", long: "محدودیت‌ها، هزینهٔ تبدیل، ریسک تجمعی و تاب‌آوری سبد در رژیم‌های مختلف.", evidence: "نیازمند ارزش روز کامل، محدودیت مالک و مدل‌های اعتبارسنجی‌شده" },
];

const bubbleSpecifications: Record<string, { instrumentCode: string; referenceCode: "XAU_USD" | "XAG_USD"; pureGrams: number }> = {
  "طلای ۱۸ عیار": { instrumentCode: "GOLD_18K_IRR", referenceCode: "XAU_USD", pureGrams: 0.75 },
  "طلای ۲۴ عیار": { instrumentCode: "GOLD_24K_IRR", referenceCode: "XAU_USD", pureGrams: 1 },
  "شمش نقره ۹۹۹": { instrumentCode: "SILVER_999_IRR", referenceCode: "XAG_USD", pureGrams: 0.999 },
};

const demoUsdTomanRate = 160_000;

function toEnglishDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = "۰۱۲۳۴۵۶۷۸۹".indexOf(digit);
    return String(persianIndex >= 0 ? persianIndex : "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
  });
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

function purchaseDateForPicker(value: string | null | undefined) {
  if (!value || !isValidPurchaseDate(value)) return "";
  const jalali = normalizeJalaliDate(value);
  if (jalali) return jalali;
  return formatJalaliDate(currentJalaliParts(new Date(`${value}T12:00:00.000Z`)));
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

function AshaLogo() {
  return (
    <svg className="asha-logo" viewBox="0 0 48 48" role="img" aria-label="نشان اشا">
      <defs>
        <linearGradient id="asha-mark-gradient" x1="9" y1="8" x2="39" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7F2FF" />
          <stop offset="1" stopColor="#D9C5F3" />
        </linearGradient>
      </defs>
      <path className="asha-logo-orbit" d="M10.5 29.5C6.5 20.5 12.2 10.4 21.9 8.6C31.7 6.7 40.6 13.7 40.7 23.6C40.8 33.4 31.9 40.5 22.2 38.8" />
      <path className="asha-logo-core" d="M14.5 34.8L23.8 12.7L33.4 34.8M18.3 26.6H29.9" />
      <path className="asha-logo-spark" d="M36.8 7.4V13.2M33.9 10.3H39.7" />
      <circle className="asha-logo-dot" cx="12.2" cy="34.7" r="2.4" />
    </svg>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return <div className="section-title"><span>{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>;
}

function EmptyLock({ title, text }: { title: string; text: string }) {
  return <div className="empty-lock"><strong>{title}</strong><p>{text}</p></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [portfolioMode, setPortfolioMode] = useState<"personal" | "demo">("personal");
  const [holdingsLoaded, setHoldingsLoaded] = useState(false);
  const [portfolioPersistence, setPortfolioPersistence] = useState<PortfolioPersistenceState>({ state: "checking" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [pendingDeleteHoldingId, setPendingDeleteHoldingId] = useState<string | null>(null);
  const [selectedAssetCategory, setSelectedAssetCategory] = useState("");
  const [selectedAssetName, setSelectedAssetName] = useState("");
  const [analysisCategory, setAnalysisCategory] = useState<AnalysisCategory>("summary");
  const [analysisHorizon, setAnalysisHorizon] = useState<AnalysisHorizon>("short");
  const [decisionHorizon, setDecisionHorizon] = useState<AnalysisHorizon>("short");
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("homogeneous");
  const [ownerConstraints, setOwnerConstraints] = useState<OwnerDecisionConstraints>({ ...emptyOwnerDecisionConstraints });
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null);
  const [scenarioShocks, setScenarioShocks] = useState<ScenarioShocks>({ ...emptyScenarioShocks });
  const [activeScenarioPreset, setActiveScenarioPreset] = useState("neutral");
  const [holdingSort, setHoldingSort] = useState<{ key: HoldingSortKey; direction: SortDirection }>({ key: "current", direction: "desc" });
  const [stressMove, setStressMove] = useState("-18");
  const [sandboxCollectedAt, setSandboxCollectedAt] = useState(() => new Date().toISOString());
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [expandedHomeCategoryId, setExpandedHomeCategoryId] = useState<string | null>(null);
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
      let restoredHoldings: Holding[] = [];
      if (saved) {
        try {
          const restored = JSON.parse(saved) as Array<Holding & { purchaseDate?: string | null }>;
          restoredHoldings = restored.map((holding) => ({ ...holding, purchaseDate: holding.purchaseDate ?? demoHoldings.find((demo) => demo.id === holding.id)?.purchaseDate ?? null }));
          setHoldings(restoredHoldings);
        } catch { sessionStorage.removeItem("gold-silver-holdings"); }
      }
      const savedPortfolioMode = sessionStorage.getItem("gold-silver-portfolio-mode");
      const savedPreference = sessionStorage.getItem(portfolioPreferenceKey);
      const shouldStartInDemo = savedPreference !== "personal";
      if (shouldStartInDemo) {
        if (savedPreference === null && savedPortfolioMode === "personal" && restoredHoldings.length > 0) {
          sessionStorage.setItem("asha-personal-holdings-backup-v1", JSON.stringify(restoredHoldings));
        }
        setPortfolioMode("demo");
        const demoIsCurrent = savedPortfolioMode === "demo" && sessionStorage.getItem("gold-silver-demo-version") === demoPortfolioVersion && restoredHoldings.length > 0;
        if (!demoIsCurrent) setHoldings(demoHoldings.map((holding) => ({ ...holding })));
        setSelectedHoldingId((demoIsCurrent ? restoredHoldings : demoHoldings)[0]?.id ?? null);
        const startedAt = new Date().toISOString();
        setSandboxCollectedAt(startedAt);
        if (!sessionStorage.getItem("gold-silver-notifications")) setNotifications(createDemoNotifications(startedAt));
      }
      const savedNotifications = sessionStorage.getItem("gold-silver-notifications");
      if (savedNotifications) {
        try { setNotifications(JSON.parse(savedNotifications) as MarketNotification[]); } catch { sessionStorage.removeItem("gold-silver-notifications"); }
      }
      const savedConstraints = sessionStorage.getItem("asha-owner-decision-constraints-v1");
      if (savedConstraints) {
        try {
          const restored = JSON.parse(savedConstraints) as Partial<Record<keyof OwnerDecisionConstraints, unknown>>;
          setOwnerConstraints(Object.fromEntries(ownerConstraintFields.map((field) => [field.key, String(restored[field.key] ?? "")])) as OwnerDecisionConstraints);
        } catch { sessionStorage.removeItem("asha-owner-decision-constraints-v1"); }
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
    if (!holdingsLoaded || portfolioMode !== "personal") return;
    let active = true;
    void fetch("/api/portfolio", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; snapshot?: PortfolioSnapshot };
        if (!active) return;
        if (!response.ok || !payload.ok || !payload.snapshot) {
          setPortfolioPersistence({ state: "unavailable", message: "ذخیره‌سازی دیتابیس روی این اجرا فعال نیست." });
          return;
        }
        setPortfolioPersistence({ state: "ready", snapshot: payload.snapshot, message: payload.snapshot.holdings.length ? "یک نسخهٔ ذخیره‌شده در دیتابیس پیدا شد." : "دیتابیس آماده است و هنوز سبدی در آن ذخیره نشده." });
      })
      .catch(() => {
        if (active) setPortfolioPersistence({ state: "unavailable", message: "ارتباط با دیتابیس برقرار نشد؛ داده‌های مرورگر دست‌نخورده ماند." });
      });
    return () => { active = false; };
  }, [holdingsLoaded, portfolioMode]);

  useEffect(() => {
    if (!holdingsLoaded) return;
    sessionStorage.setItem("gold-silver-notifications", JSON.stringify(notifications));
  }, [holdingsLoaded, notifications]);

  useEffect(() => {
    if (!holdingsLoaded) return;
    sessionStorage.setItem("asha-owner-decision-constraints-v1", JSON.stringify(ownerConstraints));
  }, [holdingsLoaded, ownerConstraints]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshMarket(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshMarket]);

  useEffect(() => {
    if (!feed) return;
    const incoming: MarketNotification[] = [];
    const nextBaseline = new Map(previousQuotesRef.current);
    const usdTomanQuote = feed.quotes.find((quote) => quote.instrumentCode === "USD_IRR" && quote.currency === "TOMAN");
    const alertUsdTomanRate = usdTomanQuote && usdTomanQuote.value > 0 ? usdTomanQuote.value : null;

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
            message: `${changePercent > 0 ? "رشد" : "افت"} ${Math.abs(changePercent).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪ در ${windowText}؛ از ${formatQuote(previous, alertUsdTomanRate)} به ${formatQuote(quote, alertUsdTomanRate)}.`,
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
  const quoteMap = useMemo(() => new Map((feed?.quotes ?? []).map((quote) => [quote.instrumentCode, quote])), [feed]);
  const sandboxQuotes = useMemo(() => buildSandboxQuotes(sandboxCollectedAt), [sandboxCollectedAt]);
  const sandboxQuoteMap = useMemo(() => new Map<string, LiveQuote>(sandboxQuotes.map((quote) => [quote.instrumentCode, quote])), [sandboxQuotes]);
  const analysisQuoteMap = portfolioMode === "demo" ? sandboxQuoteMap : quoteMap;
  const usdTomanQuote = quoteMap.get("USD_IRR");
  const marketUsdTomanRate = usdTomanQuote?.currency === "TOMAN" && usdTomanQuote.status === "valid" && usdTomanQuote.value > 0 ? usdTomanQuote.value : null;
  const portfolioUsdTomanRate = portfolioMode === "demo" ? demoUsdTomanRate : marketUsdTomanRate;
  const marketRateStatus = !isUsableUsdTomanRate(marketUsdTomanRate) ? "نرخ دلار ناموجود" : `۱ دلار = ${formatToman(marketUsdTomanRate)} (${usdTomanQuote?.status === "valid" ? "تازه" : "منقضی"})`;
  const portfolioRateStatus = portfolioMode === "demo" ? `۱ دلار = ${formatToman(demoUsdTomanRate)} (نرخ ساختگی سبد نمایشی)` : marketRateStatus;
  const formatPortfolioMoney = (valueToman: number) => formatTomanAndUsd(valueToman, portfolioUsdTomanRate);
  const formatScenarioMoney = (valueToman: number) => formatTomanAndUsd(valueToman, portfolioUsdTomanRate);
  const holdingValues = useMemo(() => new Map(holdings.map((holding) => [holding.id, portfolioMode === "demo" ? (demoCurrentValuesToman[holding.id] ?? null) : calculateHoldingValue(holding, quoteMap)])), [holdings, portfolioMode, quoteMap]);
  const sortedHoldings = useMemo(() => [...holdings].sort((left, right) => {
    const leftCurrent = holdingValues.get(left.id) ?? null;
    const rightCurrent = holdingValues.get(right.id) ?? null;
    const leftProfit = leftCurrent !== null && left.costToman !== null ? leftCurrent - left.costToman : null;
    const rightProfit = rightCurrent !== null && right.costToman !== null ? rightCurrent - right.costToman : null;
    const values: Record<HoldingSortKey, [string | number | null, string | number | null]> = {
      name: [left.name, right.name], amount: [left.amount, right.amount], cost: [left.costToman, right.costToman], current: [leftCurrent, rightCurrent], profit: [leftProfit, rightProfit],
    };
    const [a, b] = values[holdingSort.key];
    if (a === null) return 1;
    if (b === null) return -1;
    const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b, "fa") : Number(a) - Number(b);
    return holdingSort.direction === "desc" ? -result : result;
  }), [holdingSort, holdingValues, holdings]);
  const scenarioPortfolio = useMemo(() => calculatePortfolioScenario(holdings.map((holding) => ({ id: holding.id, name: holding.name, valueToman: holdingValues.get(holding.id) ?? null })), scenarioShocks), [holdingValues, holdings, scenarioShocks]);
  const scenarioRowsByImpact = useMemo(() => [...scenarioPortfolio.rows].sort((a, b) => Math.abs(b.impactToman) - Math.abs(a.impactToman)), [scenarioPortfolio.rows]);
  const bubbleRows = useMemo(() => holdings.map((holding) => {
    const calculatedCurrent = calculateHoldingBubble(holding.name, analysisQuoteMap);
    const sandboxMetrics = buildSandboxPremiumMetrics(holding.name, calculatedCurrent);
    return portfolioMode === "demo"
      ? { holding, ...sandboxMetrics }
      : { holding, applicable: calculatedCurrent !== null, current: calculatedCurrent, minimum: null, average: null, maximum: null };
  }), [analysisQuoteMap, holdings, portfolioMode]);
  const bubbleAvailableCount = bubbleRows.filter((row) => row.current !== null).length;
  const valuedHoldingCount = Array.from(holdingValues.values()).filter((value) => value !== null).length;
  const portfolioMarketValue = holdings.length > 0 && valuedHoldingCount === holdings.length
    ? Array.from(holdingValues.values()).reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  const portfolioProfitLoss = portfolioMarketValue !== null && costCoverage === 100 ? portfolioMarketValue - knownCost : null;
  const portfolioProfitPercent = portfolioProfitLoss !== null && knownCost > 0 ? (portfolioProfitLoss / knownCost) * 100 : null;
  const allocationRows = holdings.map((holding) => ({ holding, value: holdingValues.get(holding.id) ?? null }));
  const largestAllocation = portfolioMarketValue === null ? null : allocationRows.reduce<{ holding: Holding; value: number } | null>((largest, row) => row.value === null || (largest && largest.value >= row.value) ? largest : { holding: row.holding, value: row.value }, null);
  const largestAllocationPercent = largestAllocation && portfolioMarketValue ? Math.round((largestAllocation.value / portfolioMarketValue) * 100) : null;
  const stressScenarioValue = portfolioMarketValue === null ? null : portfolioMarketValue * (1 + Number(stressMove) / 100);
  const liveQuoteCount = feed?.quotes.filter((quote) => quote.status === "valid").length ?? 0;
  const staleQuoteCount = feed?.quotes.filter((quote) => quote.status === "stale").length ?? 0;
  const displayQuoteCount = feed?.quotes.length ?? 0;
  const freshIranQuoteCount = feed?.quotes.filter((quote) => quote.status === "valid" && instruments.find((instrument) => instrument.code === quote.instrumentCode)?.market === "بازار ایران").length ?? 0;
  const navasanConnected = feed?.sources.some((source) => source.id === "navasan" && source.status === "connected") ?? false;
  const connectedSourceCount = feed?.sources.filter((source) => source.status === "connected" || source.status === "fallback" || source.status === "snapshot").length ?? 0;
  const effectiveLiveQuoteCount = portfolioMode === "demo" ? sandboxQuotes.length : liveQuoteCount;
  const effectiveDisplayQuoteCount = portfolioMode === "demo" ? sandboxQuotes.length : displayQuoteCount;
  const effectiveFreshIranQuoteCount = portfolioMode === "demo" ? sandboxQuotes.filter((quote) => instruments.find((instrument) => instrument.code === quote.instrumentCode)?.market === "بازار ایران").length : freshIranQuoteCount;
  const pricingReady = portfolioMode === "demo" || liveQuoteCount > 0;
  const readinessScore = 1 + (holdings.length ? 1 : 0) + (pricingReady ? 1 : 0);
  const filteredAssetOptions = getAssetOptionsForCategory(selectedAssetCategory);
  const availableUnits = selectedAssetName ? (assetUnitOptions[selectedAssetName] ?? ["واحد"]) : [];
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  const visibleNotifications = notificationFilter === "all" ? notifications : notifications.filter((notification) => notification.kind === notificationFilter);
  const excitingOpportunities = notifications.filter((notification) => notification.kind === "opportunity").slice(0, 3);
  const selectedAnalysis = analysisCategories.find((category) => category.id === analysisCategory) ?? analysisCategories[0];
  const selectedAnalysisContent = selectedAnalysis;
  const decisionAssets = holdings.map((holding) => ({ id: holding.id, name: holding.name, priced: holdingValues.get(holding.id) !== null, bubble: bubbleRows.find((row) => row.holding.id === holding.id)?.current ?? null }));
  const selectedHolding = holdings.find((holding) => holding.id === selectedHoldingId) ?? holdings[0] ?? null;
  const editingHolding = editingHoldingId ? holdings.find((holding) => holding.id === editingHoldingId) ?? null : null;
  const pendingDeleteHolding = pendingDeleteHoldingId ? holdings.find((holding) => holding.id === pendingDeleteHoldingId) ?? null : null;
  const selectedHoldingValue = selectedHolding ? (holdingValues.get(selectedHolding.id) ?? null) : null;
  const selectedHoldingProfit = selectedHolding && selectedHoldingValue !== null && selectedHolding.costToman !== null ? selectedHoldingValue - selectedHolding.costToman : null;
  const selectedHoldingProfitPercent = selectedHoldingProfit !== null && selectedHolding?.costToman && selectedHolding.costToman > 0 ? (selectedHoldingProfit / selectedHolding.costToman) * 100 : null;
  const selectedHoldingPremium = selectedHolding ? (bubbleRows.find((row) => row.holding.id === selectedHolding.id) ?? null) : null;
  const selectedHoldingBubble = selectedHoldingPremium?.current ?? null;
  const homeAssetGroups = Array.from(holdings.reduce((groups, holding) => {
    const category = getAssetCategoryForAsset(holding.name);
    const existing = groups.get(category.id);
    if (existing) existing.holdings.push(holding);
    else groups.set(category.id, { id: category.id, label: category.label, holdings: [holding] });
    return groups;
  }, new Map<string, { id: string; label: string; holdings: Holding[] }>()).values()).map((group) => {
    const values = group.holdings.map((holding) => holdingValues.get(holding.id) ?? null);
    const fullyValued = values.every((value) => value !== null);
    return { ...group, value: fullyValued ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null };
  });
  const focusedDecisionAssets = selectedHolding
    ? [...decisionAssets.filter((asset) => asset.id === selectedHolding.id), ...decisionAssets.filter((asset) => asset.id !== selectedHolding.id)]
    : decisionAssets;
  const ownerConstraintReadiness = evaluateOwnerDecisionConstraints(ownerConstraints);
  const decisionReadiness = evaluateDecisionGates({
    hasPortfolio: holdings.length > 0,
    portfolioFullyValued: holdings.length > 0 && valuedHoldingCount === holdings.length,
    hasFreshIranData: freshIranQuoteCount > 0,
    ownerConstraintsDefined: ownerConstraintReadiness.complete,
    methodologyApproved: false,
    historicalValidationPassed: false,
  });
  const sandboxDecision = useMemo(() => calculateSandboxDecision(holdings.map((holding) => ({
    id: holding.id,
    name: holding.name,
    valueToman: holdingValues.get(holding.id) ?? null,
    costToman: holding.costToman,
  })), ownerConstraints, decisionHorizon), [decisionHorizon, holdingValues, holdings, ownerConstraints]);
  const buildIntelligenceInputs = useCallback((decision: typeof sandboxDecision) => decision.rows.map((row) => {
    const assetClass = getAssetClass(row.name);
    const premium = bubbleRows.find((bubble) => bubble.holding.id === row.id);
    return {
      id: row.id,
      name: row.name,
      assetClassId: assetClass.id,
      assetClassLabel: assetClass.label,
      valueToman: row.valueToman,
      costToman: row.costToman,
      allocationPercent: row.allocationPercent,
      returnPercent: row.returnPercent,
      riskScore: row.riskScore,
      riskLabel: row.riskLabel,
      premium: premium ? {
        applicable: premium.applicable,
        current: premium.current,
        minimum: premium.minimum,
        average: premium.average,
        maximum: premium.maximum,
      } : { applicable: false, current: null, minimum: null, average: null, maximum: null },
    };
  }), [bubbleRows]);
  const sandboxDecisionIntelligence = useMemo(() => calculateSandboxIntelligence(
    buildIntelligenceInputs(sandboxDecision),
    sandboxDecision.profile,
    decisionHorizon,
  ), [buildIntelligenceInputs, decisionHorizon, sandboxDecision]);
  const sandboxAnalysisIntelligence = useMemo(() => {
    const analysisDecision = calculateSandboxDecision(holdings.map((holding) => ({
      id: holding.id,
      name: holding.name,
      valueToman: holdingValues.get(holding.id) ?? null,
      costToman: holding.costToman,
    })), ownerConstraints, analysisHorizon);
    return calculateSandboxIntelligence(buildIntelligenceInputs(analysisDecision), analysisDecision.profile, analysisHorizon);
  }, [analysisHorizon, buildIntelligenceInputs, holdingValues, holdings, ownerConstraints]);
  const sandboxIntelligenceRows = useMemo(() => new Map(sandboxDecisionIntelligence.assets.map((row) => [row.id, row])), [sandboxDecisionIntelligence.assets]);
  const selectedSandboxIntelligence = selectedHolding ? (sandboxIntelligenceRows.get(selectedHolding.id) ?? null) : null;
  const selectedSandboxAnalysisLens = selectedHolding
    ? buildSandboxAnalysisLens(sandboxAnalysisIntelligence, selectedHolding.id, analysisCategory)
    : null;
  const sandboxOverallActionText = sandboxDecisionIntelligence.overallDecision.amountToman > 0
    ? `${sandboxDecisionIntelligence.overallDecision.label} · ${formatPortfolioMoney(sandboxDecisionIntelligence.overallDecision.amountToman)}`
    : sandboxDecisionIntelligence.overallDecision.label;
  const sandboxOverallActionReason = sandboxDecisionIntelligence.overallDecision.reason;

  function toggleHoldingSort(key: HoldingSortKey) {
    setHoldingSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  }

  function openAssetWorkspace(holdingId: string, destination: View) {
    setSelectedHoldingId(holdingId);
    setView(destination);
  }

  function applyScenarioPreset(id: string) {
    const preset = scenarioPresets.find((item) => item.id === id);
    if (!preset) return;
    setScenarioShocks({ ...preset.shocks });
    setActiveScenarioPreset(id);
  }

  function updateScenarioShock(driver: ScenarioDriver, value: number) {
    setScenarioShocks((current) => ({ ...current, [driver]: value }));
    setActiveScenarioPreset("custom");
  }

  function openNewHolding() {
    setEditingHoldingId(null);
    setSelectedAssetCategory("");
    setSelectedAssetName("");
    setModalOpen(true);
  }

  function openEditHolding(holding: Holding) {
    setEditingHoldingId(holding.id);
    setSelectedAssetCategory(getAssetCategoryForAsset(holding.name).id);
    setSelectedAssetName(holding.name);
    setModalOpen(true);
  }

  function closeHoldingModal() {
    setModalOpen(false);
    setEditingHoldingId(null);
    setSelectedAssetCategory("");
    setSelectedAssetName("");
  }

  function saveHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const rawCost = String(data.get("cost") ?? "").trim();
    const costToman = rawCost ? Number(rawCost) : null;
    const purchaseDateInput = String(data.get("purchaseDate") ?? "").trim();
    const purchaseDate = purchaseDateInput ? normalizeJalaliDate(purchaseDateInput) : null;
    const name = String(data.get("name"));
    const unit = String(data.get("unit"));
    const validUnits = assetUnitOptions[name] ?? ["واحد"];
    if (!assetOptions.includes(name) || !validUnits.includes(unit)) return;
    if (!Number.isFinite(amount) || amount <= 0 || (costToman !== null && (!Number.isFinite(costToman) || costToman < 0)) || (purchaseDateInput && !purchaseDate)) return;
    const holdingId = editingHoldingId ?? crypto.randomUUID();
    const nextHolding: Holding = {
      id: holdingId,
      name,
      amount,
      unit,
      costToman,
      purchaseDate,
      note: String(data.get("note") ?? "").trim(),
    };
    setHoldings((current) => editingHoldingId ? current.map((holding) => holding.id === editingHoldingId ? nextHolding : holding) : [...current, nextHolding]);
    setSelectedHoldingId(holdingId);
    event.currentTarget.reset();
    closeHoldingModal();
  }

  function confirmDeleteHolding() {
    if (!pendingDeleteHoldingId) return;
    setHoldings((current) => current.filter((holding) => holding.id !== pendingDeleteHoldingId));
    if (selectedHoldingId === pendingDeleteHoldingId) setSelectedHoldingId(null);
    setPendingDeleteHoldingId(null);
  }

  async function savePersonalPortfolioToDatabase() {
    if (portfolioMode !== "personal" || portfolioPersistence.state === "checking" || portfolioPersistence.state === "unavailable") return;
    const preferences = { ...ownerConstraints, analysisHorizon, decisionHorizon };
    const snapshot = portfolioPersistence.snapshot ?? { version: 0, holdings: [], preferences };
    setPortfolioPersistence({ state: "saving", snapshot, message: "در حال ذخیرهٔ نسخهٔ فعلی در دیتابیس…" });
    try {
      const response = await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Asha-Portfolio-Request": "save" },
        body: JSON.stringify({ expectedVersion: snapshot.version, holdings, preferences }),
      });
      const payload = await response.json() as { ok?: boolean; snapshot?: PortfolioSnapshot; code?: string };
      if (response.ok && payload.ok && payload.snapshot) {
        setPortfolioPersistence({ state: "ready", snapshot: payload.snapshot, message: "نسخهٔ فعلی سبد با موفقیت در دیتابیس ذخیره شد." });
        return;
      }
      setPortfolioPersistence({ state: "error", snapshot, message: payload.code === "version_conflict" ? "نسخهٔ دیتابیس در مرورگر دیگری تغییر کرده؛ ابتدا آن را بازیابی کن." : "ذخیره تأیید نشد؛ داده‌های مرورگر دست‌نخورده ماند." });
    } catch {
      setPortfolioPersistence({ state: "error", snapshot, message: "ارتباط هنگام ذخیره قطع شد؛ نتیجه نامشخص است و داده‌های مرورگر حذف نشد." });
    }
  }

  function restorePersonalPortfolioFromDatabase() {
    if (portfolioMode !== "personal" || portfolioPersistence.state === "checking" || portfolioPersistence.state === "unavailable" || !portfolioPersistence.snapshot) return;
    const restored = portfolioPersistence.snapshot.holdings.map((holding) => ({ ...holding }));
    setHoldings(restored);
    setOwnerConstraints({
      liquidityReservePercent: portfolioPersistence.snapshot.preferences.liquidityReservePercent,
      maxSingleAssetPercent: portfolioPersistence.snapshot.preferences.maxSingleAssetPercent,
      maxAcceptableDrawdownPercent: portfolioPersistence.snapshot.preferences.maxAcceptableDrawdownPercent,
      shortTermMonths: portfolioPersistence.snapshot.preferences.shortTermMonths,
      longTermYears: portfolioPersistence.snapshot.preferences.longTermYears,
    });
    setAnalysisHorizon(portfolioPersistence.snapshot.preferences.analysisHorizon);
    setDecisionHorizon(portfolioPersistence.snapshot.preferences.decisionHorizon);
    setSelectedHoldingId(restored[0]?.id ?? null);
    setPortfolioPersistence({ state: "ready", snapshot: portfolioPersistence.snapshot, message: "سبد، محدودیت‌های مالک و افق‌های تحلیل از دیتابیس بازیابی شدند." });
  }

  function loadDemoPortfolio() {
    activateDemoPortfolio("portfolio");
  }

  function activateDemoPortfolio(destination: View) {
    if (portfolioMode !== "demo") sessionStorage.setItem("asha-personal-holdings-backup-v1", JSON.stringify(holdings));
    sessionStorage.setItem(portfolioPreferenceKey, "demo");
    setHoldings(demoHoldings.map((holding) => ({ ...holding })));
    setSelectedHoldingId(demoHoldings[0]?.id ?? null);
    setPortfolioMode("demo");
    const createdAt = new Date().toISOString();
    setSandboxCollectedAt(createdAt);
    pushNotifications(createDemoNotifications(createdAt));
    setView(destination);
  }

  function clearDemoPortfolio() {
    let restoredHoldings: Holding[] = [];
    const backup = sessionStorage.getItem("asha-personal-holdings-backup-v1");
    if (backup) {
      try { restoredHoldings = JSON.parse(backup) as Holding[]; } catch { restoredHoldings = []; }
    }
    sessionStorage.removeItem("asha-personal-holdings-backup-v1");
    sessionStorage.setItem(portfolioPreferenceKey, "personal");
    setHoldings(restoredHoldings);
    setSelectedHoldingId(restoredHoldings[0]?.id ?? null);
    setPortfolioMode("personal");
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
      <aside className={menuOpen ? "sidebar open" : "sidebar"} id="asha-sidebar">
        <a className="brand" href="#top" onClick={() => setView("overview")}>
          <span className="brand-mark"><AshaLogo /></span>
          <span><strong>اشا <b>ASHA</b></strong><small>دستیار تصمیم زر و سیم</small></span>
        </a>
        <nav aria-label="بخش‌های سامانه">
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setMenuOpen(false); }}>{item.label}</button>)}
        </nav>
        <div className="sidebar-status"><i /><span><strong>حالت امن فعال</strong><small>بدون معاملهٔ خودکار</small></span></div>
        <p className="sidebar-version">PHASE 1 · EVALUATION</p>
      </aside>

      <main className="workspace" id="top">
        <header className="topbar">
          <div className="top-title"><button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? "بستن منو" : "باز کردن منو"} aria-expanded={menuOpen} aria-controls="asha-sidebar">☰</button><div><h1>{headerTitle}</h1><p>اشا؛ سبد، تصمیم و کیفیت داده در یک نمای قابل‌ردیابی</p></div></div>
          <div className="top-actions"><span className={effectiveDisplayQuoteCount ? "offline-state online" : "offline-state"}><i /><span><strong>{portfolioMode === "demo" ? `${effectiveLiveQuoteCount.toLocaleString("fa-IR")} قیمت کاملاً ساختگی` : feedLoading ? "در حال دریافت قیمت" : displayQuoteCount ? `${liveQuoteCount.toLocaleString("fa-IR")} قیمت تازه از ${displayQuoteCount.toLocaleString("fa-IR")}` : "منبع قابل نمایش نیست"}</strong><small>{portfolioMode === "demo" ? `آزمایشگاه اشا · ${sandboxMethodology.datasetId}` : feedError ? `${feedError} · ${marketRateStatus}` : marketRateStatus}</small></span></span><button className="notification-trigger" data-testid="notification-center" onClick={() => setNotificationOpen(true)} aria-label={`اعلان‌ها؛ ${unreadNotificationCount.toLocaleString("fa-IR")} خوانده‌نشده`} aria-expanded={notificationOpen}><span>اعلان‌ها</span>{unreadNotificationCount > 0 && <b>{unreadNotificationCount.toLocaleString("fa-IR")}</b>}</button><button className="primary-button" onClick={openNewHolding}>＋ افزودن دارایی</button></div>
        </header>

        {portfolioMode === "demo" && <section className="simulation-banner" role="status"><div><b>آزمایشگاه کامل اشا فعال است</b><span>قیمت، تحلیل، ریسک و تصمیم این حالت کاملاً ساختگی و غیرعملیاتی‌اند؛ اجرای معامله وجود ندارد.</span></div><button className="ghost-button" onClick={clearDemoPortfolio}>بازگشت به داده‌های شخصی</button></section>}

        <div className="page-content">
          {view === "overview" && <>
            <section className="overview-toolbar">
              <div><span>داشبورد ثروت شخصی</span><strong>{holdings.length ? `${holdings.length.toLocaleString("fa-IR")} موقعیت · آمادگی ${readinessScore.toLocaleString("fa-IR")} از ۴` : "برای شروع، دارایی ثبت یا سبد نمایشی را فعال کن"}</strong><small>{portfolioRateStatus}</small></div>
              <div><button className="primary-button" onClick={openNewHolding}>＋ ثبت دارایی</button>{portfolioMode === "personal" ? <button className="ghost-button" data-testid="load-demo-portfolio" onClick={loadDemoPortfolio}>فعال‌کردن تجربهٔ کامل</button> : <button className="ghost-button" onClick={clearDemoPortfolio}>بازگشت به سبد شخصی</button>}<button className="ghost-button" onClick={() => setView("market")}>دیده‌بان بازار</button><button className="text-button" onClick={() => setView("data")}>کیفیت داده ←</button></div>
            </section>

            <section className="metric-grid">
              <article><div><small>ارزش روز سبد</small><strong>{portfolioMarketValue === null ? (holdings.length ? "پوشش ناقص" : "دارایی ثبت نشده") : formatPortfolioMoney(portfolioMarketValue)}</strong><p>{holdings.length ? `${valuedHoldingCount.toLocaleString("fa-IR")} از ${holdings.length.toLocaleString("fa-IR")} دارایی قیمت‌گذاری شده` : "پس از ثبت دارایی محاسبه می‌شود"}</p></div></article>
              <article><div><small>موقعیت‌های ثبت‌شده</small><strong>{holdings.length.toLocaleString("fa-IR")}</strong><p>{portfolioMode === "demo" ? "سبد ساختگی برای آزمون تجربهٔ کاربری" : "فقط در نشست فعلی این مرورگر"}</p></div></article>
              <article><div><small>بهای خرید ثبت‌شده</small><strong>{knownCost ? formatPortfolioMoney(knownCost) : "ثبت نشده"}</strong><p>پوشش اطلاعات: {costCoverage.toLocaleString("fa-IR")}٪</p></div></article>
              <article><div><small>آمادگی تصمیم</small><strong>{portfolioMode === "demo" ? "۶ از ۶ آزمایشی" : `${decisionReadiness.passedCount.toLocaleString("fa-IR")} از ۶`}</strong><p>{portfolioMode === "demo" ? "موتور شبیه‌سازی فعال است" : decisionReadiness.operational ? "همهٔ دروازه‌ها عبور کرده‌اند" : "موتور تصمیم مالی واقعی قفل است"}</p></div></article>
            </section>

            <section className="home-primary-grid">
              <article className="panel portfolio-panel home-portfolio"><div className="panel-head"><SectionTitle eyebrow="MY PORTFOLIO" title="سبد دارایی‌های من" text="نمای اصلی روی دارایی‌های خودت متمرکز است؛ دیده‌بان بازار در تب مستقل قرار دارد."/><button className="text-button" onClick={() => setView("portfolio")}>مدیریت کامل ←</button></div>
                {holdings.length === 0 ? <EmptyLock title="سبد شما هنوز خالی است" text="دارایی‌های خودت را ثبت کن یا برای بررسی رابط، سبد نمایشی را فعال کن."/> : <><div className="home-portfolio-summary"><span><small>ارزش روز</small><b>{portfolioMarketValue === null ? "پوشش ناقص" : formatPortfolioMoney(portfolioMarketValue)}</b></span><span><small>سود و زیان</small><b className={portfolioProfitLoss === null ? "muted-value" : portfolioProfitLoss < 0 ? "negative" : "positive"}>{portfolioProfitLoss === null ? "محاسبه نشده" : formatPortfolioMoney(portfolioProfitLoss)}</b></span></div><div className="home-asset-groups">{homeAssetGroups.map((group) => { const expanded = expandedHomeCategoryId === group.id; const panelId = `home-assets-${group.id}`; return <article className={`home-asset-group${expanded ? " expanded" : ""}`} key={group.id}><button type="button" className="home-asset-group-trigger" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpandedHomeCategoryId(expanded ? null : group.id)}><span><strong>{group.label}</strong><small>{group.holdings.length.toLocaleString("fa-IR")} زیرشاخه در سبد</small></span><b>{group.value === null ? "پوشش قیمت ناقص" : formatPortfolioMoney(group.value)}</b><i aria-hidden="true">⌄</i></button>{expanded && <div className="home-asset-children" id={panelId} role="region" aria-label={`زیرشاخه‌های ${group.label}`}>{group.holdings.map((item) => { const currentValue = holdingValues.get(item.id); return <button type="button" key={item.id} onClick={() => openAssetWorkspace(item.id, "asset-center")}><span><strong>{item.name}</strong><small>{item.amount.toLocaleString("fa-IR")} {item.unit}</small></span><b>{currentValue === null || currentValue === undefined ? "بدون قیمت تازه" : formatPortfolioMoney(currentValue)}</b><i aria-hidden="true">←</i></button>; })}</div>}</article>; })}</div></>}
              </article>
              <aside className="panel opportunity-radar"><div className="panel-head"><SectionTitle eyebrow="HIGH-CONVICTION WATCH" title="فرصت‌های خیلی جذاب" text="فقط فرصت‌هایی که تمام دروازه‌های داده و روش را عبور کنند؛ موارد آزمایشی با برچسب جدا نمایش داده می‌شوند."/><span className={excitingOpportunities.length ? "status-chip warning" : "status-chip safe"}>{excitingOpportunities.length.toLocaleString("fa-IR")} مورد</span></div>
                {excitingOpportunities.length ? <div className="opportunity-list">{excitingOpportunities.map((opportunity) => <article key={opportunity.id}><div><b>{opportunity.demo ? "نمایشی" : "تأییدشده"}</b></div><strong>{opportunity.title}</strong><p>{opportunity.message}</p><time>{formatNotificationTime(opportunity.createdAt)}</time></article>)}</div> : <div className="opportunity-empty"><strong>فرصت خیلی جذابِ تأییدشده‌ای وجود ندارد</strong><p>وقتی دادهٔ تازه، روش مصوب و اعتبارسنجی تاریخی هم‌زمان آماده باشند، موارد با اهمیت بالا اینجا ظاهر می‌شوند.</p></div>}
                <button className="text-button" onClick={() => { setNotificationFilter("opportunity"); setNotificationOpen(true); }}>مشاهدهٔ مرکز فرصت‌ها ←</button>
              </aside>
            </section>

            <section className="panel decision-brief">
              <div><SectionTitle eyebrow="ASHA DAILY BRIEF" title="خلاصهٔ تصمیم اشا" text="صفحهٔ اول فقط وضعیت و اقدام مجاز فعلی را نشان می‌دهد؛ جزئیات هر دارایی در فضای تخصصی خودش قرار دارد."/></div>
              <div className="decision-brief-status"><small>{portfolioMode === "demo" ? "بهترین اقدام در شبیه‌سازی" : "بهترین اقدام مجاز اکنون"}</small><strong>{portfolioMode === "demo" ? sandboxOverallActionText : decisionReadiness.safeAction}</strong><p>{portfolioMode === "demo" ? "خروجی آزمایشی بر پایهٔ قواعد نسخه‌دار و دادهٔ ساختگی است؛ قابل اجرا نیست." : `${decisionReadiness.passedCount.toLocaleString("fa-IR")} از ۶ دروازه آماده است؛ این وضعیت توصیهٔ خرید یا فروش نیست.`}</p></div>
              <div className="decision-brief-routes"><button className="ghost-button" onClick={() => setView("asset-center")}>مرکز دارایی</button><button className="ghost-button" onClick={() => setView("analysis")}>تحلیل‌ها</button><button className="primary-button" onClick={() => setView("decisions")}>تصمیم‌ها ←</button></div>
            </section>
          </>}

          {view === "portfolio" && <section className="view-stack"><div className="view-hero"><SectionTitle eyebrow="MY ASSETS" title="فهرست دارایی‌های من" text="هر ردیف، اطلاعات مالی همان دارایی و مسیر مستقیم به نمای ترکیبی، تحلیل و تصمیم را در اختیار می‌گذارد."/><div className="market-actions">{portfolioMode === "demo" && <span className="status-chip warning">آزمایشگاه فعال</span>}{portfolioMode === "personal" && <button className="ghost-button" data-testid="load-demo-portfolio" onClick={loadDemoPortfolio}>فعال‌کردن تجربهٔ کامل</button>}{portfolioMode === "demo" && <button className="ghost-button" onClick={clearDemoPortfolio}>بازگشت به داده‌های شخصی</button>}<button className="primary-button" onClick={openNewHolding}>＋ ثبت دارایی</button></div></div>
            {portfolioMode === "demo" && <section className="guardrail"><span>i</span><div><b>سبد و قیمت‌های این حالت کاملاً ساختگی‌اند</b><p>مقدار، بهای خرید و قیمت روز فقط برای تجربهٔ کامل محصول ساخته شده‌اند. هیچ خروجی این حالت پیشنهاد خرید، فروش یا تبدیل واقعی نیست.</p></div></section>}
            {portfolioMode === "personal" && <section className="guardrail" data-testid="portfolio-persistence"><span>✓</span><div><b>نسخهٔ امن سبد و تنظیمات روی PostgreSQL محلی</b><p>{portfolioPersistence.state === "checking" ? "در حال بررسی اتصال دیتابیس…" : portfolioPersistence.message}</p>{portfolioPersistence.state !== "checking" && portfolioPersistence.state !== "unavailable" && <small>نسخهٔ دیتابیس: {portfolioPersistence.snapshot.version.toLocaleString("fa-IR")} · {portfolioPersistence.snapshot.holdings.length.toLocaleString("fa-IR")} دارایی · همراه محدودیت‌ها و افق‌های تحلیل</small>}</div><div className="market-actions">{portfolioPersistence.state !== "checking" && portfolioPersistence.state !== "unavailable" && <><button className="primary-button" data-testid="save-portfolio-database" disabled={portfolioPersistence.state === "saving"} onClick={() => void savePersonalPortfolioToDatabase()}>{portfolioPersistence.state === "saving" ? "در حال ذخیره…" : "ذخیره سبد و تنظیمات"}</button>{portfolioPersistence.snapshot.holdings.length > 0 && <button className="ghost-button" data-testid="restore-portfolio-database" disabled={portfolioPersistence.state === "saving"} onClick={restorePersonalPortfolioFromDatabase}>بازیابی نسخهٔ دیتابیس</button>}</>}</div></section>}
            <section className="conversion-strip"><b>مبنای نمایش دوارزی</b><span>{portfolioRateStatus}</span></section>
            <section className="panel"><div className="portfolio-summary"><div><small>تعداد موقعیت‌ها</small><strong>{holdings.length.toLocaleString("fa-IR")}</strong></div><div><small>جمع بهای خرید ثبت‌شده</small><strong>{knownCost ? formatPortfolioMoney(knownCost) : "—"}</strong></div><div><small>ارزش روز</small><strong className={portfolioMarketValue === null ? "muted-value" : ""}>{portfolioMarketValue === null ? "پوشش ناقص" : formatPortfolioMoney(portfolioMarketValue)}</strong></div><div><small>سود و زیان</small><strong className={portfolioProfitLoss === null ? "muted-value" : portfolioProfitLoss < 0 ? "negative" : "positive"}>{portfolioProfitLoss === null ? "محاسبه نشده" : formatPortfolioMoney(portfolioProfitLoss)}</strong></div></div>
              {holdings.length === 0 ? <EmptyLock title="هنوز دارایی ثبت نشده است" text="افزودن دارایی به معنی پیشنهاد خرید نیست؛ فقط اطلاعاتی است که خودتان وارد می‌کنید."/> : <div className="holdings-table"><div className="table-row table-head"><SortButton label="دارایی" active={holdingSort.key === "name"} direction={holdingSort.direction} onClick={() => toggleHoldingSort("name")}/><SortButton label="مقدار" active={holdingSort.key === "amount"} direction={holdingSort.direction} onClick={() => toggleHoldingSort("amount")}/><SortButton label="بهای خرید (تومان · دلار)" active={holdingSort.key === "cost"} direction={holdingSort.direction} onClick={() => toggleHoldingSort("cost")}/><SortButton label="ارزش فعلی (تومان · دلار)" active={holdingSort.key === "current"} direction={holdingSort.direction} onClick={() => toggleHoldingSort("current")}/><SortButton label="سود/زیان (تومان · دلار)" active={holdingSort.key === "profit"} direction={holdingSort.direction} onClick={() => toggleHoldingSort("profit")}/><span>عملیات</span></div>{sortedHoldings.map((item) => { const currentValue = holdingValues.get(item.id); const holdingProfitLoss = typeof currentValue === "number" && item.costToman !== null ? currentValue - item.costToman : null; const holdingProfitPercent = holdingProfitLoss !== null && item.costToman !== null && item.costToman > 0 ? (holdingProfitLoss / item.costToman) * 100 : null; return <div className="table-row" key={item.id}><span><b>{item.name}</b><small>{formatPurchaseDate(item.purchaseDate)} · {item.note || "ثبت‌شده توسط شما"}</small></span><span>{item.amount.toLocaleString("fa-IR")} {item.unit}</span><span>{item.costToman !== null ? formatPortfolioMoney(item.costToman) : "—"}</span><span className={currentValue === null || currentValue === undefined ? "no-data" : "positive"}>{currentValue === null || currentValue === undefined ? "—" : formatPortfolioMoney(currentValue)}</span><span className={`holding-profit ${holdingProfitLoss === null ? "muted-value" : holdingProfitLoss < 0 ? "negative" : "positive"}`}><b>{holdingProfitLoss === null ? "نامشخص" : formatPortfolioMoney(holdingProfitLoss)}</b><small>{holdingProfitPercent === null ? "—" : `${holdingProfitPercent > 0 ? "+" : ""}${holdingProfitPercent.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`}</small></span><span className="row-actions"><button className="asset-open-button" onClick={() => openAssetWorkspace(item.id, "asset-center")}>بازکردن</button><button className="edit-button" onClick={() => openEditHolding(item)} aria-label={`ویرایش ${item.name}`}>ویرایش</button><button className="remove-button" onClick={() => setPendingDeleteHoldingId(item.id)} aria-label={`حذف ${item.name}`}>حذف</button></span></div>; })}</div>}
            </section>
            <section className="panel bubble-monitor">
              <div className="panel-head"><SectionTitle eyebrow="PREMIUM MONITOR" title="حباب و پریمیوم دارایی‌ها" text={portfolioMode === "demo" ? `حباب جاری و دامنهٔ ${sandboxPremiumMethodology.windowLabel} برای دارایی‌های مرتبط، کاملاً ساختگی و فعال است.` : "حباب جاری نسبت به ارزش خام فلز محاسبه می‌شود؛ آمار تاریخی فقط پس از ورود تاریخچهٔ معتبر نمایش داده خواهد شد."}/><span className={bubbleAvailableCount ? "status-chip safe" : "status-chip warning"}>{bubbleAvailableCount.toLocaleString("fa-IR")} محاسبهٔ معتبر</span></div>
              {holdings.length === 0
                ? <EmptyLock title="دارایی برای محاسبه وجود ندارد" text="طلا یا نقرهٔ پشتیبانی‌شده ثبت کن تا حباب خام در صورت وجود سه قیمت تازه محاسبه شود."/>
                : <BubbleTable rows={bubbleRows} demoMode={portfolioMode === "demo"}/>}
              <div className="method-note"><b>{portfolioMode === "demo" ? `روش آزمایشی ${sandboxPremiumMethodology.id}:` : "روش فعلی:"}</b> {portfolioMode === "demo" ? `${sandboxPremiumMethodology.windowLabel} برای تکمیل تجربهٔ رابط تولید شده و هیچ ارزش تاریخی یا عملیاتی ندارد.` : "قیمت داخلی منهای ارزش فلز خالص بر پایهٔ اونس جهانی و دلار آزاد. هزینهٔ ساخت، مالیات، وزن دقیق سکه، نقدشوندگی و توزیع تاریخی هنوز وارد مدل نشده‌اند؛ بنابراین خروجی سیگنال معامله نیست."}</div>
            </section>
          </section>}

          {view === "asset-center" && <section className="view-stack">
            <div className="view-hero"><SectionTitle eyebrow="ASSET 360" title="مرکز دارایی" text="نمای ترکیبی و مینیمالِ اطلاعات، تحلیل و وضعیت تصمیم برای یک دارایی؛ بدون تکرار جدول‌ها و جزئیات کم‌اهمیت."/><div className="market-actions"><button className="ghost-button" onClick={() => setView("portfolio")}>فهرست کامل</button><button className="primary-button" onClick={openNewHolding}>＋ ثبت دارایی</button></div></div>
            {selectedHolding ? <>
              <section className="asset-context-bar" aria-label="انتخاب دارایی"><div><small>دارایی در حال بررسی</small><strong>{selectedHolding.name}</strong></div><div className="asset-context-list">{holdings.map((holding) => <button key={holding.id} className={holding.id === selectedHolding.id ? "active" : ""} onClick={() => setSelectedHoldingId(holding.id)}>{holding.name}</button>)}</div></section>
              <section className="asset-center-grid">
                <article className="panel asset-center-card asset-profile-card"><div className="asset-card-head"><div><small>اطلاعات دارایی</small><h3>{selectedHolding.name}</h3></div><b>{getAssetClass(selectedHolding.name).label}</b></div><dl className="asset-facts"><div><dt>مقدار</dt><dd>{selectedHolding.amount.toLocaleString("fa-IR")} {selectedHolding.unit}</dd></div><div><dt>تاریخ خرید</dt><dd>{formatPurchaseDate(selectedHolding.purchaseDate)}</dd></div><div><dt>بهای خرید</dt><dd>{selectedHolding.costToman === null ? "ثبت نشده" : formatPortfolioMoney(selectedHolding.costToman)}</dd></div><div><dt>ارزش فعلی</dt><dd>{selectedHoldingValue === null ? "بدون قیمت قابل استفاده" : formatPortfolioMoney(selectedHoldingValue)}</dd></div><div><dt>سود/زیان</dt><dd className={selectedHoldingProfit === null ? "muted-value" : selectedHoldingProfit < 0 ? "negative" : "positive"}>{selectedHoldingProfit === null ? "محاسبه نشده" : `${formatPortfolioMoney(selectedHoldingProfit)} · ${selectedHoldingProfitPercent === null ? "—" : formatPercent(selectedHoldingProfitPercent)}`}</dd></div></dl><button className="text-button" onClick={() => openEditHolding(selectedHolding)}>ویرایش این دارایی</button></article>
                <article className="panel asset-center-card asset-analysis-card"><div className="asset-card-head"><div><small>تحلیل دارایی</small><h3>شواهد موجود</h3></div><b>{portfolioMode === "demo" ? "تحلیل ساختگی فعال" : selectedHoldingValue === null ? "پوشش ناقص" : "قیمت‌گذاری‌شده"}</b></div><div className="asset-signal-list"><div><span>قیمت و ارزش روز</span><strong>{selectedHoldingValue === null ? "نیازمند قیمت تازه" : portfolioMode === "demo" ? "ساختگی · قابل محاسبه" : "قابل محاسبه"}</strong></div><div><span>حباب خام جاری</span><strong>{selectedHoldingBubble === null ? portfolioMode === "demo" ? "برای این کلاس کاربرد ندارد" : "دادهٔ کافی نیست" : formatPercent(selectedHoldingBubble)}</strong></div><div><span>تحلیل تاریخی</span><strong>{portfolioMode === "demo" ? selectedHoldingPremium?.applicable ? sandboxPremiumMethodology.windowLabel : "تحلیل ساختگی کلاس دارایی فعال" : "در انتظار تاریخچهٔ معتبر ایران"}</strong></div><div><span>سناریوی کوتاه/بلند</span><strong>آمادهٔ بررسی فرضیه</strong></div></div><button className="primary-button" onClick={() => openAssetWorkspace(selectedHolding.id, "analysis")}>تحلیل کامل این دارایی</button></article>
                <article className="panel asset-center-card asset-decision-card">
                  <div className="asset-card-head"><div><small>تصمیم دارایی</small><h3>{portfolioMode === "demo" ? "سه تصمیم آزمایشگاهی" : "دروازهٔ اقدام"}</h3></div><b>{portfolioMode === "demo" ? "غیرعملیاتی" : `${decisionReadiness.passedCount.toLocaleString("fa-IR")} / ۶`}</b></div>
                  {portfolioMode === "demo" && selectedSandboxIntelligence ? <>
                    <div className="asset-decision-list">
                      <div className="asset-decision-item"><div><small>تصمیم همگن · همین کلاس</small><span>امتیاز {selectedSandboxIntelligence.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}</span></div><strong>{selectedSandboxIntelligence.homogeneousDecision.label}</strong><p>{selectedSandboxIntelligence.homogeneousDecision.reason}</p></div>
                      <div className="asset-decision-item"><div><small>تصمیم ناهمگن · بین کلاس‌ها</small><span>{selectedSandboxIntelligence.heterogeneousDecision.destinationName ?? "بدون مقصد"}</span></div><strong>{selectedSandboxIntelligence.heterogeneousDecision.label}</strong><p>{selectedSandboxIntelligence.heterogeneousDecision.reason}</p></div>
                      <div className="asset-decision-item overall"><div><small>بهترین اقدام کل سبد</small><span>{decisionHorizon === "short" ? "کوتاه‌مدت" : "بلندمدت"}</span></div><strong>{sandboxOverallActionText}</strong><p>{sandboxOverallActionReason}</p></div>
                    </div>
                    <div className="asset-decision-meta"><span>روش: {sandboxIntelligenceMethodology.id}</span><span>اجرا: غیرفعال</span></div>
                  </> : <>
                    <div className="asset-decision-state"><small>اقدام مجاز فعلی</small><strong>{decisionReadiness.safeAction}</strong><p>تا زمان تأیید روش و آزمون تاریخی، اشا هیچ خرید، فروش یا تبدیل دارایی پیشنهاد نمی‌کند.</p></div>
                    <div className="mini-gates">{decisionReadiness.gates.map((gate) => <span className={gate.passed ? "passed" : "blocked"} key={gate.id}>{gate.passed ? "✓" : "×"} {gate.label}</span>)}</div>
                  </>}
                  <button className="primary-button" onClick={() => openAssetWorkspace(selectedHolding.id, "decisions")}>جزئیات و مقایسهٔ تصمیم‌ها</button>
                </article>
              </section>
            </> : <section className="panel"><EmptyLock title="دارایی برای نمایش وجود ندارد" text="ابتدا یک دارایی ثبت کن؛ سپس اطلاعات، تحلیل و تصمیم آن در همین نمای ترکیبی قرار می‌گیرد."/></section>}
          </section>}

          {view === "market" && <section className="view-stack">
            <div className="view-hero">
              <SectionTitle eyebrow="MARKET INTELLIGENCE" title="فلزات و بازارهای مرجع" text="دیده‌بان بازار از حالت آزمایشی سبد مستقل است و همیشه خوراک آنلاینِ اعتبارسنجی‌شده را نمایش می‌دهد."/>
              <div className="market-actions">
                <span className={freshIranQuoteCount ? "status-chip safe" : "status-chip warning"}>{feedLoading ? "در حال بروزرسانی" : `${freshIranQuoteCount.toLocaleString("fa-IR")} نرخ ایران تازه · ${liveQuoteCount.toLocaleString("fa-IR")} کل`}</span>
                <button className="ghost-button refresh-button" onClick={() => void refreshMarket()} disabled={feedLoading}>{feedLoading ? "لطفاً صبر کنید" : "بروزرسانی منابع آنلاین"}</button>
              </div>
            </div>
            {feedError && <div className="feed-error">{feedError}</div>}
            <section className="conversion-strip"><b>مبنای تبدیل قیمت‌ها</b><span>{marketRateStatus}</span></section>
            <section className="guardrail snapshot-note"><div><b>{navasanConnected ? "خوراک آنلاین ایران فعال است" : "خوراک آنلاین ایران فعلاً در دسترس نیست"}</b><p>{navasanConnected ? "نرخ‌های ایران از API نوسان می‌آیند؛ وضعیت و نام منبع کنار هر قیمت ثبت شده و سبد نمایشی این جدول را تغییر نمی‌دهد." : "تا بازگشت اتصال نوسان، Snapshot منقضی فقط برای منشأ و زمان نگه داشته می‌شود و به‌عنوان قیمت جاری نمایش یا استفاده نمی‌شود."}</p></div></section>
            <section className="panel"><MarketTable rows={instruments} quotes={quoteMap} usdTomanRate={marketUsdTomanRate}/></section>
            <section className="source-grid">{(feed?.sources ?? []).map((source) => <article key={source.id}><div><strong>{source.name}</strong><span className={`source-status ${source.status}`}>{sourceLabel(source.status)}</span></div><p>{source.message}</p>{source.id === "tgju" && <a className="source-action" href="https://www.tgju.org/form/api" target="_blank" rel="noreferrer">درخواست رسمی API از TGJU ↗</a>}</article>)}</section>
            <section className="info-grid"><article><span>۱</span><h3>قیمت خام</h3><p>دریافت بدون تغییر همراه با زمان و شناسهٔ منبع.</p></article><article><span>۲</span><h3>اعتبارسنجی</h3><p>کنترل نوع، دامنه، تازگی و سازگاری رکورد.</p></article><article><span>۳</span><h3>قرنطینه</h3><p>عدد مشکوک هیچ‌وقت وارد تحلیل نمی‌شود.</p></article><article><span>۴</span><h3>نمایش</h3><p>فقط دادهٔ معتبر و قابل‌ردیابی نمایش داده می‌شود.</p></article></section>
          </section>}

          {view === "analysis" && <section className="view-stack">
            <div className="view-hero"><SectionTitle eyebrow="MULTI-LENS ANALYSIS" title="مرکز تحلیل چندلایه و سناریو" text="از رویداد و اقتصاد تا رفتار قیمت، حباب و اثر سبد؛ هر نتیجه با افق، شواهد لازم و مرز عدم‌قطعیت جدا می‌شود."/><div className="market-actions">{portfolioMode === "demo" ? <span className="status-chip warning">سبد ساختگی فعال</span> : <button className="primary-button" onClick={() => activateDemoPortfolio("analysis")}>بارگذاری سبد نمایشی</button>}<HorizonToggle value={analysisHorizon} onChange={setAnalysisHorizon}/></div></div>

            {selectedHolding && <section className="asset-context-bar compact" aria-label="انتخاب دارایی برای تحلیل"><div><small>تحلیل متمرکز روی</small><strong>{selectedHolding.name}</strong></div><div className="asset-context-list">{holdings.map((holding) => <button key={holding.id} className={holding.id === selectedHolding.id ? "active" : ""} onClick={() => setSelectedHoldingId(holding.id)}>{holding.name}</button>)}</div><button className="ghost-button" onClick={() => setView("asset-center")}>نمای ۳۶۰ درجه</button></section>}

            <section className="analysis-summary-grid">
              <article><small>{portfolioMode === "demo" ? "قیمت ساختگی" : "قیمت تازه"}</small><strong>{effectiveLiveQuoteCount.toLocaleString("fa-IR")}</strong><p>{portfolioMode === "demo" ? "۰ رکورد منقضی در مجموعهٔ تمرینی" : `${staleQuoteCount.toLocaleString("fa-IR")} رکورد منقضی`}</p></article>
              <article><small>پوشش ارزش‌گذاری سبد</small><strong>{valuedHoldingCount.toLocaleString("fa-IR")} / {holdings.length.toLocaleString("fa-IR")}</strong><p>{portfolioRateStatus}</p></article>
              <article><small>حباب قابل محاسبه</small><strong>{bubbleAvailableCount.toLocaleString("fa-IR")}</strong><p>{portfolioMode === "demo" ? `${sandboxPremiumMethodology.windowLabel} فعال` : "آمار تاریخی هنوز قفل است"}</p></article>
              <article className="gate-card"><small>دروازهٔ تصمیم</small><strong>{portfolioMode === "demo" ? "فعال آزمایشی" : "غیرفعال"}</strong><p>{portfolioMode === "demo" ? "بدون اعتبار عملیاتی" : "نیازمند بک‌تست و walk-forward"}</p></article>
            </section>

            <section className="panel analysis-catalogue">
              <div className="analysis-tabs" role="tablist" aria-label="دسته‌بندی تحلیل‌ها">{analysisCategories.map((category) => <button key={category.id} role="tab" aria-selected={analysisCategory === category.id} className={analysisCategory === category.id ? "active" : ""} onClick={() => setAnalysisCategory(category.id)}>{category.label}</button>)}</div>
              <div className="analysis-category-panel" role="tabpanel">
                <div className="analysis-category-title"><div><small>{analysisHorizon === "short" ? "افق کوتاه‌مدت" : "افق بلندمدت"}{selectedHolding ? ` · ${selectedHolding.name}` : ""}</small><h3>{selectedAnalysis.label}</h3></div><b className="evidence-badge">{portfolioMode === "demo" ? `${sandboxIntelligenceMethodology.id} · محاسبه شد` : "شواهد ناکافی برای تصمیم"}</b></div>
                {portfolioMode === "demo" && selectedSandboxAnalysisLens ? <>
                  <div className="intelligence-verdict"><div><small>نتیجهٔ ملموس این لایه</small><h4>{selectedSandboxAnalysisLens.headline}</h4></div><p>{selectedSandboxAnalysisLens.verdict}</p></div>
                  <div className="analysis-metric-grid">{selectedSandboxAnalysisLens.metrics.map((metric) => <article className={metric.tone} key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.detail}</span></article>)}</div>
                  <div className="analysis-findings"><div><small>استدلال محاسبه‌شده</small>{selectedSandboxAnalysisLens.findings.map((finding) => <p key={finding}>{finding}</p>)}</div><aside><small>تصمیم حاصل</small><strong>{selectedSandboxAnalysisLens.decision}</strong><p>{selectedSandboxAnalysisLens.invalidation}</p></aside></div>
                  <div className="analysis-provenance"><span>داده: {sandboxIntelligenceMethodology.datasetId}</span><span>تاریخچه: {sandboxIntelligenceMethodology.historyDatasetId}</span><span>روش: {sandboxIntelligenceMethodology.id} / {sandboxIntelligenceMethodology.version}</span><span>اجرا: غیرفعال</span></div>
                </> : <>
                  <p className="analysis-lead">{selectedAnalysisContent[analysisHorizon]}</p>
                  <div className="analysis-category-body">
                    <article><small>آنچه اکنون قابل اثبات است</small><strong>{analysisCategory === "summary" ? `${liveQuoteCount.toLocaleString("fa-IR")} قیمت تازه و ${staleQuoteCount.toLocaleString("fa-IR")} قیمت منقضی` : analysisCategory === "portfolio" ? `${valuedHoldingCount.toLocaleString("fa-IR")} از ${holdings.length.toLocaleString("fa-IR")} موقعیت ارزش‌گذاری شده` : analysisCategory === "bubble" ? `${bubbleAvailableCount.toLocaleString("fa-IR")} حباب خام لحظه‌ای` : "خوراک تخصصی این لایه هنوز متصل نیست"}</strong></article>
                    <article><small>شواهد لازم برای نتیجه</small><strong>{selectedAnalysisContent.evidence}</strong></article>
                  </div>
                  <div className="analysis-brief"><b>خلاصهٔ تحلیل</b><p>در وضعیت فعلی می‌توان کیفیت و پوشش داده را گزارش و اثر سناریوهای ورودی کاربر را محاسبه کرد؛ اما برای توصیهٔ خرید، فروش یا «نقطهٔ امن» شواهد و اعتبارسنجی کافی وجود ندارد.</p></div>
                </>}
              </div>
            </section>

            <section className="panel scenario-workbench">
              <div className="panel-head"><SectionTitle eyebrow="WHAT-IF ENGINE" title="مهندسی سناریوی چندمحرکی" text="شوک‌های فرضی را جداگانه تنظیم کن؛ موتور اثر را با ضرایب نسخه‌دار روی هر موقعیت محاسبه و سهم اثر را مرتب می‌کند."/><div className="method-version"><span>{scenarioMethodology.id}</span><b>نسخه {scenarioMethodology.version}</b></div></div>
              <div className="scenario-preset-grid">{scenarioPresets.map((preset) => <button key={preset.id} className={activeScenarioPreset === preset.id ? "active" : ""} onClick={() => applyScenarioPreset(preset.id)}><strong>{preset.label}</strong><small>{preset.description}</small></button>)}</div>
              <div className="scenario-driver-grid">{scenarioDrivers.map((driver) => <label key={driver.key}><span><b>{driver.label}</b><small>{driver.hint}</small></span><output className={scenarioShocks[driver.key] < 0 ? "negative" : scenarioShocks[driver.key] > 0 ? "positive" : ""}>{scenarioShocks[driver.key] > 0 ? "+" : ""}{scenarioShocks[driver.key].toLocaleString("fa-IR")}٪</output><input type="range" min="-40" max="40" step="1" value={scenarioShocks[driver.key]} onChange={(event) => updateScenarioShock(driver.key, Number(event.target.value))}/></label>)}</div>
              <div className="scenario-output-grid"><article><small>ارزش مبنای پوشش‌داده‌شده</small><strong>{scenarioPortfolio.coverageCount ? formatScenarioMoney(scenarioPortfolio.baseValueToman) : "—"}</strong></article><article><small>ارزش پس از سناریو</small><strong>{scenarioPortfolio.coverageCount ? formatScenarioMoney(scenarioPortfolio.projectedValueToman) : "—"}</strong></article><article><small>اثر کل فرضی</small><strong className={scenarioPortfolio.impactToman < 0 ? "negative" : scenarioPortfolio.impactToman > 0 ? "positive" : ""}>{scenarioPortfolio.coverageCount ? formatScenarioMoney(scenarioPortfolio.impactToman) : "—"}<small>{scenarioPortfolio.coverageCount ? formatPercent(scenarioPortfolio.impactPercent) : "بدون پوشش"}</small></strong></article><article><small>پوشش سناریو</small><strong>{scenarioPortfolio.coverageCount.toLocaleString("fa-IR")} / {scenarioPortfolio.totalCount.toLocaleString("fa-IR")}</strong></article></div>
              {scenarioRowsByImpact.length === 0 ? <EmptyLock title="سبد قابل ارزش‌گذاری وجود ندارد" text="سبد نمایشی را فعال یا دارایی دارای قیمت تازه ثبت کن تا ماتریس اثر ساخته شود."/> : <div className="scenario-impact-table"><div className="scenario-impact-row head"><span>دارایی</span><span>ارزش مبنا</span><span>تغییر فرضی</span><span>ارزش سناریو</span><span>سهم اثر</span></div>{scenarioRowsByImpact.map((row) => <div className="scenario-impact-row" key={row.id}><b>{row.name}</b><span>{formatScenarioMoney(row.valueToman)}</span><span className={row.movePercent < 0 ? "negative" : row.movePercent > 0 ? "positive" : ""}>{formatPercent(row.movePercent)}</span><span>{formatScenarioMoney(row.projectedValueToman)}</span><span className={row.impactToman < 0 ? "negative" : row.impactToman > 0 ? "positive" : ""}>{formatScenarioMoney(row.impactToman)}</span></div>)}</div>}
              <div className="method-note"><b>محدودیت روش:</b> {scenarioMethodology.limitation} این محاسبه پیش‌بینی، تحلیل همبستگی تجربی یا توصیهٔ سرمایه‌گذاری نیست.</div>
            </section>

            <section className="guardrail"><span>!</span><div><b>محدودهٔ محتمل با نقطهٔ تضمینی فرق دارد</b><p>خروجی واقعی باید علاوه بر سناریوی پایه، سناریوی خلاف، کیفیت داده، عدم‌قطعیت، هزینه و نقدشوندگی را نشان دهد؛ تا آن زمان دروازهٔ اقدام بسته می‌ماند.</p></div></section>
          </section>}

          {view === "decisions" && <section className="view-stack">
            <div className="view-hero"><SectionTitle eyebrow="ASHA DECISIONS" title="تصمیم‌های متناسب با هر دارایی" text="این صفحه فقط سؤال تصمیم را پاسخ می‌دهد: مقایسه در همان کلاس، امکان تبدیل بین کلاس‌ها، و بهترین اقدام مجاز برای کل سبد."/><div className="market-actions"><span className={portfolioMode === "demo" ? "status-chip warning" : decisionReadiness.operational ? "status-chip safe" : "status-chip warning"}>{portfolioMode === "demo" ? "۶ از ۶ · آزمایشی" : `${decisionReadiness.passedCount.toLocaleString("fa-IR")} از ۶ دروازه`}</span><HorizonToggle value={decisionHorizon} onChange={setDecisionHorizon}/></div></div>
            {selectedHolding && <section className="asset-context-bar compact" aria-label="انتخاب دارایی برای تصمیم"><div><small>تصمیم متمرکز روی</small><strong>{selectedHolding.name}</strong></div><div className="asset-context-list">{holdings.map((holding) => <button key={holding.id} className={holding.id === selectedHolding.id ? "active" : ""} onClick={() => setSelectedHoldingId(holding.id)}>{holding.name}</button>)}</div><button className="ghost-button" onClick={() => setView("asset-center")}>نمای ۳۶۰ درجه</button></section>}
            <section className="panel decision-desk">
              <div className="panel-head decision-head"><SectionTitle eyebrow="DECISION MODES" title="میز تصمیم اشا" text="اطلاعات هر دارایی از تحلیل جدا نمی‌شود، اما برای حفظ تمرکز فقط نتیجهٔ آمادگی و شواهد لازم در این صفحه نمایش داده می‌شود."/><span className="method-version compact"><span>{portfolioMode === "demo" ? sandboxIntelligenceMethodology.id : decisionFramework.id}</span><b>نسخه {portfolioMode === "demo" ? sandboxIntelligenceMethodology.version : decisionFramework.version}</b></span></div>
              {portfolioMode === "demo" && <div className="sandbox-decision-banner"><b>موتور تحلیل و تصمیم شبیه‌سازی فعال است</b><p>ورودی بازار: {sandboxIntelligenceMethodology.datasetId} · تاریخچه: {sandboxIntelligenceMethodology.historyDatasetId} · تصمیم هر دارایی یک گزینهٔ مستقل است و «بهترین اقدام کل» اولویت نهایی سبد را تعیین می‌کند · اجرای معامله وجود ندارد</p></div>}
              <details className="owner-constraints-panel">
                <summary><span><b>پروفایل تصمیم شخصی</b><small>افق، نقدینگی، تمرکز و افت قابل‌تحمل</small></span><strong className={portfolioMode === "demo" || ownerConstraintReadiness.complete ? "complete" : "incomplete"}>{portfolioMode === "demo" ? ownerConstraintReadiness.complete ? "کامل · آزمایشی" : "پیش‌فرض آزمایشگاه فعال" : ownerConstraintReadiness.complete ? "کامل" : `${ownerConstraintReadiness.completedCount.toLocaleString("fa-IR")} از ۵`}</strong></summary>
                <div className="owner-constraint-grid">{ownerConstraintFields.map((field) => <label key={field.key}><span>{field.label}</span><span className="constraint-input"><input type="number" inputMode="decimal" min={field.min} max={field.max} step="1" value={ownerConstraints[field.key]} onChange={(event) => setOwnerConstraints((current) => ({ ...current, [field.key]: event.target.value }))} aria-label={field.label}/><b>{field.suffix}</b></span><small>از {field.min.toLocaleString("fa-IR")} تا {field.max.toLocaleString("fa-IR")}</small></label>)}</div>
                <p>{portfolioMode === "demo" ? "فیلد خالی با پیش‌فرض نسخه‌دار آزمایشگاه جایگزین می‌شود و هر تغییر شما فوراً خروجی ساختگی را به‌روزرسانی می‌کند. این مقادیر به سرور ارسال نمی‌شوند." : "این داده‌ها فقط در نشست همین مرورگر ذخیره می‌شوند و به سرور ارسال نمی‌شوند. کامل‌شدن این بخش فقط یک دروازه را باز می‌کند؛ روش مالی و اعتبارسنجی تاریخی همچنان الزامی‌اند."}</p>
              </details>
              <div className="decision-mode-tabs" role="tablist" aria-label="نوع تصمیم"><button type="button" role="tab" aria-selected={decisionMode === "homogeneous"} className={decisionMode === "homogeneous" ? "active" : ""} onClick={() => setDecisionMode("homogeneous")}><b>تصمیم همگن</b><small>داخل همان کلاس دارایی</small></button><button type="button" role="tab" aria-selected={decisionMode === "heterogeneous"} className={decisionMode === "heterogeneous" ? "active" : ""} onClick={() => setDecisionMode("heterogeneous")}><b>تصمیم ناهمگن</b><small>تبدیل بین کلاس‌های دارایی</small></button><button type="button" role="tab" aria-selected={decisionMode === "best"} className={decisionMode === "best" ? "active" : ""} onClick={() => setDecisionMode("best")}><b>بهترین اقدام کل</b><small>شرایط سبد و بازار باهم</small></button></div>
              <div className="decision-gate"><span>!</span><div><strong>{portfolioMode === "demo" ? `خروجی آزمایشی کل: ${sandboxOverallActionText}` : decisionReadiness.operational ? "دروازه‌های تصمیم آماده‌اند" : `بهترین اقدام مجاز اکنون: ${decisionReadiness.safeAction}`}</strong><p>{portfolioMode === "demo" ? "این خروجی فقط برای لمس جریان کار است و به هیچ حساب یا سامانهٔ معامله متصل نیست." : decisionReadiness.operational ? "خروجی عملیاتی باید از موتور قطعی و نسخه‌دار دریافت شود." : "این نتیجه دربارهٔ آمادگی سیستم است، نه پیشنهاد نگهداری، خرید یا فروش یک دارایی."}</p></div></div>
              {portfolioMode === "demo" ? decisionMode === "best" ? <div className="best-decision-card tangible-decision"><div><small>{decisionHorizon === "short" ? "جمع‌بندی کوتاه‌مدت ساختگی" : "جمع‌بندی بلندمدت ساختگی"}</small><strong>{sandboxOverallActionText}</strong><p>{sandboxOverallActionReason}</p><div className="decision-route"><span>مبدأ: {sandboxDecisionIntelligence.overallDecision.sourceName}</span><span>مقصد: {sandboxDecisionIntelligence.overallDecision.destinationName ?? "بدون تبدیل"}</span><span>مبلغ: {formatPortfolioMoney(sandboxDecisionIntelligence.overallDecision.amountToman)}</span></div></div><div className="decision-gates">{sandboxReadinessGates.map((label) => <span className="passed" key={label}>✓ {label}</span>)}</div></div> : <div className="decision-grid tangible-grid">{focusedDecisionAssets.map((asset) => { const row = sandboxIntelligenceRows.get(asset.id); const route = decisionMode === "homogeneous" ? row?.homogeneousDecision : row?.heterogeneousDecision; return <article className={asset.id === selectedHolding?.id ? "focused" : ""} key={asset.id}><div><span>{asset.name}</span><b>{row?.assetClassLabel ?? getAssetClass(asset.name).label}</b></div><strong>{route?.label ?? "محاسبه نشد"}</strong><p>{route?.reason ?? "برای این موقعیت ورودی کافی وجود ندارد."}</p>{row && <div className="decision-numbers"><span>امتیاز <b>{row.score.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}</b></span><span>مومنتوم <b>{formatPercent(decisionHorizon === "short" ? row.history.momentum20Percent : row.history.momentum60Percent)}</b></span><span>بدترین فشار <b>{formatPercent(row.worstScenario.movePercent)}</b></span><span>مبلغ <b>{formatPortfolioMoney(route?.amountToman ?? 0)}</b></span></div>}<small>{row?.invalidation ?? "قاعدهٔ ابطال در دسترس نیست"}</small></article>; })}</div> : decisionMode === "best" ? <div className="best-decision-card"><div><small>{decisionHorizon === "short" ? "جمع‌بندی کوتاه‌مدت" : "جمع‌بندی بلندمدت"}</small><strong>{decisionReadiness.safeAction}</strong><p>شرایط کلی از پوشش سبد، تازگی دادهٔ ایران، محدودیت‌های مالک، روش مصوب و اعتبارسنجی تاریخی ساخته می‌شود. هر دروازهٔ ناقص، تصمیم مالی را متوقف می‌کند.</p></div><div className="decision-gates">{decisionReadiness.gates.map((gate) => <span className={gate.passed ? "passed" : "blocked"} key={gate.id}>{gate.passed ? "✓" : "×"} {gate.label}</span>)}</div></div> : focusedDecisionAssets.length === 0 ? <EmptyLock title="برای تصمیم‌سازی، ابتدا سبد را ثبت کن" text="تصمیم همگن و ناهمگن فقط برای دارایی‌های خودت نمایش داده می‌شود؛ دیده‌بان بازار جایگزین سبد شخصی نیست."/> : <div className="decision-grid">{focusedDecisionAssets.slice(0, 6).map((asset) => { const assetClass = getAssetClass(asset.name); const sameClassCandidates = getSameClassCandidates(asset.name, assetOptions).slice(0, 3); return <article className={asset.id === selectedHolding?.id ? "focused" : ""} key={asset.id}><div><span>{asset.name}</span><b>{assetClass.label}</b></div><strong>{decisionMode === "homogeneous" ? "مقایسهٔ درون‌کلاسی" : "ارزیابی تبدیل بین‌کلاسی"}</strong><p>{decisionMode === "homogeneous" ? `تصمیم فقط بین گزینه‌های کلاس «${assetClass.label}» سنجیده می‌شود؛ ${asset.priced ? "قیمت فعلی موجود است" : "قیمت تازه کامل نیست"}${asset.bubble !== null ? ` و حباب خام ${formatPercent(asset.bubble)} است` : ""}.` : `دارایی مبدأ از کلاس «${assetClass.label}» است؛ مقصد تا زمان مقایسهٔ ارزش، ریسک، نقدشوندگی، هزینهٔ تبدیل و محدودیت‌های شما انتخاب نمی‌شود.`}</p><small>{decisionMode === "homogeneous" ? `دامنهٔ مقایسه: ${sameClassCandidates.length ? sameClassCandidates.join("، ") : "گزینهٔ هم‌کلاس دیگری تعریف نشده"}` : "وضعیت: تبدیل غیرفعال تا عبور همهٔ دروازه‌ها"}</small></article>; })}</div>}
              <div className="decision-framework-note"><b>مرز این نسخه:</b> {portfolioMode === "demo" ? sandboxIntelligenceMethodology.limitation : decisionFramework.limitation}</div>
              <button className="text-button decision-link" onClick={() => setView("analysis")}>مشاهدهٔ تحلیل همین دارایی ←</button>
            </section>
          </section>}

          {view === "risk" && <section className="view-stack">
            <div className="view-hero"><SectionTitle eyebrow="RISK & ALLOCATION" title="ریسک قبل از بازده" text={portfolioMode === "demo" ? "ابزارهای این صفحه با یک سبد کاملاً ساختگی باز شده‌اند تا رفتار رابط را بررسی کنی." : "برای ارزیابی واقعی، تحمل ریسک، تاریخچه معتبر و روش مصوب لازم است."}/><div className="market-actions">{portfolioMode === "demo" ? <span className="status-chip warning">آزمایش با دادهٔ ساختگی</span> : <button className="primary-button" onClick={() => activateDemoPortfolio("risk")}>فعال‌سازی ابزارهای نمایشی</button>}<span className="status-chip safe">بدون پیشنهاد معامله</span></div></div>
            <section className="risk-grid">{portfolioMode === "demo" ? <><article><h3>تمرکز سبد</h3><p>{largestAllocation ? `${largestAllocation.holding.name} بزرگ‌ترین موقعیت سبد است.` : "—"}</p><b>{largestAllocationPercent === null ? "—" : `${largestAllocationPercent.toLocaleString("fa-IR")}٪ از سبد`}</b></article><article><h3>بازده نمایشی</h3><p>اختلاف ارزش ساختگی امروز با بهای خرید نمونه.</p><b>{portfolioProfitPercent === null ? "—" : `${portfolioProfitPercent.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`}</b></article><article><h3>نقدشوندگی نمونه</h3><p>برچسب آزمایشی برای بررسی نمایش ریسک خروج.</p><b>متوسط · ساختگی</b></article><article><h3>سناریوی فشار</h3><p>اثر یک شوک یکسان روی کل ارزش سبد نمونه.</p><b>{Number(stressMove).toLocaleString("fa-IR")}٪</b></article></> : <><article><h3>تمرکز سبد</h3><p>وزن هر دارایی و وابستگی بیش‌ازحد به یک بازار.</p><b>نیازمند ارزش روز کامل</b></article><article><h3>نوسان و افت</h3><p>نوسان، افت تاریخی و زمان بازیابی در دادهٔ ایران.</p><b>نیازمند تاریخچه معتبر</b></article><article><h3>نقدشوندگی</h3><p>اثر فاصلهٔ خرید و فروش و امکان خروج در فشار بازار.</p><b>نیازمند دادهٔ بازار</b></article><article><h3>سناریوی فشار</h3><p>ارز، اونس، پریمیوم داخلی و شوک‌های هم‌زمان.</p><b>نیازمند مدل مصوب</b></article></>}</section>
            {portfolioMode === "demo" ? <div className="split-grid analysis-grid"><section className="panel allocation-panel"><div className="panel-head"><SectionTitle eyebrow="DEMO ALLOCATION" title="ترکیب سبد نمایشی"/><b className="score">جمع ۱۰۰٪</b></div><div className="allocation-list">{allocationRows.map((row) => { const weight = row.value !== null && portfolioMarketValue ? Math.round((row.value / portfolioMarketValue) * 100) : 0; return <div key={row.holding.id}><div><span>{row.holding.name}</span><b>{weight.toLocaleString("fa-IR")}٪</b></div><span className="allocation-track"><i style={{ width: `${weight}%` }}/></span></div>; })}</div></section><section className="panel scenario-card"><h3>آزمایش فشار سبد</h3><p>درصد شوک فرضی را تغییر بده و نتیجه را فوراً ببین.</p><label>شوک یکسان به سبد<input type="range" min="-50" max="0" step="1" value={stressMove} onChange={(event) => setStressMove(event.target.value)}/><span className="negative">{Number(stressMove).toLocaleString("fa-IR")}٪</span></label><div className="scenario-presets" aria-label="سناریوهای فشار سریع">{[-10, -20, -30, -40].map((move) => <button type="button" className={stressMove === String(move) ? "active" : ""} key={move} onClick={() => setStressMove(String(move))}>{move.toLocaleString("fa-IR")}٪</button>)}</div><div className="scenario-result"><small>ارزش پس از شوک نمایشی</small><strong>{stressScenarioValue === null ? "—" : formatPortfolioMoney(stressScenarioValue)}</strong><p>{stressScenarioValue === null || portfolioMarketValue === null ? "سبد نمایشی را فعال کن." : `افت فرضی: ${formatPortfolioMoney(stressScenarioValue - portfolioMarketValue)}`}</p></div></section></div> : <section className="panel"><EmptyLock title="ابزارهای ریسک آمادهٔ تجربه‌اند" text="با فعال‌کردن سبد نمایشی، وزن دارایی‌ها، تمرکز، بازده نمونه و سناریوی فشار قابل استفاده می‌شوند؛ حالت واقعی همچنان قفل می‌ماند."/></section>}
            {portfolioMode === "demo" && <section className="guardrail"><span>i</span><div><b>این ارزیابی ریسک واقعی نیست</b><p>ارزش‌ها، برچسب نقدشوندگی و شوک‌ها برای آزمون رابط ساخته شده‌اند و روش تخصیص یا پیشنهاد سرمایه‌گذاری محسوب نمی‌شوند.</p></div></section>}
          </section>}

          {view === "data" && <section className="view-stack">
            <div className="view-hero"><SectionTitle eyebrow="DATA TRUST" title="کیفیت، تازگی و منشأ داده" text="این صفحه دلیل قابل استفاده بودن یا نبودن هر عدد را به زبان ساده نشان می‌دهد."/><span className={portfolioMode === "demo" ? "status-chip warning" : "status-chip safe"}>{portfolioMode === "demo" ? "دادهٔ ساختگی فعال" : "حالت fail-closed فعال"}</span></div>
            <section className="data-cards">
              <article><small>منابع در دسترس</small><strong>{(portfolioMode === "demo" ? 1 : connectedSourceCount).toLocaleString("fa-IR")}</strong><p>{portfolioMode === "demo" ? "فقط آزمایشگاه ساختگی اشا" : "API، خوراک موقت و Snapshot دستی تفکیک می‌شوند."}</p></article>
              <article><small>{portfolioMode === "demo" ? "رکوردهای ساختگی" : "رکوردهای تازه"}</small><strong>{effectiveLiveQuoteCount.toLocaleString("fa-IR")}</strong><p>{portfolioMode === "demo" ? sandboxMethodology.datasetId : "فقط رکورد عبورکرده از اعتبارسنجی نمایش داده می‌شود."}</p></article>
              <article><small>رکورد قرنطینه</small><strong>۰</strong><p>{portfolioMode === "demo" ? "مجموعهٔ تمرینی ثابت و از پیش اعتبارسنجی‌شده" : "خطا جایگزین عدد قبلی یا عدد ساختگی نمی‌شود."}</p></article>
              <article><small>نرخ تبدیل دلار</small><strong className="rate-card-value">{isUsableUsdTomanRate(marketUsdTomanRate) ? `۱ USD = ${formatToman(marketUsdTomanRate)}` : "نامشخص"}</strong><p>{isUsableUsdTomanRate(marketUsdTomanRate) ? `منبع: ${usdTomanQuote?.sourceName ?? "نامشخص"} · ${usdTomanQuote?.status === "valid" ? "تازه" : "منقضی"}` : "معادل دلاری بدون نرخ معتبر ساخته نمی‌شود."}</p></article>
              <article><small>آخرین دریافت</small><strong>{portfolioMode === "demo" ? formatFreshness(sandboxCollectedAt) : feed ? formatFreshness(feed.collectedAt) : "نامشخص"}</strong><p>{portfolioMode === "demo" ? "زمان فعال‌سازی مجموعهٔ تمرینی" : "زمان دریافت مستقل از زمان انتشار ثبت می‌شود."}</p></article>
            </section>
            <section className="panel engine-readiness"><div className="panel-head"><SectionTitle eyebrow="OPERATIONAL READINESS" title="وضعیت موتورهای اشا" text="آماده‌بودن رابط با آماده‌بودن تصمیم مالی یکی نیست؛ وضعیت واقعی و آزمایشی هرگز با هم ادغام نمی‌شوند."/><a className="source-action" href="/api/health" target="_blank" rel="noreferrer">خروجی سلامت واقعی JSON ↗</a></div>
              <div className="engine-readiness-grid">{portfolioMode === "demo" ? <>
                <article className="demo-ready"><span>رابط و سبد</span><b>فعال آزمایشی</b><small>۱۰ موقعیت ساختگی در نشست مرورگر</small></article>
                <article className="demo-ready"><span>خوراک بازار</span><b>{sandboxQuotes.length.toLocaleString("fa-IR")} قیمت ساختگی</b><small>{sandboxMethodology.datasetId}</small></article>
                <article className="demo-ready"><span>دادهٔ ایران</span><b>{effectiveFreshIranQuoteCount.toLocaleString("fa-IR")} رکورد ساختگی</b><small>بدون ادعای تازگی بازار</small></article>
                <article className="demo-ready"><span>سناریو</span><b>فعال آزمایشی</b><small>{scenarioMethodology.id}</small></article>
                <article className="demo-ready"><span>ذخیرهٔ نشست</span><b>فعال محلی</b><small>دادهٔ شخصی در سرور ذخیره نمی‌شود</small></article>
                <article className="demo-ready"><span>تصمیم</span><b>فعال آزمایشی</b><small>{sandboxMethodology.id} · بدون اجرا</small></article>
              </> : <>
                <article className="ready"><span>رابط و سبد</span><b>آمادهٔ ارزیابی</b><small>ثبت و سبد نمایشی در همین مرورگر</small></article>
                <article className={liveQuoteCount > 0 ? "ready" : "blocked"}><span>خوراک بازار</span><b>{liveQuoteCount > 0 ? `${liveQuoteCount.toLocaleString("fa-IR")} قیمت تازه` : "بدون قیمت تازه"}</b><small>منبع، زمان و تازگی کنترل می‌شود</small></article>
                <article className={freshIranQuoteCount > 0 ? "ready" : "blocked"}><span>دادهٔ ایران</span><b>{freshIranQuoteCount > 0 ? "خوراک تازه موجود" : "قرارداد/API ناقص"}</b><small>Snapshot منقضی جای API عملیاتی را نمی‌گیرد</small></article>
                <article className="demo"><span>سناریو</span><b>فقط نمایشی</b><small>WHAT_IF_UI_V1 کالیبره نشده</small></article>
                <article className="blocked"><span>ذخیرهٔ مرکزی</span><b>فقط اپراتور محلی</b><small>عمومی: بدون حساب و دیتابیس سبد</small></article>
                <article className="blocked"><span>تصمیم مالی</span><b>قفل ایمنی</b><small>{decisionReadiness.passedCount.toLocaleString("fa-IR")} از ۶ دروازه آماده</small></article>
              </>}</div>
            </section>
            <OperatorCsvImport key={portfolioMode} demoMode={portfolioMode === "demo"}/>
            <section className="panel audit-timeline"><h3>زنجیرهٔ اعتماد هر قیمت</h3>{["شناسه ابزار و واحد", "شناسه و قرارداد منبع", "زمان انتشار به UTC", "زمان دریافت به UTC", "اعتبارسنجی قطعی", "نسخهٔ تبدیل و اثر انگشت رکورد"].map((item, index) => <div key={item}><span>{(index + 1).toLocaleString("fa-IR")}</span><p>{item}</p><b>{portfolioMode === "demo" ? "آمادهٔ آزمایشی" : index < 5 && liveQuoteCount ? "ثبت شده" : index < 2 ? "تعریف شده" : "در انتظار داده"}</b></div>)}</section>
          </section>}

          {view === "agents" && <section className="view-stack"><div className="view-hero"><SectionTitle eyebrow="ASHA REVIEW BOARD" title="اشا و هیئت بررسی چندتخصصی" text="اشا دستیار تصمیم پروژه است و بررسی‌های امنیت، مالی، داده و تجربهٔ کاربری را هماهنگ می‌کند؛ به حساب مالی، معامله یا کلیدهای خصوصی دسترسی ندارد."/><span className="status-chip safe">فقط بررسی</span></div><section className="agent-grid"><article><h3>امنیت</h3><p>رازها، دسترسی، زنجیره تأمین و مرز دادهٔ شخصی.</p><b>Plugin نصب شده</b></article><article><h3>داده و مالی</h3><p>منشأ، point-in-time، صحت محاسبات و سوگیری آزمون.</p><b>Plugin نصب شده</b></article><article><h3>محصول و UI</h3><p>RTL، دسترس‌پذیری و فهم‌پذیری برای مالک پروژه.</p><b>Plugin نصب شده</b></article><article><h3>تست و بازبینی</h3><p>رفتار قطعی، رگرسیون و کنترل کیفیت انتشار.</p><b>Plugin نصب شده</b></article></section><section className="guardrail"><div><b>نصب به معنی اجرای دائمی نیست</b><p>در هر Task، Codex تخصص مرتبط را بر اساس درخواست فراخوانی می‌کند. خروجی مالی همچنان باید از موتور قطعی و آزموده‌شده بیاید.</p></div></section></section>}
        </div>
        <footer><span>اشا · دستیار تصمیم زر و سیم · نسخهٔ ارزیابی Phase 1</span><span>{portfolioMode === "demo" ? "آزمایشگاه فعال · همهٔ داده‌ها ساختگی · بدون اجرای معامله" : "سبد فقط در همین مرورگر · بدون قیمت ساختگی · بدون معاملهٔ خودکار"} · <b>حالت امن</b></span></footer>
      </main>

      {notificationOpen && <div className="notification-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setNotificationOpen(false); }}>
        <aside className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title">
          <div className="notification-head"><div><span>MARKET ALERTS</span><h2 id="notification-title">مرکز نوتیفیکیشن</h2><p>هشدارها هنگام دریافت یا بروزرسانی قیمت‌ها بررسی می‌شوند.</p></div><button onClick={() => setNotificationOpen(false)} aria-label="بستن اعلان‌ها">×</button></div>
          <div className="notification-toolbar"><div className="notification-filters">{(["all", "volatility", "opportunity", "data"] as NotificationFilter[]).map((filter) => <button key={filter} className={notificationFilter === filter ? "active" : ""} onClick={() => setNotificationFilter(filter)}>{filter === "all" ? "همه" : notificationKindLabel(filter)}</button>)}</div>{unreadNotificationCount > 0 && <button className="text-button" onClick={markAllNotificationsRead}>خواندن همه</button>}</div>
          <div className="notification-list">{visibleNotifications.length > 0 ? visibleNotifications.map((notification) => <button className={`notification-item ${notification.read ? "read" : "unread"}`} key={notification.id} onClick={() => markNotificationRead(notification.id)}><span className={`notification-symbol ${notification.kind}`}>{notification.kind === "volatility" ? "!" : notification.kind === "opportunity" ? "◇" : "i"}</span><span><span className="notification-meta"><b>{notificationKindLabel(notification.kind)}</b>{notification.demo && <em>نمایشی</em>}<time>{formatNotificationTime(notification.createdAt)}</time></span><strong>{notification.title}</strong><small>{notification.message}</small></span></button>) : <div className="notification-empty"><span>◇</span><strong>{notificationFilter === "opportunity" ? "فرصت تأییدشده‌ای وجود ندارد" : "اعلانی در این بخش نیست"}</strong><p>{notificationFilter === "opportunity" ? "اعلان فرصت واقعی فقط پس از تعریف روش، دادهٔ تاریخی، بک‌تست و walk-forward فعال می‌شود." : "با بروزرسانی قیمت یا فعال‌کردن سبد نمایشی، اعلان‌های مرتبط اینجا ظاهر می‌شوند."}</p></div>}</div>
          <div className="notification-policy"><b>مرز ایمنی اعلان فرصت</b><p>افت قیمت به‌تنهایی «فرصت جذاب» نیست. سیستم واقعی تا قبل از مدل تأییدشده فقط نوسان شدید و مشکل کیفیت داده را هشدار می‌دهد.</p></div>
        </aside>
      </div>}

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeHoldingModal(); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title">
          <div className="modal-head"><div><span>MY PORTFOLIO</span><h2 id="asset-dialog-title">{editingHolding ? "ویرایش دارایی" : "ثبت دارایی من"}</h2></div><button onClick={closeHoldingModal} aria-label="بستن">×</button></div>
          <p className="modal-note">{editingHolding ? "تغییرات این دارایی در همین نشست مرورگر ذخیره می‌شود." : "این اطلاعات فقط در نشست فعلی مرورگر ذخیره می‌شود و به هیچ سرویس بیرونی ارسال نمی‌شود."}</p>
          <form key={editingHolding?.id ?? "new-holding"} onSubmit={saveHolding}>
            <div className="form-row">
              <label>دستهٔ دارایی<select required value={selectedAssetCategory} onChange={(event) => { setSelectedAssetCategory(event.target.value); setSelectedAssetName(""); }}><option value="" disabled>ابتدا دسته را انتخاب کنید</option>{assetCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
              <label>نوع دارایی<select name="name" required disabled={!selectedAssetCategory} value={selectedAssetName} onChange={(event) => setSelectedAssetName(event.target.value)}><option value="" disabled>{selectedAssetCategory ? "نوع دارایی را انتخاب کنید" : "در انتظار انتخاب دسته"}</option>{filteredAssetOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>مقدار<input name="amount" type="number" min="0.000001" step="any" required placeholder="مثلاً ۲.۵" defaultValue={editingHolding?.amount}/></label>
              <label>واحد<select key={selectedAssetName} name="unit" required disabled={!selectedAssetName} defaultValue={editingHolding?.unit ?? availableUnits[0] ?? ""}>{availableUnits.length === 0 && <option value="">ابتدا دارایی را انتخاب کنید</option>}{availableUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            </div>
            <label>بهای خرید کل (تومان)<input name="cost" type="number" min="0" step="1000" placeholder="اختیاری" defaultValue={editingHolding?.costToman ?? undefined}/></label>
            <PersianDatePicker key={`${editingHolding?.id ?? "new"}-${editingHolding?.purchaseDate ?? "none"}`} name="purchaseDate" initialValue={purchaseDateForPicker(editingHolding?.purchaseDate)} />
            <label>یادداشت<input name="note" maxLength={80} placeholder="مثلاً نگهداری بلندمدت" defaultValue={editingHolding?.note}/></label>
            <div className="modal-actions"><button type="button" className="ghost-button" onClick={closeHoldingModal}>انصراف</button><button className="primary-button" type="submit">{editingHolding ? "ذخیرهٔ تغییرات" : "ثبت در نشست فعلی"}</button></div>
          </form>
        </section>
      </div>}

      {pendingDeleteHolding && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPendingDeleteHoldingId(null); }}>
        <section className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
          <div className="modal-head"><div><span>CONFIRM</span><h2 id="delete-dialog-title">حذف {pendingDeleteHolding.name}؟</h2></div><button onClick={() => setPendingDeleteHoldingId(null)} aria-label="بستن">×</button></div>
          <p className="modal-note" id="delete-dialog-description">این دارایی فقط از سبد همین مرورگر حذف می‌شود. در حالت آزمایشی می‌توانی با بارگذاری دوبارهٔ تجربهٔ کامل آن را برگردانی.</p>
          <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setPendingDeleteHoldingId(null)}>انصراف</button><button type="button" className="danger-button" onClick={confirmDeleteHolding}>حذف دارایی</button></div>
        </section>
      </div>}
    </div>
  );
}

function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: SortDirection; onClick: () => void }) {
  return <button type="button" className={active ? "sort-button active" : "sort-button"} onClick={onClick} aria-label={`${label}؛ مرتب‌سازی ${active && direction === "desc" ? "نزولی" : "صعودی"}`}><span>{label}</span><i aria-hidden="true">{active ? direction === "desc" ? "↓" : "↑" : "↕"}</i></button>;
}

function HorizonToggle({ value, onChange }: { value: AnalysisHorizon; onChange: (value: AnalysisHorizon) => void }) {
  return <div className="horizon-toggle" role="group" aria-label="افق تحلیل"><button type="button" className={value === "short" ? "active" : ""} onClick={() => onChange("short")}>کوتاه‌مدت</button><button type="button" className={value === "long" ? "active" : ""} onClick={() => onChange("long")}>بلندمدت</button></div>;
}

function MarketTable({ rows, quotes, usdTomanRate }: { rows: Instrument[]; quotes: Map<string, LiveQuote>; usdTomanRate: number | null }) {
  const [sort, setSort] = useState<{ key: MarketSortKey; direction: SortDirection }>({ key: "price", direction: "desc" });
  const toggleSort = (key: MarketSortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const leftQuote = quotes.get(left.code);
    const rightQuote = quotes.get(right.code);
    const values: Record<MarketSortKey, [string | number | null, string | number | null]> = {
      instrument: [left.name, right.name],
      market: [left.market, right.market],
      price: [quoteComparableToman(leftQuote, usdTomanRate), quoteComparableToman(rightQuote, usdTomanRate)],
      freshness: [leftQuote ? new Date(quoteObservedAt(leftQuote)).getTime() : null, rightQuote ? new Date(quoteObservedAt(rightQuote)).getTime() : null],
      source: [leftQuote?.sourceName ?? null, rightQuote?.sourceName ?? null],
    };
    const [a, b] = values[sort.key];
    if (a === null) return 1;
    if (b === null) return -1;
    const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b, "fa") : Number(a) - Number(b);
    return sort.direction === "desc" ? -result : result;
  }), [quotes, rows, sort, usdTomanRate]);
  return <div className="market-table"><div className="market-row market-head"><SortButton label="نماد" active={sort.key === "instrument"} direction={sort.direction} onClick={() => toggleSort("instrument")}/><SortButton label="بازار" active={sort.key === "market"} direction={sort.direction} onClick={() => toggleSort("market")}/><SortButton label="آخرین قیمت (تومان · دلار)" active={sort.key === "price"} direction={sort.direction} onClick={() => toggleSort("price")}/><SortButton label="تازگی" active={sort.key === "freshness"} direction={sort.direction} onClick={() => toggleSort("freshness")}/><SortButton label="منشأ" active={sort.key === "source"} direction={sort.direction} onClick={() => toggleSort("source")}/></div>{sortedRows.map((row) => {
    const quote = quotes.get(row.code);
    return <div className="market-row" key={row.code}><span className="instrument"><i className={row.tone}>{row.icon}</i><span><strong>{row.name}</strong><small>{row.code}</small></span></span><span>{row.market}</span>{quote?.status === "valid" ? <strong className="live-value">{formatQuote(quote, usdTomanRate)}</strong> : quote ? <strong className="no-data">منقضی؛ قیمت جاری ناموجود</strong> : <strong className="no-data">—</strong>}{quote ? <span className={quote.status === "valid" ? "fresh" : "pending"}>{formatFreshness(quote.publishedAt ?? quote.collectedAt)}</span> : <span className="pending">در انتظار</span>}{quote ? quote.sourceId === "asha-sandbox" ? <span className="source-link sandbox-source-label"><span>{quote.sourceName}</span><small>ساختگی · نسخه‌دار</small></span> : <a className="source-link" href={quote.sourceUrl} target="_blank" rel="noreferrer"><span>{quote.sourceName}</span><small>{sourceQualityLabel(quote.quality)}</small></a> : <span className="source-none">تعریف نشده</span>}</div>;
  })}</div>;
}

function BubbleTable({ rows, demoMode }: { rows: Array<{ holding: Holding; applicable: boolean; current: number | null; minimum: number | null; average: number | null; maximum: number | null }>; demoMode: boolean }) {
  const [sort, setSort] = useState<{ key: BubbleSortKey; direction: SortDirection }>({ key: "current", direction: "desc" });
  const toggleSort = (key: BubbleSortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const values: Record<BubbleSortKey, [string | number | null, string | number | null]> = {
      name: [left.holding.name, right.holding.name], current: [left.current, right.current], minimum: [left.minimum, right.minimum], average: [left.average, right.average], maximum: [left.maximum, right.maximum],
    };
    const [a, b] = values[sort.key];
    if (a === null && b === null) return left.holding.name.localeCompare(right.holding.name, "fa");
    if (a === null) return 1;
    if (b === null) return -1;
    const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b, "fa") : Number(a) - Number(b);
    return sort.direction === "desc" ? -result : result;
  }), [rows, sort]);
  const metricText = (value: number | null, applicable: boolean) => value !== null ? formatPercent(value) : demoMode && !applicable ? "نامرتبط" : "نیازمند تاریخچه";
  return <div className="bubble-table"><div className="bubble-row bubble-head"><SortButton label="دارایی" active={sort.key === "name"} direction={sort.direction} onClick={() => toggleSort("name")}/><SortButton label="حباب فعلی" active={sort.key === "current"} direction={sort.direction} onClick={() => toggleSort("current")}/><SortButton label="کمترین حباب" active={sort.key === "minimum"} direction={sort.direction} onClick={() => toggleSort("minimum")}/><SortButton label="میانگین حباب" active={sort.key === "average"} direction={sort.direction} onClick={() => toggleSort("average")}/><SortButton label="بیشترین حباب" active={sort.key === "maximum"} direction={sort.direction} onClick={() => toggleSort("maximum")}/></div>{sortedRows.map((row) => <div className="bubble-row" key={row.holding.id}><b>{row.holding.name}</b><span className={row.current === null ? "no-data" : row.current < 0 ? "negative" : "positive"}>{row.current === null ? demoMode && !row.applicable ? "نامرتبط" : "قابل محاسبه نیست" : formatPercent(row.current)}</span><span className={row.minimum === null ? "history-pending" : "sandbox-history"}>{metricText(row.minimum, row.applicable)}</span><span className={row.average === null ? "history-pending" : "sandbox-history"}>{metricText(row.average, row.applicable)}</span><span className={row.maximum === null ? "history-pending" : "sandbox-history"}>{metricText(row.maximum, row.applicable)}</span></div>)}</div>;
}

function formatQuote(quote: LiveQuote, usdTomanRate: number | null) {
  if (quote.currency === "USD") return `${formatUsd(quote.value)} · ${isUsableUsdTomanRate(usdTomanRate) ? formatToman(quote.value * usdTomanRate) : "معادل تومانی نامشخص"}`;
  return formatTomanAndUsd(quote.value, usdTomanRate);
}

function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪`;
}

function quoteComparableToman(quote: LiveQuote | undefined, usdTomanRate: number | null) {
  if (!quote || quote.status !== "valid") return null;
  if (quote.currency === "TOMAN") return quote.value;
  return isUsableUsdTomanRate(usdTomanRate) ? quote.value * usdTomanRate : null;
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

function calculateHoldingBubble(name: string, quotes: Map<string, LiveQuote>) {
  const specification = bubbleSpecifications[name];
  if (!specification) return null;
  const marketQuote = quotes.get(specification.instrumentCode);
  const referenceQuote = quotes.get(specification.referenceCode);
  const usdQuote = quotes.get("USD_IRR");
  if (!marketQuote || marketQuote.status !== "valid" || marketQuote.currency !== "TOMAN") return null;
  if (!referenceQuote || referenceQuote.status !== "valid" || referenceQuote.currency !== "USD") return null;
  if (!usdQuote || usdQuote.status !== "valid" || usdQuote.currency !== "TOMAN") return null;
  return calculatePremiumPercent(marketQuote.value, referenceQuote.value, usdQuote.value, specification.pureGrams);
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
