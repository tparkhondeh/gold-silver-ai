import { NumberValue } from "./number-value";
import { PurchaseRatio } from "./purchase-book-panel";
import { personalAnalysisGaps, type PersonalLotInputGap, type PersonalPortfolioAnalysis } from "./personal-portfolio-analysis";
import type { PersonalQuoteState } from "./personal-market-valuation";

const quoteLabels: Record<PersonalQuoteState, string> = {
  fresh: "قیمت معتبر", stale: "قیمت قدیمی", future: "زمان قیمت نامعتبر", missing: "قیمت موجود نیست",
  unsupported_asset: "دارایی بدون پوشش قیمت", unsupported_unit: "واحد یا عیار ناسازگار",
  unsupported_quantity: "مقدار ناسازگار", invalid_snapshot: "نسخهٔ قیمت نامعتبر",
};
const inputLabels: Record<PersonalLotInputGap, string> = {
  unit_price: "قیمت خرید", fees: "هزینهٔ خرید",
  historical_fx_rial: "نرخ تاریخی دلار برای بهای ریالی", historical_fx_usd: "نرخ تاریخی دلار برای بهای دلاری",
};

/** The props contain a fresh, descriptive result only; this panel cannot fetch,
 * save, choose a method, allocate either horizon's cash or place orders. */
