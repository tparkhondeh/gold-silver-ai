import assert from "node:assert/strict";
import test from "node:test";

import { createNavasanHistoryPost } from "../app/api/operator/navasan-history/route.ts";

const environment = {
  NAVASAN_API_KEY: "synthetic-test-credential",
  NAVASAN_VALUE_UNIT: "TOMAN",
  NAVASAN_KEY_ROTATION_CONFIRMED: "true",
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
