import type { PortfolioHolding } from "../data/postgres-portfolio-repository.ts";
import { validPortfolioAmount, validPortfolioCost } from "../data/portfolio-numeric-contract.ts";

export const PURCHASE_BOOK_VERSION = "asha.purchase_book.v1";
export const PURCHASE_DATE_CALENDAR = "gregorian";
export const PURCHASE_TIME_ZONE = "Asia/Tehran";
export const MAX_PURCHASE_LOTS = 500;

// Instrument identity, unit and purity are not inferred from a similar name.
export const purchaseAssetCatalog = [
  { id: "GOLD_18K_IRR", name: "طلای ۱۸ عیار", assetClass: "gold", unit: "gram", displayUnit: "گرم", purityPermille: 750 },
  { id: "GOLD_24K_IRR", name: "طلای ۲۴ عیار", assetClass: "gold", unit: "gram", displayUnit: "گرم", purityPermille: 1000 },
  { id: "MESGHAL_IRR", name: "مثقال طلا", assetClass: "gold", unit: "mesghal", displayUnit: "مثقال", purityPermille: null },
  { id: "EMAMI_COIN_IRR", name: "سکه امامی", assetClass: "coin", unit: "unit", displayUnit: "عدد", purityPermille: null },
  { id: "AZADI_COIN_IRR", name: "سکه بهار آزادی", assetClass: "coin", unit: "unit", displayUnit: "عدد", purityPermille: null },
  { id: "HALF_COIN_IRR", name: "نیم سکه", assetClass: "coin", unit: "unit", displayUnit: "عدد", purityPermille: null },
  { id: "QUARTER_COIN_IRR", name: "ربع سکه", assetClass: "coin", unit: "unit", displayUnit: "عدد", purityPermille: null },
  { id: "GRAM_COIN_IRR", name: "سکه یک گرمی", assetClass: "coin", unit: "unit", displayUnit: "عدد", purityPermille: null },
  { id: "SILVER_999_IRR", name: "شمش نقره ۹۹۹", assetClass: "silver", unit: "gram", displayUnit: "گرم", purityPermille: 999 },
  { id: "SILVER_925_IRR", name: "نقره ۹۲۵", assetClass: "silver", unit: "gram", displayUnit: "گرم", purityPermille: 925 },
  { id: "USD_IRR", name: "دلار آزاد", assetClass: "currency", unit: "usd", displayUnit: "دلار", purityPermille: null },
] as const;
export type PurchaseAsset = typeof purchaseAssetCatalog[number];
export type PurchaseCurrency = "IRR" | "TOMAN" | "USD";
export type PurchaseFx = {
  tomanPerUsd: string; rateDate: string; rateType: string; source: string;
  receivedAt: string; validity: "user_entered_unverified";
};
export type PurchaseLot = {
  id: string; assetId: PurchaseAsset["id"]; assetClass: PurchaseAsset["assetClass"];
  unit: PurchaseAsset["unit"]; purityPermille: number | null;
  quantity: string; purchaseDate: string; purchaseTime: string | null;
  paymentCurrency: PurchaseCurrency; unitPrice: string | null; fees: string | null;
  note: string; source: { kind: "manual" | "xlsx"; reference: string | null }; fx: PurchaseFx | null;
};
export type PurchaseImportReceipt = { fileSha256: string; importedAt: string; lotIds: string[] };
export type PurchaseBook = { version: typeof PURCHASE_BOOK_VERSION; lots: PurchaseLot[]; imports: PurchaseImportReceipt[] };
export type ExactRatio = { numerator: string; denominator: string };
type Ratio = { n: bigint; d: bigint };
const ZERO: Ratio = { n: 0n, d: 1n };
const ONE: Ratio = { n: 1n, d: 1n };
const TEN: Ratio = { n: 10n, d: 1n };

