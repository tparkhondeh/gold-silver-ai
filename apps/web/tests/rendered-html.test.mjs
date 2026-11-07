import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createRenderedWorker } from "./helpers/rendered-worker.mjs";

let worker;
before(async () => { worker = await createRenderedWorker(); });
after(async () => { await worker?.dispose(); });
const request = (...args) => worker.request(...args);

async function render() {
  return request();
}

test("renders a Persian access shell without exposing a portfolio before access verification", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  const html = await response.text();
  assert.match(html, /lang="fa"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /اشا/);
  assert.doesNotMatch(html, /data-testid="unified-workspace"/);
  assert.match(html, /سبد شخصی/);
  assert.match(html, /در حال بررسی دسترسی/);
  assert.doesNotMatch(html, /آزمون با قیمت بازار|آزمایشگاه ساختگی|سبد شخصی جداگانه/);
  assert.doesNotMatch(html, /notification-center/);
  assert.match(html, /ورود به سبد شخصی/);
  assert.match(html, /بررسی دوبارهٔ دسترسی/);
  assert.doesNotMatch(html, /MARKET · TECHNICAL TEST|دریافت یک‌باره|ذخیرهٔ آخرین قیمت|بازیابی قیمت/);
  assert.doesNotMatch(html, /فرصت‌های خیلی جذاب/);
  assert.doesNotMatch(html, /MARKET WATCH/);
  assert.doesNotMatch(html, /تصمیم بهتر، از/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("exposes an honest machine-readable readiness endpoint", async () => {
  const response = await request("/api/health", { accept: "application/json" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const health = await response.json();
  assert.equal(health.service, "asha-web");
  assert.equal(health.status, "evaluation_only");
  assert.equal(health.release.stableForFinancialUse, false);
  assert.equal(health.engines.some((engine) => engine.id === "navasan-history" && engine.state === "locked"), true);
  assert.equal(health.engines.some((engine) => engine.id === "financial-decision" && engine.state === "blocked"), true);
});

test("serves the manual snapshot deterministically and never sends an unrotated Navasan key", async () => {
  const { outboundRequests } = worker;
  const response = await request("/api/market", { accept: "application/json" }, true);
  assert.equal(response.status, 200);
  const feed = await response.json();
  const quoteByCode = new Map(feed.quotes.map((quote) => [quote.instrumentCode, quote]));

  assert.equal(quoteByCode.get("GOLD_18K_IRR")?.value, 21_480_700);
  assert.equal(quoteByCode.get("EMAMI_COIN_IRR")?.value, 212_500_000);
  assert.equal(quoteByCode.get("SILVER_999_IRR")?.value, 446_860);
  assert.equal(quoteByCode.get("USD_IRR")?.value, 199_800);
  assert.equal(quoteByCode.get("GOLD_18K_IRR")?.currency, "TOMAN");
  assert.equal(quoteByCode.get("GOLD_18K_IRR")?.publishedAt, null);
  assert.equal(feed.sources.some((source) => source.id === "rahavard-manual" && source.status === "snapshot"), true);
  assert.equal(feed.sources.some((source) => source.id === "xaus"), true);
  assert.equal(feed.sources.some((source) => source.id === "gold-api-com"), true);
  assert.equal(feed.sources.some((source) => source.id === "tgju" && source.status === "needs_key"), true);
  assert.equal(feed.sources.some((source) => source.id === "navasan" && source.status === "needs_key" && source.message.includes("کلید قبلی")), true);
  assert.equal(outboundRequests.some((url) => new URL(url).hostname === "xaus.com"), true);
  assert.equal(outboundRequests.some((url) => new URL(url).hostname === "api.gold-api.com"), true);
  assert.equal(outboundRequests.some((url) => url.includes("navasan.tech")), false);
  assert.equal(JSON.stringify(feed).includes("synthetic-test-credential"), false);
  outboundRequests.length = 0;
  const cached = await (await request("/api/market", { accept: "application/json" }, true)).json();
  assert.deepEqual(cached, feed);
  assert.deepEqual(outboundRequests, []);
  // Disabling must bypass an already populated cache as well as provider calls.
  const offline = await (await request("/api/market", { accept: "application/json" })).json();
  assert.equal(offline.networkAllowed, false);
  assert.deepEqual(offline.quotes, []);
  assert.deepEqual(outboundRequests, []);
});
