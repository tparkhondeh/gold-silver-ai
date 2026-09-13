import type { View } from "./workspace-navigation";
import type { buildSharedAnalysis } from "./shared-analysis";

type Report = ReturnType<typeof buildSharedAnalysis>;
const number = (value: number) => value.toLocaleString("fa-IR", { maximumFractionDigits: 4 });
const quoteIssue: Record<string, string> = { missing_bid: "قیمت فروش نداریم", missing_ask: "قیمت خرید نداریم", future_quote: "تاریخ قیمت در آینده است", expired_quote: "اعتبار قیمت تمام شده است" };

export function SharedAnalysisPanel({ report, selectedAssetId, view }: { report: Report; selectedAssetId: string; view: View }) {
  return <section className="panel" data-testid="shared-diagnostics" data-revision={report.source.revision}>
    <h3>{view === "data" ? "کیفیت ورودی همین سبد" : view === "market" ? "رابطهٔ فلزات همین سبد" : "شواهد تحلیل همین سبد"}</h3>
    <p>دادهٔ ساختگی · بازبینی {number(report.source.revision)} · بدون بودجه یا سفارش جداگانه</p>
    <p>حباب و تشخیص وضعیت بازار هنوز قابل محاسبه نیستند. روند و ریسک از مرجع ساختگی موتور می‌آیند، نه تاریخچهٔ قیمت‌های واردشده.</p>
    {(view === "market" || view === "analysis") && <div data-testid="shared-metal-ratio"><b>نسبت قیمت یک گرم طلای خالص به یک گرم نقرهٔ خالص: </b>{report.metalRatio ? number(Number(report.metalRatio.scaled10000) / 10_000) : "قابل محاسبه نیست"}<p>تعدیل عیار ۷۵۰ و ۹۹۹ انجام شده؛ نسبت بدون واحد است، نه حباب و نه دستور تبدیل.</p>{report.metalRatioMissing && <p role="alert">{report.metalRatioMissing}</p>}{report.metalRatio && <details><summary>محاسبهٔ دقیق نسبت</summary><code dir="ltr">{report.metalRatio.numerator} / {report.metalRatio.denominator}</code><p>قیمت طلا ÷ عیار طلا، تقسیم بر قیمت نقره ÷ عیار نقره؛ نمایش تا چهار رقم اعشار رو به پایین.</p></details>}</div>}
    {(view === "data" || view === "market") && <div className="table-scroll"><table className="shared-table"><thead><tr><th>دارایی</th><th>وضعیت قیمت</th><th>فاصلهٔ خرید/فروش از مبنا</th><th>منشأ / اعتبار</th></tr></thead><tbody>{report.quotes.map((quote) => <tr key={quote.assetId}><td>{report.source.inputSnapshot.assets.find((asset) => asset.id === quote.assetId)!.name}</td><td>{quote.state === "usable" ? "معتبر در تاریخ ساختگی بررسی" : quote.issues.map((issue) => quoteIssue[issue]).join("؛ ")}</td><td>{quote.spread ? `${number(Number(quote.spread.scaled10000) / 100)}٪` : "قابل محاسبه نیست"}</td><td>ورودی ساختگی سبد · {quote.quotedOn} تا {quote.validUntil}</td></tr>)}</tbody></table><p>فاصله = (قیمت خرید − قیمت فروش) ÷ قیمت مبنا. این عدد کل هزینهٔ معامله نیست.</p></div>}
    {(view === "analysis" || view === "risk") && report.horizons.map((horizon) => {
      const asset = horizon.assets.find((row) => row.assetId === selectedAssetId);
      return asset ? <details className="action-detail" key={horizon.id} data-testid={`shared-evidence-${horizon.id}`}><summary>{horizon.id === "short" ? "کوتاه‌مدت" : "میان‌مدت"} — روند، نوسان، افت و بحران</summary>
        <p>افق برنامه {number(horizon.days)} روز؛ پنجرهٔ عامل روند {number(horizon.featureObservations)} مشاهده از {number(asset.history.observationCount)} مشاهدهٔ مرجع است. تغییر روزهای برنامه، تاریخچهٔ جدید تولید یا موتور را بازتنظیم نمی‌کند.</p>
        <p>مومنتوم {number(horizon.featureObservations)} مشاهده: {number(horizon.id === "short" ? asset.history.momentum20Percent : asset.history.momentum60Percent)}٪ · نوسان ۲۰ مشاهده: {number(asset.history.volatility20Percent)}٪ · بیشترین افت: {number(asset.history.maxDrawdownPercent)}٪</p>
        {horizon.targetSource === "explicit_test_targets" && <p>در این سناریوی آزمون، هدف‌ها ثابت‌اند؛ امتیاز عامل‌ها علت انتخاب این هدف‌ها نیست.</p>}
        {asset.factors.map((factor) => <p key={factor.id}>{factor.label}: ورودی خام {number(factor.input)} · امتیاز {number(factor.points)} × وزن {number(factor.weight * 100)}٪ = سهم {number(factor.weightedContribution)}</p>)}
        <p>سناریوهای زیر ساختگی‌اند و مبلغ آن‌ها سفارش یا بودجهٔ اضافی نیست:</p>{asset.scenarios.map((scenario) => <p key={scenario.id}>{scenario.label}: تغییر {number(scenario.movePercent)}٪ · اثر بر همین موجودی {number(scenario.impactToman)} تومان</p>)}
        <p>{asset.invalidation}</p>
      </details> : null;
    })}
    {view === "risk" && <div data-testid="shared-concentration">{report.concentration ? report.concentration.filter((row) => row.aboveLimit).map((row) => <p role="alert" key={row.assetId}>{report.source.inputSnapshot.assets.find((asset) => asset.id === row.assetId)?.name ?? row.assetId}: وزن فعلی از سقف واردشده بیشتر است.</p>) : <p>به‌علت ارزش نامشخص، تمرکز کل سبد قابل محاسبه نیست.</p>}</div>}
    <details className="action-detail"><summary>کمبود داده و مرز این تحلیل</summary>{report.gaps.map((gap) => <p key={gap.id}>{gap.reason}</p>)}<code dir="ltr">{report.schemaVersion} · {report.source.fixtureId} · {report.source.historyDatasetId}</code></details>
  </section>;
}
