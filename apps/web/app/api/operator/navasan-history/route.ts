import { fingerprintNavasanRequest } from "../../../../data/navasan-quota-ledger.ts";
import {
  resolveNavasanQuotaLedger,
  type NavasanQuotaLedgerResolution,
} from "../../../../db/postgres-runtime.ts";
import {
  normalizeNavasanDailyPayload,
  normalizeNavasanJalaliDate,
  normalizeNavasanOhlcPayload,
  inspectNavasanHistoryAuthorization,
  parseNavasanProviderCode,
  type NavasanHistoryEndpoint,
} from "../../../navasan-history.ts";
import { inspectNavasanConfiguration } from "../../../navasan-adapter.ts";

type HistoryRequest = {
  action?: unknown;
  item?: unknown;
  date?: unknown;
  start?: unknown;
  end?: unknown;
};

type ResolveQuota = () => NavasanQuotaLedgerResolution | Promise<NavasanQuotaLedgerResolution>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_REQUEST_BYTES = 4_096;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function localBoundaryError(request: Request) {
  const requestUrl = new URL(request.url);
  if (!isLoopbackHost(requestUrl.hostname)) return "history access is available on loopback only";
  const origin = request.headers.get("origin");
  if (!origin) return "a same-origin request is required";
  try {
    if (new URL(origin).origin !== requestUrl.origin) return "cross-origin history requests are rejected";
  } catch {
    return "request origin is invalid";
  }
  if (request.headers.get("sec-fetch-site") !== "same-origin") return "same-origin browser context is required";
  if (request.headers.get("x-asha-navasan-history") !== "read") return "explicit history intent is required";
  return null;
}

function validateRequest(payload: HistoryRequest) {
  if (payload.action !== "dailyCurrency" && payload.action !== "ohlcSearch") {
    throw new Error("history action must be dailyCurrency or ohlcSearch");
  }
  const action = payload.action as NavasanHistoryEndpoint;
  const item = parseNavasanProviderCode(payload.item);
  if (action === "dailyCurrency") {
    return { action, item, date: normalizeNavasanJalaliDate(payload.date) } as const;
  }
  const start = normalizeNavasanJalaliDate(payload.start);
  const end = normalizeNavasanJalaliDate(payload.end);
  if (start > end) throw new Error("Navasan history start must not be after end");
  return { action, item, start, end } as const;
}

async function fetchProviderJson(fetcher: FetchLike, url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(url.toString(), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("provider request failed");
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export function createNavasanHistoryPost(
  resolveQuota: ResolveQuota = resolveNavasanQuotaLedger,
  fetcher: FetchLike = fetch,
  environment: Record<string, string | undefined> = process.env,
) {
  return async function post(request: Request) {
    const boundaryError = localBoundaryError(request);
    if (boundaryError) return json({ ok: false, code: "operator_boundary", message: boundaryError }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ ok: false, code: "unsupported_media_type" }, 415);
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ ok: false, code: "request_too_large" }, 413);
    }

    let input: ReturnType<typeof validateRequest>;
    try {
      input = validateRequest(JSON.parse(rawBody) as HistoryRequest);
    } catch {
      return json({ ok: false, code: "invalid_request", message: "درخواست تاریخچه معتبر نیست" }, 422);
    }

    const historyAuthorization = inspectNavasanHistoryAuthorization(environment);
    if (!historyAuthorization.ready) {
      const missingLicenseReference = historyAuthorization.reason === "license_reference_missing";
      return json({
        ok: false,
        code: missingLicenseReference ? "history_license_reference_missing" : "history_execution_disabled",
        message: missingLicenseReference
          ? "شناسهٔ مجوز کتبی تاریخچه ثبت نشده است؛ هیچ سهمیه یا شبکه‌ای مصرف نشد"
          : "اجرای واقعی تاریخچه غیرفعال است؛ هیچ سهمیه یا شبکه‌ای مصرف نشد",
      }, 423);
    }

    const configuration = inspectNavasanConfiguration(environment);
    const apiKey = environment.NAVASAN_API_KEY?.trim();
    if (!configuration.ready || !apiKey) {
      return json({ ok: false, code: "provider_not_configured", message: "تنظیم امن نوسان کامل نیست" }, 503);
    }

    let quota: NavasanQuotaLedgerResolution;
    try { quota = await resolveQuota(); }
    catch { quota = { available: false, reason: "database_unavailable" }; }
    if (!quota.available) {
      return json({ ok: false, code: "quota_ledger_unavailable", message: "دفتر پایدار سهمیه آماده نیست؛ هیچ درخواستی ارسال نشد" }, 503);
    }

    const parameters: Record<string, string> = input.action === "dailyCurrency"
      ? { item: input.item, date: input.date }
      : { item: input.item, start: input.start, end: input.end };
    const reservation = await quota.ledger.reserve(input.action, fingerprintNavasanRequest(input.action, parameters));
    if (!reservation.allowed) {
      return json({ ok: false, code: "quota_exhausted", message: "سقف امن سهمیه پر شده است؛ هیچ درخواستی ارسال نشد" }, 429);
    }

    const providerUrl = new URL(`https://api.navasan.tech/${input.action}/`);
    providerUrl.searchParams.set("api_key", apiKey);
    for (const [name, value] of Object.entries(parameters)) providerUrl.searchParams.set(name, value);
    const collectedAt = new Date().toISOString();
    try {
      const payload = await fetchProviderJson(fetcher, providerUrl);
      const points = input.action === "dailyCurrency"
        ? normalizeNavasanDailyPayload(payload, input.item, configuration.unit, collectedAt)
        : normalizeNavasanOhlcPayload(payload, input.item, configuration.unit, collectedAt);
      return json({
        ok: true,
        endpoint: input.action,
        item: input.item,
        points,
        quota: { remainingSafeCalls: reservation.remaining, windowDays: 31 },
      });
    } catch {
      return json({ ok: false, code: "provider_or_validation_failure", message: "پاسخ تاریخچه دریافت یا اعتبارسنجی نشد" }, 502);
    }
  };
}

export const POST = createNavasanHistoryPost();
