import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateApplication } from "../auth/private-application.ts";
import { privateUiResponse } from "../auth/private-ui-response.ts";
import { createMemoryOwnerIdentityStore, createOwnerIdentityGate } from "../auth/owner-identity.ts";

const origin = "https://goldsilver.wealthos.ir";
function fixture() {
  const seen = [], counts = { private: 0, market: 0 };
  const gate = createOwnerIdentityGate({ origin, ownerSubject: "synthetic-owner", store: createMemoryOwnerIdentityStore(), adapter: {
    issuer: "https://synthetic.invalid", redirectUri: origin + "/auth/google/callback",
    authorizationUrl() { throw Error("No identity interaction permitted"); }, async exchange() { throw Error("No identity interaction permitted"); },
  } });
  const app = createPrivateApplication({ origin, release: "a".repeat(40), gate,
    portfolio: async () => { counts.private++; throw Error("Public request reached private storage"); },
    market: { async latest() { counts.market++; throw Error("Public request reached market acquisition"); } },
    publicUi: async request => {
      seen.push(request);
      return privateUiResponse(new Response("Synthetic public evaluation shell", { headers: { "content-type": "text/html", "set-cookie": "synthetic-upstream=1", "access-control-allow-origin": "*" } }));
    },
  });
  const call = (path, init) => app(new Request(origin + path, init));
  return { call, app, seen, counts };
}

test("only exact evaluation GET reaches public UI, without cookies, identity, action or RSC headers", async () => {
  const f = fixture();
  const response = await f.call("/evaluation", { headers: { accept: "text/html", cookie: "synthetic-owner-cookie", authorization: "Bearer synthetic", origin, "x-oai-subject": "synthetic", "x-forwarded-for": "synthetic", "x-asha-intent": "owner-action", rsc: "1", "next-action": "synthetic" } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "Synthetic public evaluation shell");
  assert.equal(f.seen.length, 1); assert.equal(f.seen[0].url, origin + "/evaluation");
  assert.equal(f.seen[0].method, "GET"); assert.equal(f.seen[0].body, null);
  assert.deepEqual([...f.seen[0].headers], [["accept", "text/html"]]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(f.counts, { private: 0, market: 0 });
});

test("evaluation does not expose queries, child routes, encoding aliases, actions or write methods", async () => {
  const f = fixture();
  for (const path of ["/evaluation?__rsc=1", "/evaluation?owner=1", "/evaluation/private", "/evaluation/", "/Evaluation", "/%65valuation", "/evaluation%2fapi%2fportfolio", "/evaluation.json", "/evaluation/api/portfolio"]) assert.equal((await f.call(path)).status, 404, path);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) assert.equal((await f.call("/evaluation", { method, ...(method === "HEAD" ? {} : { body: "synthetic" }) })).status, 404, method);
  assert.equal(f.seen.length, 0); assert.deepEqual(f.counts, { private: 0, market: 0 });
});

test("public evaluation leaves private APIs denied even with forged identity/action headers", async () => {
  const f = fixture();
  assert.equal((await f.call("/evaluation")).status, 200);
  const headers = { origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-action", "x-asha-portfolio-request": "save", "x-asha-managed-market": "latest", "x-oai-subject": "synthetic-owner", cookie: "__Host-asha-owner=synthetic-forgery" };
  for (const path of ["/api/portfolio", "/api/portfolio/export", "/auth/session", "/evaluation/../api/portfolio"]) assert.equal((await f.call(path, { headers })).status, 401, path);
  assert.equal((await f.call("/api/portfolio", { method: "PUT", headers, body: "{}" })).status, 401);
  assert.equal((await f.call("/api/managed-market", { method: "POST", headers })).status, 401);
  for (const path of ["/api/market-test", "/api/market", "/api/operator/csv", "/evaluation/api/managed-market"]) assert.equal((await f.call(path, { method: "POST", headers })).status, 404);
  assert.equal(f.seen.length, 1); assert.deepEqual(f.counts, { private: 0, market: 0 });
});

test("evaluation retains canonical host boundary and generic unavailable response", async () => {
  const f = fixture();
  assert.equal((await f.app(new Request("https://other.invalid/evaluation"))).status, 400);
  assert.equal((await f.call("/evaluation", { headers: { host: "other.invalid" } })).status, 400);
  assert.equal(f.seen.length, 0);
  const app = createPrivateApplication({ origin, release: "a".repeat(40), gate: {}, publicUi: async () => { throw Error("synthetic private upstream detail"); } });
  const result = await app(new Request(origin + "/evaluation"));
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "service_unavailable" });
  assert.equal(result.headers.get("cache-control"), "no-store");
});
