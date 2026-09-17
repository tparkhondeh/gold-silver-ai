"use client";

import "./purchase-book.css";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { NumberValue } from "./number-value";
import {
  canonicalPurchaseDecimal, evaluatePurchaseBook, purchaseAssetCatalog, upsertPurchaseLot,
  type ExactRatio, type PurchaseAssetAggregate, type PurchaseBook, type PurchaseBookEvaluation,
  type PurchaseCoverage, type PurchaseLot,
} from "./purchase-book";
import type { PortfolioHolding } from "../data/postgres-portfolio-repository";
import { validPortfolioAmount, validPortfolioCost } from "../data/portfolio-numeric-contract";
import type { PurchaseImportPreview } from "./purchase-import";

const currencyLabel = { IRR: "ریال", TOMAN: "تومان", USD: "دلار" };

export function PurchaseRatio({ value, unit = "", rialToToman = false }: { value: ExactRatio | null; unit?: string; rialToToman?: boolean }) {
  return value === null ? <span className="muted-value">نامشخص</span> : <NumberValue value={value.numerator} denominator={rialToToman ? (BigInt(value.denominator) * 10n).toString() : value.denominator} unit={unit} />;
}

function Coverage({ value, label, unit, rialToToman = false }: { value: PurchaseCoverage; label: string; unit: string; rialToToman?: boolean }) {
  return <div className="purchase-coverage"><dt>{label}</dt><dd><PurchaseRatio value={value.average} unit={unit} rialToToman={rialToToman} />
    {!value.complete && <small>پوشش: <PurchaseRatio value={value.coveredQuantity} /> از <PurchaseRatio value={value.totalQuantity} /> واحد مقدار</small>}
    <details><summary>جمع و محاسبهٔ دقیق</summary><p>جمع بخش دارای داده: <PurchaseRatio value={value.total} unit={unit.split("/")[0]} rialToToman={rialToToman} /></p>
      <p>جمع مبلغ ÷ جمع مقدارِ همان ردیف‌های دارای داده = <PurchaseRatio value={value.averageCovered} unit={unit} rialToToman={rialToToman} />{!value.complete && "؛ فقط میانگین بخش پوشش‌داده‌شده، نه کل موجودی."}</p></details>
  </dd></div>;
}

function AssetBasis({ asset }: { asset: PurchaseAssetAggregate }) {
  return <article className="purchase-basis" data-testid={`purchase-basis-${asset.asset.id}`}>
    <header><b>{asset.asset.name}</b><span><PurchaseRatio value={asset.quantity} unit={asset.asset.displayUnit} /></span></header>
    <dl className="purchase-basis-grid">
      <Coverage value={asset.purchaseRial} label="میانگین موزون قیمت خرید، بدون هزینه" unit={`تومان/${asset.asset.displayUnit}`} rialToToman />
      <Coverage value={asset.landedRial} label="میانگین بهای تمام‌شده، با هزینه" unit={`تومان/${asset.asset.displayUnit}`} rialToToman />
      <Coverage value={asset.usd} label="میانگین دلاری با نرخ تاریخ هر خرید" unit={`دلار/${asset.asset.displayUnit}`} />
    </dl>
    <details><summary>تفکیک پرداخت دلاری و تبدیل تاریخی</summary><p>پرداخت مستقیم دلاریِ دارای هزینهٔ کامل: <PurchaseRatio value={asset.paidUsd.total} unit="دلار" /></p><p>معادل دلاری خریدهای ریالی/تومانی: <PurchaseRatio value={asset.equivalentUsd.total} unit="دلار" />؛ نرخ واردشده توسط کاربر، تأییدنشدهٔ منبع.</p><p>موجودی بدون ریز خرید: <PurchaseRatio value={asset.legacyQuantity} unit={asset.asset.displayUnit} />؛ بهای ثبت‌شده: <PurchaseRatio value={asset.legacyCostToman} unit="تومان" />. جزئیات هزینه و نرخ تاریخی آن بازسازی نشده است.</p></details>
    {asset.issues.map((issue) => <p className="action-error" key={issue}>{issue.replaceAll("موجودی قدیمی", "موجودی بدون ریز خرید").replaceAll("قرارداد قدیمی", "قالب عددی محدود")}</p>)}
  </article>;
}

