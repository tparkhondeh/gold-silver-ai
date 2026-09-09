import { buildActionFixture, buildActionPlan, validateActionInput, type ActionInput, type ActionPlan } from "./decision-action-plan.ts";

export const SHARED_PORTFOLIO_VERSION = "asha.synthetic.shared_portfolio.v1";
export const SHARED_DOCUMENT_VERSION = "asha.synthetic.shared_document.v1";
export const SHARED_STORAGE_KEY = "asha-shared-synthetic-portfolio-v1";
export const sharedViews = ["overview", "portfolio", "asset-center", "analysis", "decisions", "risk"] as const;
export const unsupportedCatalog = {
  SYNTH_STOCKS: { name: "[ساختگی] سهام", assetClass: "equity", unit: "سهم" },
  SYNTH_FX: { name: "[ساختگی] ارز", assetClass: "currency", unit: "واحد ارز" },
  SYNTH_DEPOSIT: { name: "[ساختگی] سپرده", assetClass: "deposit", unit: "تومان سپرده" },
  SYNTH_ETF: { name: "[ساختگی] صندوق", assetClass: "fund", unit: "واحد صندوق" },
  SYNTH_CRYPTO: { name: "[ساختگی] رمزارز", assetClass: "crypto", unit: "واحد رمزارز" },
  SYNTH_PROPERTY: { name: "[ساختگی] ملک", assetClass: "property", unit: "متر مربع" },
  SYNTH_BUSINESS: { name: "[ساختگی] کسب‌وکار", assetClass: "business", unit: "درصد مالکیت" },
} as const;
export type UnsupportedId = keyof typeof unsupportedCatalog;
export type UnsupportedHolding = { id: UnsupportedId; quantityMilli: number; referencePriceToman: number | null };
export type SharedPortfolio = {
  schemaVersion: typeof SHARED_PORTFOLIO_VERSION;
  portfolioId: "ASHA_SYNTHETIC_SHARED_PORTFOLIO_V1";
  currency: "TOMAN"; quantityScale: 1000; revision: number;
  selectedAssetId: string;
  input: ActionInput;
  unsupported: UnsupportedHolding[];
};
export type SharedEvaluation = {
  state: "ready" | "undecidable"; errors: string[];
  totalToman: string | null; cashToman: string | null;
  values: Record<string, string | null>; weightsBps: Record<string, number | null>;
  plan: ActionPlan | null;
};

export function createSharedPortfolio(): SharedPortfolio {
  return {
    schemaVersion: SHARED_PORTFOLIO_VERSION, portfolioId: "ASHA_SYNTHETIC_SHARED_PORTFOLIO_V1",
    currency: "TOMAN", quantityScale: 1000, revision: 1, selectedAssetId: "SYNTH_GOLD",
    input: buildActionFixture(), unsupported: [],
  };
}

function keys(value: unknown, expected: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(" ") !== expected.split(" ").sort().join(" ")) throw new Error("ساختار سبد مشترک با نسخهٔ فعلی سازگار نیست.");
}

export function validateSharedPortfolio(value: unknown): SharedPortfolio {
  keys(value, "schemaVersion portfolioId currency quantityScale revision selectedAssetId input unsupported");
  const portfolio = value as SharedPortfolio;
  if (portfolio.schemaVersion !== SHARED_PORTFOLIO_VERSION || portfolio.portfolioId !== "ASHA_SYNTHETIC_SHARED_PORTFOLIO_V1" || portfolio.currency !== "TOMAN" || portfolio.quantityScale !== 1000) throw new Error("نسخه، واحد پول یا مقیاس مقدار سبد ناسازگار است؛ تبدیل خودکار انجام نمی‌شود.");
  if (!Number.isSafeInteger(portfolio.revision) || portfolio.revision < 1 || portfolio.revision >= Number.MAX_SAFE_INTEGER) throw new Error("شمارهٔ بازبینی سبد معتبر نیست.");
  const input = validateActionInput(portfolio.input);
  // This adapter has deliberately narrower instrument support than the general lab engine.
  const reference = buildActionFixture().assets;
  if (input.assets.length !== reference.length) throw new Error("این نسخه به سه ابزار تعریف‌شدهٔ طلا، سکه و نقره نیاز دارد؛ مقدار صفر مجاز است.");
  for (const [index, asset] of input.assets.entries()) {
    const expected = reference[index];
    if (["id", "name", "assetClass", "unit", "purityPermille", "lotMilli"].some((key) => asset[key as keyof typeof asset] !== expected[key as keyof typeof expected])) throw new Error("شناسه، ترتیب، کلاس، واحد، عیار یا گام دارایی پشتیبانی نمی‌شود؛ نگاشت حدسی انجام نشد.");
  }
  if (!Array.isArray(portfolio.unsupported) || portfolio.unsupported.length > Object.keys(unsupportedCatalog).length) throw new Error("فهرست دارایی‌های فاقد پشتیبانی معتبر نیست.");
  const ids = new Set(input.assets.map((asset) => asset.id));
  for (const holding of portfolio.unsupported) {
    keys(holding, "id quantityMilli referencePriceToman");
    if (!Object.hasOwn(unsupportedCatalog, holding.id) || ids.has(holding.id)) throw new Error("دارایی ناشناخته یا تکراری است.");
    ids.add(holding.id);
    if (!Number.isSafeInteger(holding.quantityMilli) || holding.quantityMilli < 0 || holding.quantityMilli > 1_000_000_000) throw new Error("مقدار دارایی فاقد پشتیبانی نامعتبر است.");
    if (holding.referencePriceToman !== null && (!Number.isSafeInteger(holding.referencePriceToman) || holding.referencePriceToman < 1 || holding.referencePriceToman > 1_000_000_000)) throw new Error("قیمت دارایی فاقد پشتیبانی نامعتبر است.");
  }
  if (!ids.has(portfolio.selectedAssetId)) throw new Error("دارایی انتخاب‌شده در همین سبد وجود ندارد.");
  return structuredClone(portfolio);
}

