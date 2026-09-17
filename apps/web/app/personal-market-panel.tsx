"use client";

import "./personal-market.css";

import { useEffect, useRef, useState } from "react";
import { MARKET_TTL_MS, type MarketSnapshot } from "./market-test-contract";
import { PersonalMarketRequestError, requestPersonalMarketSnapshot } from "./personal-market-client";
import { PERSONAL_MARKET_STORAGE, restorePersonalMarketSnapshot, savePersonalMarketSnapshot } from "./personal-market-storage";
import { snapshotFailure } from "./browser-snapshot-storage";
import { NumberValue } from "./number-value";
import type { ExactRatio, PurchaseCoverage } from "./purchase-book";
import type { PersonalMarketRow, PersonalMarketValuation, PersonalQuoteState } from "./personal-market-valuation";

export type PersonalMarketPrices = {
  snapshot: MarketSnapshot | null; nowMs: number | null; busy: boolean; ready: boolean;
  notice: string; quota: { used: number; remaining: number } | null; canSave: boolean;
  receive: () => Promise<void>; save: () => Promise<void>; restore: () => void;
};

// This hook receives prices only. It cannot alter purchase rows, cash, historical
// FX or the independently persisted personal portfolio. No automatic fetch/save.
export function usePersonalMarketPrices(enabled: boolean): PersonalMarketPrices {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [quota, setQuota] = useState<PersonalMarketPrices["quota"]>(null);
  const [storedRaw, setStoredRaw] = useState<string | null | undefined>(undefined);
  const loaded = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const session = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const currentSession = ++session.current;
    const refreshClock = () => setNowMs(Date.now());
    const timer = window.setTimeout(() => {
      if (session.current !== currentSession) return;
      refreshClock(); setBusy(false);
      if (!loaded.current) {
        loaded.current = true;
        try {
          const saved = restorePersonalMarketSnapshot(localStorage, Date.now());
          setStoredRaw(saved.raw); setSnapshot(saved.snapshot);
          if (saved.snapshot) setNotice("آخرین قیمت ذخیره‌شده بازیابی شد؛ تازگی آن با زمان فعلی بررسی می‌شود.");
        } catch {
          setStoredRaw(undefined);
          setNotice("نسخهٔ ذخیره‌شده قابل بازیابی نیست؛ حذف نشده و ذخیره مسدود است. قیمت تازه را می‌توان جدا دریافت کرد.");
        }
      }
      setReady(true);
    }, 0);
    // Clock updates do not make provider requests. Resume from a sleeping tab
    // immediately invalidates expired quotes, independent of network cadence.
    const interval = window.setInterval(refreshClock, 30_000);
    const visibility = () => { if (document.visibilityState === "visible") refreshClock(); };
    const storageChanged = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== PERSONAL_MARKET_STORAGE && event.key !== null)) return;
      setStoredRaw(undefined);
      setNotice("نسخهٔ قیمت در تب دیگری تغییر کرده؛ قیمت روی صفحه حفظ شد. پیش از ذخیره، بازیابی را بزن؛ قیمت ذخیره‌نشدهٔ این صفحه جایگزین می‌شود.");
      refreshClock();
    };
    window.addEventListener("focus", refreshClock);
    window.addEventListener("storage", storageChanged);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      session.current = currentSession + 1;
      operation.current?.abort(); operation.current = null;
      window.clearTimeout(timer); window.clearInterval(interval);
      window.removeEventListener("focus", refreshClock);
      window.removeEventListener("storage", storageChanged);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || snapshot === null || nowMs === null) return;
    const time = Date.now();
    const boundaries = snapshot.observations.flatMap((quote) => [Date.parse(quote.publishedAt), Date.parse(quote.receivedAt), Date.parse(quote.publishedAt) + MARKET_TTL_MS + 1]).filter((boundary) => boundary > time);
    if (!boundaries.length) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), Math.min(...boundaries) - time);
    return () => window.clearTimeout(timer);
  }, [enabled, snapshot, nowMs]);

  async function receive() {
    if (!enabled || !ready || operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    const currentSession = session.current;
    const ownsRequest = () => operation.current === controller && session.current === currentSession && !controller.signal.aborted;
    setBusy(true); setNotice("");
    try {
      const receipt = await requestPersonalMarketSnapshot(controller.signal);
      if (!ownsRequest()) return;
      setSnapshot(receipt.snapshot); setQuota({ used: receipt.used, remaining: receipt.remaining }); setNowMs(Date.now());
      setNotice("قیمت واقعی دریافت و اعتبارسنجی شد؛ تازه‌بودن جدا بررسی می‌شود. هنوز ذخیره نشده؛ خریدها و نرخ‌های تاریخی تغییر نکردند.");
    } catch (error) {
      if (ownsRequest()) setNotice(error instanceof PersonalMarketRequestError ? error.message : "دریافت انجام نشد؛ قیمت قبلی حفظ شد و تکرار خودکار نداریم.");
    } finally {
      if (ownsRequest()) { operation.current = null; setBusy(false); }
    }
  }

  async function save() {
    if (!enabled || !ready || operation.current || snapshot === null || storedRaw === undefined) return;
    const controller = new AbortController(); operation.current = controller;
    const currentSession = session.current;
    const ownsSave = () => operation.current === controller && session.current === currentSession && !controller.signal.aborted;
    setBusy(true); setNotice("");
    try {
      const time = Date.now();
      const raw = await savePersonalMarketSnapshot(localStorage, snapshot, time, storedRaw);
      if (!ownsSave()) return;
      setStoredRaw(raw); setNowMs(time);
      setNotice("فقط آخرین قیمت در همین مرورگر ذخیره شد؛ دفتر خرید جدا در پایگاه محلی نگهداری می‌شود. تاریخچه یا همگام‌سازی دستگاه‌ها ایجاد نشد.");
    } catch (error) {
      if (ownsSave()) setNotice(snapshotFailure(error, "ذخیرهٔ قیمت انجام نشد؛ نسخهٔ قبلی و قیمت روی صفحه حفظ شدند."));
    } finally {
      if (ownsSave()) { operation.current = null; setBusy(false); }
    }
  }

  function restore() {
    if (!enabled || !ready || operation.current) return;
    try {
      const time = Date.now(); const saved = restorePersonalMarketSnapshot(localStorage, time);
      setStoredRaw(saved.raw); setNowMs(time);
      if (!saved.snapshot) { setNotice("قیمتی ذخیره نشده است؛ قیمت فعلی روی صفحه حفظ شد."); return; }
      setSnapshot(saved.snapshot); setQuota(null);
      setNotice("آخرین قیمت ذخیره‌شده بازیابی شد؛ قدیمی‌بودن آن پنهان نمی‌شود. خریدها و نرخ‌های تاریخی تغییر نکردند.");
    } catch {
      setStoredRaw(undefined);
      setNotice("بازیابی قیمت انجام نشد؛ نسخهٔ ذخیره و قیمت روی صفحه حفظ شدند. ذخیره تا بازیابی سالم مسدود است.");
    }
  }

  return { snapshot, nowMs, busy: enabled && busy, ready: enabled && ready, notice, quota,
    canSave: enabled && ready && !busy && snapshot !== null && storedRaw !== undefined, receive, save, restore };
}

