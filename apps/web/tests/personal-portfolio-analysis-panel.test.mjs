import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as analysisModule from "../app/personal-portfolio-analysis.ts";
import * as purchases from "../app/purchase-book.ts";
import * as numeric from "../data/portfolio-numeric-contract.ts";
import * as display from "../app/number-display.ts";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";

// Render actual panel, ratio and number components with synthetic in-memory
// inputs. No browser, account, network, storage or provider request is involved.
function compile(file, dependencies) {
  const source = readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const exports = {};
  new Function("require", "exports", "React", javascript)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected component dependency: ${name}`);
    return dependencies[name];
  }, exports, React);
  return exports;
}
const numbers = compile("number-value.tsx", { react: React, "./number-display": display });
const purchasePanel = compile("purchase-book-panel.tsx", {
  react: React, "./purchase-book.css": {}, "./number-value": numbers, "./purchase-book": purchases,
  "../data/portfolio-numeric-contract": numeric, "./purchase-import": {},
});
const { PersonalPortfolioAnalysisPanel } = compile("personal-portfolio-analysis-panel.tsx", {
  "./number-value": numbers, "./purchase-book-panel": purchasePanel, "./personal-portfolio-analysis": analysisModule,
});
const time = "2000-01-03T12:00:00.000Z", now = Date.parse(time);
function snapshot() {
  return { version: 7, holdings: [], purchaseBook: { ...purchases.emptyPurchaseBook(), lots: [{
    id: "synthetic-panel-purchase", assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750,
    quantity: "3", purchaseDate: "2000-01-02", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "900000", fees: null,
    note: "synthetic rendered fixture", source: { kind: "manual", reference: null }, fx: null,
  }] }, preferences: { liquidityReservePercent: "10", maxSingleAssetPercent: "60", maxAcceptableDrawdownPercent: "20", shortTermMonths: "3", longTermYears: "5", analysisHorizon: "short", decisionHorizon: "long" } };
}
const market = () => makeNavasanSnapshot({ "18ayar": { value: "1000000", timestamp: now / 1000 } }, "TOMAN", time);
const analyze = (input = snapshot(), quotes = market(), at = now) => analysisModule.buildPersonalPortfolioAnalysis(input, quotes, at);
const render = analysis => renderToStaticMarkup(React.createElement(PersonalPortfolioAnalysisPanel, { analysis }));
const segment = (html, id) => html.slice(html.indexOf(`data-testid="${id}"`)).split("</article>")[0];

test("rendered analysis names denominator, absent cash and descriptive-only limit comparison", () => {
  const result = analyze(), before = structuredClone(result), html = render(result);
  assert.match(html, /data-testid="personal-analysis"/);
  assert.match(html, /سهم از همهٔ دارایی‌های ثبت‌شده/);
  assert.match(html, /سهم از کل ثروت یا بودجهٔ قابل‌خرج نیست/);
  assert.match(html, /ماندهٔ نقد قابل‌خرج مستقل ثبت نشده است/);
  assert.match(html, /سهم این دارایی از سقف واردشده بیشتر است/);
  assert.match(html, /این مقایسه دستور فروش نیست/);
  assert.match(html, /استفادهٔ مالی فعال نیست/);
  assert.deepEqual(result, before);
});

test("per-purchase missing fields, quantities and quote identity/time remain reviewable", () => {
  const html = render(analyze());
  assert.match(html, /synthetic-panel-purchase/); assert.match(html, /2000-01-02/);
  assert.match(html, /نامشخص: هزینهٔ خرید، نرخ تاریخی دلار برای بهای دلاری/);
  assert.match(html, /navasan/); assert.match(html, /GOLD_18K_IRR/); assert.match(html, /2000-01-03T12:00:00.000Z/);
  assert.match(html, /مقدار دارای بهای کامل ریالی/); assert.match(html, /سود \/ زیان کل این دارایی/);
  assert.match(html, /asha.personal_market_valuation.v2/); assert.match(html, /asha.personal_portfolio_analysis.v1/);
});

test("short and medium decisions disclose independent horizons and one unknown budget without controls", () => {
  const html = render(analyze());
  const short = segment(html, "personal-analysis-short"), medium = segment(html, "personal-analysis-medium");
  assert.match(short, /مدت ذخیره‌شده/); assert.match(short, /۳/); assert.match(short, /ماه/);
  assert.doesNotMatch(short, /مدت میان‌مدت/);
  assert.match(medium, /مدت میان‌مدت در قرارداد فعلی ثبت نمی‌شود/);
  assert.doesNotMatch(medium, /مدت ذخیره‌شده/);
  assert.equal((html.match(/تصمیم‌ناپذیر/g) ?? []).length, 2);
  assert.match(html, /هیچ سفارش یا بودجهٔ جداگانه‌ای ساخته نشده است/);
  assert.match(html, /تاریخچهٔ مجاز/); assert.match(html, /خارج از نمونه/);
  assert.doesNotMatch(html, /<input|<form|<select|خرید پیشنهادی|فروش پیشنهادی/);
});

test("expired prices change the rendered current result while retaining purchase provenance", () => {
  const source = snapshot(), quotes = market();
  const fresh = render(analyze(source, quotes, now + MARKET_TTL_MS));
  const stale = render(analyze(source, quotes, now + MARKET_TTL_MS + 1));
  assert.match(fresh, /سهم این دارایی از سقف واردشده بیشتر است/);
  assert.match(stale, /قیمت قدیمی/);
  assert.match(segment(stale, "personal-analysis-share-purchase:GOLD_18K_IRR"), /نامشخص/);
  assert.doesNotMatch(stale, /سهم این دارایی از سقف واردشده بیشتر است/);
  assert.match(stale, /synthetic-panel-purchase/);
  assert.match(stale, /ارزش جاری همهٔ دارایی‌های ثبت‌شده معلوم نیست/);
});

test("reloaded saved constraints replace prior displayed comparisons and short duration", () => {
  const source = snapshot(), old = render(analyze(source));
  source.version = 8; source.preferences.maxSingleAssetPercent = "100"; source.preferences.shortTermMonths = "6";
  const current = render(analyze(source));
  assert.match(old, /از سقف واردشده بیشتر است/);
  assert.match(current, /در محدودهٔ سقف واردشده است/);
  assert.match(current, /تأیید ریسک یا تصمیم نگهداری نیست/);
  assert.match(segment(current, "personal-analysis-short"), /۶/);
  assert.match(current, /نسخهٔ سبد: <span class="number-value"><bdi dir="ltr">۸/);
});

test("unavailable and invalid saved inputs render no stale numbers, recommendation or action", () => {
  const pending = render(null), invalid = render(analysisModule.buildPersonalPortfolioAnalysis({}, market(), now));
  assert.match(pending, /در انتظار اطلاعات ذخیره‌شده/);
  assert.match(invalid, /role="alert"/); assert.match(invalid, /تحلیل متوقف است/);
  assert.doesNotMatch(invalid + pending, /personal-analysis-share-|تومان|سهم این دارایی/);
  const empty = snapshot(); empty.purchaseBook.lots = [];
  assert.match(render(analyze(empty)), /دارایی ثبت نشده است/);
});

test("incomplete registered holdings never render a priced-subset concentration as complete", () => {
  const source = snapshot();
  source.holdings.push({ id: "synthetic-unsupported", name: "دارایی فرضی بدون پوشش", unit: "واحد", amount: 1, costToman: null, purchaseDate: null, note: "synthetic" });
  const html = render(analyze(source));
  assert.match(html, /دارایی بدون پوشش قیمت/);
  assert.match(html, /مقایسه با سقف: تا تکمیل ارزش‌گذاری/);
  assert.match(html, /synthetic-unsupported/);
  assert.match(html, /هزینه و نرخ تاریخی آن بازسازی نشده‌اند/);
  assert.doesNotMatch(html, /سهم این دارایی از سقف واردشده بیشتر است/);
});
