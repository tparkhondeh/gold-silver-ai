import assert from "node:assert/strict";
import test from "node:test";

async function request(path = "/", headers = { accept: "text/html" }) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

async function render() {
  return request();
}

test("renders the Persian wealth and market dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  const html = await response.text();
  assert.match(html, /lang="fa"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /اشا/);
  assert.match(html, /نشان اشا/);
  assert.match(html, /ASHA/);
  assert.match(html, /بدون قیمت ساختگی/);
  assert.match(html, /load-demo-portfolio/);
  assert.match(html, /notification-center/);
  assert.match(html, /تحلیل دارایی‌ها/);
  assert.match(html, /هیئت بررسی/);
  assert.match(html, /داشبورد ثروت شخصی/);
  assert.match(html, /خلاصهٔ تصمیم اشا/);
  assert.match(html, /بهترین اقدام مجاز اکنون/);
  assert.match(html, /مرکز دارایی/);
  assert.match(html, /تصمیم‌های دارایی/);
  assert.match(html, /PHASE 1 · EVALUATION/);
  assert.match(html, /سبد دارایی‌های من/);
  assert.match(html, /فرصت‌های خیلی جذاب/);
  assert.match(html, /دیده‌بان بازار/);
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
  assert.equal(health.engines.some((engine) => engine.id === "financial-decision" && engine.state === "blocked"), true);
});

test("serves the owner-approved Rahavard snapshot with deterministic IRR-to-toman conversion", async () => {
  const response = await request("/api/market", { accept: "application/json" });
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
  assert.equal(feed.sources.some((source) => source.id === "tgju" && source.status === "needs_key"), true);
});
