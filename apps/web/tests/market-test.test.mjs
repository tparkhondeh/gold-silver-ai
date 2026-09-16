import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { makeNavasanSnapshot, validateMarketSnapshot, createMarketTestPortfolio, evaluateMarketTest, encodeMarketTest, decodeMarketTest, navasanRawRial, displayRialAsToman, tomanInputToRial, rialToTomanInput, MARKET_TEST_STORAGE } from "../app/market-test-contract.ts";
import { saveMarketTest, restoreMarketTest } from "../app/market-test-storage.ts";
import { createTestLocks } from "./helpers/snapshot-locks.mjs";
import { handleMarketTest } from "../app/api/market-test/route.ts";

// Entirely synthetic transport fixtures. Never copied from a provider or labelled as live evidence.
const now = Date.parse("2000-01-01T12:00:00.000Z");
const received = new Date(now).toISOString();
const payload = () => ({ "18ayar": { value: "10000000", timestamp: now / 1000 }, sekkeh: { value: "100000", timestamp: now / 1000 } });
const snapshot = () => makeNavasanSnapshot(payload(), "TOMAN", received);
const portfolio = () => ({ ...createMarketTestPortfolio(), snapshot: snapshot() });
const environment = { ASHA_LOCAL_MARKET_TEST_ENABLED: "true", NAVASAN_API_KEY: "synthetic-test-not-a-credential", NAVASAN_VALUE_UNIT: "TOMAN", NAVASAN_KEY_ROTATION_CONFIRMED: "true", NAVASAN_PLAN: "free" };
const request = (headers = {}, url = "http://127.0.0.1:4174/api/market-test", options = {}) => new Request(url, { method: "POST", headers: { origin: "http://127.0.0.1:4174", "sec-fetch-site": "same-origin", "x-asha-market-test": "latest-once", ...headers }, ...options });
const allowed = { allowed: true, used: 7, remaining: 108, reservationId: "test-reservation", retryAfterSeconds: null };
function dependencies(overrides = {}) {
  const calls = { reserve: 0, fetch: 0, outcomes: [] };
  const ledger = { async reserve(endpoint, hash, interval) { calls.reserve++; assert.equal(endpoint, "latest"); assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(interval, overrides.expectedInterval ?? 24000); return overrides.reservation ?? allowed; }, async recordLatestOutcome(value) { calls.outcomes.push(value); if (overrides.recordFailure) throw new Error("test"); } };
  return { calls, resolve: async () => ({ available: true, ledger }), fetcher: async (url, options) => { calls.fetch++; assert.equal(url.hostname, "api.navasan.tech"); assert.equal(url.pathname, "/latest/"); assert.equal(options.redirect, "manual"); assert.equal(options.cache, "no-store"); if (overrides.throwFetch) throw new Error("synthetic-test-not-a-credential"); return overrides.response ?? Response.json(payload()); } };
}

test("synthetic transport exercises exact Navasan denomination, provider scale and provenance", () => {
  const s = snapshot(); validateMarketSnapshot(s, now);
  assert.equal(s.observations[0].priceRial, "100000000");
  assert.equal(s.observations[1].priceRial, "1000000000");
  assert.equal(s.observations[0].purityPermille, 750); assert.equal(s.observations[1].purityPermille, null);
  assert.equal(s.observations[1].rawValue, "100000");
  assert.equal(navasanRawRial("123.45", "TOMAN", 1000), "1234500");
  assert.equal(navasanRawRial("100", "IRR", 1), "100");
  for (const raw of ["-1", "NaN", "1e5", "0", "0.000001", "secret", "1,0"]) assert.throws(() => navasanRawRial(raw, "TOMAN", 1));
  assert.equal(displayRialAsToman("12345"), "۱٬۲۳۴٫۵ تومان"); assert.equal(displayRialAsToman(null), "قابل محاسبه نیست");
  assert.equal(displayRialAsToman("100"), "۱۰ تومان");
  for (const amount of ["0", "12500000.1", "99999999999999999.9"]) assert.equal(rialToTomanInput(tomanInputToRial(amount)), amount);
  for (const amount of ["", "-1", "0.01", "1e3", "1000000000000000000"]) assert.throws(() => tomanInputToRial(amount));
  assert.throws(() => makeNavasanSnapshot({ "18ayar": { value: "10000000", timestamp: true } }, "TOMAN", received));
});

