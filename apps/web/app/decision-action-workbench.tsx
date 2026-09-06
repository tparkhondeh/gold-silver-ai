"use client";

import { useMemo, useState } from "react";
import { ActionSizingComparisonPanel } from "./action-sizing-comparison-panel";
import {
  actionScenarios, buildActionFixture, buildActionPlan, decodeActionPlan, encodeActionPlan,
  type ActionAsset, type ActionInput, type ActionPlan, type ActionScenario, type PlanRow,
} from "./decision-action-plan";

const STORAGE_KEY = "asha-synthetic-action-plan-v1";
const scenarioLabels: Record<ActionScenario, string> = {
  method: "محاسبه با موتور تحلیل", entry: "ورود از نقد", exit: "خروج کامل",
  peer: "تبدیل هم‌کلاس", cross: "تبدیل بین‌کلاسی", hold: "بدون تغییر",
  wait: "انتظار برای قیمت", missing: "دادهٔ ناقص",
};
const actions: Record<PlanRow["action"], string> = {
  increase: "افزایش دارایی", reduce: "کاهش دارایی", exit: "خروج کامل",
  hold: "بدون تغییر", wait: "انتظار مشروط", undecidable: "تصمیم‌ناپذیر",
};
const reasons: Record<string, string> = {
  NET_TARGET_DISTANCE_IMPROVEMENT: "این برنامه با احتساب هزینه‌ها، سبد را به ترکیب هدف نزدیک‌تر می‌کند.",
  NO_SUFFICIENT_NET_IMPROVEMENT_OR_FEASIBLE_LOT: "بهبود کافی پس از هزینه‌ها یا مقدار قابل‌انجام در محدودیت‌های فعلی پیدا نشد.",
  MISSING_STALE_OR_FUTURE_QUOTE: "حداقل یک قیمت ناقص، منقضی یا مربوط به آیندهٔ زمان بررسی است.",
  WAIT_FOR_ACCEPTABLE_QUOTE: "قیمت خرید یا فروش از محدودهٔ مجاز خارج است؛ با رسیدن قیمت مناسب، مقدار دوباره محاسبه می‌شود.",
  CONSTRAINT_BREACH_REMAINS: "ترکیب فعلی هنوز با سقف تمرکز یا ذخیرهٔ نقد سازگار نیست؛ محدودیت‌های فعلی اجازهٔ اصلاح کامل را نمی‌دهند.",
  STRESS_BUDGET_BREACH_REMAINS: "حد محافظه‌کارانهٔ فشار سبد هنوز از تحمل ثبت‌شده بیشتر است؛ هیچ برنامهٔ ناسازگار با آن پذیرفته نشد.",
  ALREADY_AT_TARGET: "مقدار فعلی با هدف همین دارایی برابر است.",
  INSIDE_NO_TRADE_BAND: "فاصلهٔ این دارایی از هدف، کمتر از حداقل تغییر لازم در این نسخه است.",
  LOT_CAPACITY_COST_OR_BUDGET_LIMIT: "مقدار قابل‌خرید یا فروش این دارایی با گام معامله، ظرفیت، هزینه یا بودجهٔ برنامه سازگار نشده است.",
};
const money = (value: string | number) => `${BigInt(value).toLocaleString("fa-IR")} تومان`;
const percent = (bps: number) => `${(bps / 100).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪`;
const units = (quantity: string | number, asset: ActionAsset) => `${(Number(quantity) / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 3 })} ${asset.unit === "gram" ? "گرم" : "عدد"}`;
const name = (asset: ActionAsset) => asset.name.replace("[ساختگی] ", "");
const displayDate = (value: string) => new Date(value).toLocaleDateString("fa-IR", { timeZone: "UTC" });
const issueLabels = { missing_bid: "قیمت فروش موجود نیست", missing_ask: "قیمت خرید موجود نیست", future_quote: "قیمت متعلق به آیندهٔ زمان بررسی است", expired_quote: "اعتبار قیمت گذشته است" };

