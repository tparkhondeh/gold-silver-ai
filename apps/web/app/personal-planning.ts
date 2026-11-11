import type { ExactRatio } from "./purchase-book.ts";

export const PERSONAL_PLANNING_VERSION = "asha.personal_planning.v1";
// Representation bounds only; these are not recommended financial amounts or horizons.
export const MAX_PERSONAL_MEDIUM_MONTHS = 32767;
export type PersonalPlanning = {
  version: typeof PERSONAL_PLANNING_VERSION;
  /** Owner-declared free cash designated for planning, not bank balance or asset value. */
  spendableCashToman: string | null;
  mediumTermMonths: number | null;
};
export function emptyPersonalPlanning(): PersonalPlanning {
  return { version: PERSONAL_PLANNING_VERSION, spendableCashToman: null, mediumTermMonths: null };
}
export function canonicalPersonalCashToman(raw: string): string {
  if (typeof raw !== "string" || raw.length > 80 || !/^(0|[1-9]\d{0,35})(\.\d{1,2})?$/.test(raw.trim())) {
    throw new Error("نقد باید مبلغ نامنفی به تومان، با حداکثر ۳۶ رقم صحیح و ۲ رقم اعشار باشد.");
  }
  return raw.trim().replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
export function validatePersonalPlanning(value: unknown): PersonalPlanning {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid personal planning");
  const row = value as Record<string, unknown>;
  const keys = ["version", "spendableCashToman", "mediumTermMonths"];
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))
    || row.version !== PERSONAL_PLANNING_VERSION) throw new Error("invalid personal planning contract");
  if (row.spendableCashToman !== null && (typeof row.spendableCashToman !== "string"
    || canonicalPersonalCashToman(row.spendableCashToman) !== row.spendableCashToman)) throw new Error("invalid personal cash");
  if (row.mediumTermMonths !== null && (!Number.isInteger(row.mediumTermMonths)
    || (row.mediumTermMonths as number) < 1 || (row.mediumTermMonths as number) > MAX_PERSONAL_MEDIUM_MONTHS)) throw new Error("invalid medium horizon");
  return { version: PERSONAL_PLANNING_VERSION, spendableCashToman: row.spendableCashToman as string | null, mediumTermMonths: row.mediumTermMonths as number | null };
}
/** Exact declaration conversion only. It does not approve or allocate trading cash. */
export function personalPlanningCashRial(value: PersonalPlanning): ExactRatio | null {
  const amount = validatePersonalPlanning(value).spendableCashToman;
  if (amount === null) return null;
  const [whole, fraction = ""] = amount.split(".");
  let numerator = BigInt(whole + fraction) * 10n, denominator = 10n ** BigInt(fraction.length);
  let a = numerator, b = denominator;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  numerator /= a; denominator /= a;
  return { numerator: numerator.toString(), denominator: denominator.toString() };
}
