"use client";

import { useEffect, useMemo, useState } from "react";
import { AssetDecisionCard, DecisionActionWorkbench } from "./decision-action-workbench";
import type { ActionAsset, ActionInput } from "./decision-action-plan";
import {
  createSharedPortfolio, decodeSharedPortfolio, encodeSharedPortfolio, evaluateSharedPortfolio,
  replaceSharedInput, SHARED_STORAGE_KEY, unsupportedCatalog,
  type SharedPortfolio, type UnsupportedId,
} from "./shared-portfolio";
import type { View } from "./workspace-navigation";

const money = (value: string | null | undefined) => value == null ? "قابل محاسبه نیست" : `${BigInt(value).toLocaleString("fa-IR")} تومان`;
const percent = (bps: number | null | undefined) => bps == null ? "نامشخص" : `${(bps / 100).toLocaleString("fa-IR")}٪`;
const assetName = (name: string) => name.replace("[ساختگی] ", "");
const quantity = (value: number) => Number.isFinite(value) ? (value / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 3 }) : "نامعتبر";
// Remove binary floating-point noise, but do not round a fourth decimal to an allowed lot.
const scaled = (value: number, scale: number) => Number((value * scale).toFixed(6));

function NumericField({ label, value, onChange, step = 1, id }: {
  label: string; value: number | null; onChange: (value: number) => void; step?: number; id: string;
}) {
  return <label className="action-field"><span>{label}</span><input data-testid={id} type="number" min={0} step={step} value={value !== null && Number.isFinite(value) ? value : ""} onChange={(event) => onChange(event.target.valueAsNumber)} /></label>;
}

function AssetEditor({ asset, update }: { asset: ActionAsset; update: (key: keyof ActionAsset, value: number | string | null) => void }) {
  const unit = asset.unit === "gram" ? "گرم" : "عدد";
  return <fieldset className="shared-editor" data-testid={`shared-editor-${asset.id}`}>
    <legend>{assetName(asset.name)}</legend>
    <p>کلاس {asset.assetClass === "gold" ? "طلا" : "نقره"} · واحد {unit} · عیار/خلوص {asset.purityPermille.toLocaleString("fa-IR")} در هزار · گام مقدار {quantity(asset.lotMilli)} {unit}</p>
    <div className="action-input-grid">
      <NumericField id={`shared-quantity-${asset.id}`} label={`موجودی — ${unit}`} value={asset.quantityMilli / 1000} step={asset.lotMilli / 1000} onChange={(value) => update("quantityMilli", scaled(value, 1000))} />
      <NumericField id={`shared-reference-${asset.id}`} label={`قیمت مبنا — تومان / ${unit}`} value={asset.referencePriceToman} onChange={(value) => update("referencePriceToman", value)} />
      <NumericField id={`shared-bid-${asset.id}`} label={`قیمت فروش — تومان / ${unit}`} value={asset.bidToman} onChange={(value) => update("bidToman", Number.isNaN(value) ? null : value)} />
      <NumericField id={`shared-ask-${asset.id}`} label={`قیمت خرید — تومان / ${unit}`} value={asset.askToman} onChange={(value) => update("askToman", Number.isNaN(value) ? null : value)} />
      <label className="action-field"><span>تاریخ قیمت</span><input data-testid={`shared-quoted-${asset.id}`} type="date" value={asset.quotedOn} onChange={(event) => update("quotedOn", event.target.value)} /></label>
      <label className="action-field"><span>اعتبار قیمت تا</span><input data-testid={`shared-expiry-${asset.id}`} type="date" value={asset.validUntil} onChange={(event) => update("validUntil", event.target.value)} /></label>
    </div>
  </fieldset>;
}

