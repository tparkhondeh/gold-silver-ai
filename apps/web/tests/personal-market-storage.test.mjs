import assert from "node:assert/strict";
import test from "node:test";
import { makeNavasanSnapshot, MARKET_TEST_STORAGE, MARKET_TTL_MS } from "../app/market-test-contract.ts";
import { PERSONAL_MARKET_STORAGE, encodePersonalMarketSnapshot, decodePersonalMarketSnapshot, savePersonalMarketSnapshot, restorePersonalMarketSnapshot } from "../app/personal-market-storage.ts";
import { PersonalMarketRequestError, requestPersonalMarketSnapshot } from "../app/personal-market-client.ts";
import { createTestLocks } from "./helpers/snapshot-locks.mjs";

const now = Date.parse("2000-01-01T12:00:00.000Z");
const snapshot = (time = now) => makeNavasanSnapshot({ "18ayar": { value: "5000000", timestamp: String(time / 1000) }, usd_sell: { value: "100000", timestamp: String(time / 1000) } }, "TOMAN", new Date(time).toISOString());
const receipt = (value = snapshot()) => ({ state: "received", snapshot: value, used: 1, remaining: 114 });
function memory() {
  const data = new Map([[MARKET_TEST_STORAGE, "isolated-fixture"], ["gold-silver-holdings", "private-holdings"], ["asha-purchase-book-v1", "private-purchases"]]);
  let writes = 0;
  return { data, get writes() { return writes; }, storage: { getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { writes++; data.set(key, value); } } };
}

test("personal latest save/reload stores only one snapshot and leaves every other namespace intact", async () => {
  const store = memory(), locks = createTestLocks(), first = snapshot();
  assert.deepEqual(restorePersonalMarketSnapshot(store.storage, now), { raw: null, snapshot: null });
  const raw = await savePersonalMarketSnapshot(store.storage, first, now, null, locks);
  assert.deepEqual(restorePersonalMarketSnapshot(store.storage, now), { raw, snapshot: first });
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["snapshot", "version"]);
  assert.equal(JSON.parse(raw).version, "asha.personal_latest_market.v1");
  assert.equal(store.data.size, 4);
  assert.equal(store.data.get(MARKET_TEST_STORAGE), "isolated-fixture");
  assert.equal(store.data.get("gold-silver-holdings"), "private-holdings");
  assert.equal(store.data.get("asha-purchase-book-v1"), "private-purchases");
  await savePersonalMarketSnapshot(store.storage, first, now, raw, locks);
  assert.equal(store.writes, 1);
  const second = snapshot(now + 1000);
  const next = await savePersonalMarketSnapshot(store.storage, second, now + 1000, raw, locks);
  assert.notEqual(next, raw);
  assert.equal(store.data.size, 4); // No backup price series.
  const restored = restorePersonalMarketSnapshot(store.storage, now + MARKET_TTL_MS + 2000).snapshot;
  assert.equal(restored.observations[0].publishedAt, second.observations[0].publishedAt);
  assert.equal(restored.receivedAt, second.receivedAt); // Read never refreshes timestamps.
  restored.observations[0].priceRial = "1";
  assert.deepEqual(restorePersonalMarketSnapshot(store.storage, now + 1000).snapshot, second);
});

test("unread, changed, corrupt, denied or locked storage is never overwritten", async () => {
  const store = memory(), locks = createTestLocks(), value = snapshot();
  await assert.rejects(savePersonalMarketSnapshot(store.storage, value, now, undefined, locks));
  assert.equal(store.writes, 0);
  const raw = await savePersonalMarketSnapshot(store.storage, value, now, null, locks);
  await assert.rejects(savePersonalMarketSnapshot(store.storage, value, now, null, locks));
  await assert.rejects(savePersonalMarketSnapshot(store.storage, value, now, raw, { request: async (_key, _options, callback) => callback(null) }));
  await assert.rejects(savePersonalMarketSnapshot(store.storage, value, now, raw, null));
  assert.equal(store.writes, 1);
  for (const damaged of ["not-json", raw.replace('"version":"asha.personal_latest_market.v1"', '"version":"wrong"'), raw.replace('"snapshot":', '"unexpected":"private","snapshot":'), raw.replace('"version":', '"version":"duplicate","version":')]) {
    store.data.set(PERSONAL_MARKET_STORAGE, damaged);
    assert.throws(() => restorePersonalMarketSnapshot(store.storage, now));
    await assert.rejects(savePersonalMarketSnapshot(store.storage, value, now, damaged, locks));
    assert.equal(store.data.get(PERSONAL_MARKET_STORAGE), damaged);
  }
  assert.throws(() => restorePersonalMarketSnapshot({ getItem() { throw Error("denied"); } }, now));
  store.data.set(PERSONAL_MARKET_STORAGE, raw);
  await assert.rejects(savePersonalMarketSnapshot({ ...store.storage, setItem() { throw Error("full"); } }, snapshot(now + 1000), now + 1000, raw, locks));
  assert.equal(store.data.get(PERSONAL_MARKET_STORAGE), raw);
});