function fail(message: string): never { throw new Error(message); }
function keys(value: unknown, expected: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(" ") !== expected.split(" ").sort().join(" ")) fail("ساختار دفتر خرید یا ردیف آن معتبر نیست.");
}
function text(value: unknown, limit: number, empty = false): asserts value is string {
  if (typeof value !== "string" || value.length > limit || (!empty && !value.trim()) || [...value].some((character) => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)))) fail("متن یا منشأ خرید معتبر نیست.");
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,100}$/.test(value)) fail("شناسهٔ مستقل خرید معتبر نیست.");
}
export function canonicalPurchaseDecimal(raw: string): string {
  if (typeof raw !== "string" || !/^(0|[1-9]\d{0,17})(\.\d{1,12})?$/.test(raw.trim())) fail("عدد باید متن ده‌دهی مثبت با حداکثر ۱۸ رقم صحیح و ۱۲ رقم اعشار باشد.");
  return raw.trim().replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
function decimal(value: unknown, positive = false): asserts value is string {
  if (typeof value !== "string" || canonicalPurchaseDecimal(value) !== value || (positive && value === "0")) fail("مقدار ده‌دهی استاندارد معتبر نیست.");
}
export function validPurchaseDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000")
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}
function timestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("زمان دریافت باید زمان معتبر UTC باشد.");
}

export function validatePurchaseLot(value: unknown): PurchaseLot {
  keys(value, "id assetId assetClass unit purityPermille quantity purchaseDate purchaseTime paymentCurrency unitPrice fees note source fx");
  identifier(value.id);
  const asset = purchaseAssetCatalog.find((item) => item.id === value.assetId);
  if (!asset || value.assetClass !== asset.assetClass || value.unit !== asset.unit || value.purityPermille !== asset.purityPermille) fail("دارایی، کلاس، واحد یا عیار با قرارداد خرید سازگار نیست؛ ادغام حدسی انجام نشد.");
  decimal(value.quantity, true);
  if (asset.unit === "unit" && value.quantity.includes(".")) fail("تعداد سکه باید صحیح باشد.");
  if (!validPurchaseDate(value.purchaseDate) || (value.purchaseTime !== null && (typeof value.purchaseTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.purchaseTime)))) fail("تاریخ میلادی یا ساعت محلی تهران معتبر نیست.");
  if (!["IRR", "TOMAN", "USD"].includes(value.paymentCurrency as string)) fail("ارز پرداخت معتبر نیست.");
  if (value.unitPrice !== null) decimal(value.unitPrice);
  if (value.fees !== null) decimal(value.fees);
  text(value.note, 1000, true);
  keys(value.source, "kind reference");
  if (value.source.kind !== "manual" && value.source.kind !== "xlsx") fail("منشأ خرید معتبر نیست.");
  if (value.source.reference !== null) text(value.source.reference, 200);
  if (value.fx !== null) {
    keys(value.fx, "tomanPerUsd rateDate rateType source receivedAt validity");
    decimal(value.fx.tomanPerUsd, true);
    if (value.fx.rateDate !== value.purchaseDate || value.fx.validity !== "user_entered_unverified") fail("نرخ دلار باید متعلق به همان تاریخ خرید و با برچسب واردشده توسط کاربر باشد.");
    text(value.fx.rateType, 100); text(value.fx.source, 200); timestamp(value.fx.receivedAt);
  }
  // PostgreSQL JSONB does not preserve object key order. Rebuild every nested
  // object in contract order so equal inputs produce equal serialized drafts.
  const lot = value as PurchaseLot;
  return {
    id: lot.id, assetId: lot.assetId, assetClass: lot.assetClass, unit: lot.unit, purityPermille: lot.purityPermille,
    quantity: lot.quantity, purchaseDate: lot.purchaseDate, purchaseTime: lot.purchaseTime,
    paymentCurrency: lot.paymentCurrency, unitPrice: lot.unitPrice, fees: lot.fees, note: lot.note,
    source: { kind: lot.source.kind, reference: lot.source.reference },
    fx: lot.fx === null ? null : { tomanPerUsd: lot.fx.tomanPerUsd, rateDate: lot.fx.rateDate, rateType: lot.fx.rateType,
      source: lot.fx.source, receivedAt: lot.fx.receivedAt, validity: lot.fx.validity },
  };
}
export function emptyPurchaseBook(): PurchaseBook { return { version: PURCHASE_BOOK_VERSION, lots: [], imports: [] }; }
export function validatePurchaseBook(value: unknown): PurchaseBook {
  keys(value, "version lots imports");
  if (value.version !== PURCHASE_BOOK_VERSION || !Array.isArray(value.lots) || value.lots.length > MAX_PURCHASE_LOTS || !Array.isArray(value.imports) || value.imports.length > 500) fail("نسخه یا اندازهٔ دفتر خرید پشتیبانی نمی‌شود.");
  const ids = new Set<string>(); const lots: PurchaseLot[] = [];
  for (const raw of value.lots) {
    const lot = validatePurchaseLot(raw);
    if (ids.has(lot.id)) fail("شناسهٔ خرید تکراری است.");
    ids.add(lot.id); lots.push(lot);
  }
  const hashes = new Set<string>(); const importedIds = new Set<string>(); const imports: PurchaseImportReceipt[] = [];
  for (const receipt of value.imports) {
    keys(receipt, "fileSha256 importedAt lotIds");
    if (typeof receipt.fileSha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.fileSha256) || hashes.has(receipt.fileSha256)) fail("رسید فایل نامعتبر یا تکراری است.");
    hashes.add(receipt.fileSha256); timestamp(receipt.importedAt);
    if (!Array.isArray(receipt.lotIds) || receipt.lotIds.length < 1 || receipt.lotIds.length > MAX_PURCHASE_LOTS || new Set(receipt.lotIds).size !== receipt.lotIds.length) fail("رسید ورود ردیف‌های معتبر ندارد.");
    for (const id of receipt.lotIds) {
      identifier(id);
      if (!ids.has(id) || importedIds.has(id)) fail("خرید ثبت‌شده در رسید وجود ندارد یا منشأ فایل آن تکراری است.");
      importedIds.add(id);
    }
    imports.push({ fileSha256: receipt.fileSha256, importedAt: receipt.importedAt, lotIds: [...receipt.lotIds] });
  }
  return { version: PURCHASE_BOOK_VERSION, lots, imports };
}
export function upsertPurchaseLot(book: PurchaseBook, lot: PurchaseLot): PurchaseBook {
  const next = validatePurchaseBook(book); const validated = validatePurchaseLot(lot);
  const index = next.lots.findIndex((item) => item.id === validated.id);
  if (index < 0) next.lots.push(validated); else next.lots[index] = validated;
  return validatePurchaseBook(next);
}