export function SharedPortfolioWorkspace({ active, view, onNavigate }: { active: boolean; view: View; onNavigate: (view: View) => void }) {
  const [portfolio, setPortfolio] = useState<SharedPortfolio>(createSharedPortfolio);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [unsupportedChoice, setUnsupportedChoice] = useState<UnsupportedId>("SYNTH_STOCKS");
  useEffect(() => { if (active) window.scrollTo(0, 0); }, [active, view]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(SHARED_STORAGE_KEY);
        if (saved) {
          setPortfolio(decodeSharedPortfolio(saved));
          setNotice("سبد ذخیره‌شده بازیابی شد؛ ورودی و نتیجه دوباره تطبیق داده شدند.");
        } else setNotice("سبد مشترکِ ساختگی از نمونهٔ مرجع آغاز شد. نمونه‌ها و اطلاعات قدیمی جدا و دست‌نخورده‌اند؛ بدون نگاشت معتبر، به این سبد منتقل نشده‌اند.");
      } catch { setNotice("بازیابی خودکار انجام نشد؛ نسخهٔ قبلی حذف نشده است. اکنون نمونهٔ مرجع جدید نمایش داده می‌شود، نه نسخهٔ ذخیره‌شده."); }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const evaluation = useMemo(() => evaluateSharedPortfolio(portfolio), [portfolio]);
  const plan = evaluation.plan;
  const selected = portfolio.input.assets.find((asset) => asset.id === portfolio.selectedAssetId);
  const selectedRow = plan?.rows.find((row) => row.assetId === portfolio.selectedAssetId);
  const updateInput = (input: ActionInput) => { setPortfolio((previous) => replaceSharedInput(previous, input)); setNotice("ورودی مشترک تغییر کرد؛ نتیجه دوباره محاسبه شد. برای نگهداری پس از بستن مرورگر، ذخیره کن."); };
  const updateAsset = (id: string, key: keyof ActionAsset, value: number | string | null) => updateInput({ ...portfolio.input, assets: portfolio.input.assets.map((asset) => asset.id === id ? { ...asset, [key]: value } : asset) });
  const select = (id: string) => setPortfolio((previous) => ({ ...previous, selectedAssetId: id, revision: previous.revision + 1 }));
  const save = () => {
    try {
      const document = encodeSharedPortfolio(portfolio);
      const previous = localStorage.getItem(SHARED_STORAGE_KEY);
      if (previous) localStorage.setItem(`${SHARED_STORAGE_KEY}-previous`, previous);
      localStorage.setItem(SHARED_STORAGE_KEY, document);
      setNotice("همین سبد، انتخاب دارایی و نتیجه در این مرورگر ذخیره شد؛ نسخهٔ قبلی نیز نگه داشته شد. این ذخیره هنوز بین دستگاه‌ها همگام نمی‌شود.");
    } catch { setNotice("ذخیره انجام نشد؛ ورودی نامعتبر یا فضای ذخیره غیرقابل دسترس است. نسخهٔ قبلی حفظ شد."); }
  };
  const restore = () => {
    try {
      const document = localStorage.getItem(SHARED_STORAGE_KEY);
      if (!document) { setNotice("نسخهٔ مشترک ذخیره‌شده‌ای وجود ندارد؛ ورودی فعلی حفظ شد."); return; }
      const restored = decodeSharedPortfolio(document);
      setPortfolio(restored); setNotice("سبد و انتخاب دارایی بازیابی شدند؛ محاسبات با نسخهٔ ذخیره‌شده دقیقاً تطبیق دارند.");
    } catch { setNotice("نسخهٔ ذخیره‌شده ناسازگار یا تغییرکرده است؛ سبد فعلی و نسخهٔ ذخیره‌شده حفظ شدند."); }
  };
  const addUnsupported = () => {
    if (portfolio.unsupported.some((holding) => holding.id === unsupportedChoice)) { select(unsupportedChoice); return; }
    setPortfolio((previous) => ({ ...previous, revision: previous.revision + 1, selectedAssetId: unsupportedChoice, unsupported: [...previous.unsupported, { id: unsupportedChoice, quantityMilli: 1000, referencePriceToman: null }] }));
    setNotice("دارایی ساختگیِ فاقد پشتیبانی اضافه شد؛ تا حضور آن، تصمیم کل سبد متوقف است و قیمت جایگزین ساخته نمی‌شود.");
  };

  if (!active) return null;
  if (!loaded) return <p role="status">در حال بررسی نسخهٔ ذخیره‌شدهٔ سبد مشترک…</p>;
  const titles: Partial<Record<View, string>> = { overview: "نمای کلی سبد مشترک", portfolio: "فهرست و ورودی سبد مشترک", "asset-center": "مرکز داراییِ سبد مشترک", analysis: "تحلیل سبد مشترک", decisions: "تصمیم برای سبد مشترک", risk: "ریسک همین برنامهٔ مشترک" };
  return <section className="view-stack shared-workspace" data-testid="shared-portfolio" data-revision={portfolio.revision}>
    <div className="view-hero"><div><span className="action-eyebrow">یک سبد · یک ورودی · یک بودجه</span><h2>{titles[view]}</h2><p>طلا، سکه، نقره و نقد از یک قرارداد مشترک می‌آیند؛ مقدار صفر یعنی فعلاً آن دارایی را نداری.</p></div><span className="status-chip warning">دادهٔ کاملاً ساختگی</span></div>
    <div className="shared-toolbar">
      <label className="action-field"><span>دارایی انتخاب‌شده در همهٔ نماها</span><select data-testid="shared-selection" value={portfolio.selectedAssetId} onChange={(event) => select(event.target.value)}>{portfolio.input.assets.map((asset) => <option key={asset.id} value={asset.id}>{assetName(asset.name)}</option>)}{portfolio.unsupported.map((holding) => <option key={holding.id} value={holding.id}>{assetName(unsupportedCatalog[holding.id].name)} — فاقد پشتیبانی</option>)}</select></label>
      <div className="market-actions"><button className="ghost-button" onClick={save}>ذخیرهٔ سبد مشترک</button><button className="ghost-button" onClick={restore}>بازیابی سبد مشترک</button>{view !== "portfolio" && <button className="primary-button" onClick={() => onNavigate("portfolio")}>ویرایش ورودی سبد</button>}</div>
    </div>
    {notice && <p className="action-notice" role="status">{notice}</p>}
    <div className="shared-summary">
      <article><span>ارزش کل قبل — با نقد</span><strong data-testid="shared-total">{money(evaluation.totalToman)}</strong></article>
      <article><span>نقد قبل</span><strong data-testid="shared-cash">{money(evaluation.cashToman)}</strong></article>
      <article><span>هزینهٔ برنامهٔ نهایی</span><strong data-testid="shared-cost">{money(plan?.portfolio.totalCostToman)}</strong></article>
      <article><span>نقد بعد از برنامهٔ نهایی</span><strong data-testid="shared-cash-after">{money(plan?.portfolio.cashAfterToman)}</strong></article>
    </div>
    {evaluation.errors.length > 0 && <div className="action-error" role="alert"><b>تصمیم‌ناپذیر — سبد ناقص یا پشتیبانی‌نشده</b><ul>{evaluation.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {plan?.state === "undecidable" && <p className="action-error" role="alert">قیمت ناقص، منقضی یا مربوط به آینده است؛ هیچ اقدام یا مصرف بودجه‌ای صادر نشده است. ارزش مبنا، قیمت معتبر امروز نیست.</p>}

    {(view === "overview" || view === "portfolio") && <section className="panel shared-table-panel"><h3>موجودی همین سبد</h3><p>وزن‌ها نسبت به ارزش کلِ قبل، شامل نقد هستند؛ نمایش تا دو رقم اعشار، رو به پایین است.</p><div className="table-scroll"><table className="shared-table"><thead><tr><th>دارایی</th><th>مقدار / واحد</th><th>کلاس / عیار</th><th>ارزش مبنا</th><th>وزن از کل</th><th>مسیر بررسی</th></tr></thead><tbody>
      {portfolio.input.assets.map((asset) => <tr key={asset.id} data-testid={`shared-holding-${asset.id}`} aria-selected={portfolio.selectedAssetId === asset.id}><td>{assetName(asset.name)}</td><td>{quantity(asset.quantityMilli)} {asset.unit === "gram" ? "گرم" : "عدد"}</td><td>{asset.assetClass === "gold" ? "طلا" : "نقره"} / {asset.purityPermille.toLocaleString("fa-IR")}</td><td>{money(evaluation.values[asset.id])}</td><td>{percent(evaluation.weightsBps[asset.id])}</td><td><button className="text-button" onClick={() => { select(asset.id); onNavigate("asset-center"); }}>بررسی {assetName(asset.name)}</button></td></tr>)}
      {portfolio.unsupported.map((holding) => <tr key={holding.id}><td>{assetName(unsupportedCatalog[holding.id].name)} — فاقد پشتیبانی</td><td>{quantity(holding.quantityMilli)} {unsupportedCatalog[holding.id].unit}</td><td>{unsupportedCatalog[holding.id].assetClass} / عیار کاربرد ندارد</td><td>{money(evaluation.values[holding.id])}</td><td>{percent(evaluation.weightsBps[holding.id])}</td><td>تصمیم‌ناپذیر</td></tr>)}
      <tr><td>نقد آزاد</td><td>تومان</td><td>نقد / عیار کاربرد ندارد</td><td>{money(evaluation.cashToman)}</td><td>{percent(evaluation.weightsBps.SYNTH_CASH)}</td><td>یک بودجهٔ مشترک</td></tr>
    </tbody></table></div><div className="market-actions"><button className="ghost-button" onClick={() => onNavigate("analysis")}>تحلیل کوتاه‌مدت و میان‌مدت</button><button className="primary-button" onClick={() => onNavigate("decisions")}>مشاهدهٔ برنامهٔ نهایی</button></div></section>}

    {view === "portfolio" && <section className="panel"><h3>ویرایش ورودی مشترک</h3><p>همهٔ قیمت‌ها تومان برای یک گرم یا یک عددند؛ قیمت‌های خرید و فروش با تغییر مبنا خودکار ساخته نمی‌شوند.</p><div className="action-input-grid">
      <NumericField id="shared-cash-input" label="نقد موجود — تومان" value={portfolio.input.cashToman} onChange={(cashToman) => updateInput({ ...portfolio.input, cashToman })} />
      <NumericField id="shared-minimum-cash" label="حداقل نقد — درصد" value={portfolio.input.minimumCashBps / 100} step={0.01} onChange={(value) => updateInput({ ...portfolio.input, minimumCashBps: scaled(value, 100) })} />
      <NumericField id="shared-maximum-asset" label="حداکثر وزن هر دارایی — درصد" value={portfolio.input.maximumAssetBps / 100} step={0.01} onChange={(value) => updateInput({ ...portfolio.input, maximumAssetBps: scaled(value, 100) })} />
      <label className="action-field"><span>تاریخ بررسی ساختگی</span><input data-testid="shared-asof" type="date" value={portfolio.input.asOf} onChange={(event) => updateInput({ ...portfolio.input, asOf: event.target.value })} /></label>
    </div>{portfolio.input.assets.map((asset) => <AssetEditor key={asset.id} asset={asset} update={(key, value) => updateAsset(asset.id, key, value)} />)}
      <details className="action-detail"><summary>آزمودن دارایی‌های فاقد پشتیبانی</summary><p>این کلاس‌ها هنوز به روش مقداردهی میز متصل نشده‌اند. حضور حتی یک ردیف بدون پشتیبانی، تصمیم کل سبد را متوقف می‌کند.</p><label className="action-field"><span>کلاس ساختگی</span><select value={unsupportedChoice} onChange={(event) => setUnsupportedChoice(event.target.value as UnsupportedId)}>{Object.entries(unsupportedCatalog).map(([id, item]) => <option key={id} value={id}>{assetName(item.name)}</option>)}</select></label><button className="ghost-button" onClick={addUnsupported}>افزودن دارایی فاقد پشتیبانی</button></details>
      {portfolio.unsupported.map((holding) => <fieldset key={holding.id} className="shared-editor"><legend>{assetName(unsupportedCatalog[holding.id].name)} — فاقد پشتیبانی</legend><div className="action-input-grid"><NumericField id={`shared-quantity-${holding.id}`} label={`مقدار — ${unsupportedCatalog[holding.id].unit}`} value={holding.quantityMilli / 1000} step={0.001} onChange={(value) => { setPortfolio((previous) => ({ ...previous, revision: previous.revision + 1, unsupported: previous.unsupported.map((row) => row.id === holding.id ? { ...row, quantityMilli: scaled(value, 1000) } : row) })); }} /><NumericField id={`shared-reference-${holding.id}`} label="قیمت مبنا — تومان برای هر واحد" value={holding.referencePriceToman} onChange={(value) => setPortfolio((previous) => ({ ...previous, revision: previous.revision + 1, unsupported: previous.unsupported.map((row) => row.id === holding.id ? { ...row, referencePriceToman: Number.isNaN(value) ? null : value } : row) }))} /></div><button className="ghost-button" onClick={() => setPortfolio((previous) => ({ ...previous, revision: previous.revision + 1, unsupported: previous.unsupported.filter((row) => row.id !== holding.id), selectedAssetId: previous.selectedAssetId === holding.id ? previous.input.assets[0].id : previous.selectedAssetId }))}>کنارگذاشتن {assetName(unsupportedCatalog[holding.id].name)} از نمونهٔ فعلی</button></fieldset>)}
    </section>}

    {(view === "asset-center" || view === "analysis") && <section className="panel"><h3>{selected ? assetName(selected.name) : "دارایی فاقد پشتیبانی"}</h3>{selected ? <p data-testid="shared-selected-summary">موجودی {quantity(selected.quantityMilli)} {selected.unit === "gram" ? "گرم" : "عدد"} · ارزش {money(evaluation.values[selected.id])} · وزن {percent(evaluation.weightsBps[selected.id])} از کل سبد با نقد</p> : <p>برای این دارایی تحلیل یا تصمیم جایگزین ساخته نشده است.</p>}
      {view === "asset-center" && selected && <AssetEditor asset={selected} update={(key, value) => updateAsset(selected.id, key, value)} />}
      {plan && selectedRow && view === "asset-center" && <AssetDecisionCard plan={plan} row={selectedRow} />}
      {plan && selected && view === "analysis" && <div className="shared-analysis">{plan.horizons.map((horizon) => <article key={horizon.id} className="action-card" data-testid={`shared-analysis-${horizon.id}`}><h3>{horizon.id === "short" ? "کوتاه‌مدت" : "میان‌مدت"} — {horizon.days.toLocaleString("fa-IR")} روز</h3><p>وزن هدف {assetName(selected.name)}: <b>{percent(horizon.targetsBps[selected.id])}</b> از کل سبد؛ وزن هدف نقد: {percent(horizon.targetsBps.SYNTH_CASH)}.</p><p>سناریوی فعال: {portfolio.input.scenario === "method" ? "موتور تحلیل هشت‌عاملی" : "وزن هدف ثابتِ آزمون؛ نه انتخاب موتور تحلیل"}. این افق به‌تنهایی بودجهٔ جداگانه‌ای خرج نمی‌کند.</p><details><summary>عامل‌ها و دلیل عددی</summary>{horizon.factors[selected.id].map((factor) => <p key={factor.id}>{factor.label}: امتیاز {factor.points.toLocaleString("fa-IR")} × وزن {percent(factor.weight * 10_000)} = سهم {factor.weightedContribution.toLocaleString("fa-IR")}</p>)}<p>افت در بدترین سناریوی ساختگی: {horizon.worstStressPercent[selected.id].toLocaleString("fa-IR")}٪؛ احتمال یا پیش‌بینی افت بازار نیست.</p></details></article>)}</div>}
      <div className="market-actions"><button className="ghost-button" onClick={() => onNavigate("analysis")}>تحلیل دو افق</button><button className="primary-button" onClick={() => onNavigate("decisions")}>مقدار، هزینه و برنامهٔ نهایی</button></div>
    </section>}
    {view === "risk" && <section className="panel"><h3>ریسک و محدودیت‌های همان برنامه</h3>{plan ? <><p>حد فشار سناریویی قبل: {money(plan.portfolio.stressLossBeforeToman)}؛ بعد: {money(plan.portfolio.stressLossAfterToman)}.</p><p>ذخیرهٔ نقد: {money(plan.portfolio.cashReserveToman)}؛ گردش نهایی: {percent(plan.portfolio.turnoverBps)}. تحمل افت ثبت‌شده: {portfolio.input.maximumDrawdownPercent.toLocaleString("fa-IR")}٪.</p></> : <p>به‌علت ورودی ناقص یا فاقد پشتیبانی، ریسک برنامه قابل‌محاسبه نیست.</p>}<button className="primary-button" onClick={() => onNavigate("decisions")}>دیدن برنامه و محدودیت‌ها</button></section>}
    {view === "decisions" && <DecisionActionWorkbench input={portfolio.input} onInputChange={updateInput} blockedReason={evaluation.errors.join(" ")} onSave={save} onRestore={restore} />}
    <details className="action-detail"><summary>ردپای مشترک و محدودهٔ ذخیره</summary><p>بازبینی ورودی: {portfolio.revision.toLocaleString("fa-IR")}؛ روش عددی تغییر نکرده است. ذخیره فقط در این مرورگر است و شامل ورودی و نتیجهٔ بازتولیدشده می‌شود؛ ذخیرهٔ شخصیِ سرور و نمونهٔ مستقل قبلی استفاده یا بازنویسی نمی‌شوند.</p><code dir="ltr">{portfolio.schemaVersion} · {portfolio.input.fixtureId} · {plan?.methodologyId ?? "NO_PLAN"}</code><p>نمای دیده‌بان بازار، آزمون‌های کیفیت و مقایسهٔ هفت روش، نمونه‌های مرجع جداگانه‌اند؛ داده یا بودجهٔ این سبد محسوب نمی‌شوند.</p></details>
  </section>;
}
