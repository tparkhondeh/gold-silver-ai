"use client";

import { useId, useState } from "react";
import { presentNumber, type NumericValue } from "./number-display";

export function NumberValue({ value, denominator = 1, unit = "" }: { value: NumericValue; denominator?: NumericValue; unit?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = presentNumber(value, denominator);
  const text = `${shown.compact}${unit ? ` ${unit}` : ""}`;
  const content = <><bdi dir={shown.compact.startsWith("کمتر") || shown.compact === "نامعتبر" ? "rtl" : "ltr"}>{shown.compact}</bdi>{unit ? ` ${unit}` : ""}</>;
  if (!shown.approximate) return <span className="number-value">{content}</span>;
  return <span className="number-value">
    <button type="button" className="number-disclosure" aria-expanded={open} aria-controls={id} aria-label={`مقدار دقیق ${text}`} onClick={() => setOpen(!open)}>{content}</button>
    <span id={id} hidden={!open} className="number-exact">مقدار دقیق: <bdi dir="ltr">{shown.exact}</bdi>{unit ? ` ${unit}` : ""}</span>
  </span>;
}

export function MoneyValue({ value, usdTomanRate }: { value: number; usdTomanRate?: number | null }) {
  return <><NumberValue value={value} unit="تومان" />{usdTomanRate !== undefined && <> · {usdTomanRate !== null && Number.isFinite(usdTomanRate) && usdTomanRate > 0 ? <NumberValue value={value / usdTomanRate} unit="دلار" /> : "معادل دلاری نامشخص"}</>}</>;
}