export function evaluateSharedPortfolio(draft: SharedPortfolio): SharedEvaluation {
  try {
    const portfolio = validateSharedPortfolio(draft);
    const values: SharedEvaluation["values"] = {};
    for (const asset of [...portfolio.input.assets, ...portfolio.unsupported]) {
      values[asset.id] = asset.referencePriceToman === null ? null : (BigInt(asset.quantityMilli) * BigInt(asset.referencePriceToman) / 1000n).toString();
    }
    const cash = BigInt(portfolio.input.cashToman);
    const total = Object.values(values).some((value) => value === null) ? null : Object.values(values).reduce<bigint>((sum, value) => sum + BigInt(value!), cash);
    const weightsBps: SharedEvaluation["weightsBps"] = {};
    for (const [id, value] of Object.entries({ ...values, SYNTH_CASH: cash.toString() })) weightsBps[id] = total === null || total === 0n || value === null ? null : Number(BigInt(value) * 10_000n / total);
    const errors = portfolio.unsupported.map((holding) => `${unsupportedCatalog[holding.id].name}: روش تصمیم پشتیبانی نمی‌شود${holding.referencePriceToman === null ? " و قیمت موجود نیست" : ""}. این دارایی از بودجه حذف نشده است؛ تصمیم کل سبد متوقف است.`);
    // Never optimize a supported subset while presenting it as the whole portfolio.
    const plan = errors.length ? null : buildActionPlan(portfolio.input);
    return { state: errors.length || plan?.state === "undecidable" ? "undecidable" : "ready", errors, totalToman: total?.toString() ?? null, cashToman: cash.toString(), values, weightsBps, plan };
  } catch (error) {
    return { state: "undecidable", errors: [error instanceof Error ? error.message : "سبد قابل‌محاسبه نیست."], totalToman: null, cashToman: null, values: {}, weightsBps: {}, plan: null };
  }
}

export function replaceSharedInput(portfolio: SharedPortfolio, input: ActionInput): SharedPortfolio {
  return { ...portfolio, revision: portfolio.revision + 1, input: structuredClone(input) };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function encodeSharedPortfolio(portfolio: SharedPortfolio): string {
  const input = validateSharedPortfolio(portfolio);
  return canonical({ schemaVersion: SHARED_DOCUMENT_VERSION, portfolio: input, result: evaluateSharedPortfolio(input) });
}

export function decodeSharedPortfolio(document: string): SharedPortfolio {
  if (document.length > 1_000_000) throw new Error("اندازهٔ نسخهٔ ذخیره‌شده بیش از حد مجاز است.");
  const payload = JSON.parse(document);
  keys(payload, "schemaVersion portfolio result");
  if (document !== canonical(payload)) throw new Error("سند باید دقیقاً در قالب ذخیرهٔ استاندارد باشد؛ کلید تکراری یا قالب مبهم پذیرفته نیست.");
  if (payload.schemaVersion !== SHARED_DOCUMENT_VERSION) throw new Error("نسخهٔ سند ذخیره‌شده پشتیبانی نمی‌شود.");
  const portfolio = validateSharedPortfolio(payload.portfolio);
  if (canonical(payload.result) !== canonical(evaluateSharedPortfolio(portfolio))) throw new Error("نتیجهٔ ذخیره‌شده با محاسبهٔ دوباره تطبیق ندارد؛ نسخهٔ فعلی حفظ شد.");
  return portfolio;
}
