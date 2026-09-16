import { BlobReader, ZipReader } from "@zip.js/zip.js/index-native.js";
import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { canonicalPurchaseDecimal, MAX_PURCHASE_LOTS, PURCHASE_DATE_CALENDAR, PURCHASE_TIME_ZONE, validatePurchaseBook, validatePurchaseLot, type PurchaseBook, type PurchaseLot } from "./purchase-book.ts";
import { PURCHASE_IMPORT_COLUMNS, PURCHASE_IMPORT_SHEET, PURCHASE_IMPORT_VERSION } from "./purchase-import-schema.ts";
export { PURCHASE_IMPORT_COLUMNS, PURCHASE_IMPORT_SHEET, PURCHASE_IMPORT_VERSION } from "./purchase-import-schema.ts";

export const PURCHASE_IMPORT_LIMITS = Object.freeze({ compressedBytes: 2 * 1024 * 1024, expandedBytes: 16 * 1024 * 1024, entryBytes: 4 * 1024 * 1024, entries: 128, rows: 500, cells: 40000, textLength: 4000 });
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
type Cell = { value: string; numeric: boolean };
export type PurchaseImportRow = { rowNumber: number; lot: PurchaseLot | null; errors: string[]; warnings: string[] };
export type PurchaseImportPreview = { version: typeof PURCHASE_IMPORT_VERSION; fileSha256: string; importedAt: string; rows: PurchaseImportRow[]; lots: PurchaseLot[]; errors: string[]; warnings: string[]; canImport: boolean };
const prepared = new WeakMap<PurchaseImportPreview, { preview: string; base: string; lots: PurchaseLot[]; hash: string; importedAt: string }>();
function fail(message: string): never { throw new Error(message); }
function elements(parent: Document | Element, namespace: string, local: string): Element[] { return Array.from(parent.getElementsByTagNameNS(namespace, local)); }
function direct(parent: Element, local: string): Element[] { return Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1 && node.namespaceURI === NS && node.localName === local); }
function one(parent: Element, local: string): Element | undefined { const found = direct(parent, local); if (found.length > 1) fail("ساختار سلول یا برگه تکراری و مبهم است."); return found[0]; }

function parseXml(text: string): Document {
  // Never resolve DTDs/entities, processing instructions or executable workbook content.
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(text)) fail("تعریف موجودیت یا دستور خارجی در فایل مجاز نیست.");
  let document: Document;
  try { document = new DOMParser({ onError: () => { fail("ساختار XML فایل معتبر نیست."); } }).parseFromString(text, "application/xml"); }
  catch { fail("ساختار XML فایل معتبر نیست."); }
  const all = Array.from(document.getElementsByTagName("*"));
  if (all.length > 100000) fail("ساختار فایل بیش از حد بزرگ است.");
  for (const node of all) {
    if (["f", "formula", "calculatedColumnFormula", "totalsRowFormula", "oleObject", "externalReference"].includes(node.localName ?? "")) fail("فایل دارای فرمول سلولی یا محتوای فعال است؛ فقط مقدار ثابت پذیرفته می‌شود.");
    if (["formula1", "formula2", "definedName"].includes(node.localName ?? "")) {
      // Dropdown metadata may name a local range/list, but not call a function,
      // refer to another workbook, or smuggle an external formula without a .rels.
      const value = (node.textContent ?? "").trim().replace(/^=/, "");
      const localRange = /^(?:'(?:[^'[\]]|'')+'|[\p{L}\p{N}_ ]+)!\$?[A-Z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Z]{1,3}\$?[1-9]\d{0,6})?$/u;
      const literal = /^"[^"[\]]*"$/;
      const nameOrNumber = /^(?:[\p{L}_][\p{L}\p{N}_.]*|\d+(?:\.\d+)?)$/u;
      if (!(localRange.test(value) || (node.localName !== "definedName" && (literal.test(value) || nameOrNumber.test(value))))) fail("فهرست انتخاب باید مقدار ثابت یا محدودهٔ داخلی باشد؛ فرمول خارجی مجاز نیست.");
    }
    let depth = 0; let ancestor = node.parentNode;
    while (ancestor) { if (++depth > 64) fail("ساختار تو در توی فایل بیش از حد بزرگ است."); ancestor = ancestor.parentNode; }
  }
  return document;
}

