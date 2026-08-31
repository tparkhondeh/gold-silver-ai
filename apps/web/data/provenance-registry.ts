import { createHash } from "node:crypto";

import type { SqlExecutor, TransactionRunner } from "./postgres-observation-repository.ts";

export type ArtifactKind = "dataset" | "assumption" | "feature" | "model" | "methodology";
export type ArtifactStatus = "draft" | "active" | "deprecated" | "superseded";
export type ArtifactReference = { kind: ArtifactKind; entityId: string; version: number };

export type ArtifactVersion = ArtifactReference & {
  status: ArtifactStatus;
  description: string;
  content: Record<string, unknown>;
  contentHash: string;
  validFrom: string | null;
  validUntil: string | null;
};

export class ArtifactVersionConflictError extends Error {
  constructor() {
    super("artifact version already exists with different content");
    this.name = "ArtifactVersionConflictError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function buildArtifactVersion(input: Omit<ArtifactVersion, "contentHash">): ArtifactVersion {
  return { ...input, contentHash: sha256(input.content) };
}

async function insertArtifact(executor: SqlExecutor, artifact: ArtifactVersion) {
  const inserted = await executor.query(`
    INSERT INTO artifact_versions (
      kind, entity_id, version, status, description, content, content_hash, valid_from, valid_until
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
    ON CONFLICT (kind, entity_id, version) DO NOTHING
  `, [artifact.kind, artifact.entityId, artifact.version, artifact.status, artifact.description, JSON.stringify(artifact.content), artifact.contentHash, artifact.validFrom, artifact.validUntil]);
  if (inserted.rowCount > 0) return { alreadyRegistered: false };
  const existing = await executor.query<{ matches: boolean }>(`
    SELECT (
      status=$4 AND description=$5 AND content_hash=$6
      AND valid_from IS NOT DISTINCT FROM $7::timestamptz
      AND valid_until IS NOT DISTINCT FROM $8::timestamptz
    ) AS matches
    FROM artifact_versions WHERE kind=$1 AND entity_id=$2 AND version=$3
  `, [artifact.kind, artifact.entityId, artifact.version, artifact.status, artifact.description, artifact.contentHash, artifact.validFrom, artifact.validUntil]);
  if (existing.rows?.[0]?.matches !== true) throw new ArtifactVersionConflictError();
  return { alreadyRegistered: true };
}

export type DatasetSnapshotInput = {
  entityId: string;
  version: number;
  description: string;
  purpose: string;
  cutoffAt: string;
  observationIds: string[];
};

export type EvaluationDecisionInput = {
  version: number;
  model: Omit<ArtifactReference, "kind"> | null;
  methodology: Omit<ArtifactReference, "kind">;
  dataset: Omit<ArtifactReference, "kind">;
  assumptions: Array<Omit<ArtifactReference, "kind">>;
  features: Array<Omit<ArtifactReference, "kind">>;
  producedAt: string;
  riskState: "normal" | "automation_paused" | "execution_disabled" | "safe_mode";
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
};

export class PostgresProvenanceRepository {
  private readonly runner: TransactionRunner;

  constructor(runner: TransactionRunner) {
    this.runner = runner;
  }

  async registerArtifact(artifact: ArtifactVersion) {
    return this.runner.transaction((executor) => insertArtifact(executor, artifact));
  }

  async createDatasetSnapshot(input: DatasetSnapshotInput) {
    if (input.observationIds.length === 0 || new Set(input.observationIds).size !== input.observationIds.length) {
      throw new Error("dataset observations must be non-empty and unique");
    }
    const observationIds = [...input.observationIds].sort();
    const artifact = buildArtifactVersion({
      kind: "dataset",
      entityId: input.entityId,
      version: input.version,
      status: "active",
      description: input.description,
      content: { cutoffAt: input.cutoffAt, purpose: input.purpose, observationIds },
      validFrom: input.cutoffAt,
      validUntil: null,
    });
    return this.runner.transaction(async (executor) => {
      const known = await executor.query<{ count: number }>(`
        SELECT count(*)::integer AS count FROM observations
        WHERE id=ANY($1::text[])
          AND greatest(observed_at, COALESCE(published_at, observed_at), collected_at) <= $2::timestamptz
      `, [observationIds, input.cutoffAt]);
      if (known.rows?.[0]?.count !== observationIds.length) throw new Error("dataset contains missing or not-yet-known observations");
      const registration = await insertArtifact(executor, artifact);
      for (const observationId of observationIds) {
        await executor.query(`
          INSERT INTO dataset_observations (dataset_id, dataset_version, observation_id)
          VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
        `, [input.entityId, input.version, observationId]);
      }
      return { ...registration, artifact };
    });
  }

  async recordEvaluationDecision(input: EvaluationDecisionInput) {
    const inputHash = sha256(input.inputs);
    const outputHash = sha256(input.output);
    const id = `decision_${sha256({ ...input, inputHash, outputHash })}`;
    return this.runner.transaction(async (executor) => {
      const inserted = await executor.query(`
        INSERT INTO decision_records (
          id, version, model_kind, model_id, model_version,
          methodology_id, methodology_version, dataset_id, dataset_version,
          produced_at, risk_state, input_hash, output, output_hash, status, execution_allowed
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,'evaluation_only',false)
        ON CONFLICT (id, version) DO NOTHING
      `, [id, input.version, input.model ? "model" : null, input.model?.entityId ?? null, input.model?.version ?? null, input.methodology.entityId, input.methodology.version, input.dataset.entityId, input.dataset.version, input.producedAt, input.riskState, inputHash, JSON.stringify(input.output), outputHash]);
      for (const assumption of input.assumptions) {
        await executor.query(`INSERT INTO decision_assumptions (decision_id, decision_version, assumption_id, assumption_version)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [id, input.version, assumption.entityId, assumption.version]);
      }
      for (const feature of input.features) {
        await executor.query(`INSERT INTO decision_features (decision_id, decision_version, feature_id, feature_version)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [id, input.version, feature.entityId, feature.version]);
      }
      return { id, version: input.version, alreadyRecorded: inserted.rowCount === 0, inputHash, outputHash };
    });
  }
}

export const provenanceRegistryInternals = { stableJson, sha256 };
