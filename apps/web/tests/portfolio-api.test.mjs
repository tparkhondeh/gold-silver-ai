import assert from "node:assert/strict";
import test from "node:test";

import { createPortfolioGet, createPortfolioPut } from "../app/api/portfolio/route.ts";
import { PortfolioVersionConflictError } from "../data/postgres-portfolio-repository.ts";

const enabled = { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" };
const emptySnapshot = { version: 0, updatedAt: null, holdings: [] };

function resolution(repository) {
  return async () => ({ available: true, repository });
}

function saveRequest(payload, overrides = {}) {
  return new Request("http://localhost:4174/api/portfolio", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:4174",
      "sec-fetch-site": "same-origin",
      "x-asha-portfolio-request": "save",
      ...overrides,
    },
    body: JSON.stringify(payload),
  });
}

test("portfolio API stays closed unless local persistence is explicitly enabled", async () => {
  const handler = createPortfolioGet(resolution({ load: async () => emptySnapshot }), {});
  const response = await handler(new Request("http://localhost:4174/api/portfolio"));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "portfolio_boundary");
});

test("portfolio GET returns the owner snapshot without caching", async () => {
  let subject;
  const handler = createPortfolioGet(resolution({ load: async (value) => { subject = value; return emptySnapshot; } }), enabled);
  const response = await handler(new Request("http://127.0.0.1:4174/api/portfolio"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(subject, "local-owner-v1");
  assert.deepEqual((await response.json()).snapshot, emptySnapshot);
});

test("portfolio PUT validates intent and saves a complete snapshot", async () => {
  let saved;
  const snapshot = { version: 1, updatedAt: "2026-08-31T00:00:00.000Z", holdings: [] };
  const handler = createPortfolioPut(resolution({ save: async (...args) => { saved = args; return snapshot; } }), enabled);
  const holding = { id: "gold-1", name: "طلای ۱۸ عیار", amount: 2.5, unit: "گرم", costToman: 25000000, purchaseDate: "1405-06-09", note: "شخصی" };
  const response = await handler(saveRequest({ expectedVersion: 0, holdings: [holding] }));
  assert.equal(response.status, 200);
  assert.equal(saved[0], "local-owner-v1");
  assert.equal(saved[1], 0);
  assert.deepEqual(saved[2], [holding]);
});

test("portfolio PUT rejects cross-origin and duplicate holdings before database access", async () => {
  let called = false;
  const handler = createPortfolioPut(resolution({ save: async () => { called = true; return emptySnapshot; } }), enabled);
  const holding = { id: "same-id", name: "طلا", amount: 1, unit: "گرم", costToman: null, purchaseDate: null, note: "" };
  const crossOrigin = await handler(saveRequest({ expectedVersion: 0, holdings: [] }, { origin: "https://example.com" }));
  assert.equal(crossOrigin.status, 403);
  const duplicate = await handler(saveRequest({ expectedVersion: 0, holdings: [holding, holding] }));
  assert.equal(duplicate.status, 422);
  assert.equal(called, false);
});

test("portfolio version conflict is explicit and database errors do not leak details", async () => {
  const conflict = createPortfolioPut(resolution({ save: async () => { throw new PortfolioVersionConflictError(4); } }), enabled);
  const conflictResponse = await conflict(saveRequest({ expectedVersion: 2, holdings: [] }));
  assert.equal(conflictResponse.status, 409);
  assert.equal((await conflictResponse.json()).code, "version_conflict");

  const failed = createPortfolioPut(resolution({ save: async () => { throw new Error("secret database password"); } }), enabled);
  const failedResponse = await failed(saveRequest({ expectedVersion: 0, holdings: [] }));
  assert.equal(failedResponse.status, 503);
  assert.doesNotMatch(await failedResponse.text(), /secret|password/i);
});
