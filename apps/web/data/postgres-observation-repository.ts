import type { IngestionBatch, QuarantineRecord, ValidatedObservation } from "./contracts.ts";

export type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = { rowCount: number; rows?: Row[] };
export type SqlExecutor = { query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, parameters?: readonly unknown[]): Promise<QueryResult<Row>> };
export type TransactionRunner = { transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> };

export type PersistBatchResult = {
  alreadyProcessed: boolean;
  insertedObservations: number;
  duplicateObservations: number;
  insertedQuarantineRecords: number;
};

const INSERT_BATCH = `
  INSERT INTO ingestion_batches (
    id, schema_version, source_id, file_name, collected_at,
    accepted_count, quarantined_count, duplicate_count
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (id) DO NOTHING
`;

const INSERT_OBSERVATION = `
  INSERT INTO observations (
    id, schema_version, idempotency_key, payload_hash, instrument_code, source_id, source_contract_version,
    value, currency, unit, observed_at, published_at, collected_at,
    effective_from, effective_to, correction_of, raw_payload
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
  ON CONFLICT (idempotency_key) DO NOTHING
`;

const INSERT_VALIDATION = `
  INSERT INTO validation_results (
    id, schema_version, batch_id, observation_id, quarantine_id, passed, issues
  ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
  ON CONFLICT (id) DO NOTHING
`;

const INSERT_QUARANTINE = `
  INSERT INTO quarantine_records (
    id, schema_version, batch_id, row_number, received_at, raw_payload, issues
  ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
  ON CONFLICT (id) DO NOTHING
`;

function observationParameters(observation: ValidatedObservation) {
  return [
    observation.id,
    observation.schemaVersion,
    observation.idempotencyKey,
    observation.payloadHash,
    observation.instrumentCode,
    observation.sourceId,
    observation.sourceContractVersion,
    observation.value,
    observation.currency,
    observation.unit,
    observation.observedAt,
    observation.publishedAt,
    observation.collectedAt,
    observation.effectiveFrom,
    observation.effectiveTo,
    observation.correctionOf,
    JSON.stringify(observation.rawPayload),
  ] as const;
}

function quarantineParameters(record: QuarantineRecord) {
  return [
    record.id,
    record.schemaVersion,
    record.batchId,
    record.rowNumber,
    record.receivedAt,
    JSON.stringify(record.rawPayload),
    JSON.stringify(record.issues),
  ] as const;
}

export class PostgresObservationRepository {
  private readonly runner: TransactionRunner;

  constructor(runner: TransactionRunner) {
    this.runner = runner;
  }

  async persistBatch(batch: IngestionBatch): Promise<PersistBatchResult> {
    return this.runner.transaction(async (executor) => {
      const insertedBatch = await executor.query(INSERT_BATCH, [
        batch.id,
        batch.schemaVersion,
        batch.sourceId,
        batch.fileName,
        batch.collectedAt,
        batch.accepted.length,
        batch.quarantined.length,
        batch.duplicates.length,
      ]);
      if (insertedBatch.rowCount === 0) {
        return { alreadyProcessed: true, insertedObservations: 0, duplicateObservations: 0, insertedQuarantineRecords: 0 };
      }

      let insertedObservations = 0;
      let duplicateObservations = batch.duplicates.length;
      let insertedQuarantineRecords = 0;

      for (const observation of batch.accepted) {
        const result = await executor.query(INSERT_OBSERVATION, observationParameters(observation));
        if (result.rowCount === 0) {
          duplicateObservations += 1;
          continue;
        }
        insertedObservations += 1;
        await executor.query(INSERT_VALIDATION, [
          `validation_${observation.idempotencyKey}`,
          observation.schemaVersion,
          batch.id,
          observation.id,
          null,
          true,
          "[]",
        ]);
      }

      for (const record of batch.quarantined) {
        const result = await executor.query(INSERT_QUARANTINE, quarantineParameters(record));
        if (result.rowCount === 0) continue;
        insertedQuarantineRecords += 1;
        await executor.query(INSERT_VALIDATION, [
          `validation_${record.id.replace("quarantine_", "")}`,
          record.schemaVersion,
          batch.id,
          null,
          record.id,
          false,
          JSON.stringify(record.issues),
        ]);
      }

      return { alreadyProcessed: false, insertedObservations, duplicateObservations, insertedQuarantineRecords };
    });
  }
}

export const postgresRepositoryStatements = {
  insertBatch: INSERT_BATCH,
  insertObservation: INSERT_OBSERVATION,
  insertValidation: INSERT_VALIDATION,
  insertQuarantine: INSERT_QUARANTINE,
};
