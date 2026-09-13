import { validateActionInput, type ActionInput } from "./decision-action-plan.ts";
import { TROY_OUNCE_GRAMS } from "./scenario-engine.ts";

export const METAL_REFERENCE_VERSION = "asha.synthetic.metal_references.v1";
export const METAL_DIAGNOSTIC_VERSION = "asha.synthetic.raw_metal_premium.v1";
export const referenceCodes = ["USD_TOMAN", "XAU_USD", "XAG_USD"] as const;
export type ReferenceCode = typeof referenceCodes[number];
const units = { USD_TOMAN: "TOMAN_PER_USD", XAU_USD: "USD_CENT_PER_TROY_OUNCE", XAG_USD: "USD_CENT_PER_TROY_OUNCE" } as const;
export type MetalReferences = {
  schemaVersion: typeof METAL_REFERENCE_VERSION; datasetKind: "synthetic_fixture";
  sourceId: "ASHA_SYNTHETIC_METAL_REFERENCE_V1";
  quotes: { code: ReferenceCode; unit: typeof units[ReferenceCode]; value: number | null; quotedOn: string; validUntil: string }[];
};

export function emptyMetalReferences(): MetalReferences {
  return { schemaVersion: METAL_REFERENCE_VERSION, datasetKind: "synthetic_fixture", sourceId: "ASHA_SYNTHETIC_METAL_REFERENCE_V1",
    quotes: referenceCodes.map(code => ({ code, unit: units[code], value: null, quotedOn: "2000-01-01", validUntil: "2000-01-07" })) };
}

// Deliberately artificial round-number UI test inputs, never a market fallback.
export function exampleMetalReferences(): MetalReferences {
  const result = emptyMetalReferences();
  result.quotes.forEach((quote, i) => { quote.value = [1000, 40000, 2000][i]; });
  return result;
}

function keys(value: unknown, expected: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(" ") !== expected.split(" ").sort().join(" ")) throw new Error("ساختار مرجع فلز با نسخهٔ ثبت‌شده سازگار نیست.");
}
function date(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9997-12-31" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("تاریخ مرجع فلز معتبر نیست.");
}
export function validateMetalReferences(value: unknown): MetalReferences {
  keys(value, "schemaVersion datasetKind sourceId quotes");
  const input = value as MetalReferences;
  if (input.schemaVersion !== METAL_REFERENCE_VERSION || input.datasetKind !== "synthetic_fixture" || input.sourceId !== "ASHA_SYNTHETIC_METAL_REFERENCE_V1") throw new Error("این قرارداد فقط مرجع فلز ساختگیِ نسخه‌دار را می‌پذیرد.");
  if (!Array.isArray(input.quotes) || input.quotes.length !== 3) throw new Error("سه جایگاه مرجع ارز، اونس طلا و اونس نقره لازم است؛ مقدار ناموجود باید خالی بماند.");
  for (const [i, quote] of input.quotes.entries()) {
    keys(quote, "code unit value quotedOn validUntil");
    if (quote.code !== referenceCodes[i] || quote.unit !== units[quote.code]) throw new Error("ترتیب، نماد یا واحد مرجع فلز ناسازگار است؛ تبدیل حدسی انجام نشد.");
    if (quote.value !== null && (!Number.isSafeInteger(quote.value) || quote.value < 1 || quote.value > 1_000_000_000)) throw new Error("مقدار مرجع باید عدد صحیح مثبت تا یک میلیارد در واحد ثبت‌شده، یا خالی باشد.");
    date(quote.quotedOn); date(quote.validUntil);
    if (quote.quotedOn > quote.validUntil) throw new Error("ترتیب تاریخ مرجع معتبر نیست.");
  }
  return structuredClone(input);
}

function fraction(numerator: bigint, denominator: bigint) {
  return { numerator: String(numerator), denominator: String(denominator), scaled10000: String(numerator * 10_000n / denominator) };
}

export function buildRawMetalDiagnostics(payload: ActionInput, references: MetalReferences) {
  const input = validateActionInput(payload), refs = validateMetalReferences(references);
  const fx = refs.quotes[0];
  const rows = input.assets.map(asset => {
    const reference = refs.quotes[asset.assetClass === "gold" ? 1 : 2];
    const issues: string[] = [];
    if (asset.unit !== "gram") issues.push("unsupported_specification");
    if (asset.quotedOn > input.asOf) issues.push("future_domestic_quote");
    if (asset.validUntil < input.asOf) issues.push("expired_domestic_quote");
    for (const quote of [fx, reference]) {
      if (quote.value === null) issues.push(`${quote.code}:missing`);
      if (quote.quotedOn > input.asOf) issues.push(`${quote.code}:future`);
      if (quote.validUntil < input.asOf) issues.push(`${quote.code}:expired`);
      if (quote.quotedOn !== asset.quotedOn) issues.push(`${quote.code}:different_date`);
    }
    // Same deterministic formula as calculatePremiumPercent, with exact integer fractions.
    // cents / 100 * FX * purity / 1000 / (31.1034768 grams/ounce).
    const numerator = issues.length ? null : BigInt(reference.value!) * BigInt(fx.value!) * BigInt(asset.purityPermille) * 100n;
    const denominator = BigInt(Math.round(TROY_OUNCE_GRAMS * 10_000_000));
    const difference = numerator === null ? null : BigInt(asset.referencePriceToman) * denominator - numerator;
    return { assetId: asset.id, state: numerator === null ? "unavailable" as const : "calculated" as const,
      issues, unit: asset.unit, purityPermille: asset.purityPermille,
      domesticPriceToman: asset.referencePriceToman, domesticQuotedOn: asset.quotedOn,
      referenceCode: reference.code,
      rawMetalTomanPerGram: numerator === null ? null : fraction(numerator, denominator),
      differenceTomanPerGram: difference === null ? null : fraction(difference, denominator),
      premiumPercent: numerator === null ? null : fraction(difference! * 100n, numerator),
    };
  });
  return { schemaVersion: METAL_DIAGNOSTIC_VERSION, source: refs, asOf: input.asOf, rows,
    troyOunceGrams: String(TROY_OUNCE_GRAMS), financialUseAllowed: false as const, affectsDecision: false as const,
    formula: "raw = ounce_USD / 31.1034768 * TOMAN_per_USD * purity_permille / 1000; premium_pct = (domestic / raw - 1) * 100",
    rounding: "display_truncates_toward_zero_at_four_decimals; exact_fractions_retained" as const };
}