export function PurchaseBasisSummary({ evaluation, selectedHoldingId }: { evaluation: PurchaseBookEvaluation; selectedHoldingId?: string }) {
  const assets = evaluation.assets.filter((asset) => !selectedHoldingId || asset.id === selectedHoldingId);
  if (!assets.length) return null;
  return <section className="panel purchase-summary"><details><summary>موجودی و میانگین‌های خرید ({assets.length} دارایی)</summary><p>همان سبد تجمیع‌شده در نماهای شخصی استفاده می‌شود. میانگین خرید، قیمت روز یا ورودی ساختگی تحلیل نیست.</p>{assets.map((asset) => <AssetBasis key={asset.id} asset={asset} />)}</details></section>;
}

function LotForm({ lot, onSave, onCancel, busy }: { lot: PurchaseLot | null; onSave: (lot: PurchaseLot) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const [assetId, setAssetId] = useState<string>(lot?.assetId ?? purchaseAssetCatalog[0].id);
  const [currency, setCurrency] = useState<PurchaseLot["paymentCurrency"]>(lot?.paymentCurrency ?? "TOMAN");
  const [error, setError] = useState("");
  const asset = purchaseAssetCatalog.find((item) => item.id === assetId)!;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError("");
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const decimal = (name: string) => text(name) === "" ? null : canonicalPurchaseDecimal(text(name));
    try {
      const rate = decimal("rate");
      if (rate === null && ["rateDate", "rateType", "rateSource"].some((name) => text(name) !== "")) throw new Error("اطلاعات نرخ دلار ناقص است؛ مقدار نرخ را وارد کن یا جزئیات نرخ را خالی بگذار.");
      const unchangedFx = lot?.fx && rate === lot.fx.tomanPerUsd && text("rateDate") === lot.fx.rateDate && text("rateType") === lot.fx.rateType && text("rateSource") === lot.fx.source;
      const next: PurchaseLot = {
        id: lot?.id ?? crypto.randomUUID(), assetId: asset.id, assetClass: asset.assetClass, unit: asset.unit, purityPermille: asset.purityPermille,
        quantity: canonicalPurchaseDecimal(text("quantity")), purchaseDate: text("date"), purchaseTime: text("time") || null,
        paymentCurrency: currency, unitPrice: decimal("price"), fees: decimal("fees"), note: text("note"),
        source: { kind: lot?.source.kind ?? "manual", reference: text("reference") || null },
        fx: rate === null ? null : { tomanPerUsd: rate, rateDate: text("rateDate"), rateType: text("rateType"), source: text("rateSource"), receivedAt: unchangedFx ? lot!.fx!.receivedAt : new Date().toISOString(), validity: "user_entered_unverified" },
      };
      await onSave(next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ثبت انجام نشد."); }
  }
  return <form className="purchase-form" onSubmit={submit} aria-label="مشخصات خرید">
    <fieldset disabled={busy}>
      <div className="form-row"><label>دارایی خریداری‌شده<select data-testid="purchase-asset" value={assetId} onChange={(event) => setAssetId(event.target.value)}>{purchaseAssetCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>مقدار ({asset.displayUnit})<input data-testid="purchase-quantity" name="quantity" inputMode="decimal" required defaultValue={lot?.quantity} /></label></div>
      <p>کلاس: {asset.assetClass} · واحد: {asset.displayUnit} · عیار: {asset.purityPermille === null ? "برای این قرارداد ثبت نشده" : `${asset.purityPermille} در هزار`}</p>
      <div className="form-row"><label>تاریخ خرید میلادی (YYYY-MM-DD)<input data-testid="purchase-date" name="date" type="date" required defaultValue={lot?.purchaseDate} /></label><label>ساعت تهران، اختیاری<input name="time" type="time" defaultValue={lot?.purchaseTime ?? ""} /></label></div>
      <div className="form-row"><label>ارز پرداخت<select data-testid="purchase-currency" value={currency} onChange={(event) => setCurrency(event.target.value as PurchaseLot["paymentCurrency"])}>{Object.entries(currencyLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>قیمت هر {asset.displayUnit} ({currencyLabel[currency]})<input data-testid="purchase-price" name="price" inputMode="decimal" defaultValue={lot?.unitPrice ?? ""} placeholder="خالی = نامشخص" /></label></div>
      <label>جمع هزینه‌های جانبی همین خرید ({currencyLabel[currency]})<input data-testid="purchase-fees" name="fees" inputMode="decimal" defaultValue={lot?.fees ?? ""} placeholder="بدون هزینه: 0 · هزینه نامعلوم: خالی" /></label>
      <details open={!!lot?.fx}><summary>نرخ دلار در تاریخ خرید، اختیاری</summary><p>نرخ تاریخی خودکار در دسترس نیست. نرخ دستی با برچسب تأییدنشده ثبت می‌شود؛ نرخ امروز یا روز دیگر جایگزین نمی‌شود.</p>
        <div className="form-row"><label>تومان برای یک دلار<input data-testid="purchase-fx" name="rate" inputMode="decimal" defaultValue={lot?.fx?.tomanPerUsd ?? ""} /></label><label>تاریخ نرخ میلادی، دقیقاً روز خرید<input data-testid="purchase-fx-date" name="rateDate" type="date" defaultValue={lot?.fx?.rateDate ?? ""} /></label></div>
        <div className="form-row"><label>نوع نرخ (مثلاً نرخ معاملهٔ ثبت‌شده)<input name="rateType" defaultValue={lot?.fx?.rateType ?? ""} maxLength={100} /></label><label>منشأ نرخ<input name="rateSource" defaultValue={lot?.fx?.source ?? ""} maxLength={200} /></label></div>
      </details>
      <label>منشأ اطلاعات خرید<input name="reference" defaultValue={lot?.source.reference ?? ""} maxLength={200} placeholder="اختیاری؛ مانند رسید خرید" /></label>
      <label>یادداشت<input name="note" defaultValue={lot?.note ?? ""} maxLength={1000} /></label>
      <p>مبلغ کل از مقدار × قیمت و هزینهٔ واردشده محاسبه می‌شود. این ثبت، اجرای معامله یا برداشت خودکار از نقد سبد نیست.</p>
      {error && <p role="alert" className="action-error">{error}</p>}
      <div className="market-actions"><button className="primary-button" type="submit">{lot ? "ثبت ویرایش خرید" : "ثبت خرید در سبد"}</button><button className="ghost-button" type="button" onClick={onCancel}>انصراف</button></div>
    </fieldset>
  </form>;
}

// Balance records already use Number. Reject text whose exact decimal value
// would change during that conversion; do not reinterpret it as a purchase lot.
function holdingNumber(raw: string): number {
  function parts(value: string): { digits: bigint; power: number } {
    if (value.length > 256 || !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) throw new Error("عدد معتبر وارد کن؛ جداکننده یا علامت منفی پذیرفته نمی‌شود.");
    const [coefficient, exponent = "0"] = value.toLowerCase().replace(/^\+/, "").split("e");
    const [whole, fraction = ""] = coefficient.split(".");
    const power = Number(exponent) - fraction.length;
    if (!Number.isSafeInteger(power) || Math.abs(power) > 1000) throw new Error("عدد خارج از محدودهٔ قابل ثبت است.");
    return { digits: BigInt(`${whole}${fraction}`), power };
  }
  const input = parts(raw);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("عدد خارج از محدودهٔ قابل ثبت است.");
  const output = parts(String(value));
  const commonPower = Math.min(input.power, output.power);
  if (input.digits * 10n ** BigInt(input.power - commonPower) !== output.digits * 10n ** BigInt(output.power - commonPower)) throw new Error("این عدد در قالب موجودی بدون کاهش دقت قابل ثبت نیست؛ مقدار را گرد نکن.");
  return value;
}

function HoldingForm({ holding, onSave, onCancel, busy }: { holding: PortfolioHolding; onSave: (holding: PortfolioHolding) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError("");
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    try {
      const amount = holdingNumber(text("amount"));
      const costToman = text("cost") === "" ? null : holdingNumber(text("cost"));
      const purchaseDate = text("date") || null;
      const note = text("note");
      if (!validPortfolioAmount(amount) || !validPortfolioCost(costToman)) throw new Error("مقدار باید مثبت و حداکثر ۱۲ رقم اعشار باشد؛ بهای کل نامنفی و حداکثر ۲ رقم اعشار است.");
      if (purchaseDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw new Error("تاریخ ثبت‌شده را با قالب YYYY-MM-DD وارد کن؛ تقویم آن تبدیل نمی‌شود.");
      if (note.length > 1000) throw new Error("یادداشت باید حداکثر ۱۰۰۰ نویسه باشد.");
      await onSave({ ...holding, amount, costToman, purchaseDate, note });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ثبت انجام نشد؛ ورودی‌ها حفظ شدند."); }
  }
  return <form className="purchase-form" onSubmit={submit} aria-label="تکمیل مشخصات موجودی">
    <fieldset disabled={busy}>
      <h3>{holding.name}</h3><p>این ردیف ریز خرید ندارد؛ قیمت واحد، هزینه و ارز پرداخت از بهای کل حدس زده نمی‌شود.</p>
      <div className="form-row"><label>مقدار ({holding.unit})<input data-testid="holding-amount" name="amount" inputMode="decimal" required defaultValue={String(holding.amount)} /></label><label>بهای کل ثبت‌شده (تومان)<input data-testid="holding-cost" name="cost" inputMode="decimal" defaultValue={holding.costToman === null ? "" : String(holding.costToman)} placeholder="خالی = نامشخص" /></label></div>
      <label>تاریخ ثبت‌شده، بدون تبدیل تقویم (YYYY-MM-DD)<input data-testid="holding-date" name="date" defaultValue={holding.purchaseDate ?? ""} placeholder="اختیاری؛ فقط تاریخ معلوم را ثبت کن" /></label>
      <label>یادداشت<input name="note" defaultValue={holding.note} maxLength={1000} /></label>
      {error && <p role="alert" className="action-error">{error}</p>}
      <div className="market-actions"><button className="primary-button" type="submit">ثبت مشخصات</button><button className="ghost-button" type="button" onClick={onCancel}>انصراف</button></div>
    </fieldset>
  </form>;
}

type EditingRecord = { kind: "purchase"; id: string | null } | { kind: "holding"; id: string };
export function PurchaseBookPanel({ book, legacyHoldings, onCommit, onCommitHoldings, busy: externalBusy }: { book: PurchaseBook; legacyHoldings: PortfolioHolding[]; onCommit: (next: PurchaseBook) => Promise<void>; onCommitHoldings?: (next: PortfolioHolding[]) => Promise<boolean>; /** @deprecated Use onCommitHoldings; this callback is never invoked. */ onEditLegacy?: (holding: PortfolioHolding) => void; busy: boolean }) {
  const [editing, setEditing] = useState<EditingRecord | null>(null);
  const [editingBase, setEditingBase] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<PurchaseImportPreview | null>(null);
  const [previewBase, setPreviewBase] = useState("");
  const [committing, setCommitting] = useState(false);
  const mutation = useRef(false);
  const busy = externalBusy || committing;
  const fileOperation = useRef(0);
  useEffect(() => () => { fileOperation.current++; }, []);
  let evaluation: PurchaseBookEvaluation;
  let legacyValid = true;
  try { evaluation = evaluatePurchaseBook(book, legacyHoldings); } catch { evaluation = evaluatePurchaseBook(book); legacyValid = false; }
  const currentBase = JSON.stringify({ book, legacyHoldings });
  const stalePreview = preview !== null && previewBase !== currentBase;
  const staleEditing = editing !== null && editingBase !== currentBase;
  function edit(record: EditingRecord) { if (busy || reading) return; setError(""); setMessage(""); setEditingBase(currentBase); setEditing(record); }
  async function save(lot: PurchaseLot) {
    if (busy || reading || mutation.current) return;
    if (staleEditing) throw new Error("سبد از زمان بازکردن فرم تغییر کرده؛ فرم را ببند و دوباره باز کن.");
    mutation.current = true; setCommitting(true);
    try { await onCommit(upsertPurchaseLot(book, lot)); setEditing(null); setMessage("خرید ثبت شد."); }
    finally { mutation.current = false; setCommitting(false); }
  }
  async function saveHolding(holding: PortfolioHolding) {
    if (busy || reading || mutation.current) return;
    if (staleEditing || !legacyHoldings.some((item) => item.id === holding.id)) throw new Error("سبد از زمان بازکردن فرم تغییر کرده؛ فرم را ببند و دوباره باز کن.");
    if (!onCommitHoldings) throw new Error("ثبت مشخصات موجودی در این نما در دسترس نیست.");
    mutation.current = true; setCommitting(true);
    try {
      if (!await onCommitHoldings(legacyHoldings.map((item) => item.id === holding.id ? holding : item))) throw new Error("ثبت انجام نشد؛ ورودی‌ها حفظ شدند. وضعیت ذخیره‌سازی را بررسی کن.");
      setEditing(null); setMessage("مشخصات ثبت شد.");
    } finally { mutation.current = false; setCommitting(false); }
  }
  // The XLSX reader is loaded only when requested. Files stay in this browser.
  async function readFile(file: File | undefined) {
    if (!file || busy || mutation.current) return;
    const operation = ++fileOperation.current;
    setError(""); setMessage(""); setPreview(null); setReading(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("حداکثر حجم فایل ۲ مگابایت است.");
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("فقط فایل xlsx قالب برنامه پذیرفته می‌شود.");
      const { previewPurchaseWorkbook } = await import("./purchase-import");
      const result = await previewPurchaseWorkbook(file, book, new Date().toISOString());
      if (operation === fileOperation.current) { setPreviewBase(currentBase); setPreview(result); }
    } catch (failure) { if (operation === fileOperation.current) setError(failure instanceof Error ? failure.message : "فایل خوانده نشد."); }
    finally { if (operation === fileOperation.current) setReading(false); }
  }
  async function confirm() {
    if (!preview || busy || reading || stalePreview || !legacyValid || mutation.current) return;
    mutation.current = true; setCommitting(true);
    setError("");
    try {
      const { confirmPurchaseImport } = await import("./purchase-import");
      const next = confirmPurchaseImport(preview, book, true);
      await onCommit(next);
      setPreview(null); setMessage("تمام ردیف‌های تأییدشده یک‌جا ثبت شدند؛ بارگذاری دوبارهٔ همین فایل مسدود است.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ثبت انجام نشد؛ پیش‌نمایش حفظ شد."); }
    finally { mutation.current = false; setCommitting(false); }
  }
  return <section className="panel purchase-book-panel" data-testid="purchase-book-panel">
    {!legacyValid && <p role="alert" className="action-error">بعضی موجودی‌ها نیاز به اصلاح دارند؛ جمع‌ها کامل نیستند و ثبت فایل فعلاً بسته است.</p>}
    <div className="panel-head"><h2>دارایی‌های من</h2><button className="primary-button" data-testid="add-purchase" onClick={() => edit({ kind: "purchase", id: null })} disabled={busy || reading}>＋ افزودن خرید</button></div>
    <div className="market-actions"><label className="ghost-button">ورود از Excel<input data-testid="purchase-file" type="file" accept=".xlsx" disabled={busy || reading} onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; await readFile(file); }} /></label><a className="ghost-button" href="/templates/purchase-lots-v1.xlsx" download>دانلود قالب Excel</a></div>
    <details><summary>راهنمای ثبت و فایل</summary><p>هر خرید یک ردیف است. موجودی بدون ریز خرید را دوباره وارد نکن؛ همان ردیف را ویرایش کن. فایل فقط در همین مرورگر بررسی و پس از تأیید یک‌جا ثبت می‌شود.</p><p>قالب فقط دارایی‌های دارای شناسه و واحد مشخص را می‌پذیرد. صندوق، گواهی، سهام و دارایی‌های بدون هویت دقیق، خودکار به طلا یا دارایی دیگر تبدیل نمی‌شوند.</p></details>
    {reading && <p role="status">در حال بررسی فایل در همین مرورگر…</p>}{error && <p className="action-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {preview && <section className="purchase-preview" data-testid="purchase-import-preview"><h3>پیش‌نمایش؛ هنوز چیزی ثبت نشده</h3><p>{preview.lots.length} خرید معتبر. این خریدها به سبد اضافه می‌شوند؛ جایگزین موجودی نیستند.</p>
      {[...preview.errors, ...preview.warnings].map((item, index) => <p className="action-error" key={index}>{item}</p>)}
      <div className="purchase-import-table"><table><thead><tr><th>ردیف Excel</th><th>خرید</th><th>مقدار</th><th>نتیجهٔ بررسی</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.lot ? purchaseAssetCatalog.find((item) => item.id === row.lot?.assetId)?.name : "نامعتبر"}</td><td>{row.lot ? <NumberValue value={row.lot.quantity} /> : "—"}</td><td>{[...row.errors, ...row.warnings].join(" · ") || "معتبر"}</td></tr>)}</tbody></table></div>
      {stalePreview && <p role="alert" className="action-error">سبد پس از پیش‌نمایش تغییر کرده است؛ فایل را دوباره انتخاب و اثر آن را بررسی کن.</p>}
      {preview.canImport && !stalePreview && legacyValid && <details><summary>اثر ثبت بر موجودی و میانگین‌ها</summary>{evaluatePurchaseBook({ ...book, lots: [...book.lots, ...preview.lots] }, legacyHoldings).assets.map((asset) => <AssetBasis key={asset.id} asset={asset} />)}</details>}
      <div className="market-actions"><button className="primary-button" data-testid="confirm-purchase-import" disabled={!preview.canImport || busy || reading || stalePreview || !legacyValid} onClick={() => void confirm()}>تأیید پیش‌نمایش و ثبت یک‌جای خریدها</button><button className="ghost-button" disabled={busy || reading} onClick={() => setPreview(null)}>انصراف از ورود فایل</button></div>
    </section>}
    {staleEditing && <p role="alert" className="action-error">سبد تغییر کرده است؛ برای ویرایش، فرم را ببند و دوباره باز کن. ورودی فعلی خودکار جایگزین نشد.</p>}
    {editing?.kind === "purchase" && <LotForm key={`purchase:${editing.id ?? "new"}`} lot={book.lots.find((item) => item.id === editing.id) ?? null} onSave={save} onCancel={() => setEditing(null)} busy={busy || reading} />}
    {editing?.kind === "holding" && legacyHoldings.filter((item) => item.id === editing.id).map((holding) => <HoldingForm key={`holding:${holding.id}`} holding={holding} onSave={saveHolding} onCancel={() => setEditing(null)} busy={busy || reading} />)}
    <div data-testid="purchase-records"><h3>فهرست دارایی‌ها ({book.lots.length + legacyHoldings.length})</h3>
    {book.lots.length + legacyHoldings.length === 0 && <p>برای شروع، خریدت را اضافه کن یا فایل قالب را وارد کن.</p>}
    {evaluation.lots.map((row) => <details className="purchase-row" key={`purchase:${row.lot.id}`}><summary>{purchaseAssetCatalog.find((item) => item.id === row.lot.assetId)?.name} · <bdi>{row.lot.purchaseDate}</bdi> · <NumberValue value={row.lot.quantity} /></summary><dl>
      <div><dt>شناسه</dt><dd><bdi>{row.lot.id}</bdi></dd></div><div><dt>قیمت واحد</dt><dd>{row.lot.unitPrice === null ? "نامشخص" : <NumberValue value={row.lot.unitPrice} unit={currencyLabel[row.lot.paymentCurrency]} />}</dd></div>
      <div><dt>هزینه</dt><dd>{row.lot.fees === null ? "نامشخص" : <NumberValue value={row.lot.fees} unit={currencyLabel[row.lot.paymentCurrency]} />}</dd></div><div><dt>مبلغ کل با هزینه</dt><dd><PurchaseRatio value={row.landedPaid} unit={currencyLabel[row.lot.paymentCurrency]} /></dd></div><div><dt>{row.usdKind === "actual_payment" ? "پرداخت مستقیم دلاری" : "معادل دلاری تاریخی"}</dt><dd><PurchaseRatio value={row.landedUsd} unit="دلار" /></dd></div>
      <div><dt>منشأ</dt><dd>{row.lot.source.kind} · {row.lot.source.reference ?? "ثبت نشده"}</dd></div><div><dt>یادداشت</dt><dd>{row.lot.note || "—"}</dd></div>
    </dl>{row.lot.fx && <p>نرخ دستی تأییدنشده: <NumberValue value={row.lot.fx.tomanPerUsd} unit="تومان/دلار" /> · <bdi>{row.lot.fx.rateDate}</bdi> · {row.lot.fx.rateType} · {row.lot.fx.source} · زمان ثبت: <bdi>{row.lot.fx.receivedAt}</bdi></p>}<button className="ghost-button" data-testid={`edit-purchase-${row.lot.id}`} onClick={() => edit({ kind: "purchase", id: row.lot.id })} disabled={busy || reading}>ویرایش</button></details>)}
    {legacyHoldings.map((holding) => <details className="purchase-row" key={`holding:${holding.id}`}><summary>{holding.name} · <NumberValue value={holding.amount} unit={holding.unit} /> · نیازمند تکمیل مشخصات خرید</summary><dl>
      <div><dt>شناسه</dt><dd><bdi>{holding.id}</bdi></dd></div><div><dt>بهای کل ثبت‌شده</dt><dd>{holding.costToman === null ? "نامشخص" : <NumberValue value={holding.costToman} unit="تومان" />}</dd></div><div><dt>تاریخ ثبت‌شده، بدون تبدیل تقویم</dt><dd><bdi>{holding.purchaseDate ?? "نامشخص"}</bdi></dd></div><div><dt>یادداشت</dt><dd>{holding.note || "—"}</dd></div>
    </dl><p>ریز قیمت واحد، هزینه و ارز پرداخت موجود نیست؛ این ردیف به خرید فرضی تبدیل نمی‌شود.</p><button className="ghost-button" data-testid={`edit-holding-${holding.id}`} onClick={() => edit({ kind: "holding", id: holding.id })} disabled={busy || reading || !onCommitHoldings}>ویرایش</button>{!onCommitHoldings && <p>ثبت مشخصات در این نما در دسترس نیست.</p>}</details>)}
    </div>
    {evaluation.assets.length > 0 && <details><summary>جمع موجودی و میانگین‌های خرید</summary>{evaluation.assets.map((asset) => <AssetBasis key={asset.id} asset={asset} />)}</details>}
  </section>;
}