export function PersonalPortfolioAnalysisPanel({ analysis }: { analysis: PersonalPortfolioAnalysis | null }) {
  if (analysis === null) return <section className="panel personal-analysis" aria-live="polite"><h2>تحلیل همین دارایی‌ها</h2><p>در انتظار اطلاعات ذخیره‌شده و زمان بررسی قیمت…</p></section>;
  if (analysis.state === "invalid_input") return <section className="panel personal-analysis" role="alert" data-testid="personal-analysis-invalid"><h2>تحلیل متوقف است</h2><p>اطلاعات سبد، تنظیمات یا زمان بررسی معتبر نیست؛ نتیجهٔ عددی و تصمیم صادر نشد. ابتدا نسخهٔ ذخیره‌شده را بررسی کن.</p></section>;
  const { valuation, source, assets, horizons } = analysis;
  const total = valuation.totals;
  const commonGaps = horizons[0].missingInputs.filter((id) => horizons[1].missingInputs.includes(id));
  return <section className="personal-analysis" data-testid="personal-analysis">
    <div className="panel"><h2>تحلیل همین دارایی‌های ثبت‌شده</h2><p>این گزارش ارزش، پوشش اطلاعات و سهم دارایی‌ها را بررسی می‌کند. پیشنهاد خرید، فروش یا تبدیل صادر نشده و استفادهٔ مالی فعال نیست.</p>
      <div className="unified-metrics">
        <article><span>ارزش دارایی‌های ثبت‌شده — پوشش کامل</span><strong><PurchaseRatio value={total.currentValueRial} unit="تومان" rialToToman /></strong><small>قیمت معتبر: <NumberValue value={total.valuedAssetCount} /> از <NumberValue value={total.totalAssetCount} /> دارایی</small></article>
        <article><span>جمع بخش دارای قیمت معتبر</span><strong><PurchaseRatio value={total.knownCurrentValueRial} unit="تومان" rialToToman /></strong><small>مقدار ناقص جای ارزش کل قرار نمی‌گیرد.</small></article>
        <article><span>بهای خرید با هزینه — پوشش کامل</span><strong><PurchaseRatio value={total.landedCostRial} unit="تومان" rialToToman /></strong><small>خرید دارای بهای کامل ریالی و قیمت معتبر: <NumberValue value={total.costCoveredLotCount} /> از <NumberValue value={total.totalLotCount} /></small></article>
      </div>
      <p className="unified-warning">ماندهٔ نقد قابل‌خرج مستقل ثبت نشده است؛ بودجهٔ مشترک دو افق نامشخص است. دلارِ ثبت‌شده، ارزش دارایی و بهای خرید به‌جای نقد قابل‌خرج استفاده نمی‌شوند.</p>
    </div>

    <div className="unified-assets">{valuation.rows.map((row, index) => {
      const diagnostic = assets[index];
      return <article className="panel" key={row.id} data-testid={`personal-analysis-asset-${row.id}`}>
        <header><h3>{row.name}</h3><span>{quoteLabels[row.quoteState]}</span></header>
        <dl>
          <div><dt>موجودی ثبت‌شده</dt><dd><PurchaseRatio value={row.quantity} unit={row.displayUnit} /></dd></div>
          <div><dt>ارزش جاری</dt><dd><PurchaseRatio value={row.currentValueRial} unit="تومان" rialToToman /></dd></div>
          <div><dt>سهم از همهٔ دارایی‌های ثبت‌شده</dt><dd data-testid={`personal-analysis-share-${row.id}`}><PurchaseRatio value={diagnostic.holdingsSharePercent} unit="٪" /></dd></div>
        </dl>
        <p>{diagnostic.savedLimitComparison === "unavailable" ? "مقایسه با سقف: تا تکمیل ارزش‌گذاری همهٔ دارایی‌ها و ثبت سقف نامشخص است."
          : diagnostic.savedLimitComparison === "above_saved_limit" ? "سهم این دارایی از سقف واردشده بیشتر است؛ این مقایسه دستور فروش نیست."
            : "سهم این دارایی در محدودهٔ سقف واردشده است؛ این مقایسه تأیید ریسک یا تصمیم نگهداری نیست."}</p>
        <details><summary>پوشش خرید و منشأ محاسبه</summary>
          <dl><div><dt>مقدار دارای بهای کامل ریالی</dt><dd><PurchaseRatio value={row.landedBasisRial.coveredQuantity} unit={row.displayUnit} /> از <PurchaseRatio value={row.quantity} unit={row.displayUnit} /></dd></div>
            <div><dt>جمع بهای معلوم با هزینه</dt><dd><PurchaseRatio value={row.landedBasisRial.total} unit="تومان" rialToToman /></dd></div>
            <div><dt>سود / زیان کل این دارایی</dt><dd><PurchaseRatio value={row.profitLossRial} unit="تومان" rialToToman /></dd></div></dl>
          {row.legacyIds.length > 0 && <p>موجودی بدون ریز خرید حفظ شده است؛ هزینه و نرخ تاریخی آن بازسازی نشده‌اند. شناسه‌ها: {row.legacyIds.map((id) => <bdi key={id}>{id} </bdi>)}</p>}
          {diagnostic.purchaseInputs.map((lot) => <p key={lot.lotId}><bdi>{lot.lotId}</bdi> · <bdi>{lot.purchaseDate}</bdi> · {lot.missing.length ? `نامشخص: ${lot.missing.map((id) => inputLabels[id]).join("، ")}` : "قیمت، هزینه و نرخ تاریخی خرید ثبت شده‌اند."}</p>)}
          {row.observation ? <p>منبع قیمت: <bdi>{row.observation.source}</bdi> · شناسهٔ ابزار: <bdi>{row.observation.instrumentCode}</bdi><br />زمان قیمت: <bdi>{row.observation.publishedAt}</bdi><br />زمان دریافت: <bdi>{row.observation.receivedAt}</bdi></p> : <p>قیمت قابل‌انتساب به این دارایی در نسخهٔ موجود نیست.</p>}
        </details>
      </article>;
    })}</div>

    <div className="panel"><h3>دو افق با یک بودجه</h3><div className="unified-horizons">{horizons.map((horizon) => <article key={horizon.id} data-testid={`personal-analysis-${horizon.id}`}>
      <h4>{horizon.id === "short" ? "کوتاه‌مدت" : "میان‌مدت"}</h4><b>تصمیم‌ناپذیر</b>
      {horizon.savedDuration && <p>مدت ذخیره‌شده: <NumberValue value={horizon.savedDuration.value} /> ماه</p>}
      {horizon.missingInputs.filter((id) => !commonGaps.includes(id)).map((id) => <p key={id}>{personalAnalysisGaps[id].label}</p>)}
      <p>مقدار اقدام و هزینهٔ آینده محاسبه نشده؛ هیچ سفارش یا بودجهٔ جداگانه‌ای ساخته نشده است.</p>
    </article>)}</div>
      <details><summary>پیش‌نیازهای مشترک تصمیم</summary><ul>{commonGaps.map((id) => <li key={id}>{personalAnalysisGaps[id].label}</li>)}</ul></details>
    </div>

    <details className="panel"><summary>تنظیمات و ردپای این محاسبه</summary>
      <p>سهم‌ها فقط نسبت به همهٔ دارایی‌های ثبت‌شده محاسبه می‌شوند؛ داراییِ بدون قیمت از مخرج حذف نمی‌شود. این نسبت، سهم از کل ثروت یا بودجهٔ قابل‌خرج نیست.</p>
      <p>سقف ذخیره‌شدهٔ هر دارایی: <PurchaseRatio value={analysis.savedMaximumAssetPercent} unit="٪" /></p>
      <ul>{analysis.constraints.fields.map((field) => <li key={field.key}>{field.label}: {field.valid ? <NumberValue value={field.value!} unit={field.suffix} /> : "ثبت نشده"}</li>)}</ul>
      <p>نسخهٔ سبد: <NumberValue value={source.portfolioVersion} /> · زمان بررسی: <bdi>{source.evaluatedAt}</bdi></p>
      <p><bdi>{analysis.version}</bdi><br /><bdi>{source.valuationVersion}</bdi><br /><bdi>{source.purchaseBookVersion}</bdi></p>
      <p>ارجاع به الزامات موجود، بدون تأیید عبور از آن‌ها: {commonGaps.flatMap((id) => personalAnalysisGaps[id].evidenceIds).map((id) => <bdi key={id}>{id} </bdi>)}</p>
    </details>
  </section>;
}
