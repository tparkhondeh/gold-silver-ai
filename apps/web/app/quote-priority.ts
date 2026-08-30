type PrioritizableQuote = {
  instrumentCode: string;
  sourceId: string;
  quality: "primary" | "informational" | "manual_snapshot";
  status: "valid" | "stale";
  publishedAt: string | null;
  collectedAt: string;
};

const sourcePriority: Record<string, number> = {
  navasan: 500,
  "goldapi-io": 500,
  xaus: 300,
  "gold-api-com": 200,
  "rahavard-manual": 100,
};

const qualityPriority: Record<PrioritizableQuote["quality"], number> = {
  primary: 1_000,
  informational: 200,
  manual_snapshot: 100,
};

function priorityScore(quote: PrioritizableQuote) {
  return (quote.status === "valid" ? 10_000 : 0)
    + qualityPriority[quote.quality]
    + (sourcePriority[quote.sourceId] ?? 0);
}

function observedTime(quote: PrioritizableQuote) {
  const parsed = Date.parse(quote.publishedAt ?? quote.collectedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectPreferredQuotes<T extends PrioritizableQuote>(quotes: T[]) {
  const selected = new Map<string, T>();
  for (const candidate of quotes) {
    const current = selected.get(candidate.instrumentCode);
    if (!current
      || priorityScore(candidate) > priorityScore(current)
      || (priorityScore(candidate) === priorityScore(current) && observedTime(candidate) > observedTime(current))) {
      selected.set(candidate.instrumentCode, candidate);
    }
  }
  return Array.from(selected.values());
}
