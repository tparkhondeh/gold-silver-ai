import type { PortfolioSnapshot, PostgresPortfolioRepository } from "../../../data/postgres-portfolio-repository.ts";
import { PortfolioVersionConflictError, PurchaseBookConflictError } from "../../../data/postgres-portfolio-repository.ts";
import { resolveLocalPortfolioRepository } from "../../../db/postgres-runtime.ts";
import { parsePortfolioSaveInput, PortfolioSaveInputError, type PortfolioSaveInput } from "../../portfolio-save-input.ts";

const LOCAL_SUBJECT = "local-owner-v1";

type RepositoryResolution =
  | { available: false; reason: string }
  | { available: true; repository: PostgresPortfolioRepository };
type ResolveRepository = () => RepositoryResolution | Promise<RepositoryResolution>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function localReadBoundary(request: Request, environment: Record<string, string | undefined>) {
  if (environment.ASHA_LOCAL_PORTFOLIO_ENABLED !== "true") return "local portfolio persistence is not explicitly enabled";
  if (!isLoopback(new URL(request.url).hostname)) return "local portfolio persistence is available on loopback only";
  return null;
}

function localWriteBoundary(request: Request, environment: Record<string, string | undefined>) {
  const readError = localReadBoundary(request, environment);
  if (readError) return readError;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!origin) return "a same-origin request is required";
  try {
    if (new URL(origin).origin !== requestUrl.origin) return "cross-origin portfolio writes are rejected";
  } catch { return "request origin is invalid"; }
  if (request.headers.get("sec-fetch-site") !== "same-origin") return "same-origin browser context is required";
  if (request.headers.get("x-asha-portfolio-request") !== "save") return "portfolio intent header is missing or invalid";
  return null;
}

async function repositoryOrResponse(resolveRepository: ResolveRepository) {
  try {
    const resolution = await resolveRepository();
    return resolution.available ? resolution : json({ ok: false, code: "database_not_ready", message: "Local PostgreSQL is not ready", reason: resolution.reason }, 503);
  } catch {
    return json({ ok: false, code: "database_unavailable", message: "Local PostgreSQL could not be reached" }, 503);
  }
}

export function createPortfolioGet(resolveRepository: ResolveRepository = resolveLocalPortfolioRepository, environment = process.env) {
  return async function get(request: Request) {
    const boundary = localReadBoundary(request, environment);
    if (boundary) return json({ ok: false, code: "portfolio_boundary", message: boundary }, 403);
    const resolution = await repositoryOrResponse(resolveRepository);
    if (resolution instanceof Response) return resolution;
    try { return json({ ok: true, snapshot: await resolution.repository.load(LOCAL_SUBJECT) }); }
    catch { return json({ ok: false, code: "database_unavailable", message: "Portfolio could not be loaded" }, 503); }
  };
}

export function createPortfolioPut(resolveRepository: ResolveRepository = resolveLocalPortfolioRepository, environment = process.env) {
  return async function put(request: Request) {
    const boundary = localWriteBoundary(request, environment);
    if (boundary) return json({ ok: false, code: "portfolio_boundary", message: boundary }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ ok: false, code: "unsupported_media_type", message: "application/json is required" }, 415);
    let body: string;
    try { body = await request.text(); }
    catch { return json({ ok: false, code: "invalid_body", message: "request body could not be read" }, 400); }
    let input: PortfolioSaveInput;
    try { input = parsePortfolioSaveInput(body); }
    catch (error) {
      if (error instanceof PortfolioSaveInputError) return json({ ok: false, code: error.code, message: error.message }, error.status);
      return json({ ok: false, code: "invalid_body", message: "request body could not be read" }, 400);
    }
    const resolution = await repositoryOrResponse(resolveRepository);
    if (resolution instanceof Response) return resolution;
    try {
      const snapshot: PortfolioSnapshot = await resolution.repository.save(LOCAL_SUBJECT, input.expectedVersion, input.holdings, input.preferences, input.purchaseBook);
      return json({ ok: true, snapshot });
    } catch (error) {
      if (error instanceof PortfolioVersionConflictError) return json({ ok: false, code: "version_conflict", message: "Portfolio changed in another browser; reload before saving" }, 409);
      if (error instanceof PurchaseBookConflictError) return json({ ok: false, code: "purchase_book_conflict", message: "خریدهای قبلی یا سابقهٔ ورود فایل نباید حذف شوند. ابتدا نسخهٔ ذخیره‌شده را بازیابی کنید." }, 409);
      return json({ ok: false, code: "database_unavailable", message: "Portfolio save outcome is unconfirmed" }, 503);
    }
  };
}

export const GET = createPortfolioGet();
export const PUT = createPortfolioPut();
