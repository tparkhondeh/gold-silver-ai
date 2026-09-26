"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioHolding, PortfolioPreferences, PortfolioSnapshot } from "../data/postgres-portfolio-repository";
import { emptyPurchaseBook, type PurchaseBook } from "./purchase-book";
import { PurchaseBookPanel, PurchaseRatio } from "./purchase-book-panel";
import { NumberValue } from "./number-value";
import { fetchPortfolioSnapshot } from "./portfolio-persistence";
import { PortfolioSaveError, saveUnifiedPortfolio } from "./unified-portfolio-client";
import { evaluatePersonalMarketValuation, type PersonalQuoteState } from "./personal-market-valuation";
import { orderPersonalAssetRows, PERSONAL_ASSET_SORT_FIELDS, type PersonalAssetSortDirection, type PersonalAssetSortField } from "./personal-asset-order";
import { requestManagedMarket, type ManagedMarketResponse } from "./managed-market-client";
import { MARKET_TTL_MS } from "./market-test-contract";
import "./unified-portfolio.css";

const quoteLabels: Record<PersonalQuoteState, string> = { fresh: "قیمت معتبر", stale: "قیمت قدیمی", future: "زمان قیمت نامعتبر", missing: "قیمت موجود نیست", unsupported_asset: "دارایی بدون پوشش قیمت", unsupported_unit: "واحد یا عیار ناسازگار", unsupported_quantity: "مقدار ناسازگار", invalid_snapshot: "قیمت نامعتبر" };
const preferenceLabels = { liquidityReservePercent: "حداقل نقد (%)", maxSingleAssetPercent: "سقف هر دارایی (%)", maxAcceptableDrawdownPercent: "حد افت قابل‌پذیرش (%)", shortTermMonths: "افق کوتاه‌مدت (ماه)", longTermYears: "افق بلندتر (سال)" } as const;
const priceReasons = { updated: "آخرین دریافت معتبر ذخیره شد", refresh_cooldown: "در انتظار فاصلهٔ مجاز دریافت بعدی", quota_exhausted: "سهمیهٔ مجاز تمام شده است", provider_or_validation_failed: "پاسخ منبع در دسترس یا معتبر نبود", cache_unavailable: "محل نگهداری آخرین قیمت در دسترس نیست", quota_unavailable: "امکان بررسی سهمیه وجود ندارد", missing_key: "دسترسی منبع تنظیم نشده است", key_rotation_required: "کلید منبع نیازمند بررسی امن است", invalid_unit: "واحد منبع تأیید نشده است", free_plan_required: "این اتصال فقط برای طرح رایگان تنظیم شده است" };
function timeLabel(value: string) { return new Date(value).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }); }
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useManagedPrices() {
  const [data, setData] = useState<ManagedMarketResponse | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false, inFlight = false, next = 0;
    const controller = new AbortController();
    const tick = async () => {
      if (stopped) return;
      const at = Date.now(); setNow(at);
      if (inFlight || at < next || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const result = await requestManagedMarket(controller.signal);
        if (!stopped) {
          const received = Date.now(); setNow(received);
          setData((previous) => {
            const snapshot = result.snapshot ?? previous?.snapshot ?? null;
            return { ...result, state: result.state === "unavailable" && snapshot !== null ? "cached" : result.state, snapshot };
          });
          setError(result.state === "unavailable"); next = Math.max(received + 30_000, Date.parse(result.nextCheckAt));
        }
      } catch { if (!stopped) { setError(true); next = Date.now() + 60_000; } }
      finally { inFlight = false; }
    };
    const initial = window.setTimeout(tick, 0), interval = window.setInterval(tick, 30_000);
    const visible = () => { void tick(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; controller.abort(); window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, []);
  useEffect(() => {
    if (!data?.snapshot || now === null) return;
    // Valuation-clock boundaries never request a quote. Publication/receipt
    // activation and the inclusive TTL are independent of provider cadence.
    const boundaries = data.snapshot.observations.flatMap((quote) => [Date.parse(quote.publishedAt), Date.parse(quote.receivedAt), Date.parse(quote.publishedAt) + MARKET_TTL_MS + 1])
      .filter((boundary) => Number.isFinite(boundary) && boundary > now);
    if (!boundaries.length) return;
    // Compare against the last evaluated time so a delayed render cannot miss
    // a boundary already crossed by the wall clock. Clamp browser timer range.
    const delay = Math.min(2_147_483_647, Math.max(0, Math.min(...boundaries) - Date.now()));
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [data?.snapshot, now]);
  return { data, now, error };
}

export function UnifiedPortfolioWorkspace({ storageLocation = "local" }: { storageLocation?: "local" | "server" } = {}) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [tab, setTab] = useState<"overview" | "purchases" | "analysis" | "settings">("overview");
  const [browserDraft, setBrowserDraft] = useState<string | null>(null);
  const savedRef = useRef<PortfolioSnapshot | null>(null), writing = useRef(false);
  const loadRequest = useRef<AbortController | null>(null);
  const prices = useManagedPrices();

  const load = useCallback(async (signal?: AbortSignal) => {
    if (writing.current || loadRequest.current) return;
    const controller = new AbortController();
    loadRequest.current = controller;
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    setStatus("loading");
    try {
      const saved = await fetchPortfolioSnapshot(requestSignal);
      if (requestSignal.aborted || loadRequest.current !== controller) return;
      savedRef.current = saved; setSnapshot(saved); setNeedsReload(false); setStatus("ready"); setMessage("اطلاعات از پایگاه داده خوانده شد.");
    } catch { if (!requestSignal.aborted && loadRequest.current === controller) { setStatus("error"); setNeedsReload(true); setMessage("اتصال به محل ذخیره برقرار نیست؛ هیچ اطلاعاتی حذف نشده است. ثبت تا برقراری اتصال غیرفعال است."); } }
    finally { if (loadRequest.current === controller) loadRequest.current = null; }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal);
      // Preserve browser-only records left by earlier versions. Never silently
      // migrate a demonstration/session portfolio into the authoritative account.
      try {
        const keys = storageLocation === "local" ? ["gold-silver-holdings", "asha-purchase-book-v1", "asha-personal-holdings-backup-v1"] : [];
        const present = Object.fromEntries(keys.flatMap((key) => { const value = sessionStorage.getItem(key); return value ? [[key, value]] : []; }));
        if (Object.keys(present).length) setBrowserDraft(JSON.stringify({ format: "asha.browser_recovery.v1", records: present }, null, 2));
      } catch { setMessage("حافظهٔ این مرورگر قابل‌خواندن نیست؛ بازیابی سبد از پایگاه داده مستقل انجام می‌شود."); }
    }, 0);
    return () => { controller.abort(); loadRequest.current?.abort(); loadRequest.current = null; window.clearTimeout(timer); };
  }, [load, storageLocation]);

  const commit = async (change: Partial<Pick<PortfolioSnapshot, "holdings" | "preferences" | "purchaseBook">>) => {
    if (!savedRef.current || writing.current || loadRequest.current || needsReload || status === "loading") throw new Error("ابتدا اتصال و وضعیت ذخیره را بررسی کن؛ ورودی فرم حفظ شده است.");
    writing.current = true; setStatus("saving"); setMessage("در حال ذخیره…");
    try {
      const saved = await saveUnifiedPortfolio({ ...savedRef.current, ...change });
      savedRef.current = saved; setSnapshot(saved); setStatus("ready"); setMessage("ذخیره در پایگاه داده تأیید شد.");
    } catch (error) {
      setStatus("error"); setNeedsReload(!(error instanceof PortfolioSaveError) || error.requiresReload);
      setMessage(error instanceof Error ? error.message : "ذخیره تأیید نشد؛ ورودی حفظ شد."); throw error;
    } finally { writing.current = false; }
  };
  const commitBook = async (purchaseBook: PurchaseBook) => { await commit({ purchaseBook }); };
  const commitHoldings = async (holdings: PortfolioHolding[]) => { await commit({ holdings }); return true; };
  const valuation = useMemo(() => {
    if (!snapshot || prices.now === null) return null;
    return evaluatePersonalMarketValuation(snapshot.purchaseBook ?? emptyPurchaseBook(), snapshot.holdings, prices.data?.snapshot ?? null, prices.now);
  }, [snapshot, prices.now, prices.data?.snapshot]);
  const total = valuation?.totals;
  const [sortField, setSortField] = useState<PersonalAssetSortField>("original");
  const [sortDirection, setSortDirection] = useState<PersonalAssetSortDirection>("asc");
  const displayedAssets = useMemo(() => orderPersonalAssetRows(valuation?.rows ?? [], sortField, sortDirection), [valuation?.rows, sortField, sortDirection]);
  const busy = status === "loading" || status === "saving" || !snapshot || needsReload;
  const [preferencesDraft, setPreferencesDraft] = useState<PortfolioPreferences | null>(null);
  const [preferencesDraftBase, setPreferencesDraftBase] = useState("");
  const preferencesBase = snapshot ? JSON.stringify(Object.entries(snapshot.preferences).sort(([left], [right]) => left.localeCompare(right))) : "";
  const stalePreferences = preferencesDraft !== null && preferencesDraftBase !== preferencesBase;
  const preferences = preferencesDraft ?? snapshot?.preferences;

  return <main className="unified-workspace" data-testid="unified-workspace">
    <header className="unified-header"><div><span>اشا</span><h1>سبد شخصی</h1></div><nav aria-label="بخش‌های سبد">{([ ["overview", "نمای سبد"], ["purchases", "ثبت و ویرایش"], ["analysis", "تحلیل و تصمیم"], ["settings", "تنظیمات و پشتیبان"] ] as const).map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav></header>
    <section className="unified-status" aria-live="polite"><span role={status === "error" ? "alert" : "status"}>{message || "در حال اتصال به پایگاه داده…"}</span>{needsReload && <button className="ghost-button" disabled={status === "loading" || status === "saving"} onClick={() => void load()}>بررسی وضعیت ذخیره</button>}<small>{storageLocation === "server" ? "اطلاعات تأییدشده متعلق به حساب شما و در پایگاه دادهٔ سرور است؛ در دستگاه دیگر پس از ورود بازیابی می‌شود." : "اطلاعات فعلاً در پایگاه دادهٔ همین کامپیوتر است؛ همگام‌سازی دستگاه‌ها هنوز فعال نیست."}</small></section>
    {browserDraft && <details className="unified-warning"><summary>اطلاعاتی در حافظهٔ مرورگر باقی مانده است</summary><p>این اطلاعات خودکار به سبد اضافه نشده‌اند تا دارایی تکراری یا اشتباه ثبت نشود. نسخهٔ آن‌ها حفظ شده است.</p><button className="ghost-button" onClick={() => download("asha-browser-recovery.json", browserDraft)}>دریافت نسخهٔ بازیابی این مرورگر</button></details>}
    <div className="unified-price-status" role="status">{prices.error ? "به‌روزرسانی قیمت انجام نشد؛ نسخهٔ قبلی، اگر موجود باشد، حفظ شده است." : prices.data?.snapshot ? "آخرین قیمت دریافت‌شده نگهداری می‌شود؛ فقط قیمت تازه در ارزش‌گذاری استفاده می‌شود." : "قیمت معتبر هنوز در دسترس نیست."}<details><summary>وضعیت منبع</summary><p>{prices.data ? priceReasons[prices.data.reason] : prices.error ? "پاسخ برنامه کامل یا معتبر نبود؛ تلاش بعدی خودکار است." : "در حال بررسی دسترسی"}</p><p>{prices.data?.checkedAt ? `آخرین بررسی: ${timeLabel(prices.data.checkedAt)}` : ""}</p>{prices.data?.quota && <p>سهمیهٔ باقی‌مانده: <NumberValue value={prices.data.quota.remaining} /></p>}<p>به‌روزرسانی خودکار در محدودهٔ سهمیه است؛ قیمت لحظه‌ای تضمین نمی‌شود.</p>
      <div data-testid="current-usd-rate"><p>نرخ دلار برای ارزش‌گذاری امروز: {valuation ? quoteLabels[valuation.usdConversion.quoteState] : "در انتظار اطلاعات"} · <PurchaseRatio value={valuation?.usdConversion.currentRialPerUsd ?? null} unit="تومان برای هر دلار" rialToToman /></p>
        {valuation?.usdConversion.observation && <small>منبع نرخ دلار: {valuation.usdConversion.observation.source} · زمان قیمت: {timeLabel(valuation.usdConversion.observation.publishedAt)} · زمان دریافت: {timeLabel(valuation.usdConversion.observation.receivedAt)}</small>}
        <p>اگر نرخ دلار تازه موجود نباشد، ارزش و سود دلاری امروز نامشخص می‌ماند؛ بهای دلاری خرید با نرخ تاریخی تغییر نمی‌کند.</p></div>
    </details></div>

    {tab === "overview" && <section aria-label="ارزش‌گذاری سبد">
      <div className="unified-metrics">
        <article><span>ارزش سبد — پوشش کامل</span><strong><PurchaseRatio value={total?.currentValueRial ?? null} unit="تومان" rialToToman /></strong><small>قیمت معتبر: <NumberValue value={total?.valuedAssetCount ?? 0} /> از <NumberValue value={total?.totalAssetCount ?? 0} /> دارایی</small></article>
        <article><span>بهای خرید با هزینه</span><strong><PurchaseRatio value={total?.landedCostRial ?? null} unit="تومان" rialToToman /></strong></article>
        <article><span>سود / زیان تحقق‌نیافته</span><strong><PurchaseRatio value={total?.profitLossRial ?? null} unit="تومان" rialToToman /></strong><small><PurchaseRatio value={total?.profitLossPercent ?? null} unit="٪ از بهای خرید با هزینه" /></small></article>
        <article><span>سود / زیان دلاری</span><strong><PurchaseRatio value={total?.profitLossUsd ?? null} unit="دلار" /></strong><small><PurchaseRatio value={total?.profitLossUsdPercent ?? null} unit="٪ از بهای دلاری خرید" /></small></article>
      </div>
      {snapshot && total?.totalAssetCount === 0 && <div className="panel"><p>هنوز دارایی ثبت نشده است.</p><button className="primary-button" onClick={() => setTab("purchases")}>ثبت دارایی یا ورود Excel</button></div>}
      {displayedAssets.length > 0 && <div role="group" aria-label="مرتب‌سازی دارایی‌ها" aria-describedby="unified-sort-note"><div className="unified-horizons"><label>مرتب‌سازی بر پایهٔ<select data-testid="unified-sort-field" value={sortField} onChange={event => setSortField(event.target.value as PersonalAssetSortField)}>{PERSONAL_ASSET_SORT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>جهت ترتیب<select data-testid="unified-sort-direction" value={sortDirection} disabled={sortField === "original"} onChange={event => setSortDirection(event.target.value as PersonalAssetSortDirection)}><option value="asc">صعودی</option><option value="desc">نزولی</option></select></label></div><small id="unified-sort-note">مبالغ بر پایهٔ تومان مقایسه می‌شوند؛ مقدار نامشخص همیشه در پایان است.</small></div>}
      <div className="unified-assets">{displayedAssets.map((row) => <article className="panel" key={row.id} data-testid={`asset-${row.id}`}><header><h2>{row.name}</h2><span className={row.quoteState === "fresh" ? "fresh" : "pending"}>{quoteLabels[row.quoteState]}</span></header><dl>
        <div><dt>جمع بهای خرید با هزینه</dt><dd><PurchaseRatio value={row.landedBasisRial.complete ? row.landedBasisRial.total : null} unit="تومان" rialToToman /></dd></div>
        <div><dt>موجودی</dt><dd><PurchaseRatio value={row.quantity} unit={row.displayUnit} /></dd></div>
        <div><dt>میانگین وزنی خرید، با هزینه</dt><dd><PurchaseRatio value={row.landedBasisRial.average} unit={`تومان / ${row.displayUnit}`} rialToToman /></dd></div>
        <div><dt>ارزش با قیمت معتبر</dt><dd><PurchaseRatio value={row.currentValueRial} unit="تومان" rialToToman /></dd></div>
        <div><dt>سود / زیان</dt><dd><PurchaseRatio value={row.profitLossRial} unit="تومان" rialToToman /></dd></div></dl>
        {(!row.costComplete || row.legacyIds.length > 0) && <p className="unified-warning">اطلاعات خرید نیازمند تکمیل است؛ سود کل این دارایی ممکن است قابل‌محاسبه نباشد.</p>}
        {row.observation && <small>منبع: {row.observation.source} · زمان قیمت: {timeLabel(row.observation.publishedAt)}</small>}
        <details><summary>قیمت، پوشش و جزئیات دلاری</summary><dl><div><dt>آخرین قیمت ثبت‌شده (ممکن است قدیمی باشد)</dt><dd><PurchaseRatio value={row.recordedPriceRial} unit={`تومان / ${row.displayUnit}`} rialToToman /></dd></div><div><dt>ارزش دلاری امروز</dt><dd><PurchaseRatio value={row.currentValueUsd} unit="دلار" /></dd></div><div><dt>بهای دلاری خرید، با هزینه</dt><dd><PurchaseRatio value={row.landedBasisUsd.complete ? row.landedBasisUsd.total : null} unit="دلار" /></dd></div><div><dt>سود / زیان دلاری</dt><dd><PurchaseRatio value={row.profitLossUsd} unit="دلار" /></dd></div><div><dt>مقدار دارای بهای دلاری</dt><dd><PurchaseRatio value={row.landedBasisUsd.coveredQuantity} unit={row.displayUnit} /> از <PurchaseRatio value={row.quantity} unit={row.displayUnit} /></dd></div></dl><p>تبدیل خرید با نرخ همان تاریخ است؛ نرخ دستی هنوز مستقل تأیید نشده است. قیمت امروز فقط برای ارزش امروز استفاده می‌شود.</p>{row.usdBasisSources.map((source) => <p key={source.lotId}>{source.purchaseDate} · {source.kind === "actual_payment" ? "پرداخت دلاری" : "تبدیل تاریخی"} · {source.missingInputs.length ? "دادهٔ خرید، هزینه یا نرخ تاریخی ناقص است" : source.fx ? "نرخ تاریخی واردشده توسط کاربر" : "ارز پرداخت دلار"}{source.fx && <span> · نرخ تاریخ {source.fx.rateDate}: <NumberValue value={source.fx.tomanPerUsd} unit="تومان برای هر دلار" /> · منبع: {source.fx.source} — تأییدنشده</span>}</p>)}</details>
      </article>)}</div>
      {total && <details className="panel"><summary>جمع بخش دارای داده، نه کل سبد</summary><p>ارزش بخش دارای قیمت: <PurchaseRatio value={total.knownCurrentValueRial} unit="تومان" rialToToman /></p><p>سود ریالی بخش دارای قیمت و بهای خرید: <PurchaseRatio value={total.coveredProfitLossRial} unit="تومان" rialToToman /></p><p>پوشش سود ریالی: <NumberValue value={total.costCoveredLotCount} /> از <NumberValue value={total.totalLotCount} /> خرید</p><p>سود دلاری بخش پوشش‌داده‌شده: <PurchaseRatio value={total.coveredProfitLossUsd} unit="دلار" /></p><p>پوشش سود دلاری: <NumberValue value={total.usdCostCoveredLotCount} /> از <NumberValue value={total.totalLotCount} /> خرید</p></details>}
    </section>}
    <section hidden={tab !== "purchases"} aria-label="ثبت و ویرایش دارایی">{snapshot && <PurchaseBookPanel book={snapshot.purchaseBook ?? emptyPurchaseBook()} legacyHoldings={snapshot.holdings} onCommit={commitBook} onCommitHoldings={commitHoldings} busy={busy} />}</section>
    {tab === "analysis" && <section className="panel"><h2>تحلیل و تصمیم همین سبد</h2><p>ارزش‌گذاری از خریدهای ثبت‌شده و قیمت معتبر انجام می‌شود. تصمیم ورود، خروج یا تبدیل هنوز دادهٔ کافی ندارد.</p><div className="unified-horizons">{["کوتاه‌مدت", "میان‌مدت"].map((horizon) => <article key={horizon}><h3>{horizon}</h3><b>تصمیم‌ناپذیر</b><p>کمبود: تاریخچهٔ مجاز، هزینه و نقدشوندگی قابل‌اعتماد و عوامل روش ثبت‌شده.</p></article>)}</div><details><summary>محدودیت تصمیم</summary><p>قیمت جاری به‌تنهایی برای محاسبهٔ مقدار یا شرط اقدام کافی نیست. روش مالی تغییر نکرده و استفادهٔ مالی فعال نشده است.</p></details></section>}
    <section hidden={tab !== "settings"} className="panel"><h2>تنظیمات و پشتیبان</h2>{snapshot && <><a className="ghost-button" href={status === "saving" ? undefined : "/api/portfolio/export"} download="asha-portfolio-backup.json" aria-disabled={status === "saving"}>خروجی پشتیبان اطلاعات ثبت‌شده</a><p>فایل شامل اطلاعات شخصی سبد است؛ آن را در محل امن نگه دار. این خروجی فقط اطلاعات تأییدشدهٔ پایگاه داده را دارد.</p><details><summary>محدودیت‌ها و افق‌های ثبت‌شده</summary>{stalePreferences && <p role="alert" className="unified-warning">تنظیمات ذخیره‌شده از زمان شروع ویرایش تغییر کرده‌اند. ورودی شما حفظ شده، اما ثبت آن بسته است؛ ابتدا نسخهٔ ذخیره‌شده را ببین و تغییراتت را دوباره اعمال کن.</p>}{preferencesDraft && <button className="ghost-button" disabled={status === "saving" || status === "loading"} onClick={() => { setPreferencesDraft(null); setPreferencesDraftBase(""); }}>کنار گذاشتن ویرایش تنظیمات و دیدن نسخهٔ ذخیره‌شده</button>}{preferences && <form onSubmit={async (event) => { event.preventDefault(); if (stalePreferences) return; try { await commit({ preferences }); setPreferencesDraft(null); setPreferencesDraftBase(""); } catch { /* keep the edited draft */ } }}><fieldset disabled={busy || stalePreferences}>{Object.entries(preferenceLabels).map(([key, label]) => <label key={key}>{label}<input value={preferences[key as keyof typeof preferenceLabels]} inputMode="decimal" onChange={(event) => { if (!preferencesDraft) setPreferencesDraftBase(preferencesBase); setPreferencesDraft({ ...preferences, [key]: event.target.value }); }} /></label>)}<button className="primary-button" type="submit">ثبت تنظیمات</button></fieldset></form>}</details><small>نسخهٔ ذخیره‌شده: <NumberValue value={snapshot.version} />. برای بازیابی کامل، پشتیبان پایگاه داده جداگانه بررسی می‌شود.</small></>}</section>
  </main>;
}
