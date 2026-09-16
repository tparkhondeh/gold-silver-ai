import { decodeSharedPortfolio, encodeSharedPortfolio, SHARED_STORAGE_KEY, type SharedPortfolio } from "./shared-portfolio.ts";
import { withSnapshotLock, writeReviewedSnapshot, type SnapshotLocks, type SnapshotStorage } from "./browser-snapshot-storage.ts";

export function restoreSharedPortfolio(storage: SnapshotStorage) {
  const raw = storage.getItem(SHARED_STORAGE_KEY);
  return { raw, portfolio: raw === null ? null : decodeSharedPortfolio(raw) };
}

export async function saveSharedPortfolio(storage: SnapshotStorage, portfolio: SharedPortfolio, expectedRaw: string | null | undefined, locks?: SnapshotLocks) {
  const text = encodeSharedPortfolio(portfolio);
  return withSnapshotLock(SHARED_STORAGE_KEY, () => writeReviewedSnapshot(storage, SHARED_STORAGE_KEY, text, expectedRaw, decodeSharedPortfolio, `${SHARED_STORAGE_KEY}-previous`), locks);
}
