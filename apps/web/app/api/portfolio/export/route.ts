import { createPortfolioGet } from "../route.ts";
import { decodePortfolioSnapshot } from "../../../portfolio-persistence.ts";
import { decodePersonalBackup, personalBackup } from "../../../unified-portfolio-client.ts";

const safeHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const unavailable = (status = 503) => Response.json({ ok: false, code: "portfolio_export_unavailable", message: "پشتیبان قابل دریافت نیست؛ اطلاعات ذخیره‌شده تغییر نکرده است." }, { status, headers: safeHeaders });
function onlyKeys(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error("Unexpected export fields");
}

// Load the latest confirmed record through the existing portfolio GET boundary.
// This endpoint never receives a browser draft, owner id, filename or provider URL.
export function createPortfolioExport(load = createPortfolioGet(), clock = Date.now) {
  return async function exportPortfolio(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.search || request.body !== null
      || request.headers.get("sec-fetch-site") !== "same-origin"
      || (request.headers.has("origin") && request.headers.get("origin") !== url.origin)) return unavailable(403);
    try {
      const response = await load(request);
      if (!response.ok) return unavailable(response.status === 403 ? 403 : 503);
      const body: unknown = await response.json();
      onlyKeys(body, ["ok", "snapshot"]);
      if (body.ok !== true) return unavailable();
      const snapshot = decodePortfolioSnapshot(body.snapshot);
      // The decoder preserves compatible fields for browser recovery. Export
      // must not forward accidental extra debug/runtime fields as private data.
      onlyKeys(snapshot, ["version", "holdings", "preferences", "purchaseBook"]);
      for (const holding of snapshot.holdings) onlyKeys(holding, ["id", "name", "amount", "unit", "costToman", "purchaseDate", "note"]);
      onlyKeys(snapshot.preferences, ["liquidityReservePercent", "maxSingleAssetPercent", "maxAcceptableDrawdownPercent", "shortTermMonths", "longTermYears", "analysisHorizon", "decisionHorizon"]);
      const text = personalBackup(snapshot, new Date(clock()).toISOString());
      decodePersonalBackup(text); // Enforce the existing exact format/2 MiB bound.
      return new Response(text, { status: 200, headers: { ...safeHeaders,
        "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="asha-portfolio-backup.json"' } });
    } catch { return unavailable(); }
  };
}

export const GET = createPortfolioExport();
