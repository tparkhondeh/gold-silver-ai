import { createHash, randomUUID } from "node:crypto";

import type { TransactionRunner } from "./postgres-observation-repository.ts";

export type NavasanQuotaEndpoint = "latest" | "dailyCurrency" | "ohlcSearch";

// The provider grants 120 requests/month. A 5-call safety reserve covers the
// activation check and any provider-side/manual discrepancy without risking 429/503.
export const NAVASAN_ROLLING_WINDOW_DAYS = 31;
export const NAVASAN_DURABLE_CALL_LIMIT = 115;

export type NavasanQuotaReservation = {
  allowed: boolean;
  used: number;
  remaining: number;
  reservationId: string | null;
  retryAfterSeconds: number | null;
};

export type NavasanProviderStatusInput = {
  reservationId: string;
  outcome: "success" | "failure";
  quoteCount: number | null;
  durationMs: number;
};

export type NavasanQuotaUsage = {
  used: number;
  remaining: number;
  limit: typeof NAVASAN_DURABLE_CALL_LIMIT;
  windowDays: typeof NAVASAN_ROLLING_WINDOW_DAYS;
  exhausted: boolean;
};

export function summarizeNavasanQuotaUsage(value: unknown): NavasanQuotaUsage {
  if (typeof value !== "number") throw new Error("Navasan quota ledger returned invalid usage");
  const used = value;
  if (!Number.isInteger(used) || used < 0) throw new Error("Navasan quota ledger returned invalid usage");
  return {
    used,
    remaining: Math.max(0, NAVASAN_DURABLE_CALL_LIMIT - used),
    limit: NAVASAN_DURABLE_CALL_LIMIT,
    windowDays: NAVASAN_ROLLING_WINDOW_DAYS,
    exhausted: used >= NAVASAN_DURABLE_CALL_LIMIT,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function fingerprintNavasanRequest(endpoint: NavasanQuotaEndpoint, parameters: Record<string, string>) {
  return createHash("sha256").update(stableJson({ endpoint, parameters })).digest("hex");
}

export class PostgresNavasanQuotaLedger {
  private readonly runner: TransactionRunner;

  constructor(runner: TransactionRunner) {
    this.runner = runner;
  }

  async reserve(endpoint: NavasanQuotaEndpoint, requestHash: string, minimumIntervalSeconds = 0): Promise<NavasanQuotaReservation> {
    if (!/^[a-f0-9]{64}$/.test(requestHash)) throw new Error("Navasan request fingerprint is invalid");
    if (!Number.isInteger(minimumIntervalSeconds) || minimumIntervalSeconds < 0) {
      throw new Error("Navasan minimum request interval is invalid");
    }
    const reservationId = `navasan_request_${randomUUID()}`;
    return this.runner.transaction(async (executor) => {
      // One global provider lock serializes the small critical section across all
      // local workers. The HTTP request happens after commit and is never retried
      // automatically, so a crash can under-use but can never overspend quota.
      await executor.query("SELECT pg_advisory_xact_lock(174228531, 10)");
      const usage = await executor.query<{ used: number; retry_after_seconds: number }>(`
        SELECT (count(*) FILTER (
            WHERE reserved_at >= clock_timestamp() - interval '31 days'
          ))::integer AS used,
          GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
            max(reserved_at) FILTER (WHERE endpoint='latest')
              + make_interval(secs => $1) - clock_timestamp()
          )))::integer) AS retry_after_seconds
        FROM provider_request_reservations
        WHERE provider_id='navasan'
      `, [minimumIntervalSeconds]);
      const quota = summarizeNavasanQuotaUsage(usage.rows?.[0]?.used ?? 0);
      if (quota.exhausted) {
        return { allowed: false, used: quota.used, remaining: 0, reservationId: null, retryAfterSeconds: null };
      }
      const retryAfterSeconds = usage.rows?.[0]?.retry_after_seconds ?? 0;
      if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 0) {
        throw new Error("Navasan quota ledger returned invalid cooldown");
      }
      if (endpoint === "latest" && retryAfterSeconds > 0) {
        return { allowed: false, used: quota.used, remaining: quota.remaining, reservationId: null, retryAfterSeconds };
      }
      await executor.query(`
        INSERT INTO provider_request_reservations (
          id, provider_id, endpoint, request_hash, window_days, limit_snapshot
        ) VALUES ($1,'navasan',$2,$3,$4,$5)
      `, [reservationId, endpoint, requestHash, NAVASAN_ROLLING_WINDOW_DAYS, NAVASAN_DURABLE_CALL_LIMIT]);
      return {
        allowed: true,
        used: quota.used + 1,
        remaining: quota.remaining - 1,
        reservationId,
        retryAfterSeconds: null,
      };
    });
  }

  async recordLatestOutcome(input: NavasanProviderStatusInput): Promise<void> {
    if (!/^navasan_request_[0-9a-f-]{36}$/.test(input.reservationId)) {
      throw new Error("Navasan reservation identity is invalid");
    }
    if (!Number.isInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 120_000) {
      throw new Error("Navasan request duration is invalid");
    }
    if (input.outcome !== "success" && input.outcome !== "failure") {
      throw new Error("Navasan outcome state is invalid");
    }
    const successful = input.outcome === "success";
    const validSuccessCount = typeof input.quoteCount === "number"
      && Number.isInteger(input.quoteCount)
      && input.quoteCount >= 1
      && input.quoteCount <= 64;
    if ((successful && !validSuccessCount) || (!successful && input.quoteCount !== null)) {
      throw new Error("Navasan outcome summary is invalid");
    }

    await this.runner.transaction(async (executor) => {
      await executor.query(`
        INSERT INTO provider_runtime_status (
          provider_id, last_reservation_id, last_outcome, quote_count, duration_ms
        ) VALUES ('navasan',$1,$2,$3,$4)
        ON CONFLICT (provider_id) DO UPDATE SET
          last_reservation_id=EXCLUDED.last_reservation_id,
          last_outcome=EXCLUDED.last_outcome,
          quote_count=EXCLUDED.quote_count,
          duration_ms=EXCLUDED.duration_ms,
          completed_at=clock_timestamp()
        WHERE provider_runtime_status.last_reservation_id=EXCLUDED.last_reservation_id
          OR (SELECT reserved_at FROM provider_request_reservations WHERE id=EXCLUDED.last_reservation_id)
            > (SELECT reserved_at FROM provider_request_reservations WHERE id=provider_runtime_status.last_reservation_id)
      `, [input.reservationId, input.outcome, input.quoteCount, input.durationMs]);
    });
  }
}