test("valuation, changes, cash, weights and horizons share one exact input without decisions", () => {
  const p = portfolio(); const e = evaluateMarketTest(p, now);
  assert.equal(e.observedTotalRial, "1200000000"); assert.equal(e.currentTotalRial, e.observedTotalRial);
  assert.equal(e.weightsBps.EMAMI_COIN_IRR, 8333); assert.equal(e.cashWeightBps, 833);
  assert.equal(e.decision.state, "undecidable"); assert.equal(e.decision.financialUseAllowed, false);
  for (const field of ["amountRial", "quantityMilli", "costRial", "cashAfterRial"]) assert.equal(e.decision[field], null);
  p.quantitiesMilli.GOLD_18K_IRR = 2345; p.cashRial = "200000001"; p.minimumCashBps = 2501; p.shortDays = 14; p.mediumDays = 90; p.revision++;
  const changed = evaluateMarketTest(p, now);
  assert.equal(changed.observedTotalRial, "1434500001"); assert.equal(changed.minimumCashRial, "358768451");
  assert.equal(changed.decision.state, "undecidable");
  assert.deepEqual(decodeMarketTest(encodeMarketTest(p, now), now), p);
});

test("missing, stale, future, unsupported and zero positions never invent current total or hold", () => {
  const p = portfolio(); p.quantitiesMilli.SILVER_999_IRR = 1000;
  assert.equal(evaluateMarketTest(p, now).observedTotalRial, null);
  p.quantitiesMilli.SILVER_999_IRR = 0;
  const stale = evaluateMarketTest(p, now + 3_600_001); assert.equal(stale.currentTotalRial, null); assert.equal(stale.observedTotalRial, "1200000000");
  const future = portfolio(); future.snapshot.observations[0].publishedAt = new Date(now + 1).toISOString(); assert.equal(evaluateMarketTest(future, now).rows[0].state, "future");
  p.snapshot = null; assert.equal(evaluateMarketTest(p, now).currentTotalRial, null);
  p.quantitiesMilli.GOLD_18K_IRR = 0; p.quantitiesMilli.EMAMI_COIN_IRR = 0; p.cashRial = "0";
  const zero = evaluateMarketTest(p, now); assert.equal(zero.currentTotalRial, "0"); assert.equal(zero.cashWeightBps, null);
});

test("reject mismatched source, units, purity, dates, raw price, unknown fields and mixed datasets", () => {
  for (const edit of [
    s => { s.datasetKind = "synthetic_fixture"; }, s => { s.version = "v2"; }, s => { s.apiKey = "test"; },
    s => { s.observations[0].source = "rahavard"; }, s => { s.observations[0].sourceUrl = "https://evil.invalid"; },
    s => { s.observations[0].unit = "unit"; }, s => { s.observations[0].purityPermille = 999; },
    s => { s.observations[0].rawCurrency = "unknown"; }, s => { s.observations[0].providerSymbol = "unsupported"; },
    s => { s.observations[0].priceRial = "1"; }, s => { s.observations[0].publishedAt = "invalid"; },
    s => { s.observations[0].publishedAt = new Date(now + 300001).toISOString(); },
    s => { s.observations[0].receivedAt = "2000-01-01T11:00:00.000Z"; },
    s => { s.receivedAt = new Date(now + 300001).toISOString(); },
    s => { s.observations.push(s.observations[0]); }, s => { s.observations = []; },
  ]) { const s = snapshot(); edit(s); assert.throws(() => validateMarketSnapshot(s, now)); }
  for (const bad of [null, [], {}, { "18ayar": null }, { "18ayar": { value: null } }, { "18ayar": { value: "garbage" } }]) assert.throws(() => makeNavasanSnapshot(bad, "TOMAN", received));
  const badTime = snapshot(); badTime.receivedAt = "2000-02-31T12:00:00.000Z"; assert.throws(() => validateMarketSnapshot(badTime, now));
  for (const edit of [p => { p.quantitiesMilli.EMAMI_COIN_IRR = 500; }, p => { p.cashRial = "1.1"; }, p => { p.mediumDays = p.shortDays; }, p => { p.minimumCashBps = NaN; }, p => { p.selectedAsset = "UNKNOWN"; }, p => { p.holdingsKind = "real_personal"; }, p => { p.quantitiesMilli.GOLD_18K_IRR = -1; }, p => { p.maximumAssetBps = 0; }, p => { p.quantitiesMilli.UNKNOWN = 1; }]) { const p = portfolio(); edit(p); assert.throws(() => evaluateMarketTest(p, now)); }
});

