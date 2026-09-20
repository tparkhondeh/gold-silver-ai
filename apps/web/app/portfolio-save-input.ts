import type { PortfolioHolding, PortfolioPreferences } from "../data/postgres-portfolio-repository.ts";
import { portfolioPreferenceLimits, validPortfolioAmount, validPortfolioCost, validPortfolioPreference } from "../data/portfolio-numeric-contract.ts";
import { validatePurchaseBook, type PurchaseBook } from "./purchase-book.ts";

export const MAX_PORTFOLIO_SAVE_BYTES = 2_097_152;
const MAX_HOLDINGS = 500;
const SAFE_ID = /^[\p{L}\p{N}_.:-]{1,100}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface PortfolioSaveInput {
  expectedVersion: number;
  holdings: PortfolioHolding[];
  preferences: PortfolioPreferences;
  purchaseBook?: PurchaseBook;
}
export class PortfolioSaveInputError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) { super(message); this.name = "PortfolioSaveInputError"; this.code = code; this.status = status; }
}

function validatedHolding(value: unknown): PortfolioHolding | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !SAFE_ID.test(row.id)) return null;
  if (typeof row.name !== "string" || row.name.length < 1 || row.name.length > 120) return null;
  if (!validPortfolioAmount(row.amount)) return null;
  if (typeof row.unit !== "string" || row.unit.length < 1 || row.unit.length > 60) return null;
  if (!validPortfolioCost(row.costToman)) return null;
  if (row.purchaseDate !== null && (typeof row.purchaseDate !== "string" || !DATE.test(row.purchaseDate))) return null;
  if (typeof row.note !== "string" || row.note.length > 1000) return null;
  return { id: row.id, name: row.name, amount: row.amount, unit: row.unit, costToman: row.costToman as number | null, purchaseDate: row.purchaseDate as string | null, note: row.note };
}
function validatedPreferences(value: unknown): PortfolioPreferences | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(portfolioPreferenceLimits) as Array<keyof typeof portfolioPreferenceLimits>) {
    if (!validPortfolioPreference(key, row[key])) return null;
  }
  if (row.analysisHorizon !== "short" && row.analysisHorizon !== "long") return null;
  if (row.decisionHorizon !== "short" && row.decisionHorizon !== "long") return null;
  return row as PortfolioPreferences;
}

// Shared local/private input contract only. Identity, transport and repository
// authorization remain outside this parser; exact purchase strings stay intact.
export function parsePortfolioSaveInput(body: string): PortfolioSaveInput {
  if (new TextEncoder().encode(body).byteLength > MAX_PORTFOLIO_SAVE_BYTES) throw new PortfolioSaveInputError("request_too_large", 413, "portfolio request is too large");
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { throw new PortfolioSaveInputError("invalid_json", 400, "request body is not valid JSON"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new PortfolioSaveInputError("invalid_portfolio", 422, "portfolio request must be an object");
  const input = payload as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0 || !Array.isArray(input.holdings) || input.holdings.length > MAX_HOLDINGS) throw new PortfolioSaveInputError("invalid_portfolio", 422, "portfolio version or holdings are invalid");
  const holdings = input.holdings.map(validatedHolding);
  if (holdings.some(holding => holding === null) || new Set(holdings.map(holding => holding?.id)).size !== holdings.length) throw new PortfolioSaveInputError("invalid_holding", 422, "one or more holdings are invalid or duplicated");
  const preferences = validatedPreferences(input.preferences);
  if (!preferences) throw new PortfolioSaveInputError("invalid_preferences", 422, "portfolio preferences are invalid");
  let purchaseBook: PurchaseBook | undefined;
  if (Object.hasOwn(input, "purchaseBook")) {
    try { purchaseBook = validatePurchaseBook(input.purchaseBook); }
    catch { throw new PortfolioSaveInputError("invalid_purchase_book", 422, "اطلاعات خریدها معتبر نیست؛ مقدار، واحد، تاریخ و نرخ‌های واردشده را بررسی کنید. اطلاعات قبلی تغییر نکرده است."); }
  }
  return { expectedVersion: input.expectedVersion as number, holdings: holdings as PortfolioHolding[], preferences, ...(purchaseBook === undefined ? {} : { purchaseBook }) };
}
