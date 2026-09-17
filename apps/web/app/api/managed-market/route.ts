import { FileManagedMarketCache } from "../../../data/managed-market-cache.ts";
import { createManagedMarketService } from "../../../data/managed-market-service.ts";
import { resolveManagedMarketCacheRunner, resolveNavasanQuotaLedger } from "../../../db/postgres-runtime.ts";
import { type ManagedMarketResponse } from "../../managed-market-contract.ts";

type Environment = Record<string, string | undefined>;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

async function emptyBody(request: Request) {
  if (!request.body) return true;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelled = () => { void reader.cancel().catch(() => {}); };
  try {
    return await Promise.race([
      (async () => {
        for (let emptyChunks = 0; emptyChunks < 8; emptyChunks++) {
          const chunk = await reader.read();
          if (chunk.done) return true;
          if (chunk.value.byteLength !== 0) return false;
        }
        return false;
      })(),
      new Promise<false>(resolve => { timer = setTimeout(() => { resolve(false); cancelled(); }, 1000); }),
    ]);
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); cancelled(); reader.releaseLock(); }
}

export async function handleManagedMarket(request: Request, environment: Environment, latest: () => Promise<ManagedMarketResponse>) {
  const url = new URL(request.url);
  if (request.method !== "POST" || environment.ASHA_MANAGED_MARKET_ENABLED !== "true" || environment.ASHA_LOCAL_NODE_DEV !== "true"
    || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || request.headers.get("origin") !== url.origin
    || request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("x-asha-managed-market") !== "latest"
    || url.search || (request.headers.get("content-length") ?? "0") !== "0") return json({ reason: "local_same_origin_intent_required" }, 403);
  // The Node bridge can wrap a legitimate zero-byte POST in a stream. Confirm
  // bounded emptiness; never parse/use payload bytes or wait on a stalled body.
  if (!await emptyBody(request)) return json({ reason: "body_not_allowed" }, 400);
  try { return json(await latest()); }
  catch { return json({ reason: "cache_unavailable" }, 503); }
}

let service: (() => Promise<ManagedMarketResponse>) | null = null;
export async function POST(request: Request) {
  return handleManagedMarket(request, process.env, async () => {
    if (!service) {
      const directory = process.env.ASHA_MANAGED_MARKET_CACHE_DIRECTORY;
      if (!directory) throw Error("Local latest cache is not configured");
      const cache = new FileManagedMarketCache(directory, resolveManagedMarketCacheRunner());
      service = createManagedMarketService({ environment: { ...process.env }, cache, resolveLedger: () => resolveNavasanQuotaLedger() });
    }
    return service();
  });
}
