import assert from "node:assert/strict";
import test from "node:test";

import { daysInJalaliMonth, formatJalaliDate, isFutureJalaliDate, toPersianDigits } from "../app/jalali-calendar.ts";

test("formats Jalali dates and digits for the owner-facing calendar", () => {
  assert.equal(formatJalaliDate({ year: 1405, month: 6, day: 7 }), "1405/06/07");
  assert.equal(toPersianDigits("1405/06/07"), "۱۴۰۵/۰۶/۰۷");
});

test("uses Persian month lengths and rejects future selections", () => {
  assert.equal(daysInJalaliMonth(1405, 1), 31);
  assert.equal(daysInJalaliMonth(1405, 7), 30);
  assert.ok([29, 30].includes(daysInJalaliMonth(1405, 12)));
  assert.equal(isFutureJalaliDate({ year: 1405, month: 6, day: 8 }, { year: 1405, month: 6, day: 7 }), true);
  assert.equal(isFutureJalaliDate({ year: 1405, month: 6, day: 7 }, { year: 1405, month: 6, day: 7 }), false);
});
