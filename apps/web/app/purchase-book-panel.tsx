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
    <details><summary>تفکیک پرداخت دلاری و تبدیل تاریخی</summary><p>پرداخت مستقیم دلاریِ دارای هزینهٔ کامل: <PurchaseRatio value={asset.paidUsd.total} unit="دلار" /></p><p>معادل دلاری خریدهای ریالی/تومانی: <PurchaseRatio value={asset.equivalentUsd.total} unit="دلار" />؛ نرخ واردشده توسط کاربر، تأییدنشدهٔ منبع.</p><p>موجودی قدیمی: <PurchaseRatio value={asset.legacyQuantity} unit={asset.asset.displayUnit} />؛ بهای ثبت‌شدهٔ قبلی: <PurchaseRatio value={asset.legacyCostToman} unit="تومان" />. جزئیات هزینه و نرخ تاریخی آن بازسازی نشده است.</p></details>
    {asset.issues.map((issue) => <p className="action-error" key={issue}>{issue}</p>)}
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
    event.preventDefault(); setError("");
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
  return <form className="purchase-form" onSubmit={(event) => void submit(event)} aria-label="مشخصات خرید">
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

export function PurchaseBookPanel({ book, legacyHoldings, onCommit, onEditLegacy, busy }: { book: PurchaseBook; legacyHoldings: PortfolioHolding[]; onCommit: (next: PurchaseBook) => Promise<void>; onEditLegacy: (holding: PortfolioHolding) => void; busy: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editingBase, setEditingBase] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<PurchaseImportPreview | null>(null);
  const [previewBase, setPreviewBase] = useState("");
  const fileOperation = useRef(0);
  useEffect(() => () => { fileOperation.current++; }, []);
  let evaluation: PurchaseBookEvaluation;
  let legacyValid = true;
  try { evaluation = evaluatePurchaseBook(book, legacyHoldings); } catch { evaluation = evaluatePurchaseBook(book); legacyValid = false; }
  const currentBase = JSON.stringify({ book, legacyHoldings });
  const stalePreview = preview !== null && previewBase !== currentBase;
  const staleEditing = editing !== null && editingBase !== currentBase;
  function edit(id: string) { setError(""); setMessage(""); setEditingBase(currentBase); setEditing(id); }
  async function save(lot: PurchaseLot) {
    if (staleEditing) throw new Error("سبد از زمان بازکردن فرم تغییر کرده؛ فرم را ببند و دوباره باز کن.");
    await onCommit(upsertPurchaseLot(book, lot)); setEditing(null); setMessage("خرید ثبت شد؛ موجودی و میانگین‌ها به‌روز شدند.");
  }
  // The XLSX reader is loaded only when requested. Files stay in this browser.
  async function readFile(file: File | undefined) {
    if (!file) return;
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
    if (!preview || busy || reading || stalePreview || !legacyValid) return;
    setError("");
    try {
      const { confirmPurchaseImport } = await import("./purchase-import");
      const next = confirmPurchaseImport(preview, book, true);
      await onCommit(next);
      setPreview(null); setMessage("تمام ردیف‌های تأییدشده یک‌جا ثبت شدند؛ بارگذاری دوبارهٔ همین فایل مسدود است.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ثبت انجام نشد؛ پیش‌نمایش حفظ شد."); }
  }
  return <section className="panel purchase-book-panel" data-testid="purchase-book-panel">
    {!legacyValid && <p role="alert" className="action-error">موجودی قدیمی نیاز به اصلاح دارد؛ اعداد این دفتر فقط خریدهای جدید را پوشش می‌دهند و ثبت فایل فعلاً بسته است.</p>}
    <div className="panel-head"><div><h2>دفتر خرید و ورود Excel</h2><p>هر خرید یک ردیف؛ موجودی قبلی محفوظ و جدا از خریدهای جدید است.</p></div><button className="primary-button" onClick={() => edit("new")} disabled={busy || reading}>＋ ثبت خرید جدید</button></div>
    <div className="market-actions"><a className="ghost-button" href="/templates/purchase-lots-v1.xlsx" download>دانلود قالب Excel</a><label className="ghost-button">انتخاب فایل Excel<input data-testid="purchase-file" type="file" accept=".xlsx" disabled={busy || reading} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
    <p>قالب فقط دارایی‌های دارای شناسه و واحد مشخص را می‌پذیرد. صندوق، گواهی، سهام و دارایی‌های بدون هویت دقیق، خودکار به طلا یا دارایی دیگر تبدیل نمی‌شوند.</p>
    {reading && <p role="status">در حال بررسی فایل در همین مرورگر…</p>}{error && <p className="action-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {preview && <section className="purchase-preview" data-testid="purchase-import-preview"><h3>پیش‌نمایش؛ هنوز چیزی ثبت نشده</h3><p>{preview.lots.length} خرید معتبر. این خریدها به موجودی قبلی اضافه می‌شوند؛ جایگزین آن نیستند.</p>
      {[...preview.errors, ...preview.warnings].map((item, index) => <p className="action-error" key={index}>{item}</p>)}
      <div className="purchase-import-table"><table><thead><tr><th>ردیف Excel</th><th>خرید</th><th>مقدار</th><th>نتیجهٔ بررسی</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.lot ? purchaseAssetCatalog.find((item) => item.id === row.lot?.assetId)?.name : "نامعتبر"}</td><td>{row.lot ? <NumberValue value={row.lot.quantity} /> : "—"}</td><td>{[...row.errors, ...row.warnings].join(" · ") || "معتبر"}</td></tr>)}</tbody></table></div>
      {stalePreview && <p role="alert" className="action-error">سبد پس از پیش‌نمایش تغییر کرده است؛ فایل را دوباره انتخاب و اثر آن را بررسی کن.</p>}
      {preview.canImport && !stalePreview && legacyValid && <details><summary>اثر ثبت بر موجودی و میانگین‌ها</summary>{evaluatePurchaseBook({ ...book, lots: [...book.lots, ...preview.lots] }, legacyHoldings).assets.map((asset) => <AssetBasis key={asset.id} asset={asset} />)}</details>}
      <div className="market-actions"><button className="primary-button" data-testid="confirm-purchase-import" disabled={!preview.canImport || busy || reading || stalePreview || !legacyValid} onClick={() => void confirm()}>تأیید پیش‌نمایش و ثبت یک‌جای خریدها</button><button className="ghost-button" disabled={busy || reading} onClick={() => setPreview(null)}>انصراف از ورود فایل</button></div>
    </section>}
    {staleEditing && <p role="alert" className="action-error">سبد تغییر کرده است؛ برای ویرایش، فرم را ببند و دوباره باز کن. ورودی فعلی خودکار جایگزین نشد.</p>}
    {editing && <LotForm key={editing} lot={book.lots.find((item) => item.id === editing) ?? null} onSave={save} onCancel={() => setEditing(null)} busy={busy} />}
    {evaluation.assets.map((asset) => <AssetBasis key={asset.id} asset={asset} />)}
    <details><summary>خریدهای مستقل ({book.lots.length})</summary>{evaluation.lots.map((row) => <details className="purchase-row" key={row.lot.id}><summary>{purchaseAssetCatalog.find((item) => item.id === row.lot.assetId)?.name} · <bdi>{row.lot.purchaseDate}</bdi> · <NumberValue value={row.lot.quantity} /></summary><dl>
      <div><dt>شناسه</dt><dd><bdi>{row.lot.id}</bdi></dd></div><div><dt>قیمت واحد</dt><dd>{row.lot.unitPrice === null ? "نامشخص" : <NumberValue value={row.lot.unitPrice} unit={currencyLabel[row.lot.paymentCurrency]} />}</dd></div>
      <div><dt>هزینه</dt><dd>{row.lot.fees === null ? "نامشخص" : <NumberValue value={row.lot.fees} unit={currencyLabel[row.lot.paymentCurrency]} />}</dd></div><div><dt>مبلغ کل با هزینه</dt><dd><PurchaseRatio value={row.landedPaid} unit={currencyLabel[row.lot.paymentCurrency]} /></dd></div><div><dt>{row.usdKind === "actual_payment" ? "پرداخت مستقیم دلاری" : "معادل دلاری تاریخی"}</dt><dd><PurchaseRatio value={row.landedUsd} unit="دلار" /></dd></div>
      <div><dt>منشأ</dt><dd>{row.lot.source.kind} · {row.lot.source.reference ?? "ثبت نشده"}</dd></div><div><dt>یادداشت</dt><dd>{row.lot.note || "—"}</dd></div>
    </dl>{row.lot.fx && <p>نرخ دستی تأییدنشده: <NumberValue value={row.lot.fx.tomanPerUsd} unit="تومان/دلار" /> · <bdi>{row.lot.fx.rateDate}</bdi> · {row.lot.fx.rateType} · {row.lot.fx.source} · زمان ثبت: <bdi>{row.lot.fx.receivedAt}</bdi></p>}<button className="ghost-button" onClick={() => edit(row.lot.id)} disabled={busy}>ویرایش خرید {row.lot.id}</button></details>)}</details>
    {legacyHoldings.length > 0 && <details><summary>موجودی‌های قدیمی؛ دوباره به‌عنوان خرید ثبت نکن ({legacyHoldings.length})</summary>{legacyHoldings.map((holding) => <p key={holding.id}>{holding.name} · <NumberValue value={holding.amount} unit={holding.unit} /> <button className="text-button" onClick={() => onEditLegacy(holding)}>ویرایش موجودی قبلی</button></p>)}</details>}
  </section>;
}
