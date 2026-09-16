// These are the existing PostgreSQL column limits, not display rounding rules.
// Count decimal digits directly: multiplying a Number by 100 would falsely reject
// valid inputs such as 1.01, while Number(raw) can hide excess preference precision.
function fitsDecimal(raw: string, precision: number, scale: number): boolean {
  const text = raw.trim();
  if (text.length > 256 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return false;
  const [coefficient, exponentText = "0"] = text.toLowerCase().split("e");
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return false;
  const [whole, fraction = ""] = coefficient.replace(/^[+-]/, "").split(".");
  const digits = `${whole}${fraction}`.replace(/^0+/, "");
  if (!digits) return true;
  const trailingZeros = digits.length - digits.replace(/0+$/, "").length;
  const integerDigits = Math.max(0, digits.length - fraction.length + exponent);
  const fractionalDigits = Math.max(0, fraction.length - exponent - trailingZeros);
  return integerDigits <= precision - scale && fractionalDigits <= scale;
}

export function validPortfolioAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && fitsDecimal(value.toString(), 38, 12);
}

export function validPortfolioCost(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && fitsDecimal(value.toString(), 38, 2));
}

export const portfolioPreferenceLimits = {
  liquidityReservePercent: [0, 100], maxSingleAssetPercent: [1, 100], maxAcceptableDrawdownPercent: [1, 100], shortTermMonths: [1, 24], longTermYears: [1, 20],
} as const;

export function validPortfolioPreference(key: keyof typeof portfolioPreferenceLimits, raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (raw === "") return true;
  const [minimum, maximum] = portfolioPreferenceLimits[key];
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) return false;
  // The repository sends horizons directly as text to smallint; decimal or
  // exponent forms are not accepted by that PostgreSQL input contract.
  if (key === "shortTermMonths" || key === "longTermYears") return /^\+?\d+$/.test(raw.trim());
  return fitsDecimal(raw, 5, 2);
}
