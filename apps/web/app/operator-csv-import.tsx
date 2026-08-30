"use client";

import { ChangeEvent, FormEvent, useState, useSyncExternalStore } from "react";

const EMPTY_TEMPLATE = "instrument_code,source_id,value,currency,unit,observed_at,published_at,collected_at,effective_from,effective_to,correction_of\n";
const SANDBOX_TEMPLATE = `instrument_code,source_id,value,currency,unit,observed_at,published_at,collected_at,effective_from,effective_to,correction_of
GOLD_18K_IRR,asha-sandbox,21480700,TOMAN,gram,2026-08-28T09:00:00.000Z,2026-08-28T09:00:00.000Z,2026-08-28T09:01:00.000Z,,,
SILVER_999_IRR,asha-sandbox,446860,TOMAN,gram,2026-08-28T09:00:00.000Z,2026-08-28T09:00:00.000Z,2026-08-28T09:01:00.000Z,,,
USD_IRR,asha-sandbox,160000,TOMAN,usd,2026-08-28T09:00:00.000Z,2026-08-28T09:00:00.000Z,2026-08-28T09:01:00.000Z,,,
GOLD_18K_IRR,asha-sandbox,21480700,TOMAN,gram,2026-08-28T09:00:00.000Z,2026-08-28T09:00:00.000Z,2026-08-28T09:01:00.000Z,,,
UNKNOWN_DEMO,asha-sandbox,invalid,TOMAN,unit,2026-08-28T09:00:00.000Z,2026-08-28T09:00:00.000Z,2026-08-28T09:01:00.000Z,,,
`;
const SOURCE_ID = "owner-local-csv";
const MAX_FILE_BYTES = 1_048_576;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function subscribeToLocation() {
  return () => undefined;
}

function getLoopbackSnapshot(): boolean | null {
  return typeof window === "undefined" ? null : LOOPBACK_HOSTS.has(window.location.hostname);
}

function getServerLoopbackSnapshot(): boolean | null {
  return null;
}

type PreviewResult = {
  ok: true;
  batchId: string;
  counts: { accepted: number; duplicates: number; quarantined: number; total: number };
  accepted: Array<{ instrumentCode: string; value: string; currency: string; unit: string; observedAt: string }>;
  duplicates: Array<{ rowNumber: number }>;
  quarantined: Array<{ rowNumber: number; issues: Array<{ code: string; field: string; message: string }> }>;
  persistence: { available: boolean; reason: string | null };
};

type CommitResult = {
  ok: true;
  mode: "commit";
  batchId: string;
  persistence: {
    available: true;
    result: {
      alreadyProcessed: boolean;
      insertedObservations: number;
      duplicateObservations: number;
      insertedQuarantineRecords: number;
    };
  };
};

type FailureResult = { ok: false; code?: string; message?: string };

const SANDBOX_INSTRUMENTS = new Set(["GOLD_18K_IRR", "SILVER_999_IRR", "USD_IRR", "XAU_USD", "XAG_USD"]);

