// Local discovery carries no identity or portfolio data. Hosted gateway replaces
// this route; it must never infer local authority from client-supplied headers.
export function createLocalAccessMode(environment: Record<string, string | undefined>) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const allowed = request.method === "GET" && !url.search && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && environment.ASHA_LOCAL_PORTFOLIO_ENABLED === "true";
    return Response.json(allowed ? { mode: "local" } : { error: "access_unavailable" }, { status: allowed ? 200 : 503, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  };
}
export const GET = (request: Request) => createLocalAccessMode(process.env)(request);
