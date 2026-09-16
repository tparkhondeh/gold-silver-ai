// Compare recorded values before display rounding. This is a numeric limit check,
// not a decision, and does not change the market/file snapshot contracts.
export function isAssetWeightAboveLimit(
  valueRial: string | null | undefined,
  totalRial: string | null | undefined,
  maximumAssetBps: number,
): boolean | null {
  // Existing bounded market/file totals fit comfortably within 32 digits.
  const amount = /^(0|[1-9]\d{0,31})$/;
  if (typeof valueRial !== "string" || typeof totalRial !== "string"
    || !amount.test(valueRial) || !amount.test(totalRial)
    || !Number.isSafeInteger(maximumAssetBps) || maximumAssetBps < 1 || maximumAssetBps > 10_000) return null;
  const value = BigInt(valueRial), total = BigInt(totalRial);
  if (total === 0n || value > total) return null;
  return value * 10_000n > total * BigInt(maximumAssetBps);
}
