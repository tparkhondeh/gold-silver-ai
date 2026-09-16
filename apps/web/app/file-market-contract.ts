import { createMarketTestPortfolio, evaluateQuotedTestPositions, navasanRawRial, validateMarketTestPortfolio, type MarketTestPortfolio } from "./market-test-contract.ts";
import { withSnapshotLock, writeReviewedSnapshot, type SnapshotLocks } from "./browser-snapshot-storage.ts";

// The vendor confirms TXT, not its column layout/encoding or this sample schema.
// No checkbox, caller-supplied license string or file name can open this gate.
export const RAHAVARD_FILE_REVIEW = Object.freeze({
  version: "asha.rahavard_export_review.v1", state: "blocked_pending_access_permission_and_sample",
  officialFormat: "TXT", officialPage: "https://rahavard365.com/dataexport",
  columns: null, encoding: null, symbolMapping: null, retention: null,
  realImportEnabled: false,
} as const);
export const FILE_TEST_VERSION = "asha.file_market_test.v1";
export const FILE_TEST_STORAGE = "asha-synthetic-file-market-test-v1";
export const FILE_PROFILE_VERSION = "asha.synthetic_txt_profile.v1";
export const MAX_FILE_BYTES = 4096;
export const SYNTHETIC_FILE = `# ASHA_SYNTHETIC_TXT_V1
symbol,price,currency,unit,purity_permille,published_at
TEST_GOLD,100,TOMAN,gram,750,2000-01-01T12:00:00.000Z
TEST_COIN,2000,IRR,unit,,2000-01-01T12:00:00.000Z
TEST_SILVER,20,TOMAN,gram,999,2000-01-01T12:00:00.000Z
`;
const header = "symbol,price,currency,unit,purity_permille,published_at";
const mappings = Object.freeze({
  TEST_GOLD: { instrumentCode: "GOLD_18K_IRR", unit: "gram", purity: "750" },
  TEST_COIN: { instrumentCode: "EMAMI_COIN_IRR", unit: "unit", purity: "" },
  TEST_SILVER: { instrumentCode: "SILVER_999_IRR", unit: "gram", purity: "999" },
});
export type FileObservation = {
  source: "asha-synthetic-file"; providerSymbol: string; instrumentCode: string;
  rawValue: string; rawCurrency: "IRR" | "TOMAN"; unit: string;
  purityPermille: number | null; priceRial: string; publishedAt: string | null; line: number;
};
export type FileSnapshot = {
  version: "asha.file_snapshot.v1"; datasetKind: "synthetic_fixture";
  profileVersion: typeof FILE_PROFILE_VERSION; sourceText: string; fileSha256: string;
  fileBytes: number; receivedAt: string; observations: FileObservation[];
};
export type FileTestPortfolio = { version: typeof FILE_TEST_VERSION; inputs: MarketTestPortfolio; file: FileSnapshot | null };
type LocalStorage = Pick<Storage, "getItem" | "setItem">;