export function PersonalMarketRatio({ value, unit = "", rialToToman = false }: { value: ExactRatio | null; unit?: string; rialToToman?: boolean }) {
  return value === null ? <span className="muted-value">نامشخص</span> : <NumberValue value={value.numerator} denominator={rialToToman ? (BigInt(value.denominator) * 10n).toString() : value.denominator} unit={unit} />;
}

const quoteLabels: Record<PersonalQuoteState, string> = {
  fresh: "تازه از نظر اعتبار فنی", stale: "منقضی؛ برای ارزش جاری استفاده نمی‌شود", future: "زمان قیمت در آینده؛ برای ارزش جاری استفاده نمی‌شود",
  missing: "قیمت سازگار موجود نیست", unsupported_asset: "هویت دارایی برای اتصال قیمت پشتیبانی نمی‌شود",
  unsupported_unit: "واحد منبع با واحد دارایی سازگار نیست", unsupported_quantity: "مقدار ثبت‌شده با قرارداد تعداد صحیح این دارایی سازگار نیست", invalid_snapshot: "نسخهٔ قیمت نامعتبر است",
};
function LocalTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })} (تهران)</time>;
}
function Basis({ basis, label, unit }: { basis: PurchaseCoverage; label: string; unit: string }) {
  return <div><dt>{label}</dt><dd><PersonalMarketRatio value={basis.average} unit={`تومان/${unit}`} rialToToman />
    {!basis.complete && <small>میانگین کل نامشخص؛ پوشش <PersonalMarketRatio value={basis.coveredQuantity} /> از <PersonalMarketRatio value={basis.totalQuantity} unit={unit} />. میانگین فقط بخش دارای داده: <PersonalMarketRatio value={basis.averageCovered} unit={`تومان/${unit}`} rialToToman /></small>}
  </dd></div>;
}
function PriceRow({ row }: { row: PersonalMarketRow }) {
  return <article className="personal-market-row" data-testid={`personal-market-row-${row.id}`}>
    <header><b>{row.name}</b><span><PersonalMarketRatio value={row.quantity} unit={row.displayUnit} /> · {row.purityPermille === null ? "عیار در این قرارداد مشخص نشده" : <>عیار <NumberValue value={row.purityPermille} /> در هزار</>}</span></header>
    <p>{quoteLabels[row.quoteState]}{row.assetId?.startsWith("SILVER_") && "؛ نوسان در قرارداد فعلی قیمت نقره ندارد. قیمت طلا یا دلار جایگزین نمی‌شود."}</p>
    <dl>
      <Basis basis={row.purchaseBasisRial} label="میانگین موزون خرید، بدون هزینه" unit={row.displayUnit} />
      <Basis basis={row.landedBasisRial} label="میانگین بهای تمام‌شده، با هزینه" unit={row.displayUnit} />
      <div><dt>{row.quoteState === "fresh" ? "قیمت جاری هر واحد" : "قیمت ثبت‌شدهٔ منبع؛ نه قیمت جاری"}</dt><dd><PersonalMarketRatio value={row.recordedPriceRial} unit={`تومان/${row.observation?.unit === "usd" ? "دلار" : row.observation?.unit === "gram" ? "گرم" : row.observation?.unit === "unit" ? "واحد منبع" : row.displayUnit}`} rialToToman /></dd></div>
      <div><dt>ارزش جاری موجودی</dt><dd><PersonalMarketRatio value={row.currentValueRial} unit="تومان" rialToToman /></dd></div>
      <div><dt>سود/زیان نسبت به بهای تمام‌شده</dt><dd><PersonalMarketRatio value={row.profitLossRial} unit="تومان" rialToToman /> · <PersonalMarketRatio value={row.profitLossPercent} unit="٪" /></dd></div>
      <div><dt>معادل دلاری ارزش جاری، با نرخ جاری</dt><dd><PersonalMarketRatio value={row.currentValueUsd} unit="دلار" /></dd></div>
    </dl>
    {row.profitLossRial === null && <p className="personal-market-warning">سود/زیان کل این دارایی نامشخص است: {!row.costComplete ? "بهای تمام‌شدهٔ همهٔ موجودی کامل نیست؛ هزینهٔ نامعلوم صفر فرض نشده." : row.currentValueRial === null ? "قیمت تازه و سازگار موجود نیست." : "مبنای کافی در دسترس نیست."}</p>}
    {row.profitLossRial !== null && row.profitLossPercent === null && <p>درصد سود/زیان نامشخص است؛ مخرج بهای تمام‌شده باید مثبت باشد.</p>}
    {row.observation && <p>منبع: <a href={row.observation.sourceUrl} target="_blank" rel="noreferrer">نوسان</a> · انتشار <LocalTime value={row.observation.publishedAt} /> · دریافت <LocalTime value={row.observation.receivedAt} /></p>}
    <details><summary>پوشش خریدها و منشأ محاسبه</summary>
      <p>بخش دارای قیمت تازه و هزینهٔ کامل: <PersonalMarketRatio value={row.covered.quantity} unit={row.displayUnit} /> در <NumberValue value={row.covered.lotCount} /> خرید؛ این بخش جای کل موجودی نیست.</p>
      <p>بهای همین بخش: <PersonalMarketRatio value={row.covered.costRial} unit="تومان" rialToToman /> · ارزش همین بخش: <PersonalMarketRatio value={row.covered.valueRial} unit="تومان" rialToToman /> · سود/زیان همین بخش: <PersonalMarketRatio value={row.covered.profitLossRial} unit="تومان" rialToToman /> · <PersonalMarketRatio value={row.covered.profitLossPercent} unit="٪" /></p>
      <p>مخرج درصد سود/زیان، بهای تمام‌شدهٔ همان موجودی پوشش‌داده‌شده است؛ قیمت فروش اجرایی، کارمزد فروش و مالیات از آن کم نشده است.</p>
      {row.legacyIds.length > 0 && <p>این دارایی موجودی قدیمی هم دارد. بهای قدیمیِ ثبت‌شده: <PersonalMarketRatio value={row.legacyRecordedCostRial} unit="تومان" rialToToman />؛ جزئیات هزینهٔ آن بازسازی نشده و خرید جدید شمرده نشده است.</p>}
      {row.observation && <p dir="ltr"><code>{row.observation.providerSymbol} · {row.observation.rawValue} {row.observation.rawCurrency} × {row.observation.providerScale} → {row.observation.priceRial} IRR · {row.observation.unit}</code></p>}
    </details>
  </article>;
}