test("save/recover stays isolated, deterministic, fail-closed and rechecks freshness", async () => {
  const data = new Map([["personal-portfolio", "do-not-touch"], ["asha-shared-synthetic-portfolio-v1", "synthetic-existing"]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const locks = createTestLocks();
  assert.deepEqual(restoreMarketTest(storage, now), { raw: null, portfolio: null });
  const p = portfolio(); await saveMarketTest(storage, p, now, null, locks); const before = data.get(MARKET_TEST_STORAGE);
  assert.deepEqual(restoreMarketTest(storage, now).portfolio, p);
  assert.equal(evaluateMarketTest(restoreMarketTest(storage, now + 7200000).portfolio, now + 7200000).currentTotalRial, null);
  await assert.rejects(() => saveMarketTest({ ...storage, setItem() { throw new Error("quota exceeded"); } }, p, now + 1, before, locks));
  assert.throws(() => restoreMarketTest({ ...storage, getItem() { throw new Error("denied"); } }, now));
  assert.equal(data.get(MARKET_TEST_STORAGE), before); assert.equal(data.get("personal-portfolio"), "do-not-touch"); assert.equal(data.size, 3);
  assert.throws(() => decodeMarketTest(before.replace('"state":"undecidable"', '"state":"hold"'), now));
  assert.throws(() => decodeMarketTest(before.replace('"revision":0', '"revision":0,"revision":1'), now));
  assert.throws(() => decodeMarketTest("x".repeat(100001), now));
  assert.throws(() => decodeMarketTest(before, now - 300001));
  assert.throws(() => decodeMarketTest(before.replace('"version":"asha.market_test_document.v1"', '"version":"wrong"'), now));
});

test("local boundary rejects remote, missing intent, cross origin, body, paid plan and configuration before quota", async () => {
  for (const req of [request({ origin: "https://evil.invalid" }), request({ "sec-fetch-site": "cross-site" }), request({ "x-asha-market-test": "" }), request({}, "https://goldsilver.wealthos.ir/api/market-test"), request({}, "http://127.0.0.1:4174/api/market-test?api_key=x"), request({ "content-length": "1" }), request({}, undefined, { body: "x" }), new Request("http://127.0.0.1:4174/api/market-test")]) {
    const d = dependencies(); assert.ok((await handleMarketTest(req, environment, d.resolve, d.fetcher, () => now)).status >= 400); assert.equal(d.calls.reserve, 0); assert.equal(d.calls.fetch, 0);
  }
  for (const env of [{ ...environment, ASHA_LOCAL_MARKET_TEST_ENABLED: "false" }, { ...environment, NAVASAN_PLAN: "gold" }, { ...environment, NAVASAN_API_KEY: "" }, { ...environment, NAVASAN_KEY_ROTATION_CONFIRMED: "false" }, { ...environment, NAVASAN_VALUE_UNIT: "" }]) {
    const d = dependencies(); assert.ok((await handleMarketTest(request(), env, d.resolve, d.fetcher, () => now)).status >= 400); assert.equal(d.calls.reserve, 0);
  }
});

test("one explicit latest request shares durable free quota and returns only approved bounded metadata", async () => {
  const d = dependencies(); const response = await handleMarketTest(request(), environment, d.resolve, d.fetcher, () => now);
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.state, "received"); validateMarketSnapshot(body.snapshot, now);
  assert.equal(d.calls.reserve, 1); assert.equal(d.calls.fetch, 1); assert.equal(d.calls.outcomes[0].outcome, "success"); assert.equal(d.calls.outcomes[0].quoteCount, 2);
  assert.ok(!JSON.stringify(body).includes(environment.NAVASAN_API_KEY)); assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cooldown, exhausted and unavailable ledger make zero upstream requests", async () => {
  for (const remaining of [0, 50]) { const d = dependencies({ reservation: { ...allowed, allowed: false, remaining, reservationId: null, retryAfterSeconds: 24000 } }); const response = await handleMarketTest(request(), environment, d.resolve, d.fetcher, () => now); assert.equal(response.status, 429); assert.equal(d.calls.fetch, 0); }
  for (const resolve of [async () => ({ available: false }), async () => { throw new Error("database down"); }, async () => ({ available: true, ledger: { async reserve() { throw new Error("database down"); } } })]) { const d = dependencies(); assert.equal((await handleMarketTest(request(), environment, resolve, d.fetcher, () => now)).status, 503); assert.equal(d.calls.fetch, 0); }
});

test("latest test route preserves slower free cadence while retaining the default and minimum", async () => {
  for (const [configured, expectedInterval] of [[undefined, 24000], ["60", 24000], ["0", 24000], ["invalid", 24000], ["24000", 24000], ["86400", 86400], ["86400.9", 86400]]) {
    const d = dependencies({ expectedInterval });
    const response = await handleMarketTest(request(), { ...environment, NAVASAN_REFRESH_SECONDS: configured }, d.resolve, d.fetcher, () => now);
    assert.equal(response.status, 200); assert.equal(d.calls.reserve, 1); assert.equal(d.calls.fetch, 1);
  }
  const d = dependencies();
  assert.equal((await handleMarketTest(request(), { ...environment, NAVASAN_PLAN: undefined }, d.resolve, d.fetcher, () => now)).status, 200);
});

test("slower configured cooldown cannot be shortened through request inputs or paid-plan settings", async () => {
  const env = { ...environment, NAVASAN_REFRESH_SECONDS: "86400" };
  let reservations = 0, upstream = 0;
  const resolve = async () => ({ available: true, ledger: {
    async reserve(_endpoint, _hash, interval) {
      reservations++;
      const elapsed = 25000; // Past the old 24,000-second limit, inside one day.
      return interval > elapsed
        ? { allowed: false, used: 1, remaining: 114, reservationId: null, retryAfterSeconds: interval - elapsed }
        : allowed;
    },
    async recordLatestOutcome() {},
  } });
  const fetcher = async () => { upstream++; return Response.json(payload()); };
  const response = await handleMarketTest(request({ "x-asha-refresh-seconds": "0" }), env, resolve, fetcher, () => now);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).retryAfterSeconds, 61400);
  assert.equal(reservations, 1); assert.equal(upstream, 0);
  for (const req of [request({}, "http://127.0.0.1:4174/api/market-test?refreshSeconds=0"), request({}, undefined, { body: '{"refreshSeconds":0}' })]) assert.ok((await handleMarketTest(req, env, resolve, fetcher, () => now)).status >= 400);
  for (const plan of ["standard", "gold"]) assert.equal((await handleMarketTest(request(), { ...env, NAVASAN_PLAN: plan }, resolve, fetcher, () => now)).status, 403);
  assert.equal(reservations, 1); assert.equal(upstream, 0);
});

