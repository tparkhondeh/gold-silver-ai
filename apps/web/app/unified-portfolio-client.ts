import type { PortfolioSnapshot } from "../data/postgres-portfolio-repository.ts";
import { decodePortfolioSnapshot } from "./portfolio-persistence.ts";
import { emptyPurchaseBook } from "./purchase-book.ts";
import { notifyOwnerAccessLost } from "./access-client.ts";

export class PortfolioSaveError extends Error {
  readonly requiresReload: boolean;
  constructor(message: string, requiresReload: boolean) { super(message); this.name = "PortfolioSaveError"; this.requiresReload = requiresReload; }
}
export function portfolioContent(snapshot: PortfolioSnapshot) {
  const checked = decodePortfolioSnapshot(snapshot);
  return { holdings: checked.holdings, preferences: checked.preferences, purchaseBook: checked.purchaseBook ?? emptyPurchaseBook() };
}
// JSONB can reorder properties; equality must not depend on their insertion order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function samePortfolioContent(a: PortfolioSnapshot, b: PortfolioSnapshot) { return canonical(portfolioContent(a)) === canonical(portfolioContent(b)); }

export async function saveUnifiedPortfolio(next: PortfolioSnapshot, request: typeof fetch = fetch): Promise<PortfolioSnapshot> {
  let content: ReturnType<typeof portfolioContent>;
  try { content = portfolioContent(next); }
  catch { throw new PortfolioSaveError("اطلاعات واردشده معتبر نیست؛ مقدارها و محدودیت‌ها را بررسی کن. هیچ درخواستی برای ذخیره ارسال نشد.", false); }
  let response: Response;
  try {
    response = await request("/api/portfolio", { method: "PUT", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Asha-Portfolio-Request": "save", "X-ASHA-Intent": "owner-action" },
      body: JSON.stringify({ expectedVersion: next.version, ...content }), signal: AbortSignal.timeout(10_000) });
  } catch { throw new PortfolioSaveError("نتیجهٔ ذخیره مشخص نیست؛ ورودی حفظ شد. پیش از تکرار، وضعیت ذخیره را بررسی کن.", true); }
  notifyOwnerAccessLost(response);
  if (response.status === 409) throw new PortfolioSaveError("سبد در پنجرهٔ دیگری تغییر کرده است؛ ورودی شما حفظ شد. ابتدا وضعیت ذخیره را بررسی کن.", true);
  if (response.status === 422) throw new PortfolioSaveError("ورودی معتبر نیست؛ ذخیره نشد. اطلاعات فرم را اصلاح کن.", false);
  if (!response.ok) throw new PortfolioSaveError("ذخیره تأیید نشد؛ ورودی حفظ شد. ابتدا وضعیت ذخیره را بررسی کن.", true);
  try {
    const payload = await response.json();
    if (payload.ok !== true) throw new Error();
    const saved = decodePortfolioSnapshot(payload.snapshot);
    if (saved.version !== next.version + 1 || !samePortfolioContent(saved, next)) throw new Error();
    return saved;
  } catch { throw new PortfolioSaveError("پاسخ ذخیره با درخواست تطبیق ندارد؛ پیش از ادامه وضعیت ذخیره را بررسی کن.", true); }
}

export function personalBackup(snapshot: PortfolioSnapshot, exportedAt: string): string {
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("invalid backup time");
  return JSON.stringify({ format: "asha.personal_portfolio_backup.v1", exportedAt, snapshot: decodePortfolioSnapshot(snapshot) }, null, 2);
}
export function decodePersonalBackup(text: string): PortfolioSnapshot {
  if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) throw new Error("فایل پشتیبان بیش از حد بزرگ است.");
  const value = JSON.parse(text);
  if (value?.format !== "asha.personal_portfolio_backup.v1" || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error("قالب پشتیبان معتبر نیست.");
  return decodePortfolioSnapshot(value.snapshot);
}
