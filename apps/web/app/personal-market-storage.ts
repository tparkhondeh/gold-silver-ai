import { validateMarketSnapshot, type MarketSnapshot } from "./market-test-contract.ts";
import { withSnapshotLock, writeReviewedSnapshot, type SnapshotLocks, type SnapshotStorage } from "./browser-snapshot-storage.ts";

export const PERSONAL_MARKET_STORAGE = "asha-personal-latest-market-v1";
const DOCUMENT_VERSION = "asha.personal_latest_market.v1";
const MAX_DOCUMENT_BYTES = 65_536;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function encodePersonalMarketSnapshot(snapshot: MarketSnapshot, now: number): string {
  validateMarketSnapshot(snapshot, now);
  const serialized = canonical({ version: DOCUMENT_VERSION, snapshot });
  if (new TextEncoder().encode(serialized).byteLength > MAX_DOCUMENT_BYTES) throw new Error("نسخهٔ قیمت بیش از اندازه بزرگ است.");
  return serialized;
}

export function decodePersonalMarketSnapshot(raw: string, now: number): MarketSnapshot {
  if (new TextEncoder().encode(raw).byteLength > MAX_DOCUMENT_BYTES) throw new Error("نسخهٔ قیمت بیش از اندازه بزرگ است.");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("|") !== "snapshot|version"
    || !("version" in value) || value.version !== DOCUMENT_VERSION || !("snapshot" in value)
    || canonical(value) !== raw) throw new Error("نسخهٔ ذخیرهٔ قیمت معتبر نیست؛ بازنویسی انجام نشد.");
  validateMarketSnapshot(value.snapshot, now);
  return value.snapshot;
}

// Only a latest-price document is written: no holdings, purchase book, history or
// previous-price backup. A failed/unread initial load must retain undefined CAS.
export async function savePersonalMarketSnapshot(storage: SnapshotStorage, snapshot: MarketSnapshot, now: number, expectedRaw: string | null | undefined, locks?: SnapshotLocks): Promise<string> {
  // Serialize before the first await so later mutable caller edits cannot leak in.
  const serialized = encodePersonalMarketSnapshot(snapshot, now);
  return withSnapshotLock(PERSONAL_MARKET_STORAGE, () => writeReviewedSnapshot(storage, PERSONAL_MARKET_STORAGE, serialized, expectedRaw, raw => decodePersonalMarketSnapshot(raw, now)), locks);
}

export function restorePersonalMarketSnapshot(storage: SnapshotStorage, now: number): { raw: string | null; snapshot: MarketSnapshot | null } {
  const raw = storage.getItem(PERSONAL_MARKET_STORAGE);
  return { raw, snapshot: raw === null ? null : decodePersonalMarketSnapshot(raw, now) };
}
