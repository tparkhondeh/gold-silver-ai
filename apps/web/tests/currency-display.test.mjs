import assert from "node:assert/strict";
import test from "node:test";

import {
  formatToman,
  formatTomanAndUsd,
  isUsableUsdTomanRate,
} from "../app/currency-display.ts";

test("displays normalized Iranian values in toman without a second tenfold conversion", () => {
  assert.equal(formatToman(204_100), "۲۰۴٬۱۰۰ تومان");
  const paired = formatTomanAndUsd(204_100, 204_100);
  assert.match(paired, /^۲۰۴٬۱۰۰ تومان/);
  assert.doesNotMatch(paired, /ریال/);
});

test("fails closed when the USD/toman conversion rate is unavailable", () => {
  assert.equal(isUsableUsdTomanRate(null), false);
  assert.match(formatTomanAndUsd(204_100, null), /معادل دلاری نامشخص/);
});
