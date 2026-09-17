"use client";

import { useEffect, useMemo, useState } from "react";
import { createFileTestPortfolio, evaluateFileTest, FILE_PROFILE_VERSION, MAX_FILE_BYTES, readFileSnapshot, restoreFileTest, saveFileTest, SYNTHETIC_FILE, type FileTestPortfolio } from "./file-market-contract";
import { displayRialAsToman as money, marketTestAssets, MARKET_TTL_MS, tomanInputToRial, rialToTomanInput } from "./market-test-contract";
import type { View } from "./workspace-navigation";
import { snapshotFailure } from "./browser-snapshot-storage";
import { NumberValue } from "./number-value";
import { isAssetWeightAboveLimit } from "./market-test-risk";

const states = { missing: "قیمت موجود نیست", unknown_time: "زمان قیمت نامشخص", future: "زمان قیمت در آینده", stale: "منقضی — فقط ارزش ثبت‌شده", fresh: "در بازه تازگی آزمون" };
const percent = (bps: number | null | undefined) => bps == null ? "نامشخص" : <NumberValue value={bps} denominator={100} unit="٪" />;

export function FileMarketWorkspace({ active, view, onNavigate }: { active: boolean; view: View; onNavigate: (view: View) => void }) {
  const [portfolio, setPortfolio] = useState<FileTestPortfolio>(createFileTestPortfolio);
  const [text, setText] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [storedRaw, setStoredRaw] = useState<string | null | undefined>(undefined);
  // Keep the draft on workspace switches; refresh age without reloading storage.
  useEffect(() => {
    if (!active) return;
    const refreshClock = () => setNow(Date.now());
    const timer = window.setTimeout(refreshClock, 0);
    const clock = window.setInterval(refreshClock, 60_000);
    const visibility = () => { if (document.visibilityState === "visible") refreshClock(); };
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timer); window.clearInterval(clock);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [active, view]);
  useEffect(() => {
    if (!active || portfolio.file === null || now === null) return;
    const boundaries = [Date.parse(portfolio.file.receivedAt), ...portfolio.file.observations.flatMap(quote => quote.publishedAt === null ? [] : [Date.parse(quote.publishedAt), Date.parse(quote.publishedAt) + MARKET_TTL_MS + 1])].filter(boundary => Number.isFinite(boundary) && boundary > now);
    if (!boundaries.length) return;
    // Schedule against the evaluated clock, including a boundary crossed between
    // render and this effect. Only time changes; file/draft/storage stay intact.
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(0, Math.min(...boundaries) - Date.now())));
    return () => window.clearTimeout(timer);
  }, [active, portfolio.file, now]);
  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(() => {
      const time = Date.now(); setNow(time);
      // Access to localStorage itself may throw before an async read can start.
      Promise.resolve().then(() => restoreFileTest(localStorage, time)).then(saved => {
        if (!mounted) return;
        setStoredRaw(saved.raw);
        if (saved.portfolio) { setPortfolio(saved.portfolio); setNotice("آزمون فایل بازیابی شد؛ تازگی با زمان فعلی بررسی می‌شود."); }
      }).catch(() => { if (mounted) setNotice("نسخه ذخیره خراب یا غیرقابل‌خواندن است؛ اصل آن حفظ شده و ذخیره خاموش است."); }).finally(() => { if (mounted) setBusy(false); });
    }, 0);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, []);
  const computed = useMemo(() => {
    try { return { result: now === null ? null : evaluateFileTest(portfolio, now), error: "" }; }
    catch (e) { return { result: null, error: e instanceof Error ? e.message : "ورودی نامعتبر است." }; }
  }, [portfolio, now]);
  const change = (values: Partial<FileTestPortfolio["inputs"]>) => {
    setPortfolio(p => ({ ...p, inputs: { ...p.inputs, ...values, revision: p.inputs.revision + 1 } }));
    setNotice("ورودی همه نماهای آزمون فایل به‌روز شد؛ هنوز ذخیره نشده است.");
  };
  const importBytes = async (bytes: Uint8Array) => {
    setBusy(true);
    try {
      const time = Date.now(); const file = await readFileSnapshot(bytes, new Date(time).toISOString());
      const candidate = { ...portfolio, file }; evaluateFileTest(candidate, time);
      setPortfolio(candidate); setNow(time); setNotice("فایل ساختگی کامل اعتبارسنجی شد؛ سبد قبلی و داده واقعی تغییر نکردند. هنوز ذخیره نشده است.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "خواندن فایل ناموفق بود؛ سبد قبلی حفظ شد."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (storedRaw === undefined) return;
    setBusy(true);
    try { setStoredRaw(await saveFileTest(localStorage, portfolio, Date.now(), storedRaw)); setNotice("همین نسخه ساختگی ذخیره شد؛ فقط در این مرورگر و جدا از بازار واقعی و سبد شخصی."); }
    catch (e) { setNotice(snapshotFailure(e, "ذخیره ناموفق؛ ورودی و دسترسی فضای مرورگر را بررسی کن. نسخه قبلی حفظ شد.")); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true);
    try {
      const time = Date.now(); const saved = await restoreFileTest(localStorage, time);
      setStoredRaw(saved.raw);
      if (saved.portfolio) { setPortfolio(saved.portfolio); setNow(time); setNotice("همان فایل، ورودی و محاسبه بازیابی شد؛ قیمت قدیمی تازه فرض نمی‌شود."); }
      else setNotice("نسخه‌ای ذخیره نشده؛ ورودی فعلی حفظ شد.");
    } catch { setNotice("بازیابی ناموفق؛ داده فعلی و نسخه ذخیره حفظ شدند."); }
    finally { setBusy(false); }
  };
  const quantity = (id: string) => Number.isFinite(portfolio.inputs.quantitiesMilli[id]) ? portfolio.inputs.quantitiesMilli[id] / 1000 : "";
  const editor = (asset: (typeof marketTestAssets)[number]) => <label className="action-field" key={asset.id}><span>{asset.name} — {asset.unit === "gram" ? "گرم" : "عدد"} فرضی</span><input data-testid={`file-quantity-${asset.id}`} type="number" min="0" step={asset.unit === "gram" ? "0.001" : "1"} disabled={busy} value={quantity(asset.id)} onChange={e => change({ quantitiesMilli: { ...portfolio.inputs.quantitiesMilli, [asset.id]: Number((e.target.valueAsNumber * 1000).toFixed(6)) } })}/></label>;
  if (now === null) return <p role="status">در حال بررسی فضای جداگانه فایل…</p>;
  const result = computed.result;
  const selected = result?.rows.find(r => r.asset.id === portfolio.inputs.selectedAsset);
  let cashInput = ""; try { cashInput = rialToTomanInput(portfolio.inputs.cashRial); } catch { /* Keep invalid entry explicit. */ }
  return <section className="view-stack market-test-workspace" data-testid="file-market-workspace" data-revision={portfolio.inputs.revision}>
    <div className="market-test-boundary"><b>آزمون اتصال فایل — قیمت، موجودی و نقد کاملاً ساختگی</b><span>این قالب نمونهٔ پروژه است؛ قالب واقعی رهاورد هنوز تأیید نشده است. جابه‌جایی نما، ورودی را حفظ می‌کند؛ برای حفظ پس از بستن یا بازخوانی صفحه، ذخیره کن.</span></div>
    <p className="action-error" role="status">ورود واقعی رهاورد تا تأیید دسترسی، مجوز استفاده/نگهداری و نمونه TXT رسمی بسته است. هیچ داده واقعی وارد این آزمون نشده است.</p>
    <div className="shared-toolbar"><label className="action-field"><span>دارایی مشترک آزمون فایل</span><select data-testid="file-selection" disabled={busy} value={portfolio.inputs.selectedAsset} onChange={e => change({ selectedAsset: e.target.value })}>{marketTestAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className="market-actions"><button className="ghost-button" disabled={busy || storedRaw === undefined || !!computed.error} onClick={save}>ذخیره آزمون فایل</button><button className="ghost-button" disabled={busy} onClick={restore}>بازیابی آزمون فایل</button></div></div>
    {notice && <p role="status" className="action-notice" data-testid="file-notice">{notice}</p>}
    {computed.error && <p role="alert" className="action-error">{computed.error}</p>}
    <details className="panel action-detail" open={view === "data" || !portfolio.file}>
      <summary>ورود TXT و بررسی قالب</summary>
      <p>نمونه زیر عمداً ساختگی است؛ فایل واقعی را با این برچسب وارد نکنید. فقط یک تا سه قیمت، نه تاریخچه؛ UTF-8 و حداکثر ۴ کیلوبایت.</p>
      <button className="ghost-button" disabled={busy} onClick={() => setText(SYNTHETIC_FILE)}>قرار دادن نمونه ساختگی</button>
      <label className="action-field"><span>متن فایل ساختگی TXT</span><textarea data-testid="file-text" dir="ltr" rows={7} disabled={busy} maxLength={MAX_FILE_BYTES} value={text} onChange={e => setText(e.target.value)}/></label>
      <button className="primary-button" disabled={busy || !text} onClick={() => importBytes(new TextEncoder().encode(text))}>اعتبارسنجی و ورود نمونه</button>
      <label className="action-field"><span>یا انتخاب فایل ساختگی TXT</span><input data-testid="file-upload" type="file" accept=".txt,text/plain" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".txt") || file.size > MAX_FILE_BYTES) { setNotice("فقط TXT تا ۴ کیلوبایت پذیرفته می‌شود؛ فایل خوانده نشد."); return; }
        setBusy(true);
        try { await importBytes(new Uint8Array(await file.arrayBuffer())); }
        catch { setNotice("خواندن فایل ناموفق بود؛ سبد قبلی حفظ شد."); }
        finally { setBusy(false); }
      }}/></label>
      <button className="ghost-button" disabled>ورود فایل واقعی — منتظر بررسی دسترسی، مجوز و قالب</button>
    </details>
    <div className="shared-summary"><article><span>ارزش ثبت‌شده فرضی، شامل نقد</span><strong data-testid="file-total">{money(result?.observedTotalRial ?? null)}</strong></article><article><span>ارزش در بازه تازگی آزمون</span><strong data-testid="file-current-total">{money(result?.currentTotalRial ?? null)}</strong></article><article><span>نقد فرضی قبل</span><strong>{computed.error ? "نامعتبر" : money(portfolio.inputs.cashRial)}</strong></article></div>
    {result?.rows.some(r => r.quantityMilli > 0 && r.state !== "fresh") && <p className="action-error" role="alert">قیمت برخی موجودی‌ها ناقص، بدون زمان، منقضی یا مربوط به آینده است؛ ارزش تازه کامل نیست.</p>}
    {(view === "overview" || view === "portfolio" || view === "data" || view === "market") && <section className="panel"><h3>قیمت‌های فایل و موجودی فرضی</h3><div className="table-scroll"><table className="shared-table"><thead><tr><th>دارایی / واحد / عیار</th><th>مقدار فرضی</th><th>قیمت</th><th>ارزش</th><th>وزن از کل با نقد</th><th>تازگی / منشأ</th></tr></thead><tbody>{result?.rows.map(r => <tr key={r.asset.id}><td><button className="text-button" onClick={() => { change({ selectedAsset: r.asset.id }); onNavigate("asset-center"); }}>{r.asset.name}</button> · {r.asset.unit === "gram" ? "گرم" : "عدد"} · {r.observation?.purityPermille == null ? "عیار نامشخص" : <NumberValue value={r.observation.purityPermille} />}</td><td><NumberValue value={portfolio.inputs.quantitiesMilli[r.asset.id]} denominator={1000} /></td><td>{money(r.observation?.priceRial ?? null)}</td><td>{money(r.valueRial)}</td><td>{percent(result.weightsBps[r.asset.id])}</td><td>{states[r.state]}<small className="market-provenance">فایل ساختگی · ردیف {r.observation?.line ?? "—"} · زمان {r.observation?.publishedAt ?? "نامشخص"}</small></td></tr>)}</tbody></table></div></section>}
    {view === "portfolio" && <section className="panel"><h3>موجودی و حدود مشترک آزمون فایل</h3><div className="action-input-grid">{marketTestAssets.map(editor)}<label className="action-field"><span>نقد فرضی — تومان</span><input data-testid="file-cash" type="number" step="0.1" min="0" disabled={busy} value={cashInput} onChange={e => { try { change({ cashRial: tomanInputToRial(e.target.value) }); } catch { change({ cashRial: "invalid" }); } }}/></label>{([ ["shortDays", "کوتاه‌مدت — روز", 1], ["mediumDays", "میان‌مدت — روز", 1], ["minimumCashBps", "حداقل نقد — درصد", 100], ["maximumAssetBps", "حداکثر وزن دارایی — درصد", 100] ] as const).map(([key, label, scale]) => <label className="action-field" key={key}><span>{label}</span><input data-testid={`file-${key}`} type="number" step={1 / scale} disabled={busy} value={Number.isFinite(portfolio.inputs[key]) ? portfolio.inputs[key] / scale : ""} onChange={e => change({ [key]: Number((e.target.valueAsNumber * scale).toFixed(6)) })}/></label>)}</div></section>}
    {(view === "asset-center" || view === "analysis" || view === "risk") && <section className="panel"><h3>{selected?.asset.name}</h3><p data-testid="file-selected-summary">مقدار {selected ? <NumberValue value={portfolio.inputs.quantitiesMilli[selected.asset.id]} denominator={1000} /> : "—"} · ارزش {money(selected?.valueRial ?? null)} · وزن {percent(result?.weightsBps[portfolio.inputs.selectedAsset])} از کل با نقد</p>{selected && <p>{states[selected.state]}</p>}{view === "asset-center" && selected && editor(selected.asset)}<p>کوتاه‌مدت {<NumberValue value={portfolio.inputs.shortDays} />} روز · میان‌مدت {<NumberValue value={portfolio.inputs.mediumDays} />} روز</p>{view === "risk" && <><p>حد نقد {percent(portfolio.inputs.minimumCashBps)}؛ معادل {money(result?.minimumCashRial ?? null)}. وزن نقد {percent(result?.cashWeightBps)}.</p><p>سقف وزن {percent(portfolio.inputs.maximumAssetBps)}؛ {isAssetWeightAboveLimit(selected?.valueRial, result?.observedTotalRial, portfolio.inputs.maximumAssetBps) === true ? "وزن بیشتر از حد فرضی است؛ دستور فروش نیست." : "این حدود صرفاً ورودی آزمون هستند."}</p></>}<p>روند، نوسان، حباب و ریسک بحران از فایل تک‌قیمتی قابل استنتاج نیستند.</p></section>}
    {(view === "overview" || view === "decisions" || view === "agents") && <section className="panel"><h3>نتیجه: تصمیم‌ناپذیر</h3><p>برای هر دو افق، مقدار، مبلغ، هزینه، شرط اقدام، منبع تأمین و نقد بعد تعیین نشده‌اند؛ هیچ بودجه‌ای مصرف نمی‌شود و «بدون تغییر» صادر نشده است.</p><p>کوتاه‌مدت {<NumberValue value={portfolio.inputs.shortDays} />} روز · میان‌مدت {<NumberValue value={portfolio.inputs.mediumDays} />} روز</p><details className="action-detail"><summary>دلیل و محدودیت</summary>{result?.decision.reasons.map(reason => <p key={reason}>{reason}</p>)}</details></section>}
    <details className="action-detail"><summary>ردپای فایل و نگهداری</summary><p>فایل به سرور یا API ارسال نمی‌شود؛ فقط همین تصویر ساختگی در فضای جداگانه مرورگر ذخیره می‌شود. اثر انگشت برای تطبیق بایت‌هاست، نه اثبات اصالت فروشنده.</p><code dir="ltr">{FILE_PROFILE_VERSION}</code><p dir="ltr">SHA-256: {portfolio.file?.fileSha256 ?? "—"}</p><p>دریافت محلی: {portfolio.file?.receivedAt ?? "—"} · اندازه: {portfolio.file?.fileBytes ?? 0} بایت</p><p>ریال/تومان از ستون صریح فایل؛ ضریب یک. مبلغ کسری موجودی مطابق روش قبلی رو به پایین تا یک ریال محاسبه می‌شود. بازبینی {<NumberValue value={portfolio.inputs.revision} />}.</p></details>
  </section>;
}
