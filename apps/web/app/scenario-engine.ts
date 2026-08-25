export type ScenarioDriver = "usd" | "gold" | "silver" | "premium" | "equity" | "crypto" | "property";

export type ScenarioShocks = Record<ScenarioDriver, number>;

export type ScenarioHoldingInput = {
  id: string;
  name: string;
  valueToman: number | null;
};

export const scenarioDrivers: Array<{ key: ScenarioDriver; label: string; hint: string }> = [
  { key: "usd", label: "دلار آزاد", hint: "شوک فرضی نرخ USD/IRR" },
  { key: "gold", label: "اونس جهانی طلا", hint: "شوک فرضی XAU/USD" },
  { key: "silver", label: "اونس جهانی نقره", hint: "شوک فرضی XAG/USD" },
  { key: "premium", label: "پریمیوم داخلی", hint: "شوک فرضی عرضه/تقاضای ابزار داخلی" },
  { key: "equity", label: "سهام و ETF", hint: "شوک فرضی ارزش بازار سهام" },
  { key: "crypto", label: "رمزارز", hint: "شوک فرضی بازار دارایی دیجیتال" },
  { key: "property", label: "ملک و دارایی غیرنقد", hint: "شوک فرضی ارزش اسمی دارایی غیرنقد" },
];

export const emptyScenarioShocks: ScenarioShocks = {
  usd: 0,
  gold: 0,
  silver: 0,
  premium: 0,
  equity: 0,
  crypto: 0,
  property: 0,
};

export const scenarioPresets: Array<{ id: string; label: string; description: string; shocks: ScenarioShocks }> = [
  { id: "neutral", label: "خط مبنا", description: "همهٔ محرک‌ها صفر؛ برای مقایسهٔ قبل و بعد.", shocks: { ...emptyScenarioShocks } },
  { id: "fx-stress", label: "شوک ارزی فرضی", description: "افزایش دلار همراه با فشار بر دارایی‌های ریسکی؛ صرفاً ترکیب ورودی آزمایش.", shocks: { usd: 18, gold: 3, silver: 1, premium: 6, equity: -10, crypto: -12, property: 4 } },
  { id: "metals-up", label: "رونق فلزات فرضی", description: "رشد هم‌زمان طلا و نقره با افزایش محدود پریمیوم داخلی.", shocks: { usd: 2, gold: 14, silver: 18, premium: 4, equity: 0, crypto: -2, property: 0 } },
  { id: "liquidity", label: "فشار نقدشوندگی فرضی", description: "افت دارایی‌های ریسکی و غیرنقد همراه با افزایش دلار و پریمیوم.", shocks: { usd: 12, gold: -4, silver: -9, premium: 8, equity: -20, crypto: -24, property: -14 } },
  { id: "risk-on", label: "رونق ریسک‌پذیری فرضی", description: "رشد سهام و رمزارز همراه با افت دلار و پریمیوم داخلی.", shocks: { usd: -7, gold: -3, silver: 5, premium: -6, equity: 16, crypto: 22, property: 7 } },
];

type Sensitivities = Partial<Record<ScenarioDriver, number>>;

export const scenarioMethodology = {
  id: "WHAT_IF_UI_V1",
  version: "1.0.0",
  status: "demo_only",
  limitation: "ضرایب فقط برای تبدیل ورودی‌های فرضی کاربر به یک تجربهٔ سناریوسازی‌اند؛ کالیبره، بک‌تست یا walk-forward نشده‌اند.",
};

const scenarioSensitivityRules: Record<string, Sensitivities> = {
  "طلای ۱۸ عیار": { usd: 1, gold: 1 },
  "طلای ۲۴ عیار": { usd: 1, gold: 1 },
  "مثقال طلا": { usd: 1, gold: 1 },
  "سکه امامی": { usd: 1, gold: 1, premium: 0.75 },
  "سکه بهار آزادی": { usd: 1, gold: 1, premium: 0.7 },
  "نیم سکه": { usd: 1, gold: 1, premium: 0.85 },
  "ربع سکه": { usd: 1, gold: 1, premium: 0.95 },
  "سکه یک گرمی": { usd: 1, gold: 1, premium: 1 },
  "شمش نقره ۹۹۹": { usd: 1, silver: 1 },
  "گواهی سپرده کالایی": { usd: 0.7, gold: 0.5, silver: 0.2, premium: 0.2 },
  "ارز خارجی": { usd: 1 },
  "وجه نقد و سپرده بانکی": {},
  "سهام": { equity: 1, usd: 0.15 },
  "صندوق سرمایه‌گذاری و ETF": { equity: 0.75, gold: 0.2, usd: 0.2 },
  "رمزارز": { crypto: 1, usd: 0.15 },
  "ملک و زمین": { property: 1, usd: 0.25 },
  "کسب‌وکار خصوصی": { equity: 0.45, property: 0.25, usd: 0.2 },
  "خودرو و تجهیزات": { usd: 0.65, property: 0.15 },
  "طلب و وام پرداختی": {},
  "دارایی دیجیتال و مالکیت فکری": { crypto: 0.35, equity: 0.25, usd: 0.2 },
};

export function calculateScenarioMove(name: string, shocks: ScenarioShocks) {
  const sensitivities = scenarioSensitivityRules[name] ?? {};
  const rawMove = scenarioDrivers.reduce((sum, driver) => sum + shocks[driver.key] * (sensitivities[driver.key] ?? 0), 0);
  return Math.min(200, Math.max(-95, rawMove));
}

export function calculatePortfolioScenario(holdings: ScenarioHoldingInput[], shocks: ScenarioShocks) {
  const rows = holdings.flatMap((holding) => {
    if (holding.valueToman === null || !Number.isFinite(holding.valueToman) || holding.valueToman < 0) return [];
    const movePercent = calculateScenarioMove(holding.name, shocks);
    const projectedValueToman = holding.valueToman * (1 + movePercent / 100);
    return [{ ...holding, movePercent, projectedValueToman, impactToman: projectedValueToman - holding.valueToman }];
  });
  const baseValueToman = rows.reduce((sum, row) => sum + row.valueToman, 0);
  const projectedValueToman = rows.reduce((sum, row) => sum + row.projectedValueToman, 0);
  return {
    rows,
    baseValueToman,
    projectedValueToman,
    impactToman: projectedValueToman - baseValueToman,
    impactPercent: baseValueToman > 0 ? ((projectedValueToman - baseValueToman) / baseValueToman) * 100 : 0,
    coverageCount: rows.length,
    totalCount: holdings.length,
  };
}

export function calculatePremiumPercent(marketValueToman: number, referenceUsdPerOunce: number, usdToman: number, pureGrams: number) {
  if (![marketValueToman, referenceUsdPerOunce, usdToman, pureGrams].every((value) => Number.isFinite(value) && value > 0)) return null;
  const theoreticalValueToman = (referenceUsdPerOunce / 31.1034768) * usdToman * pureGrams;
  return ((marketValueToman / theoreticalValueToman) - 1) * 100;
}
