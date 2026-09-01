import {
  NAVASAN_DURABLE_CALL_LIMIT,
  NAVASAN_ROLLING_WINDOW_DAYS,
} from "./navasan-quota-ledger.ts";

export type NavasanPlan = "free" | "standard" | "gold";

export const NAVASAN_FREE_PROVIDER_CALL_LIMIT = 120;
export const NAVASAN_FREE_REFRESH_SECONDS = 24_000;

type RuntimeEnvironment = Record<string, string | undefined>;

const planDefaults: Record<NavasanPlan, number> = {
  free: NAVASAN_FREE_REFRESH_SECONDS,
  standard: 120,
  gold: 30,
};

function parsePlan(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return { plan: "free" as const, configurationValid: true };
  if (normalized === "free" || normalized === "standard" || normalized === "gold") {
    return { plan: normalized, configurationValid: true } as const;
  }
  return { plan: "free" as const, configurationValid: false };
}

function scheduledCallsInRollingWindow(refreshSeconds: number) {
  const windowSeconds = NAVASAN_ROLLING_WINDOW_DAYS * 86_400;
  // Include the call at the start of the rolling window as well as later refreshes.
  return Math.floor(windowSeconds / refreshSeconds) + 1;
}

export type NavasanRefreshPolicy = {
  plan: NavasanPlan;
  configurationValid: boolean;
  requestedRefreshSeconds: number | null;
  effectiveRefreshSeconds: number;
  adjustedForSafety: boolean;
  maximumScheduledCallsInWindow: number;
  rollingWindowDays: typeof NAVASAN_ROLLING_WINDOW_DAYS;
  durableCallLimit: typeof NAVASAN_DURABLE_CALL_LIMIT;
  providerPlanLimit: number;
};

export function resolveNavasanRefreshPolicy(
  environment: RuntimeEnvironment = process.env,
): NavasanRefreshPolicy {
  const { plan, configurationValid: planValid } = parsePlan(environment.NAVASAN_PLAN);
  const configured = Number(environment.NAVASAN_REFRESH_SECONDS);
  const refreshValid = Number.isFinite(configured) && configured > 0;
  const requestedRefreshSeconds = refreshValid ? Math.floor(configured) : null;
  const minimum = planDefaults[plan];
  // A slower owner-selected cadence is always safe to preserve. Never shorten it,
  // because that would spend provider allowance faster than requested.
  const effectiveRefreshSeconds = Math.max(minimum, requestedRefreshSeconds ?? minimum);

  return {
    plan,
    configurationValid: planValid && (environment.NAVASAN_REFRESH_SECONDS === undefined || refreshValid),
    requestedRefreshSeconds,
    effectiveRefreshSeconds,
    adjustedForSafety: requestedRefreshSeconds !== null && requestedRefreshSeconds !== effectiveRefreshSeconds,
    maximumScheduledCallsInWindow: scheduledCallsInRollingWindow(effectiveRefreshSeconds),
    rollingWindowDays: NAVASAN_ROLLING_WINDOW_DAYS,
    durableCallLimit: NAVASAN_DURABLE_CALL_LIMIT,
    providerPlanLimit: plan === "free" ? NAVASAN_FREE_PROVIDER_CALL_LIMIT : plan === "standard" ? 30_000 : 90_000,
  };
}
