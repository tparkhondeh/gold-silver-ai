import { decodeMarketTest, encodeMarketTest, MARKET_TEST_STORAGE, type MarketTestPortfolio } from "./market-test-contract.ts";

export type TestStorage = Pick<Storage, "getItem" | "setItem">;
// One current snapshot only. Neither the legacy portfolio nor a market history is written.
export function saveMarketTest(storage: TestStorage, portfolio: MarketTestPortfolio, now: number) {
  const serialized = encodeMarketTest(portfolio, now);
  storage.setItem(MARKET_TEST_STORAGE, serialized);
}
export function restoreMarketTest(storage: TestStorage, now: number) {
  const value = storage.getItem(MARKET_TEST_STORAGE);
  return value === null ? null : decodeMarketTest(value, now);
}
