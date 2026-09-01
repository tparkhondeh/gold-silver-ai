type QuotaDetails = {
  plan?: unknown;
  configurationValid?: unknown;
  adjustedForSafety?: unknown;
  refreshSeconds?: unknown;
  maximumScheduledCallsInWindow?: unknown;
  providerPlanLimit?: unknown;
  latestOutcome?: unknown;
  used?: unknown;
  remaining?: unknown;
  limit?: unknown;
  windowDays?: unknown;
};

export type NavasanLatestOutcome = {
  outcome: "success" | "failure";
  quoteCount: number | null;
  durationMs: number;
  completedAt: string;
};

export type NavasanQuotaView = {
  state: "loading" | "ready" | "blocked";
  message: string;
  details?: {
    used: number;
    remaining: number;
    limit: number;
    windowDays: number;
    refreshSeconds: number;
    maximumScheduledCallsInWindow: number;
    providerPlanLimit: number;
    configurationValid: boolean;
    adjustedForSafety: boolean;
    latestOutcome: NavasanLatestOutcome | null;
  };
};

function finiteInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function parseLatestOutcome(value: unknown): NavasanLatestOutcome | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { outcome?: unknown; quoteCount?: unknown; durationMs?: unknown; completedAt?: unknown };
  const durationMs = finiteInteger(candidate.durationMs);
  const quoteCount = candidate.quoteCount === null ? null : finiteInteger(candidate.quoteCount);
  const completedAt = typeof candidate.completedAt === "string" ? candidate.completedAt : "";
  const timestamp = Date.parse(completedAt);
  if (candidate.outcome !== "success" && candidate.outcome !== "failure") return undefined;
  const outcome = candidate.outcome;
  const countValid = outcome === "success"
    ? quoteCount !== null && quoteCount >= 1 && quoteCount <= 64
    : quoteCount === null;
  if (!countValid || durationMs === null || durationMs > 120_000 || !Number.isFinite(timestamp)) return undefined;
  return { outcome, quoteCount, durationMs, completedAt };
}

export function parseNavasanQuotaHealth(payload: unknown): NavasanQuotaView {
  if (!payload || typeof payload !== "object") return { state: "blocked", message: "پاسخ سلامت معتبر نیست." };
  const engines = (payload as { engines?: unknown }).engines;
  if (!Array.isArray(engines)) return { state: "blocked", message: "وضعیت سهمیه در دسترس نیست." };
  const engine = engines.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === "navasan-quota") as { state?: unknown; reason?: unknown; details?: QuotaDetails } | undefined;
  if (engine?.state !== "quota_ready" || !engine.details) {
    return { state: "blocked", message: typeof engine?.reason === "string" ? engine.reason : "دفتر سهمیه آماده نیست." };
  }

  const used = finiteInteger(engine.details.used);
  const remaining = finiteInteger(engine.details.remaining);
  const limit = finiteInteger(engine.details.limit);
  const windowDays = finiteInteger(engine.details.windowDays);
  const refreshSeconds = finiteInteger(engine.details.refreshSeconds);
  const maximumScheduledCallsInWindow = finiteInteger(engine.details.maximumScheduledCallsInWindow);
  const providerPlanLimit = finiteInteger(engine.details.providerPlanLimit);
  const latestOutcome = parseLatestOutcome(engine.details.latestOutcome);
  if (engine.details.plan !== "free"
    || used === null
    || remaining === null
    || limit === null
    || windowDays === null
    || refreshSeconds === null
    || maximumScheduledCallsInWindow === null
    || providerPlanLimit === null
    || latestOutcome === undefined) {
    return { state: "blocked", message: "تنظیمات پلن رایگان معتبر نیست؛ دریافت تازه متوقف می‌ماند." };
  }

  return {
    state: "ready",
    message: engine.details.configurationValid === true
      ? "پلن رایگان با سقف ایمنی پایدار فعال است."
      : "تنظیم نامعتبر بود؛ سیاست امن رایگان به‌صورت خودکار جایگزین شد.",
    details: {
      used,
      remaining,
      limit,
      windowDays,
      refreshSeconds,
      maximumScheduledCallsInWindow,
      providerPlanLimit,
      adjustedForSafety: engine.details.adjustedForSafety === true,
      configurationValid: engine.details.configurationValid === true,
      latestOutcome,
    },
  };
}
