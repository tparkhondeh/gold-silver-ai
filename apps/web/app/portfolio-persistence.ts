import type { PortfolioSnapshot } from "../data/postgres-portfolio-repository.ts";
import { portfolioPreferenceLimits, validPortfolioAmount, validPortfolioCost, validPortfolioPreference } from "../data/portfolio-numeric-contract.ts";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Validate the complete response before any part replaces an editable browser draft.
export function decodePortfolioSnapshot(value: unknown): PortfolioSnapshot {
  if (!record(value) || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || !Array.isArray(value.holdings) || value.holdings.length > 500 || !record(value.preferences)) throw new Error("invalid portfolio snapshot");
  const ids = new Set<string>();
  for (const holding of value.holdings) {
    if (!record(holding) || typeof holding.id !== "string" || !/^[\p{L}\p{N}_.:-]{1,100}$/u.test(holding.id) || ids.has(holding.id)
      || typeof holding.name !== "string" || holding.name.length < 1 || holding.name.length > 120
      || !validPortfolioAmount(holding.amount)
      || typeof holding.unit !== "string" || holding.unit.length < 1 || holding.unit.length > 60
      || !validPortfolioCost(holding.costToman)
      || (holding.purchaseDate !== null && (typeof holding.purchaseDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(holding.purchaseDate)))
      || typeof holding.note !== "string" || holding.note.length > 1000) throw new Error("invalid portfolio holding");
    ids.add(holding.id);
  }
  for (const key of Object.keys(portfolioPreferenceLimits) as Array<keyof typeof portfolioPreferenceLimits>) {
    if (!validPortfolioPreference(key, value.preferences[key])) throw new Error("invalid portfolio preferences");
  }
  if (!["short", "long"].includes(value.preferences.analysisHorizon as string) || !["short", "long"].includes(value.preferences.decisionHorizon as string)) throw new Error("invalid portfolio horizons");
  return structuredClone(value) as PortfolioSnapshot;
}

export async function fetchPortfolioSnapshot(signal?: AbortSignal, request: typeof fetch = fetch): Promise<PortfolioSnapshot> {
  const timeout = AbortSignal.timeout(10_000);
  const response = await request("/api/portfolio", { cache: "no-store", credentials: "same-origin", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const payload: unknown = await response.json();
  if (!response.ok || !record(payload) || payload.ok !== true) throw new Error("portfolio could not be loaded");
  return decodePortfolioSnapshot(payload.snapshot);
}
