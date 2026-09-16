import assert from "node:assert/strict";
import test from "node:test";
import { isAssetWeightAboveLimit } from "../app/market-test-risk.ts";
import { createMarketTestPortfolio, evaluateMarketTest, makeNavasanSnapshot } from "../app/market-test-contract.ts";
import { createFileTestPortfolio, evaluateFileTest, readFileSnapshot, SYNTHETIC_FILE } from "../app/file-market-contract.ts";

const now = Date.parse("2000-01-01T12:00:00.000Z");

test("market limit warnings distinguish below, equal and one-rial-above despite rounded weights", () => {
  const portfolio = createMarketTestPortfolio();
  portfolio.quantitiesMilli = { GOLD_18K_IRR: 1000, EMAMI_COIN_IRR: 0, SILVER_999_IRR: 0 };
  portfolio.snapshot = makeNavasanSnapshot({ "18ayar": { value: "10000000", timestamp: now / 1000 } }, "TOMAN", new Date(now).toISOString());
  for (const [cash, expected] of [["100000001", false], ["100000000", false], ["99999999", true]]) {
    portfolio.cashRial = cash;
    const result = evaluateMarketTest(portfolio, now);
    assert.equal(isAssetWeightAboveLimit(result.rows[0].valueRial, result.observedTotalRial, 5000), expected);
    if (expected) assert.equal(result.weightsBps.GOLD_18K_IRR, 5000, "the old rounded comparison hides this breach");
  }
});

test("synthetic file valuation shares the exact limit warning without a different schema", async () => {
  const portfolio = createFileTestPortfolio();
  portfolio.inputs.quantitiesMilli = { GOLD_18K_IRR: 100000000, EMAMI_COIN_IRR: 0, SILVER_999_IRR: 0 };
  portfolio.inputs.cashRial = "99999999";
  portfolio.file = await readFileSnapshot(new TextEncoder().encode(SYNTHETIC_FILE), new Date(now).toISOString());
  const result = evaluateFileTest(portfolio, now);
  assert.equal(result.rows[0].valueRial, "100000000");
  assert.equal(result.observedTotalRial, "199999999");
  assert.equal(result.weightsBps.GOLD_18K_IRR, 5000);
  assert.equal(isAssetWeightAboveLimit(result.rows[0].valueRial, result.observedTotalRial, portfolio.inputs.maximumAssetBps), true);
  assert.equal(result.decision.financialUseAllowed, false);
});

test("zero positions and exact full allocation are not breaches; large amounts retain one-rial precision", () => {
  assert.equal(isAssetWeightAboveLimit("0", "1", 1), false);
  assert.equal(isAssetWeightAboveLimit("1", "1", 10000), false);
  assert.equal(isAssetWeightAboveLimit("1", "1", 9999), true);
  assert.equal(isAssetWeightAboveLimit("1000000000000000000000000", "2000000000000000000000000", 5000), false);
  assert.equal(isAssetWeightAboveLimit("1000000000000000000000000", "1999999999999999999999999", 5000), true);
});

test("missing, zero-total, inconsistent, negative, malformed and oversized inputs stay unknown", () => {
  for (const invalid of [null, undefined, "", "-1", "+1", "01", "1.0", "1e2", "NaN", "Infinity", "1".repeat(33), 1]) {
    assert.equal(isAssetWeightAboveLimit(invalid, "100", 5000), null);
    assert.equal(isAssetWeightAboveLimit("1", invalid, 5000), null);
  }
  assert.equal(isAssetWeightAboveLimit("0", "0", 5000), null);
  assert.equal(isAssetWeightAboveLimit("101", "100", 5000), null);
  for (const limit of [-1, 0, 0.5, 10001, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "5000", null]) {
    assert.equal(isAssetWeightAboveLimit("1", "100", limit), null);
  }
});
