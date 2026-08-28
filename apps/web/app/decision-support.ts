export type DecisionMode = "homogeneous" | "heterogeneous" | "best";

export type AssetClassId =
  | "gold"
  | "silver"
  | "commodity_certificate"
  | "currency"
  | "cash"
  | "capital_market"
  | "crypto"
  | "real_assets"
  | "private_assets"
  | "credit"
  | "intellectual_property"
  | "other";

export type DecisionGateInput = {
  hasPortfolio: boolean;
  portfolioFullyValued: boolean;
  hasFreshIranData: boolean;
  methodologyApproved: boolean;
  historicalValidationPassed: boolean;
  ownerConstraintsDefined: boolean;
};

export type OwnerDecisionConstraints = {
  liquidityReservePercent: string;
  maxSingleAssetPercent: string;
  maxAcceptableDrawdownPercent: string;
  shortTermMonths: string;
  longTermYears: string;
};

export const emptyOwnerDecisionConstraints: OwnerDecisionConstraints = {
  liquidityReservePercent: "",
  maxSingleAssetPercent: "",
  maxAcceptableDrawdownPercent: "",
  shortTermMonths: "",
  longTermYears: "",
};

export const ownerConstraintFields: Array<{
  key: keyof OwnerDecisionConstraints;
  label: string;
  suffix: string;
  min: number;
  max: number;
}> = [
  { key: "liquidityReservePercent", label: "حداقل ذخیرهٔ نقد", suffix: "٪", min: 0, max: 100 },
  { key: "maxSingleAssetPercent", label: "حداکثر وزن یک دارایی", suffix: "٪", min: 1, max: 100 },
  { key: "maxAcceptableDrawdownPercent", label: "حداکثر افت قابل‌تحمل", suffix: "٪", min: 1, max: 100 },
  { key: "shortTermMonths", label: "افق کوتاه‌مدت", suffix: "ماه", min: 1, max: 24 },
  { key: "longTermYears", label: "افق بلندمدت", suffix: "سال", min: 1, max: 20 },
];

export function evaluateOwnerDecisionConstraints(input: OwnerDecisionConstraints) {
  const fields = ownerConstraintFields.map((field) => {
    const value = Number(input[field.key]);
    const valid = input[field.key].trim() !== "" && Number.isFinite(value) && value >= field.min && value <= field.max;
    return { ...field, value: valid ? value : null, valid };
  });
  return {
    complete: fields.every((field) => field.valid),
    completedCount: fields.filter((field) => field.valid).length,
    fields,
  };
}

export const decisionFramework = {
  id: "DECISION_FRAMEWORK_UI_V1",
  version: "1.0.0",
  status: "ui_only",
  limitation: "این نسخه فقط نوع تصمیم و دروازه‌های لازم را ساختاربندی می‌کند؛ آستانه، وزن، رتبه‌بندی یا توصیهٔ مالی تولید نمی‌کند.",
};

const assetClasses: Record<string, { id: AssetClassId; label: string }> = {
  "طلای ۱۸ عیار": { id: "gold", label: "طلا" },
  "طلای ۲۴ عیار": { id: "gold", label: "طلا" },
  "مثقال طلا": { id: "gold", label: "طلا" },
  "سکه امامی": { id: "gold", label: "طلا" },
  "سکه بهار آزادی": { id: "gold", label: "طلا" },
  "نیم سکه": { id: "gold", label: "طلا" },
  "ربع سکه": { id: "gold", label: "طلا" },
  "سکه یک گرمی": { id: "gold", label: "طلا" },
  "شمش نقره ۹۹۹": { id: "silver", label: "نقره" },
  "گواهی سپرده کالایی": { id: "commodity_certificate", label: "گواهی کالایی" },
  "ارز خارجی": { id: "currency", label: "ارز" },
  "وجه نقد و سپرده بانکی": { id: "cash", label: "نقد و سپرده" },
  "سهام": { id: "capital_market", label: "بازار سرمایه" },
  "صندوق سرمایه‌گذاری و ETF": { id: "capital_market", label: "بازار سرمایه" },
  "رمزارز": { id: "crypto", label: "دارایی دیجیتال" },
  "ملک و زمین": { id: "real_assets", label: "دارایی واقعی" },
  "خودرو و تجهیزات": { id: "real_assets", label: "دارایی واقعی" },
  "کسب‌وکار خصوصی": { id: "private_assets", label: "سرمایه‌گذاری خصوصی" },
  "طلب و وام پرداختی": { id: "credit", label: "اعتبار و مطالبات" },
  "دارایی دیجیتال و مالکیت فکری": { id: "intellectual_property", label: "مالکیت فکری" },
};

export function getAssetClass(name: string) {
  return assetClasses[name] ?? { id: "other" as const, label: "سایر دارایی‌ها" };
}

export function getSameClassCandidates(name: string, universe: string[]) {
  const assetClass = getAssetClass(name).id;
  return universe.filter((candidate) => candidate !== name && getAssetClass(candidate).id === assetClass);
}

export function evaluateDecisionGates(input: DecisionGateInput) {
  const gates = [
    { id: "portfolio", label: "سبد ثبت‌شده", passed: input.hasPortfolio },
    { id: "valuation", label: "ارزش‌گذاری کامل", passed: input.portfolioFullyValued },
    { id: "iran-data", label: "دادهٔ تازهٔ ایران", passed: input.hasFreshIranData },
    { id: "constraints", label: "محدودیت‌های مالک", passed: input.ownerConstraintsDefined },
    { id: "methodology", label: "روش مصوب", passed: input.methodologyApproved },
    { id: "validation", label: "بک‌تست و walk-forward", passed: input.historicalValidationPassed },
  ];
  const operational = gates.every((gate) => gate.passed);
  const safeAction = !input.hasPortfolio
    ? "ابتدا سبد دارایی را ثبت کنید"
    : !input.portfolioFullyValued || !input.hasFreshIranData
      ? "تکمیل داده و پایش؛ تصمیم مالی صادر نشد"
      : "پایش و حفظ دروازهٔ ایمنی تا تصویب و اعتبارسنجی روش";
  return { gates, operational, passedCount: gates.filter((gate) => gate.passed).length, safeAction };
}
