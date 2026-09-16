import assert from "node:assert/strict";
import test from "node:test";

import { createPortfolioGet, createPortfolioPut } from "../app/api/portfolio/route.ts";
import { PortfolioVersionConflictError } from "../data/postgres-portfolio-repository.ts";

const enabled = { ASHA_LOCAL_PORTFOLIO_ENABLED: "true" };
const preferences = {
  liquidityReservePercent: "",
  maxSingleAssetPercent: "",
  maxAcceptableDrawdownPercent: "",
  shortTermMonths: "",
  longTermYears: "",
  analysisHorizon: "short",
  decisionHorizon: "short",
};
const emptySnapshot = { version: 0, holdings: [], preferences };

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
    body: JSON.stringify({ preferences, ...payload }),
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
  assert.deepEqual(saved[3], preferences);
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

test("portfolio PUT rejects invalid owner preferences", async () => {
  let called = false;
  const handler = createPortfolioPut(resolution({ save: async () => { called = true; return emptySnapshot; } }), enabled);
  const response = await handler(saveRequest({ expectedVersion: 0, holdings: [], preferences: { ...preferences, maxSingleAssetPercent: "101" } }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "invalid_preferences");
  assert.equal(called, false);
});

test("portfolio PUT rejects null, primitive and unreadable bodies before accessing storage", async () => {
  let called = false;
  const handler = createPortfolioPut(async () => { called = true; throw Error("must not access storage"); }, enabled);
  const headers = { "content-type": "application/json", origin: "http://localhost:4174", "sec-fetch-site": "same-origin", "x-asha-portfolio-request": "save" };
  for (const body of ["null", "false", "0", '"text"', "[]"]) {
    const response = await handler(new Request("http://localhost:4174/api/portfolio", { method: "PUT", headers, body }));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "invalid_portfolio");
  }
  const unreadable = new Request("http://localhost:4174/api/portfolio", { method: "PUT", headers, body: "{}" });
  unreadable.text = async () => { throw Error("private request detail"); };
  const response = await handler(unreadable);
  assert.equal(response.status, 400);
  assert.doesNotMatch(await response.text(), /private request detail/);
  assert.equal(called, false);
});

test("portfolio PUT rejects numeric rounding, overflow and invalid horizon text before database access", async () => {
  let calls = 0;
  const handler = createPortfolioPut(async () => { calls++; throw Error("must not resolve storage"); }, enabled);
  const holding = { id: "synthetic-precision", name: "Synthetic", amount: 1, unit: "test", costToman: null, purchaseDate: null, note: "" };
  for (const values of [{ amount: 1.1234567890123 }, { amount: 1e-13 }, { amount: 1e26 }, { costToman: 1.005 }, { costToman: 1e36 }]) {
    const response = await handler(saveRequest({ expectedVersion: 0, holdings: [{ ...holding, ...values }] }));
    assert.equal(response.status, 422); assert.equal((await response.json()).code, "invalid_holding");
  }
  for (const values of [{ liquidityReservePercent: "12.345" }, { maxSingleAssetPercent: "10.0000000000000001" }, { maxAcceptableDrawdownPercent: "2e-3" }, { shortTermMonths: "1.5" }, { longTermYears: "1e0" }]) {
    const response = await handler(saveRequest({ expectedVersion: 0, holdings: [], preferences: { ...preferences, ...values } }));
    assert.equal(response.status, 422); assert.equal((await response.json()).code, "invalid_preferences");
  }
  assert.equal(calls, 0);
});