function gcd(a: bigint, b: bigint): bigint { while (b) { const r = a % b; a = b; b = r; } return a; }
function ratio(n: bigint, d = 1n): Ratio { if (d <= 0n || n < 0n) fail("نسبت مالی نامعتبر است."); const g = gcd(n, d); return { n: n / g, d: d / g }; }
function parse(value: string): Ratio { const [whole, fraction = ""] = value.split("."); return ratio(BigInt(whole + fraction), 10n ** BigInt(fraction.length)); }
function add(a: Ratio, b: Ratio): Ratio {
  // Inputs are reduced. Any remaining common factor of the sum and denominator
  // must divide g; avoiding a full huge-numerator/denominator GCD keeps a bounded
  // book of distinct historical FX rates responsive without sacrificing digits.
  const g = gcd(a.d, b.d); const numerator = a.n * (b.d / g) + b.n * (a.d / g);
  const reduction = gcd(numerator, g);
  return { n: numerator / reduction, d: (a.d / g) * (b.d / reduction) };
}
function multiply(a: Ratio, b: Ratio): Ratio {
  const left = gcd(a.n, b.d); const right = gcd(b.n, a.d);
  return { n: (a.n / left) * (b.n / right), d: (a.d / right) * (b.d / left) };
}
function divide(a: Ratio, b: Ratio): Ratio {
  if (b.n === 0n) fail("تقسیم بر مقدار صفر مجاز نیست.");
  const left = gcd(a.n, b.n); const right = gcd(b.d, a.d);
  return { n: (a.n / left) * (b.d / right), d: (a.d / right) * (b.n / left) };
}
function same(a: Ratio, b: Ratio): boolean { return a.n === b.n && a.d === b.d; }
function output(value: Ratio): ExactRatio { return { numerator: value.n.toString(), denominator: value.d.toString() }; }
function optional(value: Ratio | null): ExactRatio | null { return value === null ? null : output(value); }
function decimalFromNumber(value: number): Ratio {
  const [coefficient, exponentRaw = "0"] = value.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split("."); const exponent = Number(exponentRaw) - fraction.length;
  return exponent < 0 ? ratio(BigInt(whole + fraction), 10n ** BigInt(-exponent)) : ratio(BigInt(whole + fraction) * 10n ** BigInt(exponent));
}
function losslessNumber(value: Ratio): number | null {
  // Convert the exact decimal once. Converting numerator and denominator to
  // floating point separately can lose a representable decimal before division.
  let denominator = value.d; let twos = 0; let fives = 0;
  while (denominator % 2n === 0n) { denominator /= 2n; twos += 1; }
  while (denominator % 5n === 0n) { denominator /= 5n; fives += 1; }
  if (denominator !== 1n) return null;
  const scale = Math.max(twos, fives);
  const digits = (value.n * 2n ** BigInt(scale - twos) * 5n ** BigInt(scale - fives)).toString().padStart(scale + 1, "0");
  const decimalText = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  const candidate = Number(decimalText);
  return Number.isFinite(candidate) && candidate >= 0 && same(decimalFromNumber(candidate), value) ? candidate : null;
}

