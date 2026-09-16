import { decodeMarketTest, encodeMarketTest, MARKET_TEST_STORAGE, type MarketTestPortfolio } from "./market-test-contract.ts";
import { withSnapshotLock, writeReviewedSnapshot, type SnapshotLocks } from "./browser-snapshot-storage.ts";

export type TestStorage = Pick<Storage, "getItem" | "setItem">;
// One current snapshot only. Neither the legacy portfolio nor a market history is written.
export async function saveMarketTest(storage: TestStorage, portfolio: MarketTestPortfolio, now: number, expectedRaw: string | null | undefined, locks?: SnapshotLocks) {
  const serialized = encodeMarketTest(portfolio, now);
  return withSnapshotLock(MARKET_TEST_STORAGE, () => writeReviewedSnapshot(storage, MARKET_TEST_STORAGE, serialized, expectedRaw, raw => decodeMarketTest(raw, now)), locks);
}
export function restoreMarketTest(storage: TestStorage, now: number) {
  const value = storage.getItem(MARKET_TEST_STORAGE);
  return { raw: value, portfolio: value === null ? null : decodeMarketTest(value, now) };
}
