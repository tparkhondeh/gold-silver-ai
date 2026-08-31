import { createHash } from "node:crypto";

import type { TransactionRunner } from "./postgres-observation-repository.ts";

export type ReconciliationReason = "source_quality" | "source_priority" | "latest_availability" | "stable_identity";

export type SourceReconciliationInput = {
  policyId: string;
  policyVersion: number;
  instrumentCode: string;
  cutoffAt: string;
  orderedCandidateIds: string[];
  selectedObservationId: string;
  reasonCode: ReconciliationReason;
};

export class ReconciliationConflictError extends Error {
  constructor() {
    super("source reconciliation record already exists with different content");
    this.name = "ReconciliationConflictError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function buildSourceReconciliation(input: SourceReconciliationInput) {
  if (!/^[a-z0-9][a-z0-9_.:-]{0,99}$/.test(input.policyId) || !Number.isInteger(input.policyVersion) || input.policyVersion < 1) {
    throw new Error("reconciliation policy reference is invalid");
  }
  if (input.orderedCandidateIds.length < 2 || new Set(input.orderedCandidateIds).size !== input.orderedCandidateIds.length) {
    throw new Error("reconciliation requires at least two unique candidates");
  }
  if (input.orderedCandidateIds[0] !== input.selectedObservationId) {
    throw new Error("selected observation must be the first ranked candidate");
  }
  const inputHash = fingerprint(input);
  return { ...input, id: `reconciliation_${inputHash}`, inputHash };
}

export class PostgresSourceReconciliationRepository {
  private readonly runner: TransactionRunner;

  constructor(runner: TransactionRunner) {
    this.runner = runner;
  }

  async record(input: SourceReconciliationInput) {
    const record = buildSourceReconciliation(input);
    return this.runner.transaction(async (executor) => {
      const known = await executor.query<{ count: number; instruments: number; instrument_code: string | null }>(`
        SELECT count(*)::integer AS count, count(DISTINCT instrument_code)::integer AS instruments,
          min(instrument_code) AS instrument_code
        FROM observations
        WHERE id=ANY($1::text[])
          AND greatest(observed_at, COALESCE(published_at, observed_at), collected_at) <= $2::timestamptz
      `, [record.orderedCandidateIds, record.cutoffAt]);
      const summary = known.rows?.[0];
      if (summary?.count !== record.orderedCandidateIds.length || summary.instruments !== 1 || summary.instrument_code !== record.instrumentCode) {
        throw new Error("reconciliation candidates are missing, mismatched or unavailable at the cutoff");
      }
      const inserted = await executor.query(`
        INSERT INTO source_reconciliations (
          id, policy_id, policy_version, instrument_code, cutoff_at,
          selected_observation_id, reason_code, candidate_count, input_hash
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING
      `, [record.id, record.policyId, record.policyVersion, record.instrumentCode, record.cutoffAt, record.selectedObservationId, record.reasonCode, record.orderedCandidateIds.length, record.inputHash]);
      if (inserted.rowCount === 0) {
        const existing = await executor.query<{ input_hash: string }>("SELECT input_hash FROM source_reconciliations WHERE id=$1", [record.id]);
        if (existing.rows?.[0]?.input_hash !== record.inputHash) throw new ReconciliationConflictError();
      }
      for (const [index, observationId] of record.orderedCandidateIds.entries()) {
        await executor.query(`
          INSERT INTO source_reconciliation_candidates (reconciliation_id, observation_id, rank, selected)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING
        `, [record.id, observationId, index + 1, index === 0]);
      }
      return { id: record.id, inputHash: record.inputHash, alreadyRecorded: inserted.rowCount === 0 };
    });
  }
}