type LotMath = { quantity: Ratio; purchasePaid: Ratio | null; landedPaid: Ratio | null; purchaseRial: Ratio | null; landedRial: Ratio | null; landedUsd: Ratio | null };
function lotMath(lot: PurchaseLot): LotMath {
  const quantity = parse(lot.quantity);
  const purchasePaid = lot.unitPrice === null ? null : multiply(quantity, parse(lot.unitPrice));
  const landedPaid = purchasePaid === null || lot.fees === null ? null : add(purchasePaid, parse(lot.fees));
  const toRial = lot.paymentCurrency === "IRR" ? ONE : lot.paymentCurrency === "TOMAN" ? TEN : lot.fx === null ? null : multiply(parse(lot.fx.tomanPerUsd), TEN);
  const toUsd = lot.paymentCurrency === "USD" ? ONE : lot.fx === null ? null : divide(lot.paymentCurrency === "TOMAN" ? ONE : divide(ONE, TEN), parse(lot.fx.tomanPerUsd));
  return { quantity, purchasePaid, landedPaid, purchaseRial: purchasePaid === null || toRial === null ? null : multiply(purchasePaid, toRial),
    landedRial: landedPaid === null || toRial === null ? null : multiply(landedPaid, toRial), landedUsd: landedPaid === null || toUsd === null ? null : multiply(landedPaid, toUsd) };
}
export type EvaluatedPurchaseLot = { lot: PurchaseLot; purchasePaid: ExactRatio | null; landedPaid: ExactRatio | null; purchaseRial: ExactRatio | null; landedRial: ExactRatio | null; landedUsd: ExactRatio | null; usdKind: "actual_payment" | "historical_equivalent" | null };
export type PurchaseCoverage = { total: ExactRatio | null; coveredQuantity: ExactRatio; totalQuantity: ExactRatio; complete: boolean; averageCovered: ExactRatio | null; average: ExactRatio | null };
function coverage(rows: { quantity: Ratio; value: Ratio | null }[], totalQuantity: Ratio): PurchaseCoverage {
  let total = ZERO; let covered = ZERO;
  for (const row of rows) if (row.value !== null) { total = add(total, row.value); covered = add(covered, row.quantity); }
  const complete = totalQuantity.n > 0n && same(covered, totalQuantity);
  const averageCovered = covered.n > 0n ? output(divide(total, covered)) : null;
  return { total: covered.n > 0n ? output(total) : null, coveredQuantity: output(covered), totalQuantity: output(totalQuantity), complete, averageCovered, average: complete ? averageCovered : null };
}
export type PurchaseAssetAggregate = {
  id: string; asset: PurchaseAsset; quantity: ExactRatio; legacyQuantity: ExactRatio; sourceLegacyIds: string[]; lotIds: string[];
  purchaseRial: PurchaseCoverage; landedRial: PurchaseCoverage; usd: PurchaseCoverage; paidUsd: PurchaseCoverage; equivalentUsd: PurchaseCoverage;
  byPaymentCurrency: Record<PurchaseCurrency, { purchase: PurchaseCoverage; landed: PurchaseCoverage }>;
  legacyCostToman: ExactRatio | null; holding: PortfolioHolding | null; issues: string[];
};
export type PurchaseMoneyTotal = { total: ExactRatio | null; coveredLotCount: number; totalLotCount: number; legacyHoldingCount: number; complete: boolean };
export type PurchaseBookEvaluation = {
  lots: EvaluatedPurchaseLot[]; assets: PurchaseAssetAggregate[]; holdings: PortfolioHolding[]; projectionIssues: string[];
  totals: Record<"purchaseRial" | "landedRial" | "usd" | "paidUsd" | "equivalentUsd", PurchaseMoneyTotal>;
};