test("two stale tabs cannot overwrite and caller mutation cannot alter a pending save", async () => {
  const store = memory(), locks = createTestLocks(), first = snapshot();
  const results = await Promise.allSettled([savePersonalMarketSnapshot(store.storage, first, now, null, locks), savePersonalMarketSnapshot(store.storage, snapshot(now + 1000), now + 1000, null, locks)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const raw = store.data.get(PERSONAL_MARKET_STORAGE);
  let complete;
  const delayed = { request: (_name, _options, callback) => new Promise(resolve => { complete = () => resolve(callback({})); }) };
  const candidate = snapshot(now + 2000), expected = structuredClone(candidate);
  const pending = savePersonalMarketSnapshot(store.storage, candidate, now + 2000, raw, delayed);
  candidate.observations[0].rawValue = "999";
  complete(); await pending;
  assert.deepEqual(restorePersonalMarketSnapshot(store.storage, now + 2000).snapshot, expected);
});

test("snapshot contract rejects injected fields, invalid arithmetic, future receipt and oversized documents", () => {
  for (const edit of [s => { s.holdings = []; }, s => { s.observations[0].priceRial = "1"; }, s => { s.observations[0].sourceUrl = "https://evil.invalid"; }, s => { s.observations[0].unit = "unit"; }]) {
    const value = snapshot(); edit(value); assert.throws(() => encodePersonalMarketSnapshot(value, now));
  }
  assert.throws(() => encodePersonalMarketSnapshot(snapshot(now + 301000), now));
  assert.throws(() => decodePersonalMarketSnapshot(" ".repeat(65537), now));
});

test("explicit request sends only fixed bodyless same-origin intent and returns validated metadata", async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, "/api/market-test");
    assert.deepEqual(Object.keys(options).sort(), ["cache", "credentials", "headers", "method", "redirect", "signal"]);
    assert.equal(options.method, "POST"); assert.equal(options.body, undefined);
    assert.deepEqual(options.headers, { "x-asha-market-test": "latest-once" });
    assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin"); assert.equal(options.redirect, "error");
    assert.equal(options.signal.aborted, false);
    return Response.json(receipt());
  };
  assert.deepEqual(await requestPersonalMarketSnapshot(undefined, fetcher, () => now), { snapshot: snapshot(), used: 1, remaining: 114 });
  assert.equal(calls, 1);
});

test("quota, server and network failures never retry or reflect secret/private response text", async () => {
  for (const [reason, status] of [["refresh_cooldown", 429], ["quota_exhausted", 429], ["quota_unavailable", 503], ["provider_or_validation_failed", 502], ["RAW_SECRET_private_holdings", 500]]) {
    let calls = 0;
    await assert.rejects(requestPersonalMarketSnapshot(undefined, async () => { calls++; return Response.json({ state: "blocked", reason, retryAfterSeconds: 120, debug: "RAW_SECRET_private_holdings" }, { status }); }, () => now), error => {
      assert.ok(error instanceof PersonalMarketRequestError); assert.ok(!error.message.includes("RAW_SECRET"));
      assert.equal(error.reason, reason === "RAW_SECRET_private_holdings" ? "invalid_response" : reason);
      assert.equal(error.retryAfterSeconds, reason === "refresh_cooldown" ? 120 : null);
      return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(requestPersonalMarketSnapshot(undefined, async () => { throw Error("RAW_SECRET_private_holdings"); }), error => error.reason === "connection_failed" && !error.message.includes("RAW_SECRET"));
});

test("malformed, oversized, wrong-type or inconsistent replies fail closed", async () => {
  const badSnapshot = snapshot(); badSnapshot.observations[0].priceRial = "1";
  const inputs = [
    () => Response.json(null), () => Response.json({ ...receipt(), private: "must-not-pass" }),
    () => Response.json({ ...receipt(), used: 0, remaining: 115 }), () => Response.json({ ...receipt(), remaining: 115 }),
    () => Response.json({ ...receipt(), used: "1" }), () => Response.json(receipt(badSnapshot)),
    () => new Response("<html>RAW_SECRET</html>", { headers: { "content-type": "text/html" } }),
    () => new Response("{bad", { headers: { "content-type": "application/json" } }),
    () => new Response('"' + "x".repeat(65537) + '"', { headers: { "content-type": "application/json" } }),
    () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "65537" } }),
    () => new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    () => Response.json(receipt(snapshot(now + 301000))),
  ];
  for (const response of inputs) await assert.rejects(requestPersonalMarketSnapshot(undefined, async () => response(), () => now), error => error.reason === "invalid_response");
});

test("abort before dispatch makes no request; abort after dispatch suppresses ignored late success", async () => {
  const early = new AbortController(); early.abort(); let calls = 0;
  await assert.rejects(requestPersonalMarketSnapshot(early.signal, async () => { calls++; }), error => error.reason === "aborted");
  assert.equal(calls, 0);
  const active = new AbortController(); let finish, receivedSignal;
  const pending = requestPersonalMarketSnapshot(active.signal, async (_url, options) => { calls++; receivedSignal = options.signal; return new Promise(resolve => { finish = resolve; }); }, () => now);
  active.abort();
  await assert.rejects(pending, error => error.reason === "aborted");
  assert.equal(receivedSignal.aborted, true); assert.equal(calls, 1);
  finish(Response.json(receipt()));
  await Promise.resolve();
});

test("ten-second timeout rejects a stalled response body, cancels reading and never retries", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, cancelled = 0;
  const pending = requestPersonalMarketSnapshot(undefined, async () => {
    calls++;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"state":')); }, cancel() { cancelled++; } }), { headers: { "content-type": "application/json" } });
  }, () => now);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  context.mock.timers.tick(10_000);
  await assert.rejects(pending, error => error.reason === "timeout");
  assert.equal(calls, 1); assert.equal(cancelled, 1);
  context.mock.timers.reset();
});
