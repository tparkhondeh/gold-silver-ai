import { inspectNavasanConfiguration } from "../app/navasan-adapter.ts";
import { makeNavasanSnapshot, type MarketSnapshot } from "../app/market-test-contract.ts";
import { MANAGED_MARKET_VERSION, type ManagedMarketReason, type ManagedMarketResponse } from "../app/managed-market-contract.ts";
import { fingerprintNavasanRequest, type PostgresNavasanQuotaLedger } from "./navasan-quota-ledger.ts";
import { resolveNavasanRefreshPolicy } from "./navasan-refresh-policy.ts";
import type { ManagedMarketCache } from "./managed-market-cache.ts";

type Environment = Record<string, string | undefined>;
type Ledger = Pick<PostgresNavasanQuotaLedger, "reserve" | "recordLatestOutcome">;
type Resolution = { available: false; reason?: string } | { available: true; ledger: Ledger };
type Options = { environment: Environment; cache: ManagedMarketCache; resolveLedger: () => Promise<Resolution>; fetcher?: typeof fetch; clock?: () => number };

async function receiveLatest(environment: Environment, unit: "IRR" | "TOMAN", fetcher: typeof fetch, clock: () => number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(Error("Provider deadline exceeded"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const receive = async () => {
    const provider = new URL("https://api.navasan.tech/latest/");
    provider.searchParams.set("api_key", environment.NAVASAN_API_KEY!);
    const response = await fetcher(provider, { headers: { accept: "application/json" }, redirect: "manual", signal: controller.signal, cache: "no-store" });
    if (!response.ok || !response.body || controller.signal.aborted) throw Error("Provider unavailable");
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let raw = "", bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 262_144) { cancel(); throw Error("Provider response too large"); }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      if (controller.signal.aborted) throw Error("Provider deadline exceeded");
      return makeNavasanSnapshot(JSON.parse(raw + decoder.decode()), unit, new Date(clock()).toISOString());
    } finally { controller.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  };
  try { return await Promise.race([receive(), interrupted]); }
  finally { clearTimeout(timer); if (onAbort) controller.signal.removeEventListener("abort", onAbort); }
}

// A browser's disconnect does not cancel an already-reserved shared acquisition.
// No timer runs here: the active local app asks, and the durable ledger decides.
export function createManagedMarketService({ environment, cache, resolveLedger, fetcher = fetch, clock = Date.now }: Options) {
  let inFlight: Promise<ManagedMarketResponse> | null = null;
  async function run(): Promise<ManagedMarketResponse> {
    let snapshot: MarketSnapshot | null = null;
    let quota: ManagedMarketResponse["quota"] = null;
    const result = (reason: ManagedMarketReason, seconds = 300): ManagedMarketResponse => {
      const checked = clock();
      return { version: MANAGED_MARKET_VERSION, state: reason === "updated" ? "received" : snapshot ? "cached" : "unavailable", snapshot,
        checkedAt: new Date(checked).toISOString(), nextCheckAt: new Date(checked + Math.max(1, seconds) * 1000).toISOString(), reason, quota };
    };
    try { snapshot = await cache.read(clock()); } catch { return result("cache_unavailable"); }
    if ((environment.NAVASAN_PLAN ?? "free") !== "free") return result("free_plan_required");
    const configuration = inspectNavasanConfiguration(environment);
    if (!configuration.ready) return result(configuration.reason);
    let resolved: Resolution;
    try { resolved = await resolveLedger(); } catch { return result("quota_unavailable"); }
    if (!resolved.available) return result("quota_unavailable");
    const ledger = resolved.ledger;
    const cadence = resolveNavasanRefreshPolicy(environment).effectiveRefreshSeconds;
    let reservation;
    try { reservation = await ledger.reserve("latest", fingerprintNavasanRequest("latest", { item: "approved-phase-1-set" }), cadence); }
    catch { return result("quota_unavailable"); }
    quota = { used: reservation.used, remaining: reservation.remaining };
    if (!reservation.allowed || !reservation.reservationId) {
      if (reservation.remaining === 0) return result("quota_exhausted", 3600);
      const retry = reservation.retryAfterSeconds ?? cadence;
      // A different worker may currently be fetching. One cheap local recheck
      // sees its completed cache; it still cannot bypass the durable quota lock.
      return result("refresh_cooldown", retry >= cadence - 30 ? 30 : Math.max(1, retry));
    }
    const started = clock();
    let stage: "provider_or_validation_failed" | "cache_unavailable" = "provider_or_validation_failed";
    const duration = () => Math.min(120_000, Math.max(0, Math.floor(clock() - started)));
    try {
      const candidate = await receiveLatest(environment, configuration.unit, fetcher, clock);
      await ledger.recordLatestOutcome({ reservationId: reservation.reservationId, outcome: "success", quoteCount: candidate.observations.length, durationMs: duration() });
      stage = "cache_unavailable";
      snapshot = await cache.replace(candidate, clock());
      return result("updated", cadence);
    } catch {
      try { await ledger.recordLatestOutcome({ reservationId: reservation.reservationId, outcome: "failure", quoteCount: null, durationMs: duration() }); } catch { /* The committed reservation is never refunded. */ }
      return result(stage, cadence);
    }
  }
  return function latest(): Promise<ManagedMarketResponse> {
    if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
    // Clone per consumer: an in-process caller cannot change another response.
    return inFlight.then(value => structuredClone(value));
  };
}
