export type JalaliDateParts = { year: number; month: number; day: number };

export const JALALI_MONTH_NAMES = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
] as const;

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

export function currentJalaliParts(date = new Date()): JalaliDateParts {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tehran",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function formatJalaliDate({ year, month, day }: JalaliDateParts) {
  return `${year.toString().padStart(4, "0")}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
}

export function currentJalaliDate() {
  return formatJalaliDate(currentJalaliParts());
}

function isJalaliLeapYear(year: number) {
  const remainders = [1, 5, 9, 13, 17, 22, 26, 30];
  return remainders.includes(year % 33);
}

export function daysInJalaliMonth(year: number, month: number) {
  if (month >= 1 && month <= 6) return 31;
  if (month >= 7 && month <= 11) return 30;
  if (month === 12) return isJalaliLeapYear(year) ? 30 : 29;
  return 0;
}

export function isFutureJalaliDate(candidate: JalaliDateParts, today = currentJalaliParts()) {
  return formatJalaliDate(candidate) > formatJalaliDate(today);
}
