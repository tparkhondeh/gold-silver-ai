import type { PortfolioHolding, PortfolioSnapshot, PostgresPortfolioRepository } from "../../../data/postgres-portfolio-repository.ts";
import { PortfolioVersionConflictError } from "../../../data/postgres-portfolio-repository.ts";
import { resolveLocalPortfolioRepository } from "../../../db/postgres-runtime.ts";

const LOCAL_SUBJECT = "local-owner-v1";
const MAX_REQUEST_BYTES = 262_144;
const MAX_HOLDINGS = 500;
const SAFE_ID = /^[\p{L}\p{N}_.:-]{1,100}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function validatedHolding(value: unknown): PortfolioHolding | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !SAFE_ID.test(row.id)) return null;
  if (typeof row.name !== "string" || row.name.length < 1 || row.name.length > 120) return null;
  if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0) return null;
  if (typeof row.unit !== "string" || row.unit.length < 1 || row.unit.length > 60) return null;
  if (row.costToman !== null && (typeof row.costToman !== "number" || !Number.isFinite(row.costToman) || row.costToman < 0)) return null;
  if (row.purchaseDate !== null && (typeof row.purchaseDate !== "string" || !DATE.test(row.purchaseDate))) return null;
  if (typeof row.note !== "string" || row.note.length > 1000) return null;
  return { id: row.id, name: row.name, amount: row.amount, unit: row.unit, costToman: row.costToman as number | null, purchaseDate: row.purchaseDate as string | null, note: row.note };
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
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) return json({ ok: false, code: "request_too_large", message: "portfolio request is too large" }, 413);
    let payload: { expectedVersion?: unknown; holdings?: unknown };
    try { payload = JSON.parse(body); } catch { return json({ ok: false, code: "invalid_json", message: "request body is not valid JSON" }, 400); }
    if (!Number.isInteger(payload.expectedVersion) || (payload.expectedVersion as number) < 0 || !Array.isArray(payload.holdings) || payload.holdings.length > MAX_HOLDINGS) return json({ ok: false, code: "invalid_portfolio", message: "portfolio version or holdings are invalid" }, 422);
    const holdings = payload.holdings.map(validatedHolding);
    if (holdings.some((holding) => holding === null) || new Set(holdings.map((holding) => holding?.id)).size !== holdings.length) return json({ ok: false, code: "invalid_holding", message: "one or more holdings are invalid or duplicated" }, 422);
    const resolution = await repositoryOrResponse(resolveRepository);
    if (resolution instanceof Response) return resolution;
    try {
      const snapshot: PortfolioSnapshot = await resolution.repository.save(LOCAL_SUBJECT, payload.expectedVersion as number, holdings as PortfolioHolding[]);
      return json({ ok: true, snapshot });
    } catch (error) {
      if (error instanceof PortfolioVersionConflictError) return json({ ok: false, code: "version_conflict", message: "Portfolio changed in another browser; reload before saving" }, 409);
      return json({ ok: false, code: "database_unavailable", message: "Portfolio save outcome is unconfirmed" }, 503);
    }
  };
}

export const GET = createPortfolioGet();
export const PUT = createPortfolioPut();
