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

  async reserve(endpoint: NavasanQuotaEndpoint, requestHash: string): Promise<NavasanQuotaReservation> {
    if (!/^[a-f0-9]{64}$/.test(requestHash)) throw new Error("Navasan request fingerprint is invalid");
    const reservationId = `navasan_request_${randomUUID()}`;
    return this.runner.transaction(async (executor) => {
      // One global provider lock serializes the small critical section across all
      // local workers. The HTTP request happens after commit and is never retried
      // automatically, so a crash can under-use but can never overspend quota.
      await executor.query("SELECT pg_advisory_xact_lock(174228531, 10)");
      const usage = await executor.query<{ used: number }>(`
        SELECT count(*)::integer AS used
        FROM provider_request_reservations
        WHERE provider_id='navasan'
          AND reserved_at >= clock_timestamp() - interval '31 days'
      `);
      const quota = summarizeNavasanQuotaUsage(usage.rows?.[0]?.used ?? 0);
      if (quota.exhausted) {
        return { allowed: false, used: quota.used, remaining: 0, reservationId: null };
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
      };
    });
  }
}
