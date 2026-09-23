"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PurchaseBookPanel, PurchaseRatio } from "./purchase-book-panel";
import { NumberValue } from "./number-value";
import { validatePurchaseBook, type PurchaseBook } from "./purchase-book";
import { evaluatePersonalMarketValuation } from "./personal-market-valuation";
import { EVALUATION_STORAGE_KEY, EvaluationStorageError, clearEvaluationState, emptyEvaluationDocument, encodeEvaluationDocument, readEvaluationState, saveEvaluationBook, type EvaluationDocument, type EvaluationStorage } from "./evaluation-client";
import "./unified-portfolio.css";
import "./evaluation.css";

const tabs = [["overview", "نمای سبد"], ["purchases", "ثبت و ویرایش"], ["analysis", "تحلیل و تصمیم"], ["storage", "نگهداری آزمایش"]] as const;

/** Public evaluation wrapper: no identity, private portfolio or market client.
 * Only user-entered nonprivate records enter the existing form and exact math. */
export function EvaluationWorkspace() {
  const [document, setDocument] = useState<EvaluationDocument>(emptyEvaluationDocument);
  const [phase, setPhase] = useState<"loading" | "ready" | "blocked">("loading");
  const [mode, setMode] = useState<"session" | "memory">("session");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<typeof tabs[number][0]>("overview");
  const [now, setNow] = useState<number | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [panelGeneration, setPanelGeneration] = useState(0);
  const storage = useRef<EvaluationStorage | null>(null), raw = useRef<string | null | undefined>(undefined);
  const current = useRef(document), writing = useRef(false), memory = useRef(false);
  const ready = useRef(false);
  function publish(next: EvaluationDocument) { current.current = next; setDocument(next); setNow(Date.now()); }
  function load() {
    if (writing.current || memory.current) return;
    try {
      storage.current ??= window.sessionStorage;
      const restored = readEvaluationState(storage.current); raw.current = restored.raw;
      if (!restored.document) throw new EvaluationStorageError("invalid");
      publish(restored.document); ready.current = true; setPhase("ready");
      setMessage("آزمایش آماده است.");
    } catch {
      ready.current = false; setPhase("blocked");
      setMessage("حافظهٔ این برگه در دسترس یا معتبر نیست. دادهٔ موجود دست‌نخورده ماند؛ ثبت تا بررسی یا انتخاب حالت فقط‌حافظه بسته است.");
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    const changed = (event: StorageEvent) => {
      if (!memory.current && event.storageArea === storage.current && (event.key === EVALUATION_STORAGE_KEY || event.key === null)) {
        ready.current = false; setPhase("blocked");
        setMessage("ذخیرهٔ آزمایشی این برگه تغییر کرده است؛ ورودی فرم حفظ شد. ابتدا نسخهٔ ذخیره‌شده را بررسی کن.");
      }
    };
    window.addEventListener("storage", changed);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", changed); };
    // This is a single tab-local initialization, never an automatic private read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function commit(book: PurchaseBook) {
    if (writing.current || !ready.current) throw new Error("ابتدا وضعیت نگهداری آزمایش را بررسی کن؛ ورودی حفظ شده است.");
    writing.current = true;
    try {
      if (memory.current) {
        const next = { ...current.current, revision: current.current.revision + 1, book: validatePurchaseBook(book) };
        // Same size/schema rules apply even without persistent browser storage.
        encodeEvaluationDocument(next); publish(next);
      } else {
        if (!storage.current || raw.current === undefined) throw new EvaluationStorageError("unavailable");
        const saved = saveEvaluationBook(storage.current, raw.current, book);
        raw.current = saved.raw; publish(saved.document!);
      }
      setMessage(memory.current ? "فقط در حافظهٔ باز همین صفحه ثبت شد؛ با بازخوانی از دست می‌رود." : "در حافظهٔ همین برگه ثبت شد؛ به سرور یا حساب مالک ارسال نشد.");
    } catch (error) {
      const failure = error instanceof EvaluationStorageError ? error : new EvaluationStorageError("invalid");
      if (failure.reason !== "invalid") { ready.current = false; setPhase("blocked"); }
      setMessage(failure.message); throw failure;
    } finally { writing.current = false; }
  }
  function memoryOnly() {
    if (writing.current) return;
    memory.current = true; ready.current = true; setMode("memory"); setPhase("ready"); setNow(Date.now());
    setMessage("حالت فقط‌حافظه فعال شد؛ از این پس ذخیرهٔ مرورگر دست‌کاری نمی‌شود. با بازخوانی، تغییرات این حالت از دست می‌رود.");
  }
  function reset() {
    if (!resetConfirmation || writing.current) return;
    writing.current = true;
    try {
      if (!memory.current) {
        if (!storage.current || raw.current === undefined) throw new EvaluationStorageError("unavailable");
        const cleared = clearEvaluationState(storage.current, raw.current); raw.current = cleared.raw;
      }
      publish(emptyEvaluationDocument()); ready.current = true; setPhase("ready");
      setPanelGeneration(value => value + 1); setResetConfirmation(false);
      setMessage(memory.current ? "فقط داده و پیش‌نویس آزمایشِ باز پاک شد؛ ذخیرهٔ قبلی تغییر نکرد." : "فقط داده و پیش‌نویس آزمایش این برگه پاک شد؛ حساب خصوصی و سایر داده‌ها تغییر نکردند.");
    } catch { ready.current = false; setPhase("blocked"); setMessage("پاک‌کردن تأیید نشد؛ دادهٔ نمایش‌داده‌شده حفظ شد. ابتدا وضعیت ذخیره را بررسی کن."); }
    finally { writing.current = false; }
  }
  function download() {
    const body = encodeEvaluationDocument(current.current);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json;charset=utf-8" }));
    const link = window.document.createElement("a"); link.href = url; link.download = "asha-public-evaluation.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const valuation = useMemo(() => now === null ? null : evaluatePersonalMarketValuation(document.book, [], null, now), [document.book, now]);
  const total = valuation?.totals;

  return <main className="unified-workspace evaluation-workspace" data-testid="public-evaluation-workspace">
    <header className="unified-header"><div><span>اشا · نسخهٔ ارزیابی</span><h1>ارزیابی آزمایشی سبد</h1></div><nav aria-label="بخش‌های ارزیابی">{tabs.map(([id, label]) => <button key={id} data-testid={`evaluation-tab-${id}`} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav></header>
    <aside className="evaluation-banner" role="note"><b>فقط دادهٔ غیرخصوصی و آزمایشی وارد کن.</b><p>{mode === "session" ? "ذخیره فقط در همین برگهٔ مرورگر؛ موقت و بدون همگام‌سازی." : "حالت فقط‌حافظه؛ با بازخوانی یا بستن صفحه از دست می‌رود."} قیمت روز متصل نیست؛ استفادهٔ مالی مجاز نیست.</p><details><summary>محدودیت نگهداری و جداسازی</summary><p>این صفحه عمومی است، اما سبد مشترک عمومی ندارد. اطلاعات واردشده به سرور یا حساب مالک ارسال نمی‌شود. فرم خرید، ورود Excel و محاسبات همان اجزای نسخهٔ اصلی‌اند.</p><p>{mode === "session" ? "بازخوانی همین برگه پشتیبانی می‌شود؛ بستن برگه یا پاک‌شدن حافظه ممکن است داده را از بین ببرد. همگام‌سازی دستگاه‌ها و پشتیبان سرور وجود ندارد." : "نسخهٔ قبلیِ ذخیره‌شده تغییر نمی‌کند. تغییرات حالت فقط‌حافظه با بازخوانی از دست می‌رود."}</p></details></aside>
    <section className="unified-status" aria-live="polite"><span role={phase === "blocked" ? "alert" : "status"}>{message || "در حال بررسی حافظهٔ همین برگه…"}</span>{phase === "blocked" && <><button className="ghost-button" data-testid="evaluation-reload" onClick={load}>بررسی نسخهٔ ذخیره‌شدهٔ آزمایش</button><button className="ghost-button" data-testid="evaluation-memory" onClick={memoryOnly}>ادامه فقط در حافظه، بدون تغییر ذخیرهٔ قبلی</button></>}</section>
    {tab === "overview" && <section aria-label="نمای سبد آزمایشی"><div className="unified-metrics">
      <article><span>جمع بهای خرید با هزینه</span><strong><PurchaseRatio value={total?.landedCostRial ?? null} unit="تومان" rialToToman /></strong></article>
      <article><span>جمع بهای دلاری خرید</span><strong><PurchaseRatio value={total?.landedCostUsd ?? null} unit="دلار" /></strong>{document.book.lots.length > 0 && total?.landedCostUsd === null && <small>بهای دلاری همهٔ خریدها معلوم نیست؛ جمع ناقص جای کل سبد نمایش داده نمی‌شود.</small>}</article>
      <article><span>ارزش امروز</span><strong><PurchaseRatio value={total?.currentValueRial ?? null} unit="تومان" rialToToman /></strong><small>قیمت روز در این نسخه متصل نیست.</small></article>
      <article><span>سود / زیان امروز</span><strong><PurchaseRatio value={total?.profitLossRial ?? null} unit="تومان" rialToToman /></strong><small>بهای خرید جای قیمت روز نیست.</small></article>
    </div>{document.book.lots.length === 0 && <div className="panel"><p>آزمایش با سبد خالی شروع می‌شود؛ دادهٔ شخصی یا نمونهٔ ساختگی خودکار اضافه نمی‌شود.</p><button className="primary-button" onClick={() => setTab("purchases")}>ثبت خرید آزمایشی یا ورود Excel</button></div>}
      <div className="unified-assets">{valuation?.rows.map(row => <article className="panel" key={row.id} data-testid={`evaluation-asset-${row.id}`}><header><h2>{row.name}</h2><span>بدون قیمت روز</span></header><dl>
        <div><dt>جمع مقدار</dt><dd><PurchaseRatio value={row.quantity} unit={row.displayUnit} /></dd></div><div><dt>میانگین موزون خرید، بدون هزینه</dt><dd><PurchaseRatio value={row.purchaseBasisRial.average} unit={`تومان / ${row.displayUnit}`} rialToToman /></dd></div><div><dt>میانگین بهای تمام‌شده</dt><dd><PurchaseRatio value={row.landedBasisRial.average} unit={`تومان / ${row.displayUnit}`} rialToToman /></dd></div><div><dt>میانگین دلاری با نرخ تاریخ خرید</dt><dd><PurchaseRatio value={row.landedBasisUsd.average} unit={`دلار / ${row.displayUnit}`} /></dd></div>
      </dl>{!row.costComplete && <p className="unified-warning">بهای خرید یا هزینه ناقص است؛ میانگین کامل و سود از دادهٔ ناقص ساخته نمی‌شود.</p>}<details><summary>پوشش و محدودیت داده</summary><p>مقدار با بهای کامل ریالی: <PurchaseRatio value={row.landedBasisRial.coveredQuantity} unit={row.displayUnit} /> از <PurchaseRatio value={row.quantity} unit={row.displayUnit} /></p><p>مقدار با بهای دلاری: <PurchaseRatio value={row.landedBasisUsd.coveredQuantity} unit={row.displayUnit} /> از <PurchaseRatio value={row.quantity} unit={row.displayUnit} /></p><p>نرخ دستیِ تاریخ خرید تأییدنشده است؛ نرخ امروز یا تاریخ دیگری جایگزین نمی‌شود. مقدار، واحد و عیار طبق قرارداد موجود محاسبه می‌شوند.</p></details></article>)}</div>
      <p>تعداد خریدهای ثبت‌شدهٔ آزمایش: <NumberValue value={document.book.lots.length} />. جزئیات هر خرید و منشأ آن در «ثبت و ویرایش» است.</p>
    </section>}
    <section hidden={tab !== "purchases"} aria-label="ثبت و ویرایش آزمایشی"><PurchaseBookPanel key={panelGeneration} book={document.book} legacyHoldings={[]} onCommit={commit} busy={phase !== "ready" || resetConfirmation} /></section>
    {tab === "analysis" && <section className="panel"><h2>تحلیل و تصمیم آزمایشی</h2><p>ثبت خرید و محاسبهٔ بهای آن قابل‌آزمون است؛ قیمت جاری و ورودی‌های لازم برای تصمیم متصل نیستند.</p><div className="unified-horizons">{["کوتاه‌مدت", "میان‌مدت"].map(horizon => <article key={horizon}><h3>{horizon}</h3><b>تصمیم‌ناپذیر</b><p>کمبود: قیمت معتبر، تاریخچهٔ مجاز، هزینه و نقدشوندگی قابل‌اعتماد و عوامل روش ثبت‌شده.</p></article>)}</div><p>هیچ توصیه، مقدار اقدام یا نتیجهٔ مالی ساختگی تولید نمی‌شود. روش مالی تغییر نکرده است.</p></section>}
    <section hidden={tab !== "storage"} className="panel"><h2>نگهداری آزمایش</h2><p>این نگهداری، پشتیبان حساب خصوصی یا ذخیره در سرور نیست. فایل Excel فقط در همین مرورگر بررسی می‌شود؛ فایل شخصی واقعی وارد نکن.</p><button className="ghost-button" data-testid="evaluation-export" disabled={phase === "loading"} onClick={download}>دریافت فایل دادهٔ آزمایشیِ ثبت‌شده</button><p>خروجی فقط خریدهای ثبت‌شدهٔ این نما را دارد، نه ورودی باز فرم و نه اطلاعات حساب مالک.</p><button className="ghost-button" data-testid="evaluation-reset" disabled={phase === "loading"} onClick={() => setResetConfirmation(true)}>پاک‌کردن همین آزمایش</button>
      {resetConfirmation && <div className="evaluation-confirmation" role="alert"><p>تمام خریدها، رسیدهای ورود فایل و پیش‌نویس باز همین آزمایش پاک می‌شوند. دادهٔ حساب خصوصی و سایر حافظه‌ها دست‌نخورده می‌مانند. ادامه می‌دهی؟</p><button className="ghost-button" data-testid="evaluation-reset-cancel" onClick={() => setResetConfirmation(false)}>انصراف؛ داده حفظ شود</button><button className="primary-button" data-testid="evaluation-reset-confirm" onClick={reset}>تأیید پاک‌کردن همین آزمایش</button></div>}
    </section>
  </main>;
}
