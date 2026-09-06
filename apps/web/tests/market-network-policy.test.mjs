import assert from "node:assert/strict";
import test from "node:test";
import { marketNetworkAllowed, browserMarketFallbackAllowed } from "../app/market-network-policy.ts";

test("market network is closed unless separately opted in exactly", () => {
  for (const value of [undefined, "", "false", "TRUE", "1", " true "]) assert.equal(marketNetworkAllowed({ ASHA_MARKET_NETWORK_ENABLED: value }), false);
  assert.equal(marketNetworkAllowed({ ASHA_MARKET_NETWORK_ENABLED: "true" }), true);
});

test("browser cannot bypass missing, disabled or malformed server network permission", () => {
  for (const payload of [null, undefined, [], {}, { networkAllowed: "true" }, { networkAllowed: 1 }, { networkAllowed: false }]) assert.equal(browserMarketFallbackAllowed(payload), false);
  assert.equal(browserMarketFallbackAllowed({ networkAllowed: true }), true);
});
