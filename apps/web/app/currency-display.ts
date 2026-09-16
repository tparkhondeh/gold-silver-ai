import { formatNumber } from "./number-display.ts";

export function formatToman(value: number) {
  return `${formatNumber(value)} تومان`;
}

export function formatUsd(value: number) {
  return `${formatNumber(value)} دلار`;
}

export function isUsableUsdTomanRate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function formatTomanAndUsd(valueToman: number, usdTomanRate: number | null) {
  return `${formatToman(valueToman)} · ${isUsableUsdTomanRate(usdTomanRate) ? formatUsd(valueToman / usdTomanRate) : "معادل دلاری نامشخص"}`;
}