function NumberField({ label, value, onChange, min = 0, max = 1_000_000_000, step = 1 }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number;
}) {
  return <label className="action-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ""} onChange={(event) => onChange(event.target.valueAsNumber)} /></label>;
}

function AssetDecisionCard({ plan, row }: { plan: ActionPlan; row: PlanRow }) {
  const asset = plan.inputSnapshot.assets.find((item) => item.id === row.assetId)!;
  const orders = plan.orders.filter((order) => order.assetId === row.assetId);
  const sourceName = (id: string) => id === "SYNTH_CASH" ? "نقد آزاد" : name(plan.inputSnapshot.assets.find((item) => item.id === id)!);
  const targetDelta = row.targetWeightBps - row.currentWeightBps;
  return <article className={`action-card action-${row.action}`} data-testid={`action-card-${row.assetId}`}>
    <div className="action-card-title"><h3>{name(asset)}</h3><span>{actions[row.action]}</span></div>
    <div className="action-main-quantity"><strong>{units(row.quantityMilli, asset)}</strong><small>مقدار تغییر در برنامهٔ فعلی</small></div>
    {orders.map((order) => <p className="action-price" key={order.id}>{order.side === "buy" ? "ورود" : "خروج"} با قیمت <b>{money(order.priceToman)}</b> برای هر {asset.unit === "gram" ? "گرم" : "عدد"}؛ {order.side === "buy" ? "پرداخت کل" : "دریافت خالص"} <b>{money(order.cashMovementToman)}</b>.</p>)}
    {row.action === "wait" && <p>مقدار هدفِ مشروط: <b>{units(row.conditionalQuantityMilli, asset)}</b>؛ {plan.reasonCodes.includes("WAIT_FOR_ACCEPTABLE_QUOTE") ? <>{targetDelta > 0 ? "ورود حداکثر" : "خروج حداقل"} <b>{money(targetDelta > 0 ? row.entryLimitToman : row.exitLimitToman)}</b> برای هر واحد.</> : "ابتدا محدودیت نقد، تمرکز یا ریسک باید سازگار شود."} این مقدار هنوز در نقد و موجودی اعمال نشده است.</p>}
    {row.action === "hold" && <p>موجودی {units(row.currentQuantityMilli, asset)} حفظ می‌شود؛ هزینه و مقدار تغییر این ردیف صفر است.</p>}
    {row.action === "undecidable" && <p>ابتدا قیمت معتبر و زمان دسترسی آن را کامل کن؛ مقدار خرید یا فروش صادر نشده است.</p>}
    <dl className="action-mini-grid"><div><dt>وزن فعلی</dt><dd>{percent(row.currentWeightBps)}</dd></div><div><dt>هدف ترکیب</dt><dd>{percent(row.targetWeightBps)}</dd></div><div><dt>وزن پس از برنامه</dt><dd>{percent(row.afterWeightBps)}</dd></div></dl>
    <details className="action-detail"><summary>مقدار، هزینه، تأمین وجه و دلیل</summary>
      <p>موجودی: {units(row.currentQuantityMilli, asset)} ← {units(row.afterQuantityMilli, asset)}. تغییر نسبت به موجودی همین دارایی: {row.changeOfSourceBps === null ? "موجودی قبلی صفر؛ درصد قابل‌تعریف نیست" : percent(row.changeOfSourceBps)}؛ نسبت به ارزش کل سبدِ قبل: {percent(row.changeOfPortfolioBps)}.</p>
      <p>ارزش مبنا: {money(row.currentValueToman)}؛ ارزش پس از برنامه: {money(row.afterValueToman)}. عیار/خلوص ثبت‌شده: {asset.purityPermille.toLocaleString("fa-IR")} در هزار؛ حداقل گام مقدار: {units(asset.lotMilli, asset)}.</p>
      <p>سقف ورود {money(row.entryLimitToman)}؛ کف خروج {money(row.exitLimitToman)}. این‌ها حد مجاز قیمت با فاصلهٔ {percent(plan.inputSnapshot.priceToleranceBps)} از مبنا هستند.</p>
      {orders.map((order) => <div key={order.id} className="action-costs"><p>فاصلهٔ خریدوفروش {money(order.spreadToman)} + لغزش {money(order.slippageToman)} + کارمزد {money(order.feeToman)} + مالیات {money(order.taxToman)} + تعدیل گردکردن {money(order.roundingToman)} = <b>{money(order.totalCostToman)}</b></p>{order.side === "buy" && <ul>{order.funding.map((fund) => <li key={fund.sourceId}>تأمین از {sourceName(fund.sourceId)}: {money(fund.amountToman)}</li>)}</ul>}</div>)}
      <p>{reasons[row.reasonCode]}</p>
      {plan.horizons.map((horizon) => <details className="action-factor-detail" key={horizon.id}><summary>۸ عامل {horizon.id === "short" ? "کوتاه‌مدت" : "میان‌مدت"}</summary><div className="action-factors">{horizon.factors[row.assetId]?.map((factor) => <div key={factor.id}><span>{factor.label}</span><b>{factor.points.toLocaleString("fa-IR")} × {percent(factor.weight * 10_000)}</b><small>ورودی: {factor.id === "TREND" ? `${factor.input.toLocaleString("fa-IR", { maximumFractionDigits: 6 })} برابر` : factor.id === "LIQUIDITY" ? `${factor.input.toLocaleString("fa-IR")} از ۵` : percent(factor.input * 10_000)}؛ سهم در امتیاز: {factor.weightedContribution.toLocaleString("fa-IR")}</small></div>)}</div><p>بدترین فشار این دارایی در سناریوهای موجود: {horizon.worstStressPercent[row.assetId].toLocaleString("fa-IR")}٪. این مقدار افت سناریو است، نه حد ضرر قیمتی تضمین‌شده.</p></details>)}
      <p>با تغییر ورودی، عبور عامل از آستانه، پایان اعتبار قیمت یا رسیدن زمان بازبینی، این تصمیم باید دوباره محاسبه شود.</p>
    </details>
  </article>;
}