export function evaluatePurchaseBook(input: PurchaseBook, legacyHoldings: readonly PortfolioHolding[] = []): PurchaseBookEvaluation {
  const book = validatePurchaseBook(input);
  const legacyIds = new Set<string>();
  for (const holding of legacyHoldings) {
    if (legacyIds.has(holding.id) || !validPortfolioAmount(holding.amount) || !validPortfolioCost(holding.costToman)) fail("موجودی قدیمی نامعتبر است؛ تبدیل خودکار انجام نشد.");
    legacyIds.add(holding.id);
  }
  const math = new Map(book.lots.map((lot) => [lot.id, lotMath(lot)]));
  const lots: EvaluatedPurchaseLot[] = book.lots.map((lot) => {
    const row = math.get(lot.id)!;
    return { lot, purchasePaid: optional(row.purchasePaid), landedPaid: optional(row.landedPaid), purchaseRial: optional(row.purchaseRial), landedRial: optional(row.landedRial), landedUsd: optional(row.landedUsd),
      usdKind: row.landedUsd === null ? null : lot.paymentCurrency === "USD" ? "actual_payment" : "historical_equivalent" };
  });
  const consumed = new Set<string>(); const assets: PurchaseAssetAggregate[] = []; const projectionIssues: string[] = [];
  for (const asset of purchaseAssetCatalog) {
    const purchases = book.lots.filter((lot) => lot.assetId === asset.id);
    // A legacy record has no canonical identity/purity fields. Only the exact
    // registered label+unit can establish compatibility; aliases are not guessed.
    const legacy = legacyHoldings.filter((holding) => holding.name === asset.name && holding.unit === asset.displayUnit);
    if (!purchases.length && !legacy.length) continue;
    for (const holding of legacy) consumed.add(holding.id);
    const legacyQuantity = legacy.reduce((sum, holding) => add(sum, decimalFromNumber(holding.amount)), ZERO);
    const quantity = purchases.reduce((sum, lot) => add(sum, math.get(lot.id)!.quantity), legacyQuantity);
    const rows = (key: "purchaseRial" | "landedRial" | "landedUsd", kind?: "USD" | "local") => purchases.map((lot) => ({ quantity: math.get(lot.id)!.quantity,
      value: kind && (kind === "USD") !== (lot.paymentCurrency === "USD") ? null : math.get(lot.id)![key] }));
    const purchaseRial = coverage(rows("purchaseRial"), quantity); const landedRial = coverage(rows("landedRial"), quantity);
    const usd = coverage(rows("landedUsd"), quantity); const paidUsd = coverage(rows("landedUsd", "USD"), quantity); const equivalentUsd = coverage(rows("landedUsd", "local"), quantity);
    const byPaymentCurrency = Object.fromEntries((["IRR", "TOMAN", "USD"] as const).map((currency) => {
      const subset = purchases.filter((lot) => lot.paymentCurrency === currency);
      const subsetQuantity = subset.reduce((sum, lot) => add(sum, math.get(lot.id)!.quantity), ZERO);
      return [currency, { purchase: coverage(subset.map((lot) => ({ quantity: math.get(lot.id)!.quantity, value: math.get(lot.id)!.purchasePaid })), subsetQuantity),
        landed: coverage(subset.map((lot) => ({ quantity: math.get(lot.id)!.quantity, value: math.get(lot.id)!.landedPaid })), subsetQuantity) }];
    })) as PurchaseAssetAggregate["byPaymentCurrency"];
    const legacyCost = legacy.some((holding) => holding.costToman === null) ? null : legacy.reduce((sum, holding) => add(sum, decimalFromNumber(holding.costToman!)), ZERO);
    const allNewLanded = purchases.every((lot) => math.get(lot.id)!.landedRial !== null);
    const totalCost = legacyCost === null || !allNewLanded ? null : purchases.reduce((sum, lot) => add(sum, divide(math.get(lot.id)!.landedRial!, TEN)), legacyCost);
    const amount = losslessNumber(quantity); const cost = totalCost === null ? null : losslessNumber(totalCost); const issues: string[] = [];
    if (amount === null || !validPortfolioAmount(amount)) issues.push(`${asset.name}: مقدار دقیق در قرارداد قدیمی قابل نمایش بدون کاهش دقت نیست؛ ارزش‌گذاری متوقف است.`);
    if (totalCost !== null && (cost === null || !validPortfolioCost(cost))) issues.push(`${asset.name}: بهای دقیق در قرارداد قدیمی قابل نمایش بدون کاهش دقت نیست؛ سود و زیان متوقف است.`);
    if (legacy.length) issues.push(`${asset.name}: موجودی قدیمی حفظ شد؛ قیمت واحد، هزینه‌های جانبی و نرخ تاریخی آن بازسازی نشده است.`);
    const id = `purchase:${asset.id}`;
    if (legacyIds.has(id) && !legacy.some((holding) => holding.id === id)) fail("شناسهٔ تجمیع با موجودی قدیمی دیگر تداخل دارد.");
    const holding: PortfolioHolding | null = amount === null || !validPortfolioAmount(amount) ? null : {
      id, name: asset.name, amount, unit: asset.displayUnit, costToman: cost !== null && validPortfolioCost(cost) ? cost : null,
      purchaseDate: null, note: "تجمیع نمایشی موجودی قدیمی و خریدها؛ جزئیات در دفتر خرید محفوظ است.",
    };
    assets.push({ id, asset, quantity: output(quantity), legacyQuantity: output(legacyQuantity), sourceLegacyIds: legacy.map((item) => item.id), lotIds: purchases.map((lot) => lot.id),
      purchaseRial, landedRial, usd, paidUsd, equivalentUsd, byPaymentCurrency, legacyCostToman: optional(legacyCost), holding, issues });
    projectionIssues.push(...issues.filter((issue) => issue.includes("متوقف است")));
  }
  const moneyTotal = (key: "purchaseRial" | "landedRial" | "landedUsd", kind?: "USD" | "local"): PurchaseMoneyTotal => {
    let total = ZERO; let coveredLotCount = 0;
    for (const lot of book.lots) {
      const value = math.get(lot.id)![key];
      if (value === null || (kind && (kind === "USD") !== (lot.paymentCurrency === "USD"))) continue;
      total = add(total, value); coveredLotCount += 1;
    }
    return { total: coveredLotCount ? output(total) : null, coveredLotCount, totalLotCount: book.lots.length, legacyHoldingCount: legacyHoldings.length,
      complete: book.lots.length > 0 && coveredLotCount === book.lots.length && legacyHoldings.length === 0 };
  };
  return { lots, assets, holdings: [...legacyHoldings.filter((holding) => !consumed.has(holding.id)).map((holding) => structuredClone(holding)), ...assets.flatMap((asset) => asset.holding ? [asset.holding] : [])], projectionIssues,
    totals: { purchaseRial: moneyTotal("purchaseRial"), landedRial: moneyTotal("landedRial"), usd: moneyTotal("landedUsd"), paidUsd: moneyTotal("landedUsd", "USD"), equivalentUsd: moneyTotal("landedUsd", "local") } };
}