function unsafePathCharacters(path: string): boolean { return /[\\:%?#]/.test(path) || [...path].some((char) => char.charCodeAt(0) <= 31); }
function safeEntryPath(path: string): boolean { return path.length <= 200 && !unsafePathCharacters(path) && !path.startsWith("/") && path.split("/").every((part) => part !== "." && part !== ".."); }
function relationshipPath(base: string, target: string): string {
  if (!target || unsafePathCharacters(target)) fail("پیوند خارجی یا مسیر مبهم در فایل مجاز نیست.");
  const parts = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") { if (!parts.length) fail("مسیر پیوند از فایل خارج می‌شود."); parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  const result = parts.join("/"); if (!safeEntryPath(result)) fail("مسیر پیوند معتبر نیست."); return result;
}

async function unpack(file: Blob): Promise<Map<string, Document>> {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false, useCompressionStream: true, strictness: "strict", checkCrc32: true, checkOverlappingEntry: true });
  const documents = new Map<string, Document>();
  const names = new Set<string>(); let declared = 0; let actual = 0; let count = 0;
  try {
    const entries = [];
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > PURCHASE_IMPORT_LIMITS.entries) fail("تعداد بخش‌های فایل بیش از حد مجاز است.");
      const key = entry.filename.normalize("NFC").toLowerCase();
      if (!safeEntryPath(entry.filename) || names.has(key) || entry.encrypted || entry.symlink) fail("ساختار فشردهٔ فایل رمزدار، تکراری یا نامعتبر است.");
      names.add(key);
      if (entry.directory) continue;
      if (!/\.(?:xml|rels)$/.test(entry.filename) || /(?:vba|macro|externalLinks|activeX|embeddings)/i.test(entry.filename)) fail("فایل دارای ماکرو یا بخش پشتیبانی‌نشده است.");
      if (![0, 8].includes(entry.compressionMethod) || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > PURCHASE_IMPORT_LIMITS.entryBytes) fail("اندازه یا روش فشرده‌سازی فایل پشتیبانی نمی‌شود.");
      declared += entry.uncompressedSize;
      if (declared > PURCHASE_IMPORT_LIMITS.expandedBytes) fail("اندازهٔ بازشدهٔ فایل بیش از حد مجاز است.");
      entries.push(entry);
    }
    for (const entry of entries) {
      const chunks: Uint8Array[] = []; let size = 0;
      await entry.getData(new WritableStream<Uint8Array>({ write(chunk) {
        size += chunk.length; actual += chunk.length;
        if (size > PURCHASE_IMPORT_LIMITS.entryBytes || size > entry.uncompressedSize || actual > PURCHASE_IMPORT_LIMITS.expandedBytes) fail("اندازهٔ واقعی فایل بیش از حد مجاز است.");
        chunks.push(chunk.slice());
      } }), { checkCrc32: true, strictness: "strict" });
      if (size !== entry.uncompressedSize) fail("اندازهٔ فایل با فهرست آن سازگار نیست.");
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/^\s*<\?xml[^?]*encoding\s*=\s*['"](?!utf-8['"])[^'"]+['"]/i.test(text)) fail("فقط XML با کدگذاری UTF-8 پشتیبانی می‌شود.");
      documents.set(entry.filename, parseXml(text));
    }
  } catch (error) {
    if (error instanceof Error && /[\u0600-\u06ff]/.test(error.message)) throw error;
    fail("فایل Excel خراب، رمزدار یا دارای ساختار ناامن است.");
  } finally { await reader.close(); }
  return documents;
}

