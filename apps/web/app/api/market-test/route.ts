import { inspectNavasanConfiguration } from "../../navasan-adapter.ts";
import { makeNavasanSnapshot } from "../../market-test-contract.ts";
import { resolveNavasanQuotaLedger } from "../../../db/postgres-runtime.ts";
import { fingerprintNavasanRequest, type PostgresNavasanQuotaLedger } from "../../../data/navasan-quota-ledger.ts";

type Environment = Record<string, string | undefined>;
type Resolution = { available: false; reason: string } | { available: true; ledger: Pick<PostgresNavasanQuotaLedger, "reserve" | "recordLatestOutcome"> };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

// Explicit, same-origin, owner-local POST only. Does not enable /api/market or any other provider.
export async function handleMarketTest(request: Request, environment: Environment, resolve: () => Promise<Resolution>, fetcher: typeof fetch = fetch, clock = Date.now) {
  const url = new URL(request.url);
  if (request.method !== "POST" || environment.ASHA_LOCAL_MARKET_TEST_ENABLED !== "true" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("x-asha-market-test") !== "latest-once" || url.search || (request.headers.get("content-length") ?? "0") !== "0") return json({ state: "blocked", reason: "local_same_origin_intent_required" }, 403);
  // This route accepts no body, user URLs, query keys, provider choices or history ranges.
  if (request.body) { const reader = request.body.getReader(); const first = await reader.read(); await reader.cancel(); if (!first.done) return json({ state: "blocked", reason: "body_not_allowed" }, 400); }
  if ((environment.NAVASAN_PLAN ?? "free") !== "free") return json({ state: "blocked", reason: "free_plan_required" }, 403);
  const configuration = inspectNavasanConfiguration(environment);
  if (!configuration.ready) return json({ state: "blocked", reason: configuration.reason }, 503);
  let ledger: Resolution;
  try { ledger = await resolve(); } catch { return json({ state: "blocked", reason: "quota_unavailable" }, 503); }
  if (!ledger.available) return json({ state: "blocked", reason: "quota_unavailable" }, 503);
  let reservation;
  try { reservation = await ledger.ledger.reserve("latest", fingerprintNavasanRequest("latest", { item: "approved-phase-1-set" }), 24_000); }
  catch { return json({ state: "blocked", reason: "quota_unavailable" }, 503); }
  if (!reservation.allowed || !reservation.reservationId) return json({ state: "blocked", reason: reservation.remaining === 0 ? "quota_exhausted" : "refresh_cooldown", used: reservation.used, remaining: reservation.remaining, retryAfterSeconds: reservation.retryAfterSeconds }, 429);
  const started = clock();
  let snapshot;
  let stage: "network" | "http" | "payload" | "validation" | "outcome_recording" = "network";
  let providerStatus: number | null = null;
  // Match the project's Worker-compatible transport; do not assume Node's static timeout helper.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const provider = new URL("https://api.navasan.tech/latest/");
    provider.searchParams.set("api_key", environment.NAVASAN_API_KEY!);
    // Workerd rejects redirect:"error" before sending. Manual + !ok rejects 3xx
    // without forwarding the query credential to a redirected origin.
    const response = await fetcher(provider, { headers: { accept: "application/json" }, redirect: "manual", signal: controller.signal, cache: "no-store" });
    stage = "http"; providerStatus = response.status;
    if (!response.ok) throw new Error("provider_unavailable");
    stage = "payload";
    if (!response.body) throw new Error("provider_empty_body");
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let body = ""; let bytes = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 262_144) { await reader.cancel(); throw new Error("provider_payload_too_large"); } body += decoder.decode(chunk.value, { stream: true }); }
    body += decoder.decode();
    stage = "validation";
    snapshot = makeNavasanSnapshot(JSON.parse(body), configuration.unit, new Date(clock()).toISOString());
    stage = "outcome_recording";
    await ledger.ledger.recordLatestOutcome({ reservationId: reservation.reservationId, outcome: "success", quoteCount: snapshot.observations.length, durationMs: Math.min(120_000, Math.max(0, clock() - started)) });
  } catch {
    try { await ledger.ledger.recordLatestOutcome({ reservationId: reservation.reservationId, outcome: "failure", quoteCount: null, durationMs: Math.min(120_000, Math.max(0, clock() - started)) }); } catch { /* Reservation still counts; fail closed. */ }
    return json({ state: "blocked", reason: "provider_or_validation_failed", stage, providerStatus, used: reservation.used, remaining: reservation.remaining }, 502);
  } finally { clearTimeout(timeout); }
  return json({ state: "received", snapshot, used: reservation.used, remaining: reservation.remaining });
}
export async function POST(request: Request) { return handleMarketTest(request, process.env, () => resolveNavasanQuotaLedger()); }
