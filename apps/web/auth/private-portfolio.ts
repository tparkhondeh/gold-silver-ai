import type { PortfolioHolding, PortfolioPreferences, PortfolioSnapshot } from "../data/postgres-portfolio-repository.ts";
import { PortfolioVersionConflictError, PurchaseBookConflictError } from "../data/postgres-portfolio-repository.ts";
import type { PurchaseBook } from "../app/purchase-book.ts";
import { decodePortfolioSnapshot } from "../app/portfolio-persistence.ts";
import { MAX_PORTFOLIO_SAVE_BYTES, parsePortfolioSaveInput, PortfolioSaveInputError } from "../app/portfolio-save-input.ts";
import { createPortfolioExport } from "../app/api/portfolio/export/route.ts";
import { OwnerAuthorizationError } from "./postgres-owner-identity-store.ts";

/** Runtime supplies this facade only inside verified owner authorization. Its
 * methods call the existing repository with one configured subject and an
 * authorized transaction runner; neither the browser nor this adapter selects it. */
export interface BoundPrivatePortfolioRepository {
  load(): Promise<PortfolioSnapshot>;
  save(expectedVersion: number, holdings: readonly PortfolioHolding[], preferences: PortfolioPreferences, purchaseBook?: PurchaseBook): Promise<PortfolioSnapshot>;
}
export interface PrivatePortfolioOptions {
  origin: string;
  repository: BoundPrivatePortfolioRepository;
  clock?: () => number;
}
// Compatibility alias for the same actual durable authorization error class.
export { OwnerAuthorizationError as PrivatePortfolioAuthorizationError };
const responseHeaders = { "Cache-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: responseHeaders });
const boundaryDenied = () => json({ ok: false, code: "private_portfolio_boundary", message: "درخواست سبد خصوصی مجاز نیست." }, 403);
const unavailable = () => json({ ok: false, code: "database_unavailable", message: "نتیجهٔ دسترسی به سبد تأیید نشد؛ اطلاعات قبلی تغییر داده نشده یا نتیجهٔ ذخیره نامشخص است." }, 503);
const invalidBody = () => new PortfolioSaveInputError("invalid_body", 400, "request body could not be read");

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_PORTFOLIO_SAVE_BYTES)) throw new PortfolioSaveInputError("request_too_large", 413, "portfolio request is too large");
  if (request.signal.aborted) throw invalidBody();
  if (!request.body) return "";
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "", timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(invalidBody());
    request.signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, 5000);
  });
  try {
    for (let chunks = 0; chunks < 4096; chunks++) {
      const chunk = await Promise.race([reader.read(), interrupted]);
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > MAX_PORTFOLIO_SAVE_BYTES) throw new PortfolioSaveInputError("request_too_large", 413, "portfolio request is too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    throw invalidBody();
  } catch (error) { if (error instanceof PortfolioSaveInputError) throw error; throw invalidBody(); }
  finally {
    if (timer) clearTimeout(timer);
    if (abort) request.signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function safeSnapshot(value: unknown): PortfolioSnapshot {
  const snapshot = decodePortfolioSnapshot(value);
  // Repository failures must not accidentally add runtime/debug fields to JSON.
  const exactKeys = (value: object, expected: readonly string[]) => {
    if (Object.keys(value).some(key => !expected.includes(key))) throw Error("Invalid private snapshot");
  };
  exactKeys(snapshot, ["version", "holdings", "preferences", "purchaseBook"]);
  for (const holding of snapshot.holdings) exactKeys(holding, ["id", "name", "amount", "unit", "costToman", "purchaseDate", "note"]);
  exactKeys(snapshot.preferences, ["liquidityReservePercent", "maxSingleAssetPercent", "maxAcceptableDrawdownPercent", "shortTermMonths", "longTermYears", "analysisHorizon", "decisionHorizon"]);
  return snapshot;
}

/** No environment activation, local-owner fallback, credential reading, pool or
 * provider access. Outer runtime must authorize before invoking these handlers;
 * the supplied repository must reauthorize atomically within each transaction. */
export function createPrivatePortfolioHandlers(options: PrivatePortfolioOptions) {
  const configuredOrigin = new URL(options.origin);
  if (configuredOrigin.protocol !== "https:" || configuredOrigin.origin !== options.origin || configuredOrigin.username || configuredOrigin.password
    || !options.repository || typeof options.repository.load !== "function" || typeof options.repository.save !== "function") throw Error("Invalid private portfolio configuration");
  const origin = configuredOrigin.origin, host = configuredOrigin.host, repository = options.repository;
  const load = repository.load.bind(repository), save = repository.save.bind(repository);
  function allowed(request: Request, path: string, method: string) {
    const url = new URL(request.url);
    return request.url.length <= 8192 && url.origin === origin && url.pathname === path && !url.search && !url.hash && !url.username && !url.password
      && request.method === method && (!request.headers.has("host") || request.headers.get("host") === host);
  }
  function failure(error: unknown) {
    if (error instanceof OwnerAuthorizationError) return json({ ok: false, code: "authentication_required", message: "ورود معتبر برای دسترسی به سبد لازم است." }, 401);
    if (error instanceof PortfolioSaveInputError) return json({ ok: false, code: error.code, message: error.message }, error.status);
    if (error instanceof PortfolioVersionConflictError) return json({ ok: false, code: "version_conflict", message: "Portfolio changed in another browser; reload before saving" }, 409);
    if (error instanceof PurchaseBookConflictError) return json({ ok: false, code: "purchase_book_conflict", message: "خریدهای قبلی یا سابقهٔ ورود فایل نباید حذف شوند. ابتدا نسخهٔ ذخیره‌شده را بازیابی کنید." }, 409);
    return unavailable();
  }
  async function loadResponse() {
    try { return json({ ok: true, snapshot: safeSnapshot(await load()) }); }
    catch (error) { return failure(error); }
  }
  const exportSnapshot = createPortfolioExport(loadResponse, options.clock ?? Date.now);
  return {
    async get(request: Request): Promise<Response> {
      if (!allowed(request, "/api/portfolio", "GET") || request.body !== null) return boundaryDenied();
      return loadResponse();
    },
    async put(request: Request): Promise<Response> {
      if (!allowed(request, "/api/portfolio", "PUT") || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") !== "same-origin"
        || request.headers.get("x-asha-portfolio-request") !== "save" || request.headers.get("x-asha-intent") !== "owner-action") return boundaryDenied();
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return json({ ok: false, code: "unsupported_media_type", message: "application/json is required" }, 415);
      try {
        const input = parsePortfolioSaveInput(await readBoundedBody(request));
        if (request.signal.aborted) throw invalidBody();
        const snapshot = safeSnapshot(await save(input.expectedVersion, input.holdings, input.preferences, input.purchaseBook));
        return json({ ok: true, snapshot });
      } catch (error) { return failure(error); }
    },
    async export(request: Request): Promise<Response> {
      if (!allowed(request, "/api/portfolio/export", "GET")) return boundaryDenied();
      const response = await exportSnapshot(request);
      for (const [name, value] of Object.entries(responseHeaders)) response.headers.set(name, value);
      return response;
    },
  };
}
