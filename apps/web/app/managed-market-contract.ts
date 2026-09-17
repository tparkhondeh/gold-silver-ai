import { validateMarketSnapshot, type MarketSnapshot } from "./market-test-contract.ts";

export const MANAGED_MARKET_VERSION = "asha.managed_market.v1";
export const managedMarketReasons = ["updated", "refresh_cooldown", "quota_exhausted", "provider_or_validation_failed", "cache_unavailable", "quota_unavailable", "missing_key", "key_rotation_required", "invalid_unit", "free_plan_required"] as const;
export type ManagedMarketReason = typeof managedMarketReasons[number];
export type ManagedMarketResponse = {
  version: typeof MANAGED_MARKET_VERSION;
  state: "received" | "cached" | "unavailable";
  snapshot: MarketSnapshot | null;
  checkedAt: string;
  nextCheckAt: string;
  reason: ManagedMarketReason;
  quota: { used: number; remaining: number } | null;
};

function keys(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== expected.sort().join("|")) throw Error("Invalid managed market response");
}
function timestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw Error("Invalid managed market timestamp");
  return Date.parse(value);
}
export function validateManagedMarketResponse(value: unknown, now: number): asserts value is ManagedMarketResponse {
  keys(value, ["version", "state", "snapshot", "checkedAt", "nextCheckAt", "reason", "quota"]);
  const checked = timestamp(value.checkedAt), next = timestamp(value.nextCheckAt);
  if (!Number.isFinite(now) || value.version !== MANAGED_MARKET_VERSION || checked > now + 300_000 || next <= checked || next - checked > 31_536_000_000
    || !managedMarketReasons.includes(value.reason as ManagedMarketReason)) throw Error("Invalid managed market response");
  if (value.snapshot !== null) validateMarketSnapshot(value.snapshot, now);
  const expectedState = value.reason === "updated" ? "received" : value.snapshot === null ? "unavailable" : "cached";
  if (value.state !== expectedState || (value.reason === "updated" && value.snapshot === null)) throw Error("Invalid managed market state");
  if (value.quota !== null) {
    keys(value.quota, ["used", "remaining"]);
    if (!Number.isSafeInteger(value.quota.used) || (value.quota.used as number) < 0 || !Number.isSafeInteger(value.quota.remaining)
      || value.quota.remaining !== Math.max(0, 115 - (value.quota.used as number))) throw Error("Invalid managed market quota");
  }
}
