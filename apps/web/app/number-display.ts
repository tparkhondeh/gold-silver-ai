// Presentation only. Never feed rounded text back into calculations or storage.
export type NumericValue = number | string | bigint;
export type NumberPresentation = { compact: string; exact: string; approximate: boolean };
const fa = (value: string) => value.replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
const integer = (value: bigint) => fa(value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));

function fraction(value: NumericValue, computedIntegerFraction = false): [bigint, bigint] {
  const text = String(value);
  if (text.length > (computedIntegerFraction ? 32000 : 350)) throw new Error("Invalid display value");
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("Invalid display value");
  const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 650) throw new Error("Invalid display exponent");
  const numerator = BigInt(`${match[1]}${match[2]}${match[3] ?? ""}`);
  return exponent >= 0 ? [numerator * 10n ** BigInt(exponent), 1n] : [numerator, 10n ** BigInt(-exponent)];
}

function exactFraction(n: bigint, d: bigint): string {
  const sign = n < 0n ? "−" : "";
  let magnitude = n < 0n ? -n : n;
  let a = magnitude, b = d;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  magnitude /= a; d /= a;
  let remainder = magnitude % d;
  let digits = "";
  const seen = new Set<bigint>();
  while (remainder !== 0n && digits.length < 650 && !seen.has(remainder)) {
    seen.add(remainder);
    remainder *= 10n;
    digits += (remainder / d).toString();
    remainder %= d;
  }
  // Recurring or very long expansions stay exact as a fraction, never ellipses.
  if (remainder !== 0n) return `${sign}${integer(magnitude)} / ${integer(d)}`;
  return `${sign}${integer(magnitude / d)}${digits ? `٫${fa(digits)}` : ""}`;
}

export function presentNumber(value: NumericValue, denominator?: NumericValue): NumberPresentation {
  try {
    // Only an explicit pair of integers is the computed-rational path. A book
    // may sum 500 distinct historical FX denominators (30 decimal digits each),
    // plus bounded decimal scales. Ordinary decimal/scientific inputs retain
    // their original limit; neither path truncates financial digits.
    const computedIntegerFraction = denominator !== undefined && /^-?\d+$/.test(String(value)) && /^\d+$/.test(String(denominator));
    const [a, b] = fraction(value, computedIntegerFraction), [c, d] = fraction(denominator === undefined ? 1 : denominator, computedIntegerFraction);
    if (c <= 0n) throw new Error("Invalid display denominator");
    const n = a * d, divisor = b * c, magnitude = n < 0n ? -n : n;
    const exact = exactFraction(n, divisor);
    if (magnitude > 0n && magnitude * 10n < divisor) {
      return { compact: `کمتر از ۰٫۱${n < 0n ? " (منفی)" : ""}`, exact, approximate: true };
    }
    // Half away from zero, computed in integers (no float or double rounding).
    const tenths = (magnitude * 20n + divisor) / (divisor * 2n);
    const approximate = tenths * divisor !== magnitude * 10n;
    const compact = `${approximate ? "≈ " : ""}${n < 0n ? "−" : ""}${integer(tenths / 10n)}${tenths % 10n ? `٫${fa(String(tenths % 10n))}` : ""}`;
    return { compact, exact, approximate };
  } catch {
    return { compact: "نامعتبر", exact: "نامعتبر", approximate: false };
  }
}

export const formatNumber = (value: NumericValue, denominator?: NumericValue) => presentNumber(value, denominator).compact;
