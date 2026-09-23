import { emptyPurchaseBook, validatePurchaseBook, type PurchaseBook } from "./purchase-book.ts";

export const EVALUATION_STORAGE_KEY = "asha.public-evaluation.v1";
export const EVALUATION_DOCUMENT_VERSION = "asha.public_evaluation.v1";
export const EVALUATION_MAX_BYTES = 2 * 1024 * 1024;
export type EvaluationDocument = { version: typeof EVALUATION_DOCUMENT_VERSION; revision: number; book: PurchaseBook };
export type EvaluationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type EvaluationState = { raw: string | null; document: EvaluationDocument | null };

export class EvaluationStorageError extends Error {
  readonly reason: "invalid" | "conflict" | "unavailable";
  constructor(reason: EvaluationStorageError["reason"]) {
    super(reason === "invalid" ? "اطلاعات آزمایشی معتبر یا در محدودهٔ مجاز نیست؛ ثبت نشد."
      : reason === "conflict" ? "نسخهٔ این برگه تغییر کرده است؛ ورودی حفظ شد. ابتدا نسخهٔ ذخیره‌شده را بررسی کن."
        : "ذخیره در این برگه تأیید نشد؛ ورودی حفظ شد. وضعیت ذخیره را بررسی کن یا صریحاً فقط در حافظه ادامه بده.");
    this.name = "EvaluationStorageError"; this.reason = reason;
  }
}
export function emptyEvaluationDocument(): EvaluationDocument {
  return { version: EVALUATION_DOCUMENT_VERSION, revision: 0, book: emptyPurchaseBook() };
}
export function decodeEvaluationDocument(raw: string): EvaluationDocument {
  try {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > EVALUATION_MAX_BYTES) throw Error();
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "book,revision,version"
      || value.version !== EVALUATION_DOCUMENT_VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error();
    return { version: EVALUATION_DOCUMENT_VERSION, revision: value.revision, book: validatePurchaseBook(value.book) };
  } catch { throw new EvaluationStorageError("invalid"); }
}
export function encodeEvaluationDocument(document: EvaluationDocument): string {
  try {
    const raw = JSON.stringify(document);
    return JSON.stringify(decodeEvaluationDocument(raw));
  } catch { throw new EvaluationStorageError("invalid"); }
}
function read(storage: EvaluationStorage): string | null {
  try { return storage.getItem(EVALUATION_STORAGE_KEY); }
  catch { throw new EvaluationStorageError("unavailable"); }
}
/** Inspect only this tab's dedicated evaluation entry. Corrupt bytes stay intact. */
export function readEvaluationState(storage: EvaluationStorage): EvaluationState {
  const raw = read(storage);
  if (raw === null) return { raw, document: emptyEvaluationDocument() };
  try { return { raw, document: decodeEvaluationDocument(raw) }; }
  catch { return { raw, document: null }; }
}
export function saveEvaluationBook(storage: EvaluationStorage, expectedRaw: string | null, book: PurchaseBook): EvaluationState {
  let document: EvaluationDocument;
  try {
    const previous = expectedRaw === null ? emptyEvaluationDocument() : decodeEvaluationDocument(expectedRaw);
    document = { version: EVALUATION_DOCUMENT_VERSION, revision: previous.revision + 1, book: validatePurchaseBook(book) };
  } catch { throw new EvaluationStorageError("invalid"); }
  const raw = encodeEvaluationDocument(document);
  if (read(storage) !== expectedRaw) throw new EvaluationStorageError("conflict");
  try { storage.setItem(EVALUATION_STORAGE_KEY, raw); }
  catch { throw new EvaluationStorageError("unavailable"); }
  if (read(storage) !== raw) throw new EvaluationStorageError("conflict");
  return { raw, document: decodeEvaluationDocument(raw) };
}
/** Called only after explicit confirmation; never touches any other entry. */
export function clearEvaluationState(storage: EvaluationStorage, expectedRaw: string | null): EvaluationState {
  if (read(storage) !== expectedRaw) throw new EvaluationStorageError("conflict");
  try { storage.removeItem(EVALUATION_STORAGE_KEY); }
  catch { throw new EvaluationStorageError("unavailable"); }
  if (read(storage) !== null) throw new EvaluationStorageError("conflict");
  return { raw: null, document: emptyEvaluationDocument() };
}
