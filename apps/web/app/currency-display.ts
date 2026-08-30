export function formatToman(value: number) {
  return `${Math.round(value).toLocaleString("fa-IR")} تومان`;
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("fa-IR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function isUsableUsdTomanRate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function formatTomanAndUsd(valueToman: number, usdTomanRate: number | null) {
  return `${formatToman(valueToman)} · ${isUsableUsdTomanRate(usdTomanRate) ? formatUsd(valueToman / usdTomanRate) : "معادل دلاری نامشخص"}`;
}