export function PersonalMarketPanel({ evaluation, prices, expanded = false }: { evaluation: PersonalMarketValuation | null; prices: PersonalMarketPrices; expanded?: boolean }) {
  const totals = evaluation?.totals;
  const partial = !!totals && totals.valuedAssetCount < totals.totalAssetCount;
  return <section className="panel personal-market-panel" data-testid="personal-market-panel">
    <div className="panel-head"><div><h2>قیمت بازار و ارزش سبد شخصی</h2><p>موجودی از دفتر خرید و موجودی قدیمی همین سبد است؛ قیمت از نوسان. سبد آزمون و آزمایشگاه ساختگی منتقل نمی‌شوند.</p></div></div>
    <div className="market-actions">
      <button className="primary-button" data-testid="personal-market-receive" disabled={!prices.ready || prices.busy} onClick={() => void prices.receive()}>{prices.busy ? "در حال انجام…" : "دریافت یک‌بارهٔ قیمت از نوسان"}</button>
      <button className="ghost-button" data-testid="personal-market-save" disabled={!prices.canSave} onClick={() => void prices.save()}>ذخیرهٔ آخرین قیمت</button>
      <button className="ghost-button" data-testid="personal-market-restore" disabled={!prices.ready || prices.busy} onClick={prices.restore}>بازیابی قیمت ذخیره‌شده</button>
    </div>
    {!prices.ready && <p role="status">در حال بررسی نسخهٔ قیمت در این مرورگر…</p>}
    {prices.notice && <p role="status" className="action-notice">{prices.notice}</p>}
    {prices.quota && <p><NumberValue value={prices.quota.used} /> درخواست مصرف‌شده و <NumberValue value={prices.quota.remaining} /> از سقف امن باقی‌مانده؛ دفتر مشترک همین پروژه.</p>}
    <p>پلن رایگان، به‌روزرسانی اعلام‌شدهٔ دوساعته؛ نه خوراک لحظه‌ای. اعتبار فنی قیمت ۶۰ دقیقه از انتشار است. دریافت و ذخیرهٔ دوباره، قیمت قدیمی را تازه نمی‌کند؛ دریافت خودکار نداریم.</p>
    {evaluation?.issues.map((issue) => <p key={issue} role="alert" className="action-error">{issue}</p>)}
    {evaluation && <>
      <div className="personal-market-metrics">
        <article><span>ارزش جاری کل دارایی‌های ثبت‌شده</span><strong data-testid="personal-market-total"><PersonalMarketRatio value={totals?.currentValueRial ?? null} unit="تومان" rialToToman /></strong><small>بدون نقد یا دارایی ثبت‌نشده</small></article>
        <article><span>{partial ? "ارزش فقط بخش دارای قیمت تازه" : "ارزش دارایی‌های دارای قیمت تازه"}</span><strong data-testid="personal-market-known-total"><PersonalMarketRatio value={totals?.knownCurrentValueRial ?? null} unit="تومان" rialToToman /></strong><small><NumberValue value={totals?.valuedAssetCount ?? 0} /> از <NumberValue value={totals?.totalAssetCount ?? 0} /> دارایی؛ این شمارش درصد ارزش نیست.</small></article>
        <article><span>سود/زیان کل نسبت به بهای تمام‌شده</span><strong data-testid="personal-market-profit"><PersonalMarketRatio value={totals?.profitLossRial ?? null} unit="تومان" rialToToman /> · <PersonalMarketRatio value={totals?.profitLossPercent ?? null} unit="٪" /></strong><small>فقط با قیمت تازه و هزینهٔ کامل کل موجودی؛ درصد = سود/زیان ÷ بهای تمام‌شده × ۱۰۰</small></article>
      </div>
      {partial && <p role="status" className="personal-market-warning">پوشش قیمت کامل نیست؛ جمع بخش دارای قیمت، ارزش کل سبد نیست. قیمت ناموجود، منقضی، آینده یا ناسازگار در کل وارد نمی‌شود.</p>}
      {totals?.profitLossRial === null && <p>سود/زیان کل نامشخص است؛ نبود قیمت یا بهای تمام‌شدهٔ کامل به معنی سود/زیان صفر نیست.</p>}
      <details open={expanded}><summary>جزئیات مقدار، میانگین خرید، قیمت و سود/زیان هر دارایی</summary>{evaluation.rows.length ? evaluation.rows.map((row) => <PriceRow key={row.id} row={row} />) : <p>هنوز دارایی در سبد شخصی ثبت نشده است؛ قیمت دریافتی به‌تنهایی موجودی ایجاد نمی‌کند.</p>}</details>
    </>}
    <details><summary>مرز قیمت جاری، خرید تاریخی و تصمیم مالی</summary>
      <p>این قیمت صرفاً ارزش‌گذاری مرجع است، نه قیمت قابل اجرای فروش. دریافت قیمت، مقدار، تاریخ، ارز پرداخت، هزینه، رسید فایل و نرخ تاریخی هیچ خریدی را تغییر نمی‌دهد.</p>
      <p>نرخ تاریخ خریدِ واردشده توسط کاربر همچنان تأییدنشده است؛ نرخ دلار امروز نه جای آن می‌نشیند و نه سابقهٔ تاریخی ایجاد می‌کند. معادل دلاری ارزش جاری، هزینه یا سود/زیان دلاری خرید نیست.</p>
      <p>ذخیرهٔ قیمت فقط آخرین نسخه در همین مرورگر است و از ذخیرهٔ دفتر خرید در پایگاه محلی جداست. دادهٔ شخصی برای دریافت قیمت ارسال نمی‌شود.</p>
      <p>قیمت امروز به‌تنهایی برای خرید، فروش، تبدیل یا توصیهٔ «بدون تغییر» کافی نیست؛ مسیر تصمیم مالی همچنان بسته است.</p>
      {evaluation && <p>زمان بررسی تازگی: <LocalTime value={evaluation.evaluatedAt} /></p>}
    </details>
  </section>;
}
