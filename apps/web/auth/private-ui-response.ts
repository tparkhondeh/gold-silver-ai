// Fetch decodes compressed upstream bodies. Never relay encoded-size metadata,
// upstream cookies, redirects or hop-by-hop headers to the public gateway.
export function privateUiResponse(upstream: Response): Response {
  if (upstream.status !== 200 || upstream.redirected) throw new Error("Built UI unavailable");
  const headers = new Headers();
  const type = upstream.headers.get("content-type");
  if (type) headers.set("content-type", type);
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: 200, headers });
}