function fail(message: string): never { throw new Error(message); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("ساختار فایل یا نسخه ذخیره ناسازگار است؛ نسخه قبلی حفظ شد.");
}
function instant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("زمان باید صریح و معتبر باشد؛ تاریخ یا منطقه زمانی حدس زده نمی‌شود.");
  return Date.parse(value as string);
}
export function assertFileImportMode(mode: string) {
  if (mode !== "synthetic_fixture") fail("ورود واقعی رهاورد مسدود است: دسترسی تازه، مجوز و قالب نمونه رسمی باید بررسی شوند. فایل واقعی را ساختگی معرفی نکنید.");
}
export function parseSyntheticFileText(text: string): FileObservation[] {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_FILE_BYTES) fail("فایل بیش از سقف ۴ کیلوبایت است.");
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (lines[0] !== "# ASHA_SYNTHETIC_TXT_V1" || lines[1] !== header) fail("این قالب فقط نمونه ساختگی پروژه است، نه خروجی تأییدشده رهاورد. سرستون‌ها نباید حدس زده شوند.");
  if (lines.length < 3 || lines.length > 5) fail("فقط یک تا سه قیمتِ یک تصویر مجاز است؛ ورود تاریخچه یا ردیف خالی پشتیبانی نمی‌شود.");
  const seen = new Set<string>();
  return lines.slice(2).map((line, index) => {
    const cells = line.split(",");
    if (cells.length !== 6) fail(`ردیف ${index + 3}: تعداد ستون ناسازگار است؛ فایل پذیرفته نشد.`);
    const [symbol, rawValue, rawCurrency, unit, purity, publishedAt] = cells;
    if (!Object.hasOwn(mappings, symbol)) fail(`ردیف ${index + 3}: نماد پشتیبانی نمی‌شود؛ نام دارایی جایگزین نشد.`);
    const mapping = mappings[symbol as keyof typeof mappings];
    if (seen.has(symbol)) fail("نماد تکراری/تاریخچه یا اختلاف قیمت وجود دارد؛ هیچ ردیفی خودکار انتخاب نشد.");
    seen.add(symbol);
    if (unit !== mapping.unit || purity !== mapping.purity) fail("واحد مقدار یا عیار با قرارداد صریح دارایی تطبیق ندارد.");
    if (rawCurrency !== "IRR" && rawCurrency !== "TOMAN") fail("ریال/تومان مشخص نیست؛ تبدیل خودکار حدسی انجام نشد.");
    if (publishedAt) instant(publishedAt);
    // Reuse the existing exact decimal-to-rial arithmetic with explicit scale=1.
    const priceRial = navasanRawRial(rawValue, rawCurrency, 1);
    if (priceRial.length > 18) fail("مبلغ از سقف محاسبات قرارداد بیشتر است.");
    return { source: "asha-synthetic-file", providerSymbol: symbol, instrumentCode: mapping.instrumentCode,
      rawValue, rawCurrency, unit, purityPermille: purity ? Number(purity) : null, priceRial,
      publishedAt: publishedAt || null, line: index + 3 };
  });
}
async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)), b => b.toString(16).padStart(2, "0")).join("");
}
export async function readFileSnapshot(bytes: Uint8Array, receivedAt: string, mode = "synthetic_fixture"): Promise<FileSnapshot> {
  assertFileImportMode(mode); instant(receivedAt);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_FILE_BYTES) fail("فایل بیش از سقف ۴ کیلوبایت است.");
  let sourceText: string;
  try { sourceText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return fail("کدگذاری فایل UTF-8 نیست؛ تبدیل حدسی یا حذف نویسه انجام نشد."); }
  const observations = parseSyntheticFileText(sourceText);
  return { version: "asha.file_snapshot.v1", datasetKind: "synthetic_fixture", profileVersion: FILE_PROFILE_VERSION,
    sourceText, fileSha256: await digest(bytes), fileBytes: bytes.byteLength, receivedAt, observations };
}
export function createFileTestPortfolio(): FileTestPortfolio {
  return { version: FILE_TEST_VERSION, inputs: createMarketTestPortfolio(), file: null };
}
export function evaluateFileTest(portfolio: FileTestPortfolio, nowMs: number) {
  exactKeys(portfolio, ["version", "inputs", "file"]);
  if (portfolio.version !== FILE_TEST_VERSION || !Number.isFinite(nowMs)) fail("نسخه یا زمان ارزیابی نامعتبر است.");
  validateMarketTestPortfolio(portfolio.inputs, nowMs);
  if (portfolio.inputs.snapshot !== null) fail("خوراک بازار واقعی با آزمون فایل ساختگی قابل اختلاط نیست.");
  if (portfolio.file !== null) {
    const file = portfolio.file;
    exactKeys(file, ["version", "datasetKind", "profileVersion", "sourceText", "fileSha256", "fileBytes", "receivedAt", "observations"]);
    if (file.version !== "asha.file_snapshot.v1" || file.datasetKind !== "synthetic_fixture" || file.profileVersion !== FILE_PROFILE_VERSION || !/^[a-f0-9]{64}$/.test(file.fileSha256) || new TextEncoder().encode(file.sourceText).length !== file.fileBytes) fail("منشأ، نوع یا اندازه فایل ناسازگار است.");
    const received = instant(file.receivedAt);
    if (received > nowMs + 300_000) fail("زمان دریافت در آینده است.");
    const parsed = parseSyntheticFileText(file.sourceText);
    if (canonical(parsed) !== canonical(file.observations)) fail("قیمت/واحد/زمان با متن اصلی فایل تطبیق ندارد.");
    if (parsed.some(q => q.publishedAt !== null && instant(q.publishedAt) > received + 300_000)) fail("زمان قیمت با زمان دریافت ناسازگار است.");
  }
  return evaluateQuotedTestPositions(portfolio.inputs, portfolio.file?.observations ?? [], nowMs);
}
export async function encodeFileTest(portfolio: FileTestPortfolio, nowMs: number) {
  const result = evaluateFileTest(portfolio, nowMs);
  if (portfolio.file && await digest(new TextEncoder().encode(portfolio.file.sourceText)) !== portfolio.file.fileSha256) fail("اثر انگشت فایل با اصل آن برابر نیست.");
  return canonical({ version: "asha.file_test_document.v1", evaluatedAt: new Date(nowMs).toISOString(), portfolio, result });
}
export async function decodeFileTest(text: string, nowMs: number): Promise<FileTestPortfolio> {
  if (typeof text !== "string" || text.length > 30_000) fail("نسخه ذخیره بیش از سقف مجاز است.");
  const document: unknown = JSON.parse(text);
  exactKeys(document, ["version", "evaluatedAt", "portfolio", "result"]);
  if (document.version !== "asha.file_test_document.v1" || canonical(document) !== text || instant(document.evaluatedAt) > nowMs + 300_000) fail("نسخه ذخیره ناشناخته، تکراری یا غیرمعتبر است.");
  const portfolio = document.portfolio as FileTestPortfolio;
  if (await encodeFileTest(portfolio, instant(document.evaluatedAt)) !== text) fail("نتیجه ذخیره با محاسبه برابر نیست.");
  evaluateFileTest(portfolio, nowMs); return portfolio;
}
export async function saveFileTest(storage: LocalStorage, portfolio: FileTestPortfolio, nowMs: number, expectedRaw: string | null, locks?: SnapshotLocks) {
  // Validate before the sole write. Detect intervening writes; never clear corrupt storage.
  const text = await encodeFileTest(portfolio, nowMs);
  return withSnapshotLock(FILE_TEST_STORAGE, async () => {
    if (expectedRaw !== null) await decodeFileTest(expectedRaw, nowMs);
    return writeReviewedSnapshot(storage, FILE_TEST_STORAGE, text, expectedRaw, () => { /* Validated above inside the lock. */ });
  }, locks);
}
export async function restoreFileTest(storage: LocalStorage, nowMs: number) {
  const raw = storage.getItem(FILE_TEST_STORAGE);
  return { raw, portfolio: raw === null ? null : await decodeFileTest(raw, nowMs) };
}