function buildSandboxPreview(text: string): PreviewResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0]?.trim() !== EMPTY_TEMPLATE.trim()) throw new Error("invalid_csv_structure");
  const accepted: PreviewResult["accepted"] = [];
  const duplicates: PreviewResult["duplicates"] = [];
  const quarantined: PreviewResult["quarantined"] = [];
  const seen = new Set<string>();

  lines.slice(1).filter((line) => line.trim()).forEach((line, index) => {
    const rowNumber = index + 2;
    const columns = line.split(",").map((value) => value.trim());
    const [instrumentCode, sourceId, value, currency, unit, observedAt] = columns;
    const issues: Array<{ code: string; field: string; message: string }> = [];
    if (!SANDBOX_INSTRUMENTS.has(instrumentCode)) issues.push({ code: "unknown_instrument", field: "instrument_code", message: "ابزار در قرارداد آزمایشگاه نیست" });
    if (sourceId !== "asha-sandbox") issues.push({ code: "unknown_source", field: "source_id", message: "منبع آزمایشگاه معتبر نیست" });
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) issues.push({ code: "invalid_decimal", field: "value", message: "مقدار مثبت نیست" });
    if (!Number.isFinite(Date.parse(observedAt))) issues.push({ code: "invalid_timestamp", field: "observed_at", message: "زمان معتبر نیست" });
    if (issues.length) {
      quarantined.push({ rowNumber, issues });
      return;
    }
    const key = `${instrumentCode}|${sourceId}|${observedAt}`;
    if (seen.has(key)) {
      duplicates.push({ rowNumber });
      return;
    }
    seen.add(key);
    accepted.push({ instrumentCode, value, currency, unit, observedAt });
  });

  return {
    ok: true,
    batchId: `asha-sandbox-preview-v1-${lines.length}-${text.length}`,
    counts: { accepted: accepted.length, duplicates: duplicates.length, quarantined: quarantined.length, total: accepted.length + duplicates.length + quarantined.length },
    accepted,
    duplicates,
    quarantined,
    persistence: { available: true, reason: null },
  };
}

const errorLabels: Record<string, string> = {
  operator_boundary: "درخواست از مرز امن محیط محلی عبور نکرد.",
  invalid_request: "نام فایل، منبع یا محتوای CSV معتبر نیست.",
  invalid_csv_structure: "ساختار ستون‌های CSV با قرارداد نسخهٔ یک سازگار نیست.",
  request_too_large: "حجم فایل از سقف یک مگابایت بیشتر است.",
  database_not_configured: "PostgreSQL هنوز متصل نیست؛ هیچ داده‌ای ذخیره نشد.",
  database_unavailable: "تراکنش PostgreSQL کامل نشد؛ هیچ ثبت ناقصی انجام نشد.",
  operator_intent_mismatch: "نوع عملیات با درخواست امن اپراتور مطابقت ندارد.",
};

