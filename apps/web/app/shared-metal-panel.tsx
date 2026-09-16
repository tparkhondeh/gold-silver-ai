import { NumberValue } from "./number-value";
import { exampleMetalReferences, type MetalReferences, type buildRawMetalDiagnostics } from "./shared-metal-reference";

const labels = { USD_TOMAN: "نرخ دلار — تومان برای یک دلار", XAU_USD: "اونس طلای خالص — دلار برای یک اونس تروا", XAG_USD: "اونس نقرهٔ خالص — دلار برای یک اونس تروا" };
const shortLabels = { USD_TOMAN: "نرخ دلار", XAU_USD: "اونس طلا", XAG_USD: "اونس نقره" };
const issues: Record<string, string> = { missing: "مقدار ندارد", future: "تاریخ آینده", expired: "منقضی", different_date: "ناهم‌تاریخ با قیمت داخلی", unsupported_specification: "مشخصات وزن خالص سکه مصوب نیست", future_domestic_quote: "قیمت داخلی مربوط به آینده است", expired_domestic_quote: "قیمت داخلی منقضی است" };
function describeIssue(issue: string) {
  const [code, problem] = issue.split(":");
  return problem ? `${shortLabels[code as keyof typeof shortLabels]}: ${issues[problem]}` : issues[code];
}

export function MetalReferenceEditor({ references, onChange }: { references: MetalReferences; onChange: (references: MetalReferences) => void }) {
  const update = (index: number, change: Partial<MetalReferences["quotes"][number]>) => onChange({ ...references, quotes: references.quotes.map((row, i) => i === index ? { ...row, ...change } : row) });
  return <details className="action-detail" data-testid="shared-metal-editor"><summary>مرجع فلز خام — ورودی ساختگیِ اختیاری</summary>
    <p>این مراجع فقط اختلاف قیمت با فلز خام را محاسبه می‌کنند؛ هدف تخصیص یا دستور خریدوفروش را تغییر نمی‌دهند. قیمت خالی جایگزین نمی‌شود؛ اونس تروا ۳۱٫۱۰۳۴۷۶۸ گرم است.</p>
    <button className="ghost-button" onClick={() => onChange(exampleMetalReferences())}>قرار دادن مثال کاملاً ساختگیِ مراجع</button>
    {references.quotes.map((quote, index) => <fieldset className="shared-editor" key={quote.code}><legend>{labels[quote.code]}</legend><div className="action-input-grid">
      <label className="action-field"><span>مقدار ساختگی</span><input type="number" min={quote.code === "USD_TOMAN" ? 1 : 0.01} max={quote.code === "USD_TOMAN" ? 1_000_000_000 : 10_000_000} step={quote.code === "USD_TOMAN" ? 1 : 0.01} data-testid={`metal-value-${quote.code}`} value={quote.value === null || !Number.isFinite(quote.value) ? "" : quote.value / (quote.code === "USD_TOMAN" ? 1 : 100)} onChange={event => update(index, { value: event.target.value === "" ? null : Number((event.target.valueAsNumber * (quote.code === "USD_TOMAN" ? 1 : 100)).toFixed(6)) })} /></label>
      <label className="action-field"><span>تاریخ ساختگی مرجع</span><input type="date" data-testid={`metal-date-${quote.code}`} value={quote.quotedOn} onChange={event => update(index, { quotedOn: event.target.value })} /></label>
      <label className="action-field"><span>اعتبار تا</span><input type="date" data-testid={`metal-expiry-${quote.code}`} value={quote.validUntil} onChange={event => update(index, { validUntil: event.target.value })} /></label>
    </div></fieldset>)}
    <p>منشأ: ورودی دستیِ ساختگی · بدون اتصال بازار · ذخیره همراه همین سبد و در همین مرورگر.</p>
  </details>;
}

export function RawMetalPanel({ report, names }: { report: ReturnType<typeof buildRawMetalDiagnostics>; names: Record<string, string> }) {
  return <section data-testid="shared-raw-metal"><h4>اختلاف قیمت با ارزش فلز خام</h4>
    <p>تشخیص ساختگی، نه حباب تاریخی یا نقطهٔ ورود و خروج. بر قیمت مبنای یک گرم محاسبه می‌شود؛ کارمزد، مالیات، ساخت و حمل در ارزش فلز خام نیستند.</p>
    <div className="table-scroll"><table className="shared-table"><thead><tr><th>دارایی</th><th>ارزش فلز خام / گرم — تومان</th><th>اختلاف / گرم — تومان</th><th>درصد اختلاف نسبت به ارزش فلز خام</th></tr></thead><tbody>{report.rows.map(row => <tr key={row.assetId} data-testid={`raw-metal-${row.assetId}`}><td>{names[row.assetId]}</td>{row.rawMetalTomanPerGram && row.differenceTomanPerGram && row.premiumPercent ? <><td>{<NumberValue value={row.rawMetalTomanPerGram.numerator} denominator={row.rawMetalTomanPerGram.denominator} />}</td><td>{<NumberValue value={row.differenceTomanPerGram.numerator} denominator={row.differenceTomanPerGram.denominator} />}</td><td>{<NumberValue value={row.premiumPercent.numerator} denominator={row.premiumPercent.denominator} unit="٪" />}</td></> : <td colSpan={3}>قابل محاسبه نیست: {row.issues.map(describeIssue).join("؛ ")}</td>}</tr>)}</tbody></table></div>
    <details className="action-detail"><summary>فرمول، مرجع و محاسبات دقیق فلز خام</summary>
      <p>ارزش فلز خام = دلارِ یک اونس ÷ ۳۱٫۱۰۳۴۷۶۸ × نرخ دلار به تومان × عیار ÷ ۱۰۰۰. درصد اختلاف = (قیمت داخلی ÷ ارزش فلز خام − ۱) × ۱۰۰. همهٔ مراجع باید معتبر و هم‌تاریخ باشند؛ درصد مثبت به‌تنهایی به معنای گران‌بودن یا لزوم فروش نیست.</p>
      {report.source.quotes.map(quote => <p key={quote.code}>{labels[quote.code]}: {quote.value === null ? "موجود نیست" : <NumberValue value={quote.value} denominator={quote.code === "USD_TOMAN" ? 1 : 100} />} · {quote.quotedOn} تا {quote.validUntil}</p>)}
      {report.rows.filter(row => row.state === "calculated").map(row => <p key={row.assetId}>{names[row.assetId]} · مبنای داخلی {row.domesticPriceToman.toLocaleString("fa-IR")} تومان · عیار {row.purityPermille.toLocaleString("fa-IR")} · تاریخ {row.domesticQuotedOn}<br /><code dir="ltr">raw={row.rawMetalTomanPerGram!.numerator}/{row.rawMetalTomanPerGram!.denominator}; premium%={row.premiumPercent!.numerator}/{row.premiumPercent!.denominator}</code></p>)}
      <p>نمایش حداکثر یک اعشار است؛ ≈ یعنی گرد‌شده. روی عدد بزن تا کسر یا مقدار دقیق باز شود. هیچ گردکردن نمایشی وارد تصمیم نمی‌شود.</p><code dir="ltr">{report.schemaVersion} · {report.source.sourceId}</code>
    </details>
  </section>;
}
