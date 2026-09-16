import assert from "node:assert/strict";
import test from "node:test";
import { validPortfolioAmount, validPortfolioCost, validPortfolioPreference } from "../data/portfolio-numeric-contract.ts";
import { decodePortfolioSnapshot } from "../app/portfolio-persistence.ts";

test("stored numeric fields accept exact decimal/scientific boundaries without binary rounding tests", () => {
  for (const value of [1.01, 2.55, 1.123456789012, 1e-12, 1e25]) assert.equal(validPortfolioAmount(value), true, String(value));
  for (const value of [null, 0, 0.01, 1.01, 2.55, 1e35]) assert.equal(validPortfolioCost(value), true, String(value));
  for (const value of [0, -1, NaN, Infinity, 1e-13, 1.1234567890123, 1e26, "1"]) assert.equal(validPortfolioAmount(value), false, String(value));
  for (const value of [-1, NaN, Infinity, 0.001, 1.005, 1e36, "1"]) assert.equal(validPortfolioCost(value), false, String(value));
});

test("preferences preserve harmless trailing zeros but reject hidden nonzero precision and invalid integer input", () => {
  for (const value of ["", "0", "100", "12.3400", "1e1", ".01", "0.01000", "1e-2", "+10.00", " 10.00 "]) assert.equal(validPortfolioPreference("liquidityReservePercent", value), true, value);
  for (const value of [" ", "12.345", "10.0000000000000001", "1e-3", "101", "-0.01", "0x10", "1e1001", "0".repeat(257), undefined]) assert.equal(validPortfolioPreference("liquidityReservePercent", value), false, String(value));
  for (const value of ["", "1", "24", "+6", "06", " 6 "]) assert.equal(validPortfolioPreference("shortTermMonths", value), true, value);
  for (const value of ["1.5", "1.0", "1e0", "0x1", "0", "25"]) assert.equal(validPortfolioPreference("shortTermMonths", value), false, value);
  assert.equal(validPortfolioPreference("longTermYears", "20"), true);
  assert.equal(validPortfolioPreference("longTermYears", "21"), false);
});

test("snapshot recovery uses the same exact numeric storage contract", () => {
  const snapshot = { version: 1, holdings: [{ id: "synthetic-precision", name: "Synthetic", amount: 1e-12, unit: "test", costToman: 1.01, purchaseDate: null, note: "" }], preferences: { liquidityReservePercent: "12.34", maxSingleAssetPercent: "40", maxAcceptableDrawdownPercent: "20", shortTermMonths: "6", longTermYears: "5", analysisHorizon: "short", decisionHorizon: "long" } };
  assert.deepEqual(decodePortfolioSnapshot(snapshot), snapshot);
  for (const field of [{ amount: 1e-13 }, { amount: 1e26 }, { costToman: 1.005 }]) assert.throws(() => decodePortfolioSnapshot({ ...snapshot, holdings: [{ ...snapshot.holdings[0], ...field }] }));
  for (const preferences of [{ liquidityReservePercent: "12.345" }, { shortTermMonths: "1.5" }, { longTermYears: "1e0" }]) assert.throws(() => decodePortfolioSnapshot({ ...snapshot, preferences: { ...snapshot.preferences, ...preferences } }));
});