function getDocument(documents: Map<string, Document>, path: string): Document { const document = documents.get(path); if (!document) fail("بخش ضروری قالب Excel پیدا نشد."); return document; }
function checkPackage(documents: Map<string, Document>): void {
  const types = getDocument(documents, "[Content_Types].xml");
  const all = Array.from(types.getElementsByTagName("*"));
  if (all.some((node) => /macro|vba|oleObject|activeX|externalLink/i.test(node.getAttribute("ContentType") ?? ""))) fail("ماکرو و پیوند خارجی در فایل مجاز نیست.");
  const defaults = new Map<string, string>(); const overrides = new Map<string, string>();
  for (const node of all.slice(1)) {
    const target = node.localName === "Default" ? defaults : node.localName === "Override" ? overrides : null;
    const key = node.getAttribute(node.localName === "Default" ? "Extension" : "PartName");
    if (!target || !key || target.has(key) || node.parentNode !== types.documentElement) fail("نوع بخش‌های فایل مبهم یا تکراری است.");
    target.set(key, node.getAttribute("ContentType") ?? "");
  }
  if ((overrides.get("/xl/workbook.xml") ?? defaults.get("xml")) !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml") fail("فایل باید قالب معمولی XLSX باشد.");
  for (const [path, document] of documents) {
    if (!path.endsWith(".rels")) continue;
    if (document.documentElement?.namespaceURI !== REL || document.documentElement?.localName !== "Relationships") fail("ساختار پیوندهای فایل معتبر نیست.");
    const base = path === "_rels/.rels" ? "" : path.replace(/_rels\/([^/]+)\.rels$/, "$1");
    const ids = new Set<string>();
    for (const relation of elements(document, REL, "Relationship")) {
      const id = relation.getAttribute("Id");
      if (!id || ids.has(id) || relation.parentNode !== document.documentElement) fail("شناسه یا ساختار پیوند داخلی تکراری و مبهم است.");
      ids.add(id);
      if (relation.getAttribute("TargetMode") && relation.getAttribute("TargetMode") !== "Internal") fail("پیوند خارجی در فایل مجاز نیست.");
      const target = relationshipPath(base, relation.getAttribute("Target") ?? "");
      if (!documents.has(target)) fail("پیوند داخلی فایل ناقص است.");
    }
  }
  const main = elements(getDocument(documents, "_rels/.rels"), REL, "Relationship").filter((node) => node.getAttribute("Type") === `${DOC_REL}/officeDocument`);
  if (main.length !== 1 || relationshipPath("", main[0].getAttribute("Target") ?? "") !== "xl/workbook.xml") fail("پیوند اصلی قالب Excel معتبر نیست.");
}

function readSharedStrings(documents: Map<string, Document>): string[] {
  const document = documents.get("xl/sharedStrings.xml"); if (!document) return [];
  const items = elements(document, NS, "si");
  if (items.length > PURCHASE_IMPORT_LIMITS.cells) fail("تعداد متن‌های فایل بیش از حد مجاز است.");
  return items.map((item) => {
    const text = elements(item, NS, "t").map((node) => node.textContent ?? "").join("");
    if (text.length > PURCHASE_IMPORT_LIMITS.textLength) fail("متن یک سلول بیش از حد مجاز است."); return text;
  });
}
function cellValue(cell: Element, shared: string[]): Cell {
  const kind = cell.getAttribute("t") || "n"; const value = one(cell, "v"); const inline = one(cell, "is");
  if (value && inline) fail("دو مقدار در یک سلول مجاز نیست.");
  if ((kind === "inlineStr" && value) || (kind !== "inlineStr" && inline)
    || Array.from(cell.childNodes).some((node) => node.nodeType === 1 && (node.namespaceURI !== NS || !["v", "is"].includes(node.localName ?? "")))
    || (value && Array.from(value.childNodes).some((node) => node.nodeType === 1))) fail("نوع سلول با مقدار آن سازگار نیست؛ مقدار مفقود فرض نشد.");
  let text = value?.textContent ?? "";
  if (kind === "s") {
    if (!/^(0|[1-9]\d{0,5})$/.test(text) || Number(text) >= shared.length) fail("ارجاع متن سلول معتبر نیست."); text = shared[Number(text)];
  } else if (kind === "inlineStr") text = inline ? elements(inline, NS, "t").map((node) => node.textContent ?? "").join("") : "";
  else if (!["n", "str", "d"].includes(kind)) fail("سلول خطا، منطقی یا نوع پشتیبانی‌نشده دارد.");
  if (text.length > PURCHASE_IMPORT_LIMITS.textLength) fail("متن یک سلول بیش از حد مجاز است.");
  return { value: text.trim(), numeric: kind === "n" && text.trim() !== "" };
}

function readRows(document: Document, shared: string[]): Map<number, Map<number, Cell>> {
  if (document.documentElement?.namespaceURI !== NS || document.documentElement?.localName !== "worksheet") fail("برگهٔ خرید معتبر نیست.");
  const data = elements(document, NS, "sheetData"); if (data.length !== 1) fail("جدول خریدها پیدا نشد یا تکراری است.");
  if (data[0].parentNode !== document.documentElement) fail("جدول خریدها در محل معتبر قرار ندارد.");
  const result = new Map<number, Map<number, Cell>>(); const seenRows = new Set<number>(); let cells = 0;
  for (const row of direct(data[0], "row")) {
    const raw = row.getAttribute("r") ?? "";
    if (!/^[1-9]\d{0,6}$/.test(raw)) fail("شمارهٔ ردیف معتبر نیست."); const number = Number(raw);
    if (seenRows.has(number)) fail("شمارهٔ ردیف تکراری است."); seenRows.add(number);
    const values = new Map<number, Cell>();
    for (const cell of direct(row, "c")) {
      if (++cells > PURCHASE_IMPORT_LIMITS.cells) fail("تعداد سلول‌های فایل بیش از حد مجاز است.");
      const reference = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(cell.getAttribute("r") ?? "");
      if (!reference || Number(reference[2]) !== number) fail("نشانی سلول با ردیف آن سازگار نیست.");
      const column = [...reference[1]].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
      if (values.has(column)) fail("نشانی سلول تکراری است.");
      const value = cellValue(cell, shared);
      if (value.value && column > PURCHASE_IMPORT_COLUMNS.length) fail("ستون اضافه در جدول خریدها وجود دارد.");
      values.set(column, value);
    }
    if ([...values.values()].some((cell) => cell.value)) {
      if (number > 3 && (row.getAttribute("hidden") === "1" || row.getAttribute("hidden") === "true")) fail("خرید در ردیف پنهان مجاز نیست؛ ابتدا ردیف را آشکار کنید.");
      result.set(number, values);
    }
  }
  return result;
}

/** Exact expansion of OOXML numeric notation; no financial value enters Number. */
export function importDecimal(cell: Cell): string {
  let text = cell.value;
  if (cell.numeric && /[eE]/.test(text)) {
    const match = /^(0|[1-9]\d*)(?:\.(\d+))?[eE]([+-]?\d{1,3})$/.exec(text);
    if (!match) fail("عدد علمی سلول معتبر نیست.");
    const exponent = Number(match[3]); const digits = match[1] + (match[2] ?? ""); const point = match[1].length + exponent;
    if (Math.abs(exponent) > 30) fail("عدد سلول خارج از محدوده است.");
    text = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
    text = text.replace(/^0+(?=\d)/, "");
  }
  return canonicalPurchaseDecimal(text);
}
export function importPurchaseDate(cell: Cell): string {
  if (!cell.numeric) return cell.value;
  const serial = importDecimal(cell);
  if (!/^\d{1,7}$/.test(serial) || Number(serial) < 1 || Number(serial) > 2958465 || Number(serial) === 60) fail("تاریخ عددی Excel معتبر نیست؛ تاریخ میلادی روز کامل لازم است.");
  const days = Number(serial);
  return new Date(Date.UTC(1899, 11, 31) + (days > 60 ? days - 1 : days) * 86400000).toISOString().slice(0, 10);
}
function rowLot(row: Map<number, Cell>, importedAt: string): PurchaseLot {
  const cell = (key: typeof PURCHASE_IMPORT_COLUMNS[number]): Cell => row.get(PURCHASE_IMPORT_COLUMNS.indexOf(key) + 1) ?? { value: "", numeric: false };
  const value = (key: typeof PURCHASE_IMPORT_COLUMNS[number]) => cell(key).value;
  const optionalDecimal = (key: "unitPrice" | "fees") => value(key) ? importDecimal(cell(key)) : null;
  if (value("calendar") !== PURCHASE_DATE_CALENDAR || value("timeZone") !== PURCHASE_TIME_ZONE) fail("تقویم باید gregorian و منطقهٔ زمانی Asia/Tehran باشد.");
  if (cell("purchaseTime").numeric) fail("ساعت را به صورت متن HH:mm وارد کنید.");
  const purity = value("purityPermille");
  if (purity && !/^(?:[1-9]\d{0,3})$/.test(purity)) fail("عیار باید عدد صحیح در هزار باشد.");
  const fxKeys = ["fxTomanPerUsd", "fxRateDate", "fxRateType", "fxSource", "fxReceivedAt"] as const;
  const hasFx = fxKeys.some((key) => value(key));
  if (hasFx && fxKeys.filter((key) => key !== "fxReceivedAt").some((key) => !value(key))) fail("نرخ دلار واردشده به تاریخ، نوع نرخ و منبع کامل نیاز دارد.");
  return validatePurchaseLot({ id: value("id"), assetId: value("assetId"), assetClass: value("assetClass"), unit: value("unit"), purityPermille: purity ? Number(purity) : null,
    quantity: importDecimal(cell("quantity")), purchaseDate: importPurchaseDate(cell("purchaseDate")), purchaseTime: value("purchaseTime") || null,
    paymentCurrency: value("paymentCurrency"), unitPrice: optionalDecimal("unitPrice"), fees: optionalDecimal("fees"), note: value("note"), source: { kind: "xlsx", reference: value("sourceReference") || null },
    fx: hasFx ? { tomanPerUsd: importDecimal(cell("fxTomanPerUsd")), rateDate: importPurchaseDate(cell("fxRateDate")), rateType: value("fxRateType"), source: value("fxSource"), receivedAt: value("fxReceivedAt") || importedAt, validity: "user_entered_unverified" } : null });
}
function similarity(lot: PurchaseLot): string { return JSON.stringify([lot.assetId, lot.assetClass, lot.unit, lot.purityPermille, lot.quantity, lot.purchaseDate, lot.purchaseTime, lot.paymentCurrency, lot.unitPrice, lot.fees, lot.fx?.tomanPerUsd ?? null, lot.fx?.rateDate ?? null]); }

/** Browser-local parse only. No upload, storage, provider call or portfolio mutation. */
export async function previewPurchaseWorkbook(file: Blob, currentBook: PurchaseBook, importedAt: string): Promise<PurchaseImportPreview> {
  const book = validatePurchaseBook(currentBook);
  if (!(file instanceof Blob) || file.size < 1 || file.size > PURCHASE_IMPORT_LIMITS.compressedBytes) fail("فایل خالی است یا اندازهٔ آن بیش از ۲ مگابایت است.");
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(importedAt) || !Number.isFinite(Date.parse(importedAt)) || new Date(importedAt).toISOString() !== importedAt) fail("زمان پیش‌نمایش معتبر نیست.");
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (book.imports.some((receipt) => receipt.fileSha256 === hash)) fail("این فایل قبلاً ثبت شده است؛ ورود دوباره انجام نشد.");
  const documents = await unpack(file); checkPackage(documents);
  const workbook = getDocument(documents, "xl/workbook.xml");
  if (workbook.documentElement?.namespaceURI !== NS || workbook.documentElement?.localName !== "workbook") fail("ساختار کتاب Excel معتبر نیست.");
  if (elements(workbook, NS, "workbookPr").some((node) => ![null, "", "0", "false"].includes(node.getAttribute("date1904")))) fail("سامانهٔ تاریخ ۱۹۰۴ پشتیبانی نمی‌شود؛ قالب برنامه با تاریخ ۱۹۰۰ را استفاده کنید.");
  const containers = direct(workbook.documentElement, "sheets"); if (containers.length !== 1) fail("فهرست برگه‌های Excel معتبر نیست.");
  const allSheets = direct(containers[0], "sheet");
  if (new Set(allSheets.map((node) => node.getAttribute("name"))).size !== allSheets.length || new Set(allSheets.map((node) => node.getAttributeNS(DOC_REL, "id"))).size !== allSheets.length) fail("نام یا پیوند برگه تکراری است.");
  const sheets = allSheets.filter((node) => node.getAttribute("name") === PURCHASE_IMPORT_SHEET);
  if (sheets.length !== 1 || (sheets[0].getAttribute("state") && sheets[0].getAttribute("state") !== "visible")) fail("برگهٔ آشکار خریدها پیدا نشد یا تکراری است.");
  const relations = elements(getDocument(documents, "xl/_rels/workbook.xml.rels"), REL, "Relationship");
  const id = sheets[0].getAttributeNS(DOC_REL, "id");
  const matching = relations.filter((node) => node.getAttribute("Id") === id && node.getAttribute("Type") === `${DOC_REL}/worksheet`);
  if (!id || matching.length !== 1) fail("پیوند برگهٔ خریدها معتبر نیست.");
  const sheetPath = relationshipPath("xl/workbook.xml", matching[0].getAttribute("Target") ?? "");
  const rows = readRows(getDocument(documents, sheetPath), readSharedStrings(documents));
  if (rows.get(1)?.get(1)?.value !== PURCHASE_IMPORT_VERSION || PURCHASE_IMPORT_COLUMNS.some((header, i) => rows.get(2)?.get(i + 1)?.value !== header)) fail("نسخه یا عنوان ستون‌های قالب تغییر کرده است؛ قالب فعلی برنامه را بگیرید.");
  const data = [...rows].filter(([number]) => number > 3).sort(([a], [b]) => a - b);
  if (data.length > PURCHASE_IMPORT_LIMITS.rows) fail("فایل بیش از ۵۰۰ خرید دارد.");
  const preview: PurchaseImportPreview = { version: PURCHASE_IMPORT_VERSION, fileSha256: hash, importedAt, rows: [], lots: [], errors: [], warnings: [], canImport: false };
  const ids = new Set(book.lots.map((lot) => lot.id)); const comparable = new Set(book.lots.map(similarity));
  for (const [rowNumber, raw] of data) {
    const row: PurchaseImportRow = { rowNumber, lot: null, errors: [], warnings: [] };
    try {
      row.lot = rowLot(raw, importedAt);
      if (ids.has(row.lot.id)) row.errors.push("شناسهٔ خرید قبلاً در سبد یا همین فایل وجود دارد؛ ثبت کل فایل متوقف است.");
      ids.add(row.lot.id);
      const key = similarity(row.lot);
      if (comparable.has(key)) row.warnings.push("خریدی با محتوای مشابه و شناسهٔ دیگر وجود دارد؛ خودکار حذف نشد، پیش از ثبت بررسی کنید.");
      comparable.add(key);
      if (row.lot.unitPrice === null || row.lot.fees === null) row.warnings.push("قیمت یا هزینه نامعلوم است؛ بهای تمام‌شدهٔ این ردیف کامل نیست.");
      if (row.lot.paymentCurrency !== "USD" && row.lot.fx === null) row.warnings.push("نرخ تاریخی دلار موجود نیست؛ معادل دلاری این خرید نامعلوم می‌ماند.");
      if (row.lot.fx && !raw.get(PURCHASE_IMPORT_COLUMNS.indexOf("fxReceivedAt") + 1)?.value) row.warnings.push("زمان دریافت نرخ دستی، زمان ورود فایل به برنامه ثبت شد؛ این زمان دریافت از تأمین‌کننده نیست.");
      preview.lots.push(row.lot);
    } catch (error) { row.errors.push(error instanceof Error ? error.message : "ردیف خرید معتبر نیست."); }
    preview.rows.push(row);
  }
  if (!data.length) preview.errors.push("برگهٔ خریدها خالی است؛ نمونه‌های برگهٔ دیگر وارد نمی‌شوند.");
  if (book.lots.length + preview.lots.length > MAX_PURCHASE_LOTS || book.imports.length >= 500) preview.errors.push("ظرفیت دفتر خرید پر می‌شود؛ ثبت انجام نشد.");
  preview.canImport = preview.errors.length === 0 && preview.rows.every((row) => row.errors.length === 0);
  if (preview.canImport) prepared.set(preview, { preview: JSON.stringify(preview), base: JSON.stringify(book), lots: structuredClone(preview.lots), hash, importedAt });
  return preview;
}

/** Explicit confirmation returns one complete candidate; the caller owns atomic persistence. */
export function confirmPurchaseImport(preview: PurchaseImportPreview, currentBook: PurchaseBook, confirmed: boolean): PurchaseBook {
  const entry = prepared.get(preview);
  if (confirmed !== true || !entry || JSON.stringify(preview) !== entry.preview) fail("ثبت فقط پس از تأیید پیش‌نمایش معتبر انجام می‌شود.");
  const book = validatePurchaseBook(currentBook);
  if (JSON.stringify(book) !== entry.base) fail("سبد پس از پیش‌نمایش تغییر کرده است؛ فایل را دوباره پیش‌نمایش کنید.");
  return validatePurchaseBook({ ...book, lots: [...book.lots, ...entry.lots], imports: [...book.imports, { fileSha256: entry.hash, importedAt: entry.importedAt, lotIds: entry.lots.map((lot) => lot.id) }] });
}
