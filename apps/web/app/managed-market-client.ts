import { validateManagedMarketResponse, type ManagedMarketResponse } from "./managed-market-contract.ts";
export type { ManagedMarketResponse, ManagedMarketReason } from "./managed-market-contract.ts";

const messages = {
  local_same_origin_intent_required: "قیمت خودکار فقط در اجرای محلیِ مجاز فعال است.",
  body_not_allowed: "درخواست قیمت باید بدون اطلاعات سبد باشد.",
  cache_unavailable: "حافظهٔ مشترک قیمت در دسترس نیست؛ قیمت معتبر قبلی حفظ شد.",
  invalid_response: "پاسخ قیمت معتبر نیست؛ قیمت معتبر قبلی حفظ شد.",
  connection_failed: "ارتباط با برنامه کامل نشد؛ قیمت معتبر قبلی حفظ شد.",
  timeout: "مهلت بررسی قیمت تمام شد؛ قیمت معتبر قبلی حفظ شد.",
  aborted: "بررسی قیمت متوقف شد؛ قیمت معتبر قبلی حفظ شد.",
} as const;
export class ManagedMarketRequestError extends Error {
  readonly reason: keyof typeof messages;
  constructor(reason: keyof typeof messages) { super(messages[reason]); this.name = "ManagedMarketRequestError"; this.reason = reason; }
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body || signal.aborted
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > 65_536))) throw new ManagedMarketRequestError("invalid_response");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let raw = "", bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 65_536) { cancel(); throw Error("Response size exceeded"); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

// Application-managed scheduling is separate from transport: one fixed local
// request, no holdings/query/URL input, retries, browser storage or provider key.
export async function requestManagedMarket(signal?: AbortSignal, request: typeof fetch = fetch, clock = Date.now): Promise<ManagedMarketResponse> {
  if (signal?.aborted) throw new ManagedMarketRequestError("aborted");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false, onAbort: (() => void) | undefined;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new ManagedMarketRequestError(timedOut ? "timeout" : "aborted"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const receive = async () => {
    const response = await request("/api/managed-market", { method: "POST", headers: { "x-asha-managed-market": "latest" }, cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal });
    let value: unknown;
    try { value = await boundedJson(response, controller.signal); } catch { throw new ManagedMarketRequestError("invalid_response"); }
    if (!response.ok) {
      const reason = value && typeof value === "object" && "reason" in value ? value.reason : undefined;
      throw new ManagedMarketRequestError(typeof reason === "string" && Object.hasOwn(messages, reason) ? reason as keyof typeof messages : "invalid_response");
    }
    try { if (response.status !== 200) throw Error("Invalid response status"); validateManagedMarketResponse(value, clock()); }
    catch { throw new ManagedMarketRequestError("invalid_response"); }
    return value;
  };
  try { return await Promise.race([receive(), interrupted]); }
  catch (error) {
    if (error instanceof ManagedMarketRequestError) throw error;
    throw new ManagedMarketRequestError(controller.signal.aborted ? timedOut ? "timeout" : "aborted" : "connection_failed");
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}