test("outage, malformed, oversized response and recording failure never retry or leak key", async () => {
  for (const options of [{ throwFetch: true }, { response: Response.redirect("https://example.invalid/", 302) }, { response: Response.json({}, { status: 429 }) }, { response: new Response("invalid") }, { response: new Response("a".repeat(262145)) }, { response: new Response(null) }, { response: Response.json({}) }, { recordFailure: true }]) {
    const d = dependencies(options); const response = await handleMarketTest(request(), environment, d.resolve, d.fetcher, () => now);
    assert.equal(response.status, 502); assert.equal(d.calls.fetch, 1); const report = await response.json(); assert.ok(!JSON.stringify(report).includes(environment.NAVASAN_API_KEY)); assert.ok(["network", "http", "payload", "validation", "outcome_recording"].includes(report.stage)); assert.equal(d.calls.outcomes.at(-1).outcome, "failure");
  }
});

test("UI uses a separate contract for all navigation paths, no scraping or market quote edits", () => {
  const ui = readFileSync(new URL("../app/market-test-workspace.tsx", import.meta.url), "utf8");
  for (const view of ["overview", "portfolio", "asset-center", "analysis", "decisions", "risk", "market", "data", "agents"]) assert.ok(ui.includes(`view === "${view}"`));
  assert.ok(!ui.includes("buildActionPlan")); assert.ok(!ui.includes("setInterval(() => receive")); assert.ok(ui.includes("validateMarketSnapshot(body.snapshot"));
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"); assert.ok(page.includes("!sharedPortfolioActive && !marketTestActive")); assert.ok(page.includes("if (marketTestActive || !holdingsLoaded || portfolioMode !=="));
  assert.ok(page.includes('if (!holdingsLoaded) { sessionStorage.setItem(portfolioPreferenceKey, mode); setPortfolioMode(mode); return; }'));
  assert.ok(page.includes('if (portfolioMode === mode) return;'));
  assert.ok(page.includes('if (legacyStorageIssue || marketTestActive || !holdingsLoaded || portfolioMode === "demo") return;'));
  assert.ok(!page.includes('sessionStorage.removeItem("asha-personal-holdings-backup-v1")'));
});