export function DecisionActionWorkbench() {
  const [input, setInput] = useState<ActionInput>(() => buildActionFixture());
  const [view, setView] = useState<"final" | "short" | "medium">("final");
  const [notice, setNotice] = useState("");
  const computed = useMemo(() => {
    try {
      const final = buildActionPlan(input);
      return { final, selected: view === "final" ? final : buildActionPlan({ ...input, shortBudgetBps: view === "short" ? 10_000 : 0 }), error: "" };
    } catch (error) { return { final: null, selected: null, error: error instanceof Error ? error.message : "ورودی قابل محاسبه نیست." }; }
  }, [input, view]);
  const plan = computed.selected;
  const update = (key: keyof ActionInput, value: number) => { setInput((previous) => ({ ...previous, [key]: value })); setNotice(""); };
  const updateAsset = (id: string, key: keyof ActionAsset, value: number) => {
    setInput((previous) => ({ ...previous, assets: previous.assets.map((asset) => asset.id !== id ? asset : key === "referencePriceToman"
      ? { ...asset, referencePriceToman: value, bidToman: Math.floor(value * 9950 / 10_000), askToman: Math.ceil(value * 10050 / 10_000) }
      : { ...asset, [key]: value }) })); setNotice("");
  };
  const save = () => {
    try { if (!computed.final) throw new Error("ابتدا ورودی را اصلاح کن."); localStorage.setItem(STORAGE_KEY, encodeActionPlan(computed.final)); setNotice("نسخهٔ ورودی و محاسبات در همین مرورگر ذخیره شد."); }
    catch { setNotice("ذخیره انجام نشد؛ ورودی یا دسترسی ذخیرهٔ مرورگر را بررسی کن."); }
  };
  const restore = () => {
    try { const document = localStorage.getItem(STORAGE_KEY); if (!document) { setNotice("هنوز نسخه‌ای در این مرورگر ذخیره نشده است."); return; } const restored = decodeActionPlan(document); setInput(restored.inputSnapshot); setView("final"); setNotice("نسخه بازیابی شد و همهٔ محاسبات دوباره تطبیق داده شدند."); }
    catch { setNotice("نسخهٔ ذخیره‌شده ناقص، تغییرکرده یا ناسازگار با نسخهٔ فعلی است؛ ورودی فعلی حفظ شد."); }
  };
  return <section className="panel action-workbench" aria-labelledby="action-workbench-title" data-testid="decision-action-workbench">
    <div className="action-workbench-head"><div><span className="action-eyebrow">مقدار · قیمت · زمان · دلیل</span><h2 id="action-workbench-title">میز تصمیم‌های عددی</h2><p>سبد ساختگیِ مستقل این میز را تغییر بده و مقدار، هزینه و ماندهٔ نقد را بررسی کن.</p></div><span className="status-chip warning">نسخهٔ آزمایشگاهی ۱</span></div>
    <div className="action-scenarios" aria-label="سناریوی آزمون">{actionScenarios.map((scenario) => <button type="button" key={scenario} aria-pressed={input.scenario === scenario} className={input.scenario === scenario ? "active" : ""} onClick={() => { setInput(buildActionFixture(scenario)); setView("final"); setNotice(""); }}>{scenarioLabels[scenario]}</button>)}</div>
    <p className="action-source-note">{input.scenario === "method" ? "هدف‌ها از موتور تحلیل هشت‌عاملی محاسبه می‌شوند؛ قیمت و مقدار از ورودی‌های همین میز می‌آیند." : "در این سناریوی آزمون، وزن هدف از قرارداد نمونهٔ ثابت می‌آید؛ موتور، مقدار و هزینه را محاسبه می‌کند. برای تحلیل هشت‌عاملی، گزینهٔ اول را انتخاب کن."}</p>
    <details className="action-inputs"><summary>تغییر ورودی‌ها و محدودیت‌ها</summary>
      <div className="action-input-grid">
        <NumberField label="نقد موجود — تومان" value={input.cashToman} onChange={(value) => update("cashToman", value)} max={1_000_000_000_000} />
        <NumberField label="سهم افق کوتاه‌مدت — درصد" value={input.shortBudgetBps / 100} onChange={(value) => update("shortBudgetBps", Math.round(value * 100))} max={100} />
        <NumberField label="کوتاه‌مدت — روز" value={input.shortDays} onChange={(value) => update("shortDays", value)} min={1} max={90} />
        <NumberField label="میان‌مدت — روز" value={input.mediumDays} onChange={(value) => update("mediumDays", value)} min={input.shortDays + 1} max={730} />
        <NumberField label="حداقل ذخیرهٔ نقد — درصد" value={input.minimumCashBps / 100} onChange={(value) => update("minimumCashBps", Math.round(value * 100))} max={50} />
        <NumberField label="حداکثر وزن هر دارایی — درصد" value={input.maximumAssetBps / 100} onChange={(value) => update("maximumAssetBps", Math.round(value * 100))} min={1} max={100} />
      </div>
      <div className="action-asset-inputs">{input.assets.map((asset) => <fieldset key={asset.id}><legend>{name(asset)}</legend><NumberField label={`موجودی — ${asset.unit === "gram" ? "گرم" : "عدد"}`} value={asset.quantityMilli / 1000} onChange={(value) => updateAsset(asset.id, "quantityMilli", Math.round(value * 1000))} max={1_000_000} step={asset.lotMilli / 1000} /><NumberField label="قیمت مبنا — تومان برای هر واحد" value={asset.referencePriceToman} onChange={(value) => updateAsset(asset.id, "referencePriceToman", value)} min={1000} /><NumberField label="قیمت فروش — تومان برای هر واحد" value={asset.bidToman ?? NaN} onChange={(value) => updateAsset(asset.id, "bidToman", value)} min={1} /><NumberField label="قیمت خرید — تومان برای هر واحد" value={asset.askToman ?? NaN} onChange={(value) => updateAsset(asset.id, "askToman", value)} min={1} /></fieldset>)}</div>
      <small>تغییر قیمت مبنا، قیمت خرید و فروش نمونه را با فاصلهٔ نیم‌درصد بازسازی می‌کند؛ سپس می‌توانی هرکدام را جدا تغییر بدهی.</small>
      <details className="action-detail"><summary>هزینه، زمان و محدودیت‌های بیشتر</summary><div className="action-input-grid">
        <NumberField label="حداکثر گردش سبد — درصد" value={input.maximumTurnoverBps / 100} onChange={(value) => update("maximumTurnoverBps", Math.round(value * 100))} max={100} />
        <NumberField label="فاصلهٔ مجاز قیمت — درصد" value={input.priceToleranceBps / 100} onChange={(value) => update("priceToleranceBps", Math.round(value * 100))} max={20} step={0.1} />
        <NumberField label="لغزش قیمت — درصد" value={input.slippageBps / 100} onChange={(value) => update("slippageBps", Math.round(value * 100))} max={10} step={0.1} />
        <NumberField label="افت قابل‌تحمل — درصد" value={input.maximumDrawdownPercent} onChange={(value) => update("maximumDrawdownPercent", value)} min={1} max={100} />
        <NumberField label="حداقل مبلغ سفارش — تومان" value={input.minimumOrderToman} onChange={(value) => update("minimumOrderToman", value)} />
        <NumberField label="حداقل فاصله از هدف — درصد سبد" value={input.noTradeBandBps / 100} onChange={(value) => update("noTradeBandBps", Math.round(value * 100))} max={50} step={0.1} />
        <NumberField label="حداقل بهبود معیار — درصد سبد" value={input.minimumImprovementBps / 100} onChange={(value) => update("minimumImprovementBps", Math.round(value * 100))} max={100} step={0.1} />
        <label className="action-field"><span>تاریخ بررسی ساختگی</span><input type="date" value={input.asOf} onChange={(event) => setInput((previous) => ({ ...previous, asOf: event.target.value }))} /></label>
      </div>{input.assets.map((asset) => <div key={asset.id} className="action-cost-inputs"><strong>{name(asset)}</strong><NumberField label="کارمزد — درصد" value={asset.feeBps / 100} onChange={(value) => updateAsset(asset.id, "feeBps", Math.round(value * 100))} max={20} step={0.1} /><NumberField label="مالیات — درصد" value={asset.taxBps / 100} onChange={(value) => updateAsset(asset.id, "taxBps", Math.round(value * 100))} max={20} step={0.1} /><NumberField label={`ظرفیت کل معامله — ${asset.unit === "gram" ? "گرم" : "عدد"}`} value={asset.capacityMilli / 1000} onChange={(value) => updateAsset(asset.id, "capacityMilli", Math.round(value * 1000))} max={1_000_000} step={asset.lotMilli / 1000} /></div>)}<p>نمونهٔ قیمت‌ها از {displayDate("2000-01-01")} تا {displayDate("2000-01-02")} معتبر است. تغییر تاریخ به بیرون این بازه باید تصمیم را متوقف کند.</p></details>
    </details>
    <div className="action-toolbar"><div className="action-view-tabs" aria-label="بازهٔ تصمیم">{(["final", "short", "medium"] as const).map((id) => <button type="button" key={id} aria-pressed={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{id === "final" ? "برنامهٔ نهایی سبد" : id === "short" ? "پیش‌نمایش کوتاه‌مدت" : "پیش‌نمایش میان‌مدت"}</button>)}</div><div><button type="button" className="ghost-button" onClick={save} disabled={!computed.final}>ذخیرهٔ نمونه</button><button type="button" className="ghost-button" onClick={restore}>بازیابی نمونه</button></div></div>
    {notice && <p role="status" className="action-notice">{notice}</p>}
    {computed.error && <p role="alert" className="action-error">محاسبه انجام نشد: {computed.error}</p>}
    {plan && <>
      <div className={`action-summary action-state-${plan.state}`} aria-live="polite"><div><small>{view === "final" ? "یک برنامه با بودجهٔ مشترک" : "پیش‌نمایش مستقل با کل بودجه"}</small><h3>{plan.state === "proposed" ? `${plan.orders.length.toLocaleString("fa-IR")} تغییر محاسبه‌شده در سبد` : plan.state === "hold" ? "ترکیب فعلی حفظ شود" : plan.state === "wait" ? "در انتظار شرط مناسب" : "اطلاعات برای تصمیم کافی نیست"}</h3>{plan.reasonCodes.map((code) => <p key={code}>{reasons[code]}</p>)}</div><div><span>هزینهٔ کامل تغییر</span><strong>{money(plan.portfolio.totalCostToman)}</strong><span>نقد پس از برنامه</span><strong>{money(plan.portfolio.cashAfterToman)}</strong></div></div>
      <p className="action-horizon-note">کوتاه‌مدت: {input.shortDays.toLocaleString("fa-IR")} روز، تا {displayDate(plan.horizons[0].endsOn)}؛ میان‌مدت: {input.mediumDays.toLocaleString("fa-IR")} روز، تا {displayDate(plan.horizons[1].endsOn)}. سهم برنامهٔ نهایی: {percent(input.shortBudgetBps)} کوتاه‌مدت و {percent(10_000 - input.shortBudgetBps)} میان‌مدت. پیش‌نمایش‌ها گزینه‌های جایگزین‌اند و با هم جمع نمی‌شوند.</p>
      {plan.inputIssues.length > 0 && <ul className="action-error">{plan.inputIssues.map((issue) => <li key={`${issue.assetId}-${issue.code}`}>{name(input.assets.find((asset) => asset.id === issue.assetId)!)}: {issueLabels[issue.code]}</li>)}</ul>}
      <div className="action-card-grid">{plan.rows.map((row) => <AssetDecisionCard plan={plan} row={row} key={row.assetId} />)}</div>
      {plan.conversions.length > 0 && <details className="action-detail" open><summary>مسیر تبدیل و تأمین وجه</summary><p>هر فروش یک‌بار در کارت دارایی مبدأ ثبت شده است. مبلغ‌های زیر سهم وجه همان فروش برای خرید مقصد هستند؛ مقدار فروش را دوباره جمع نکن.</p><ul className="action-conversions">{plan.conversions.map((route) => <li key={`${route.saleOrderId}-${route.buyOrderId}`}><b>{route.kind === "same_class" ? "هم‌کلاس" : "بین‌کلاسی"}</b><span>{name(input.assets.find((asset) => asset.id === route.sourceId)!)} ← {name(input.assets.find((asset) => asset.id === route.destinationId)!)}</span><strong>{money(route.amountToman)}</strong></li>)}</ul></details>}
      <details className="action-detail"><summary>مقایسهٔ گزینه‌ها و اثر تغییر بر ریسک</summary>
        <p>حد فشار محافظه‌کارانهٔ سبد: از {money(plan.portfolio.stressLossBeforeToman)} به {money(plan.portfolio.stressLossAfterToman)}؛ معادل {percent(plan.portfolio.stressBoundAfterBps)} از ارزش پس از برنامه. تحمل ثبت‌شده {input.maximumDrawdownPercent.toLocaleString("fa-IR")}٪ است. این حد از جمع بدترین افت هر دارایی در سناریوهای ساختگی می‌آید؛ احتمال وقوع یا زیان تضمین‌شده نیست.</p>
        <p>گزینه‌های قابل‌محاسبه بر اساس معیار کمتر، مرتب شده‌اند. انتخاب نهایی علاوه بر مجازبودن، باید بیش از {percent(input.minimumImprovementBps)} از ارزش اولیه بهبود ایجاد کند. فاصلهٔ کمتر از {percent(input.noTradeBandBps)} از هدف، تغییر ایجاد نمی‌کند.</p>
        <ol className="action-alternatives">{[...plan.alternatives].sort((a, b) => a.objectiveToman === null ? (b.objectiveToman === null ? a.fractionBps - b.fractionBps : 1) : b.objectiveToman === null ? -1 : BigInt(a.objectiveToman) < BigInt(b.objectiveToman) ? -1 : BigInt(a.objectiveToman) > BigInt(b.objectiveToman) ? 1 : a.fractionBps - b.fractionBps).map((option) => <li key={option.fractionBps}><strong>{percent(option.fractionBps)} از تغییر هدف{option.fractionBps === plan.portfolio.chosenFractionBps ? " — برنامهٔ فعلی" : ""}</strong><span>{option.state === "infeasible" ? "ناسازگار با محدودیت‌ها" : option.state === "not_evaluated" ? "به‌علت وضعیت قیمت بررسی نشد" : `معیار: ${money(option.objectiveToman!)}؛ هزینه: ${money(option.totalCostToman!)}`}</span></li>)}</ol>
      </details>
      <details className="action-detail"><summary>تطبیق کل سبد، معیار انتخاب و زمان بازبینی</summary><p>ارزش قبل {money(plan.portfolio.beforeToman)} = ارزش پس از برنامه {money(plan.portfolio.afterToman)} + هزینهٔ کامل {money(plan.portfolio.totalCostToman)}. ذخیرهٔ نقد حداقلی: {money(plan.portfolio.cashReserveToman)}؛ گردش: {percent(plan.portfolio.turnoverBps)}.</p><p>معیار انتخاب: مجموع فاصلهٔ مبلغ دارایی‌ها و نقد از هدف، به‌اضافهٔ دو برابر هزینهٔ تغییر. پنج اندازهٔ صفر، ۲۵، ۵۰، ۷۵ و ۱۰۰ درصدِ تغییر هدف بررسی شدند؛ بهترین گزینهٔ مجاز {percent(plan.portfolio.chosenFractionBps)} بود.</p><p>فاصله از هدف قبل: {money(plan.portfolio.trackingErrorBeforeToman)}؛ بعد: {money(plan.portfolio.trackingErrorAfterToman)}؛ بهبود معیار پس از جریمهٔ هزینه: {money(plan.portfolio.objectiveImprovementToman)}. این عدد سود موردانتظار نیست. جست‌وجو فقط بین همین پنج اندازه است.</p><p>قیمت‌ها تا {displayDate(plan.validUntil)} معتبرند؛ بازبینی در {displayDate(plan.reviewOn)} یا زودتر با تغییر ورودی. نقطهٔ سودگیری و حد ضرر قیمتی توسط این روش پیش‌بینی نمی‌شود؛ حدود نمایش‌داده‌شده، سقف ورود و کف خروجِ مجازند.</p><p>بازه‌های ۳۰ و ۱۸۰ روز و سهم اولیهٔ ۵۰/۵۰ فرض طراحیِ قابل‌تغییر این میز هستند. عوامل روند موجود همچنان از ۲۰ و ۶۰ مشاهدهٔ ساختگی استفاده می‌کنند.</p><code>{plan.schemaVersion} · {plan.methodologyId}</code></details>
    </>}
    <ActionSizingComparisonPanel />
  </section>;
}
