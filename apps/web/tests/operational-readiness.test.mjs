import assert from "node:assert/strict";
import test from "node:test";

import { RESPONSE_SECURITY_HEADERS, withSecurityHeaders } from "../worker/security-headers.ts";

test("security headers are attached without losing response metadata", async () => {
  const secured = withSecurityHeaders(new Response("ok", { status: 202, headers: { "Cache-Control": "no-store" } }));
  assert.equal(secured.status, 202);
  assert.equal(await secured.text(), "ok");
  assert.equal(secured.headers.get("cache-control"), "no-store");
  for (const [name, value] of Object.entries(RESPONSE_SECURITY_HEADERS)) assert.equal(secured.headers.get(name), value);
});
