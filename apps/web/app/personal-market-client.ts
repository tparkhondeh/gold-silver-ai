import { validateMarketSnapshot, type MarketSnapshot } from "./market-test-contract.ts";

const MAX_RESPONSE_BYTES = 65_536;
const REQUEST_TIMEOUT_MS = 10_000;
const messages = {
  local_same_origin_intent_required: "دریافت قیمت فقط در اجرای محلیِ مجاز فعال است.",
  free_plan_required: "این مسیر فقط برای پلن رایگان نوسان مجاز است.",
  missing_key: "کلید نوسان تنظیم نشده است؛ درخواستی به منبع ارسال نشد.",
  key_rotation_required: "تأیید تعویض کلید لازم است؛ درخواستی به منبع ارسال نشد.",
  invalid_unit: "واحد پول منبع مشخص نیست؛ درخواستی به منبع ارسال نشد.",
  quota_unavailable: "دفتر سهمیه در دسترس نیست؛ درخواستی به منبع ارسال نشد.",
  quota_exhausted: "سقف امن سهمیه پر شده است؛ درخواستی به منبع ارسال نشد.",
  refresh_cooldown: "فاصلهٔ امن دریافت هنوز نگذشته است؛ درخواستی به منبع ارسال نشد و قیمت قبلی حفظ شد.",
  provider_or_validation_failed: "پاسخ معتبر دریافت نشد؛ این تلاش در سهمیه ثبت شده و خودکار تکرار نمی‌شود. قیمت قبلی حفظ شد.",
  invalid_response: "پاسخ معتبر دریافت نشد؛ قیمت قبلی حفظ شد. تلاش ممکن است در سهمیه ثبت شده باشد؛ تکرار خودکار انجام نمی‌شود.",
  connection_failed: "ارتباط کامل نشد؛ قیمت قبلی حفظ شد. تلاش ممکن است در سهمیه ثبت شده باشد؛ تکرار خودکار انجام نمی‌شود.",
  timeout: "مهلت دریافت تمام شد؛ قیمت قبلی حفظ شد. تلاش ممکن است در سهمیه ثبت شده باشد؛ تکرار خودکار انجام نمی‌شود.",
  aborted: "دریافت متوقف شد؛ قیمت قبلی حفظ شد. تلاش ممکن است در سهمیه ثبت شده باشد؛ تکرار خودکار انجام نمی‌شود.",
} as const;
type FailureReason = keyof typeof messages;

export class PersonalMarketRequestError extends Error {
  readonly reason: FailureReason;
  readonly retryAfterSeconds: number | null;
  constructor(reason: FailureReason, retryAfterSeconds: number | null = null) {
    super(messages[reason]);
    this.name = "PersonalMarketRequestError";
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    || !response.body || signal.aborted) throw new PersonalMarketRequestError("invalid_response");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "", bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {});
        throw new PersonalMarketRequestError("invalid_response");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new PersonalMarketRequestError("invalid_response");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export type PersonalMarketReceipt = { snapshot: MarketSnapshot; used: number; remaining: number };

// Call only after an explicit user action. This API accepts no holdings, symbol
// selection, provider URL or history range, and never retries or writes storage.
export async function requestPersonalMarketSnapshot(signal?: AbortSignal, request: typeof fetch = fetch, clock = Date.now): Promise<PersonalMarketReceipt> {
  if (signal?.aborted) throw new PersonalMarketRequestError("aborted");
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new PersonalMarketRequestError(timedOut ? "timeout" : "aborted"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const receive = async (): Promise<PersonalMarketReceipt> => {
      const response = await request("/api/market-test", {
        method: "POST", headers: { "x-asha-market-test": "latest-once" },
        cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal,
      });
      const body = await boundedJson(response, controller.signal);
      if (!record(body)) throw new PersonalMarketRequestError("invalid_response");
      if (!response.ok) {
        const reason = typeof body.reason === "string" && Object.hasOwn(messages, body.reason) ? body.reason as FailureReason : "invalid_response";
        const retryAfterSeconds = reason === "refresh_cooldown" && Number.isSafeInteger(body.retryAfterSeconds) && (body.retryAfterSeconds as number) > 0 && (body.retryAfterSeconds as number) <= 31_536_000 ? body.retryAfterSeconds as number : null;
        throw new PersonalMarketRequestError(reason, retryAfterSeconds);
      }
      if (response.status !== 200 || Object.keys(body).sort().join("|") !== "remaining|snapshot|state|used" || body.state !== "received"
        || !Number.isSafeInteger(body.used) || (body.used as number) < 1 || (body.used as number) > 115
        || !Number.isSafeInteger(body.remaining) || (body.remaining as number) < 0 || (body.used as number) + (body.remaining as number) !== 115) throw new PersonalMarketRequestError("invalid_response");
      try { validateMarketSnapshot(body.snapshot, clock()); } catch { throw new PersonalMarketRequestError("invalid_response"); }
      return { snapshot: body.snapshot, used: body.used as number, remaining: body.remaining as number };
    };
    return await Promise.race([receive(), interrupted]);
  } catch (error) {
    if (error instanceof PersonalMarketRequestError) throw error;
    throw new PersonalMarketRequestError(controller.signal.aborted ? timedOut ? "timeout" : "aborted" : "connection_failed");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}
