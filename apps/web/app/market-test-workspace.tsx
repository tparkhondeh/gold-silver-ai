"use client";

import { useEffect, useMemo, useState } from "react";
import { createMarketTestPortfolio, displayRialAsToman as money, evaluateMarketTest, marketTestAssets, validateMarketSnapshot, tomanInputToRial, rialToTomanInput, type MarketTestPortfolio } from "./market-test-contract";
import { restoreMarketTest, saveMarketTest } from "./market-test-storage";
import type { View } from "./workspace-navigation";
import { NumberValue } from "./number-value";
import { FileMarketWorkspace } from "./file-market-workspace";
import { snapshotFailure } from "./browser-snapshot-storage";

const labels = { fresh: "تازه", stale: "منقضی — فقط ارزش ثبت‌شده", future: "زمان انتشار در آینده", missing: "قیمت موجود نیست", unknown_time: "زمان قیمت نامشخص" };
const percent = (value: number | null) => value === null ? "نامشخص" : <NumberValue value={value} denominator={100} unit="٪" />;
const date = (value: string) => new Date(value).toLocaleString("fa-IR");
const stageLabels: Record<string, string> = { network: "ارتباط با منبع", http: "پاسخ سرویس", payload: "خواندن پاسخ", validation: "اعتبارسنجی داده", outcome_recording: "ثبت نتیجه در دفتر سهمیه" };
const errorMessages: Record<string, string> = {
  local_same_origin_intent_required: "دریافت فقط در اجرای محلیِ مجاز فعال است.", free_plan_required: "فقط پلن رایگان مجاز است.",
  missing_key: "کلید نوسان تنظیم نشده است.", key_rotation_required: "تأیید تعویض کلید لازم است.", invalid_unit: "واحد پول منبع تنظیم نشده است.",
  quota_unavailable: "دفتر سهمیه در دسترس نیست؛ درخواستی ارسال نشد.", quota_exhausted: "سقف امن سهمیه پر شده؛ درخواستی ارسال نشد.",
  refresh_cooldown: "فاصلهٔ امن دریافت هنوز نگذشته؛ درخواستی ارسال نشد. قیمت قبلی حفظ شد.",
  provider_or_validation_failed: "منبع پاسخ معتبر نداد؛ درخواست در سهمیه ثبت شد. قیمت قبلی حفظ شد و تکرار خودکار نداریم.",
};

function CashInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  let displayed = "";
  try { displayed = rialToTomanInput(value); } catch { /* Invalid editable input stays blank; never round it. */ }
  return <label className="action-field"><span>نقد فرضی — تومان</span><input data-testid="market-cash-input" type="number" min="0" step="0.1" value={displayed} onChange={(event) => { try { onChange(tomanInputToRial(event.target.value)); } catch { onChange("invalid"); } }}/></label>;
}