export function OperatorCsvImport({ demoMode = false }: { demoMode?: boolean }) {
  const [fileName, setFileName] = useState(demoMode ? "asha-sandbox-observations.csv" : "phase1-observations.csv");
  const [csvText, setCsvText] = useState(demoMode ? SANDBOX_TEMPLATE : EMPTY_TEMPLATE);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isLoopback = useSyncExternalStore(subscribeToLocation, getLoopbackSnapshot, getServerLoopbackSnapshot);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(null);
    setCommitMessage(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("حجم فایل از سقف امن یک مگابایت بیشتر است.");
      event.target.value = "";
      return;
    }
    setFileName(file.name);
    setCsvText(await file.text());
    setError(null);
  }

  async function previewCsv(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setPreview(null);
    setCommitMessage(null);
    if (demoMode) {
      try { setPreview(buildSandboxPreview(csvText)); } catch { setError("ساختار CSV آزمایشی معتبر نیست؛ دادهٔ نمونه را دوباره بارگذاری کن."); }
      finally { setLoading(false); }
      return;
    }
    try {
      const response = await fetch("/api/operator/csv", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-asha-operator-request": "preview",
        },
        body: JSON.stringify({ action: "preview", fileName, sourceId: SOURCE_ID, text: csvText }),
      });
      const result = await response.json() as PreviewResult | FailureResult;
      if (!response.ok || !result.ok) {
        const failure = result as FailureResult;
        setError(errorLabels[failure.code ?? ""] ?? "پیش‌نمایش با حالت امن متوقف شد؛ ساختار فایل را بررسی کن.");
        return;
      }
      setPreview(result);
    } catch {
      setError("ارتباط با مسیر محلی ورود داده برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function commitCsv() {
    let activePreview = preview;
    if (demoMode && !activePreview) {
      try { activePreview = buildSandboxPreview(csvText); }
      catch { setError("ساختار CSV آزمایشی معتبر نیست؛ دادهٔ نمونه را دوباره بارگذاری کن."); return; }
    }
    if (!activePreview?.persistence.available) return;
    if (!preview && demoMode) setPreview(activePreview);
    setLoading(true);
    setError(null);
    setCommitMessage(null);
    if (demoMode) {
      setCommitMessage(`${activePreview.counts.accepted.toLocaleString("fa-IR")} مشاهدهٔ ساختگی و ${activePreview.counts.quarantined.toLocaleString("fa-IR")} رکورد قرنطینه در حافظهٔ آزمایشگاه ثبت شد؛ هیچ داده‌ای به سرور ارسال نشد.`);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/operator/csv", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-asha-operator-request": "commit",
        },
        body: JSON.stringify({ action: "commit", fileName, sourceId: SOURCE_ID, text: csvText }),
      });
      const result = await response.json() as CommitResult | FailureResult;
      if (!response.ok || !result.ok) {
        const failure = result as FailureResult;
        setError(errorLabels[failure.code ?? ""] ?? "ثبت داده با حالت امن متوقف شد.");
        return;
      }

      const persisted = (result as CommitResult).persistence.result;
      setCommitMessage(persisted.alreadyProcessed
        ? "این دسته قبلاً ثبت شده بود؛ عملیات تکراری بدون تغییر پایان یافت."
        : `${persisted.insertedObservations.toLocaleString("fa-IR")} مشاهده و ${persisted.insertedQuarantineRecords.toLocaleString("fa-IR")} رکورد قرنطینه در یک تراکنش ثبت شد.`);
    } catch {
      setError("ارتباط با PostgreSQL محلی برقرار نشد؛ هیچ ثبت ناقصی انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  function resetTemplate() {
    setFileName(demoMode ? "asha-sandbox-observations.csv" : "phase1-observations.csv");
    setCsvText(demoMode ? SANDBOX_TEMPLATE : EMPTY_TEMPLATE);
    setPreview(null);
    setError(null);
    setCommitMessage(null);
  }

  if (!demoMode && isLoopback !== true) {
    return (
      <section className="panel operator-import" aria-labelledby="operator-import-title">
        <div className="panel-head operator-import-head">
          <div className="section-title">
            <span>LOCAL DATA OPERATOR</span>
            <h2 id="operator-import-title">ورود امن CSV</h2>
            <p>{isLoopback === null ? "در حال بررسی محیط اپراتور…" : "این ابزار عمداً فقط روی نسخهٔ محلی Asha فعال است و از سایت عمومی داده دریافت نمی‌کند."}</p>
          </div>
          <span className="status-chip warning">فقط محیط محلی</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel operator-import" aria-labelledby="operator-import-title">
      <div className="panel-head operator-import-head">
        <div className="section-title">
          <span>LOCAL DATA OPERATOR</span>
          <h2 id="operator-import-title">{demoMode ? "آزمایش کامل ورود CSV" : "ورود امن CSV"}</h2>
          <p>{demoMode ? "نمونهٔ آماده را اعتبارسنجی و در حافظهٔ ساختگی ثبت کن تا مسیر پذیرفته، تکراری و قرنطینه را کامل ببینی." : "فایل فقط در همین نشست محلی پیش‌نمایش می‌شود؛ هیچ ردیفی پیش از اتصال PostgreSQL ذخیره نمی‌شود."}</p>
        </div>
        <span className={`status-chip ${demoMode || preview?.persistence.available ? "fresh" : "warning"}`}>
          {demoMode ? "ذخیرهٔ آزمایشی فعال" : preview?.persistence.available ? "PostgreSQL آماده" : "ذخیره‌سازی قفل است"}
        </span>
      </div>

      <form onSubmit={previewCsv} className="operator-form">
        <div className="operator-file-row">
          <label className="operator-file-button" htmlFor="operator-csv-file">انتخاب فایل CSV</label>
          <input id="operator-csv-file" type="file" accept=".csv,text/csv" onChange={selectFile} />
          <span>{fileName}</span>
          <button type="button" className="text-button" onClick={resetTemplate}>{demoMode ? "بارگذاری دوبارهٔ نمونه" : "قالب خالی"}</button>
        </div>
        <label htmlFor="operator-csv-text">محتوای CSV</label>
        <textarea
          id="operator-csv-text"
          value={csvText}
          onChange={(event) => { setCsvText(event.target.value); setPreview(null); setCommitMessage(null); }}
          spellCheck={false}
          dir="ltr"
          rows={7}
          aria-describedby="operator-csv-help"
        />
        <p id="operator-csv-help" className="field-help">منبع ثابت: <b>{demoMode ? "asha-sandbox" : SOURCE_ID}</b> · سقف فایل: ۱ مگابایت · زمان‌ها: UTC ISO-8601 · مقادیر: رشتهٔ ده‌دهی مثبت</p>
        <div className="operator-actions">
          <button type="submit" className="primary-button" disabled={loading || csvText.trim() === EMPTY_TEMPLATE.trim()}>{loading ? "در حال اعتبارسنجی…" : "پیش‌نمایش و اعتبارسنجی"}</button>
          <button
            type="button"
            className="ghost-button"
            disabled={loading || (!demoMode && !preview?.persistence.available)}
            title={preview?.persistence.available ? "ثبت اتمیک دستهٔ اعتبارسنجی‌شده" : "پس از اتصال و فعال‌سازی صریح PostgreSQL در محیط محلی فعال می‌شود"}
            onClick={commitCsv}
          >
            {loading ? "در حال انجام…" : demoMode ? "ثبت آزمایشی" : "ثبت در PostgreSQL"}
          </button>
        </div>
      </form>

      <div className="operator-feedback" aria-live="polite">
        {error && <div className="feed-error">{error}</div>}
        {commitMessage && <div className="feed-success">{commitMessage}</div>}
        {preview && <>
          <div className="operator-counts" data-testid="csv-preview-counts">
            <article><small>کل ردیف‌ها</small><strong>{preview.counts.total.toLocaleString("fa-IR")}</strong></article>
            <article className="accepted"><small>پذیرفته</small><strong>{preview.counts.accepted.toLocaleString("fa-IR")}</strong></article>
            <article className="duplicate"><small>تکراری</small><strong>{preview.counts.duplicates.toLocaleString("fa-IR")}</strong></article>
            <article className="quarantined"><small>قرنطینه</small><strong>{preview.counts.quarantined.toLocaleString("fa-IR")}</strong></article>
          </div>
          <div className="operator-preview-grid">
            <div><h3>ردیف‌های پذیرفته‌شده</h3>{preview.accepted.length ? preview.accepted.slice(0, 8).map((row, index) => <p key={`${row.instrumentCode}-${row.observedAt}-${index}`}><b>{row.instrumentCode}</b><span>{row.value} {row.currency} / {row.unit}</span></p>) : <small>ردیف پذیرفته‌شده‌ای نیست.</small>}</div>
            <div><h3>قرنطینه و تکرار</h3>{preview.quarantined.map((row) => <p key={`q-${row.rowNumber}`}><b>ردیف {row.rowNumber.toLocaleString("fa-IR")}</b><span>{row.issues.map((issue) => `${issue.field}: ${issue.code}`).join(" · ")}</span></p>)}{preview.duplicates.map((row) => <p key={`d-${row.rowNumber}`}><b>ردیف {row.rowNumber.toLocaleString("fa-IR")}</b><span>duplicate</span></p>)}{!preview.quarantined.length && !preview.duplicates.length && <small>خطا یا تکراری وجود ندارد.</small>}</div>
          </div>
          <p className="operator-batch-id">شناسهٔ پیش‌نمایش: <code>{preview.batchId.slice(0, 22)}…</code></p>
          <p className="field-help">{demoMode ? "مسیر آزمایشی فعال است؛ ثبت فقط در حافظهٔ همین تجربه انجام می‌شود." : preview.persistence.available ? "مسیر ثبت محلی آماده است؛ فقط همین دستهٔ اعتبارسنجی‌شده ثبت می‌شود." : "PostgreSQL محلی هنوز آماده نیست؛ پیش‌نمایش فقط‌خواندنی باقی می‌ماند."}</p>
        </>}
      </div>
    </section>
  );
}
