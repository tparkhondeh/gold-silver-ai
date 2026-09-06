"use client";
import { useMemo } from "react";
import { buildActionSizingComparison } from "./action-sizing-comparison";

const labels: Record<string, string> = {
  ASHA_BENCHMARK_CASH_CONTROL_V1: "تمام نقد",
  ASHA_BENCHMARK_EQUAL_WEIGHT_CONTROL_V1: "تقسیم مساوی",
  ASHA_BENCHMARK_HRP_CONTROL_V1: "تخصیص خوشه‌ای (HRP)",
  ASHA_BENCHMARK_INVERSE_VOLATILITY_CONTROL_V1: "معکوس نوسان",
  ASHA_BENCHMARK_MINIMUM_CVAR_CONTROL_V1: "کمینهٔ زیان دنباله‌ای (CVaR)",
  ASHA_BENCHMARK_NO_TRADE_CONTROL_V1: "نگهداری اولیه",
  ASHA_TRANSPARENT_GUARDED_DECISION_V1: "روش هشت‌عاملی پیشنهادی",
};
const money = (value: string) => `${BigInt(value).toLocaleString("fa-IR")} تومان`;
const percent = (bps: number) => `${(bps / 100).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪`;

export function ActionSizingComparisonPanel() {
  const result = useMemo(() => {
    try { return { report: buildActionSizingComparison(), error: false }; }
    catch { return { report: null, error: true }; }
  }, []);
  return <details className="action-detail" data-testid="action-sizing-comparison"><summary>آزمون مشترک روش‌ها با هزینه و مقدار قابل‌معامله</summary>
    {result.error && <p role="alert">مقایسه با قرارداد بررسی‌شده تطبیق ندارد و نمایش داده نشد.</p>}
    {result.report && <>
      <p>۷ روش در ۲ پنجرهٔ یکسان، با سبد شروع، هزینه، حداقل مقدار و محدودیت‌های برابر بررسی شدند. این مقایسه از تغییر ورودی‌های میز مستقل است. مسیرهای پژوهشی فقط برای آزمون محاسبات به سه دارایی نمونه وصل شده‌اند؛ نتایج، عملکرد طلا یا نقرهٔ ایران نیستند.</p>
      <p>وزن‌ها فقط از بخش آموزش می‌آیند؛ یک برنامه در ابتدا محاسبه می‌شود و مقدارها در دورهٔ ارزیابی ثابت می‌مانند. نگهداری یعنی حفظ سبد شروع مشترک. هزینهٔ آغاز در تغییر ارزش و افت حساب شده است؛ رتبه‌بندی یا انتخاب برنده انجام نمی‌شود.</p>
      {result.report.folds.map((fold) => <section key={fold.foldIndex}><h3>پنجرهٔ {String(fold.foldIndex + 1).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}</h3><p>آخرین مشاهدهٔ آموزش: {fold.trainEndIndex.toLocaleString("fa-IR")}؛ زمان برنامه: {fold.executionCutoffIndex.toLocaleString("fa-IR")}؛ ارزیابی: {fold.testStartIndex.toLocaleString("fa-IR")} تا {fold.testEndIndex.toLocaleString("fa-IR")}.</p>
        <div className="action-comparison-scroll"><table><caption>مقایسهٔ جداگانهٔ روش‌ها در همین پنجره</caption><thead><tr><th>روش</th><th>وضعیت مقدار</th><th>هزینه</th><th>ارزش پایان</th><th>تغییر با هزینه</th><th>بیشترین افت</th></tr></thead><tbody>{fold.methods.map((method) => <tr key={method.methodId}><th scope="row">{labels[method.methodId]}</th><td>{method.trial.state === "proposed" ? `${method.trial.orders.length.toLocaleString("fa-IR")} تغییر` : method.trial.state === "hold" ? "بدون تغییر" : "محدودیت / انتظار"}</td><td>{money(method.trial.portfolio.totalCostToman)}</td><td>{money(method.evaluation.finalToman)}</td><td>{percent(method.evaluation.changeBps)}</td><td>{percent(method.evaluation.maximumDrawdownBps)}</td></tr>)}</tbody></table></div>
      </section>)}
      <p>این نسخه نه بهینه‌سازی پیوسته دارد و نه بازتنظیم روزانهٔ سبد؛ با گزارش قدیمیِ وزن ثابت روزانه یکی نیست. سهولت محاسبه، حفظ بودجه و تفکیک گذشته از آینده آزموده می‌شوند.</p><code>{result.report.schemaVersion}</code>
    </>}
  </details>;
}
