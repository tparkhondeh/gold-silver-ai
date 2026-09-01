import assert from "node:assert/strict";
import test from "node:test";

import { createNavasanHistoryPost } from "../app/api/operator/navasan-history/route.ts";

const environment = {
  NAVASAN_API_KEY: "synthetic-test-credential",
  NAVASAN_VALUE_UNIT: "TOMAN",
  NAVASAN_KEY_ROTATION_CONFIRMED: "true",
  NAVASAN_HISTORY_EXECUTION_ENABLED: "true",
  NAVASAN_HISTORY_LICENSE_REFERENCE: "synthetic-license-fixture-v1",
};

function request(payload, url = "http://localhost/api/operator/navasan-history") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(url).origin,
      "sec-fetch-site": "same-origin",
      "x-asha-navasan-history": "read",
    },
    body: JSON.stringify(payload),
  });
}

test("reads approved history only after a durable reservation", async () => {
  const events = [];
  const quota = { available: true, ledger: { async reserve(endpoint, hash) {
    events.push({ type: "reserve", endpoint, hash });
    return { allowed: true, used: 1, remaining: 114, reservationId: "test" };
  } } };
  const fetcher = async (url) => {
    events.push({ type: "fetch", hasSecret: url.includes("synthetic-test-credential") });
    return Response.json([{ timestamp: Math.floor(Date.parse("2026-08-30T12:00:00.000Z") / 1000), date: "1405-06-08", value: "200000", change: "0" }]);
  };
  const post = createNavasanHistoryPost(async () => quota, fetcher, environment);
  const response = await post(request({ action: "dailyCurrency", item: "usd_sell", date: "1405-06-08" }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.points[0].instrumentCode, "USD_IRR");
  assert.deepEqual(events.map((event) => event.type), ["reserve", "fetch"]);
  assert.equal(events[1].hasSecret, true);
  assert.equal(JSON.stringify(body).includes(environment.NAVASAN_API_KEY), false);
});

test("rejects public access and exhausted quota before any provider request", async () => {
  let fetchCount = 0;
  const post = createNavasanHistoryPost(async () => ({ available: true, ledger: { async reserve() {
    return { allowed: false, used: 115, remaining: 0, reservationId: null };
  } } }), async () => { fetchCount += 1; return Response.json([]); }, environment);
  const publicResponse = await post(request({ action: "dailyCurrency", item: "usd_sell", date: "1405-06-08" }, "https://example.com/api/operator/navasan-history"));
  assert.equal(publicResponse.status, 403);
  const quotaResponse = await post(request({ action: "dailyCurrency", item: "usd_sell", date: "1405-06-08" }));
  assert.equal(quotaResponse.status, 429);
  assert.equal(fetchCount, 0);
});

test("keeps history locked before quota reservation and network access", async () => {
  let quotaResolutionCount = 0;
  let fetchCount = 0;
  const resolveQuota = async () => {
    quotaResolutionCount += 1;
    return { available: true, ledger: { async reserve() { throw new Error("must not reserve"); } } };
  };
  const fetcher = async () => {
    fetchCount += 1;
    return Response.json([]);
  };

  const disabled = createNavasanHistoryPost(resolveQuota, fetcher, {
    ...environment,
    NAVASAN_HISTORY_EXECUTION_ENABLED: "false",
  });
  const disabledResponse = await disabled(request({ action: "dailyCurrency", item: "usd_sell", date: "1405-06-08" }));
  assert.equal(disabledResponse.status, 423);
  assert.equal((await disabledResponse.json()).code, "history_execution_disabled");

  const missingReference = createNavasanHistoryPost(resolveQuota, fetcher, {
    ...environment,
    NAVASAN_HISTORY_LICENSE_REFERENCE: "",
  });
  const missingReferenceResponse = await missingReference(request({ action: "dailyCurrency", item: "usd_sell", date: "1405-06-08" }));
  assert.equal(missingReferenceResponse.status, 423);
  assert.equal((await missingReferenceResponse.json()).code, "history_license_reference_missing");
  assert.equal(quotaResolutionCount, 0);
  assert.equal(fetchCount, 0);
});