export function MarketTestWorkspace({ active, view, onNavigate }: { active: boolean; view: View; onNavigate: (view: View) => void }) {
  const [portfolio, setPortfolio] = useState<MarketTestPortfolio>(createMarketTestPortfolio);
  const [now, setNow] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [storedRaw, setStoredRaw] = useState<string | null | undefined>(undefined);
  const [quota, setQuota] = useState("");
  const [fileMode, setFileMode] = useState(false);
  const [fileVisited, setFileVisited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const time = Date.now(); setNow(time);
      try { const saved = restoreMarketTest(localStorage, time); setStoredRaw(saved.raw); if (saved.portfolio) { setPortfolio(saved.portfolio); setNotice("نسخهٔ آزمون بازیابی شد؛ تازگی قیمت با زمان فعلی دوباره بررسی می‌شود."); } }
      catch { setNotice("نسخهٔ ذخیره‌شده قابل بازیابی نیست؛ حذف نشده و ذخیره غیرفعال است. اکنون نمونهٔ خالی جدید نمایش داده می‌شود."); }
    }, 0);
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, []);
  useEffect(() => { if (active) window.scrollTo(0, 0); }, [active, view]);
  const computed = useMemo(() => {
    if (now === null) return { result: null, error: "" };
    try { return { result: evaluateMarketTest(portfolio, now), error: "" }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : "ورودی نامعتبر است." }; }
  }, [portfolio, now]);
  const change = (values: Partial<MarketTestPortfolio>) => { setPortfolio((p) => ({ ...p, ...values, revision: p.revision + 1 })); setNotice("ورودی آزمون تغییر کرد؛ نماهای مرتبط به‌روز شدند. هنوز ذخیره نشده است."); };
  const receive = async () => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/market-test", { method: "POST", headers: { "x-asha-market-test": "latest-once" }, cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (typeof body.used === "number" && typeof body.remaining === "number") setQuota(`${body.used.toLocaleString("fa-IR")} درخواست مصرف‌شده؛ ${body.remaining.toLocaleString("fa-IR")} از سقف امن باقی‌مانده (دفتر این پروژه).`);
      if (!response.ok || body.state !== "received") { setNotice(`${errorMessages[body.reason] ?? "دریافت موفق نبود؛ دادهٔ قبلی حفظ شد."}${stageLabels[body.stage] ? ` مرحلهٔ مشکل: ${stageLabels[body.stage]}.` : ""}`); return; }
      const time = Date.now(); validateMarketSnapshot(body.snapshot, time);
      setNow(time); change({ snapshot: body.snapshot });
      setNotice("قیمت‌های واقعی دریافت و اعتبارسنجی شدند؛ منقضی‌بودن جدا مشخص است. برای نگهداری همین نسخه، ذخیره کن.");
    } catch { setNotice("ارتباط یا پاسخ نامعتبر بود؛ دادهٔ قبلی حفظ شد. درخواست خودکار تکرار نمی‌شود."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (busy || storedRaw === undefined) return;
    setBusy(true);
    try { const time = Date.now(); setStoredRaw(await saveMarketTest(localStorage, portfolio, time, storedRaw)); setNow(time); setNotice("فقط آخرین نسخهٔ آزمون در همین مرورگر ذخیره شد؛ نه سبد شخصی و نه تاریخچهٔ بازار. بین دستگاه‌ها همگام نیست."); }
    catch (error) { setNotice(snapshotFailure(error, "ذخیره ناموفق؛ نسخهٔ قبلی حفظ شد. ورودی و دسترسی فضای مرورگر را بررسی کن.")); }
    finally { setBusy(false); }
  };
  const restore = () => {
    try { const time = Date.now(); const saved = restoreMarketTest(localStorage, time); setStoredRaw(saved.raw); if (!saved.portfolio) { setNotice("نسخهٔ آزمونی ذخیره نشده است؛ ورودی فعلی حفظ شد."); return; } setPortfolio(saved.portfolio); setNow(time); setNotice("همان ورودی و محاسبهٔ ثبت‌شده بازیابی شد؛ قیمت قدیمی تازه فرض نمی‌شود."); }
    catch { setNotice("بازیابی ناموفق؛ نسخهٔ ذخیره و ورودی فعلی حفظ شدند."); }
  };

  const result = computed.result;
  const selected = result?.rows.find((r) => r.asset.id === portfolio.selectedAsset);
  const editor = (asset: (typeof marketTestAssets)[number]) => <label className="action-field" key={asset.id}><span>{asset.name} — {asset.unit === "gram" ? "گرم" : "عدد"} (موجودی فرضی)</span><input data-testid={`market-quantity-${asset.id}`} type="number" min="0" step={asset.unit === "unit" ? 1 : 0.001} value={Number.isFinite(portfolio.quantitiesMilli[asset.id]) ? portfolio.quantitiesMilli[asset.id] / 1000 : ""} onChange={(event) => change({ quantitiesMilli: { ...portfolio.quantitiesMilli, [asset.id]: Number((event.target.valueAsNumber * 1000).toFixed(6)) } })}/></label>;
  return <>
    <div hidden={!active || !fileMode} data-testid="retained-file-workspace">{fileVisited && <><button className="ghost-button" onClick={() => setFileMode(false)}>بازگشت به آزمون نوسان</button><FileMarketWorkspace active={active && fileMode} view={view} onNavigate={onNavigate}/></>}</div>
    <div hidden={!active || fileMode}>{now === null ? <p role="status">در حال بررسی نسخهٔ آزمون…</p> : <section className="view-stack market-test-workspace" data-testid="market-test-workspace" data-revision={portfolio.revision}>
    <fieldset disabled={busy} style={{ display: "contents" }}>
    <button className="ghost-button" onClick={() => { setFileVisited(true); setFileMode(true); }}>اتصال فایل TXT رهاورد / آزمون ساختگی</button>
    <div className="market-test-boundary"><b>{portfolio.snapshot ? "قیمت واقعی بازار" : "قیمت بازار هنوز دریافت نشده"} · موجودی و نقد فرضیِ آزمون</b><span>منبع: نوسان · بدون اتصال به سبد شخصی یا موتور سفارش</span></div>
    <div className="shared-toolbar"><label className="action-field"><span>دارایی مشترک</span><select data-testid="market-selection" value={portfolio.selectedAsset} onChange={(event) => change({ selectedAsset: event.target.value })}>{marketTestAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className="market-actions"><button className="primary-button" disabled={busy} onClick={receive}>{busy ? "در حال انجام…" : "دریافت یک‌باره از نوسان"}</button><button className="ghost-button" disabled={storedRaw === undefined || !!computed.error} onClick={save}>ذخیرهٔ آزمون بازار</button><button className="ghost-button" onClick={restore}>بازیابی آزمون بازار</button></div></div>
    {notice && <p role="status" className="action-notice">{notice}</p>}
    {quota && <small>{quota}</small>}
    {computed.error && <p role="alert" className="action-error">{computed.error}</p>}
    <div className="shared-summary"><article><span>ارزش با قیمت ثبت‌شده — شامل نقد</span><strong data-testid="market-total">{money(result?.observedTotalRial ?? null)}</strong></article><article><span>ارزش با قیمت تازه</span><strong data-testid="market-current-total">{money(result?.currentTotalRial ?? null)}</strong></article><article><span>نقد فرضیِ قبل</span><strong data-testid="market-cash">{computed.error ? "نامعتبر" : money(portfolio.cashRial)}</strong></article></div>
    {result?.rows.some((r) => r.quantityMilli > 0 && r.state !== "fresh") && <p role="alert" className="action-error">قیمت بعضی موجودی‌ها ناقص، منقضی یا مربوط به آینده است؛ ارزش ثبت‌شده را ارزش تازهٔ بازار حساب نکن.</p>}
    {(view === "overview" || view === "decisions" || view === "agents") && <section className="panel"><h2>نتیجه: تصمیم‌ناپذیر</h2><p>قیمت لحظه‌ای به‌تنهایی برای تعیین ورود، خروج یا تبدیل کافی نیست؛ «بدون تغییر» هم صادر نشده است.</p><div className="table-scroll"><table className="shared-table"><thead><tr><th>دارایی</th><th>مقدار / مبلغ اقدام</th><th>شرط اقدام / هزینه</th><th>نقد بعد</th><th>افق</th></tr></thead><tbody>{["کوتاه‌مدت", "میان‌مدت"].map((horizon, i) => <tr key={horizon}><td>{marketTestAssets.find((a) => a.id === portfolio.selectedAsset)?.name}</td><td>تعیین نشده</td><td>دادهٔ کافی نیست</td><td>تعیین نشده</td><td>{horizon} · {i === 0 ? portfolio.shortDays : portfolio.mediumDays} روز</td></tr>)}</tbody></table></div><details className="action-detail"><summary>چه چیزی برای تصمیم کم است؟</summary><ul>{result?.decision.reasons.map((r) => <li key={r}>{r}</li>)}</ul><p>این مسیر فقط ارزش‌گذاری فنی است؛ عوامل و سناریوهای ساختگی به قیمت واقعی وصل نمی‌شوند. هیچ بودجه‌ای مصرف نمی‌شود.</p></details></section>}
    {(view === "overview" || view === "portfolio" || view === "market" || view === "data") && <section className="panel"><h3>سبد آزمون و منشأ قیمت</h3><div className="table-scroll"><table className="shared-table"><thead><tr><th>دارایی / واحد / عیار</th><th>موجودی فرضی</th><th>قیمت منبع</th><th>ارزش ثبت‌شده</th><th>وزن از کل با نقد</th><th>تازگی / منبع</th></tr></thead><tbody>{result?.rows.map((r) => <tr key={r.asset.id}><td><button className="text-button" onClick={() => { change({ selectedAsset: r.asset.id }); onNavigate("asset-center"); }}>{r.asset.name}</button> · {r.asset.unit === "gram" ? "گرم" : "عدد"} · {r.observation?.purityPermille == null ? "عیار منبع نامشخص" : <NumberValue value={r.observation.purityPermille} />}</td><td>{<NumberValue value={r.quantityMilli} denominator={1000} />}</td><td>{money(r.observation?.priceRial ?? null)}</td><td>{money(r.valueRial)}</td><td>{percent(result.weightsBps[r.asset.id])}</td><td>{labels[r.state]}{r.observation && <small className="market-provenance">نوسان · انتشار {date(r.observation.publishedAt)} · دریافت {date(r.observation.receivedAt)}</small>}</td></tr>)}</tbody></table></div><button className="text-button" onClick={() => onNavigate("portfolio")}>ویرایش موجودی و محدودیت‌های آزمون</button></section>}
    {view === "portfolio" && <section className="panel"><h3>ورودی مشترک آزمون — نه دارایی‌های شخصی</h3><div className="action-input-grid">{marketTestAssets.map(editor)}<CashInput value={portfolio.cashRial} onChange={(cashRial) => change({ cashRial })}/></div><details className="action-detail"><summary>افق‌ها و محدودیت‌های همین سبد</summary><div className="action-input-grid">{([ ["shortDays", "کوتاه‌مدت — روز", 1], ["mediumDays", "میان‌مدت — روز", 1], ["minimumCashBps", "حداقل نقد — درصد", 100], ["maximumAssetBps", "حداکثر وزن دارایی — درصد", 100] ] as const).map(([key, label, scale]) => <label key={key} className="action-field"><span>{label}</span><input data-testid={`market-${key}`} type="number" step={1 / scale} value={Number.isFinite(portfolio[key]) ? portfolio[key] / scale : ""} onChange={(e) => change({ [key]: Number((e.target.valueAsNumber * scale).toFixed(6)) })}/></label>)}</div></details><p>قیمت منبع فقط‌خواندنی است؛ اصلاح دستی قیمت، دادهٔ واقعی منبع نیست. آزمون قیمت و خطا در آزمایشگاه ساختگی جدا انجام می‌شود.</p></section>}
    {(view === "asset-center" || view === "analysis" || view === "risk") && <section className="panel"><h3>{selected?.asset.name}</h3><p data-testid="market-selected-summary">مقدار {selected ? <NumberValue value={selected.quantityMilli} denominator={1000} /> : "—"} · ارزش {money(selected?.valueRial ?? null)} · وزن {percent(result?.weightsBps[portfolio.selectedAsset] ?? null)} از ارزش ثبت‌شدهٔ کل، شامل نقد</p>{selected && <p>{labels[selected.state]} · {selected.observation ? `نوسان · انتشار ${date(selected.observation.publishedAt)} · دریافت ${date(selected.observation.receivedAt)}` : "قیمت و منبع موجود نیست"}</p>}{view === "asset-center" && selected && editor(selected.asset)}{view === "analysis" && <><h4>کوتاه‌مدت: {<NumberValue value={portfolio.shortDays} />} روز · میان‌مدت: {<NumberValue value={portfolio.mediumDays} />} روز</h4><p>ارزش‌گذاری قابل محاسبه است؛ روند، نوسان، حباب، اهداف و امتیاز تصمیم بدون ورودی واقعی لازم قابل محاسبه نیستند.</p></>}{view === "risk" && <><p>حد نقد فرضی: {percent(portfolio.minimumCashBps)}؛ مبلغ متناظر با ارزش ثبت‌شده: {money(result?.minimumCashRial ?? null)}.</p><p>وزن نقد: {percent(result?.cashWeightBps ?? null)}؛ حداکثر وزن مجاز ورودی: {percent(portfolio.maximumAssetBps)}.</p>{selected && (result?.weightsBps[selected.asset.id] ?? 0) > portfolio.maximumAssetBps && <p role="alert">وزن دارایی از حد واردشده بیشتر است؛ این هشدار عددی است، نه دستور فروش.</p>}<p>نوسان، افت، هزینهٔ خروج و ریسک بحران: دادهٔ کافی وجود ندارد.</p></>}</section>}
    <details className="action-detail"><summary>وضعیت منابع، تبدیل واحد و ردپای آزمون</summary><p>رهاورد: ورود مرورگر در دسترس بود؛ بند ۲.۱ مقررات، کپی یا انتقال اطلاعات را نیازمند مجوز ارائه‌دهنده می‌داند. داده‌ای منتقل نشده؛ اتصال خودکار ندارد.</p><p>نوسان: فقط آخرین قیمت؛ حداقل فاصلهٔ درخواست ۶ ساعت و ۴۰ دقیقه و سقف امن ۱۱۵ درخواست در ۳۱ روز. اعتبار فنی قیمت همچنان ۶۰ دقیقه از انتشار است. دریافت مجدد، قیمت منقضی را تازه نمی‌کند.</p><p>تبدیل دقیق در ریال انجام می‌شود؛ نمایش تومان = ریال ÷ ۱۰. ارزش مقدار کسری در صورت نیاز رو به پایین تا یک ریال گرد می‌شود. مقدار سکه فقط عدد صحیح است؛ عیار سکه از منبع گزارش نشده است.</p><p>بازبینی سبد {portfolio.revision} · ذخیره فقط آخرین تصویر در همین مرورگر؛ بدون انباشت تاریخچه و بدون ارسال به Git یا سرور.</p><code dir="ltr">{portfolio.version}</code>{portfolio.snapshot?.observations.map((q) => <p key={q.providerSymbol} dir="ltr">{q.providerSymbol} → {q.instrumentCode}: {q.rawValue} {q.rawCurrency} × {q.providerScale} → {q.priceRial} IRR · {q.unit}</p>)}</details>
    </fieldset>
  </section>}</div>
  </>;
}
