import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DATA_CONTRACT_VERSION } from "../data/contracts.ts";
import { ingestManualCsv, manualCsvHeaders, sanitizeRawPayload } from "../data/csv-ingestion.ts";
import { PostgresObservationRepository, postgresRepositoryStatements } from "../data/postgres-observation-repository.ts";
import { validateObservation } from "../data/validation.ts";

const registry = {
  instruments: new Map([["TEST_GOLD_IRR", {
    schemaVersion: DATA_CONTRACT_VERSION,
    code: "TEST_GOLD_IRR",
    displayName: "دارایی صرفاً آزمایشی",
    assetClass: "test",
    canonicalCurrency: "TOMAN",
    canonicalUnit: "gram",
    activeFrom: "2026-01-01T00:00:00.000Z",
    retiredAt: null,
  }]]),
  sources: new Map([["test-manual", {
    schemaVersion: DATA_CONTRACT_VERSION,
    id: "test-manual",
    displayName: "منبع صرفاً آزمایشی",
    quality: "test_only",
    accessMode: "test",
    active: true,
  }]]),
};

const validRawObservation = {
  instrumentCode: "TEST_GOLD_IRR",
  sourceId: "test-manual",
  value: "1.000",
  currency: "TOMAN",
  unit: "gram",
  observedAt: "2026-08-20T10:00:00Z",
  publishedAt: null,
  collectedAt: "2026-08-20T10:01:00Z",
  effectiveFrom: "2026-08-20T10:00:00Z",
  effectiveTo: null,
  correctionOf: null,
  rawPayload: { fixture: "synthetic-test-only", value: "1.000" },
};

test("normalizes a valid observation and produces stable idempotency", async () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const first = await validateObservation(validRawObservation, registry, now);
  const reorderedPayload = { ...validRawObservation, rawPayload: { value: "1.000", fixture: "synthetic-test-only" } };
  const second = await validateObservation(reorderedPayload, registry, now);

  assert.deepEqual(first.issues, []);
  assert.equal(first.observation?.value, "1");
  assert.equal(first.observation?.observedAt, "2026-08-20T10:00:00.000Z");
  assert.equal(first.observation?.idempotencyKey, second.observation?.idempotencyKey);
  assert.equal(first.observation?.payloadHash, second.observation?.payloadHash);
});

test("fails closed on unit, value, and point-in-time errors", async () => {
  const result = await validateObservation({
    ...validRawObservation,
    value: "0",
    unit: "unit",
    collectedAt: "not-a-timestamp",
  }, registry, new Date("2026-08-20T12:00:00Z"));

  assert.equal(result.observation, null);
  assert.deepEqual(new Set(result.issues.map((issue) => issue.code)), new Set(["non_positive_value", "unit_mismatch", "invalid_utc_timestamp"]));
});

test("ingests unique CSV rows, reports duplicates, and quarantines invalid rows", async () => {
  const header = manualCsvHeaders.join(",");
  const valid = "TEST_GOLD_IRR,test-manual,1.00,TOMAN,gram,2026-08-20T10:00:00Z,,2026-08-20T10:01:00Z,2026-08-20T10:00:00Z,,";
  const invalid = "TEST_GOLD_IRR,test-manual,1.00,USD,gram,2026-08-20T10:00:00Z,,2026-08-20T10:01:00Z,2026-08-20T10:00:00Z,,";
  const batch = await ingestManualCsv({
    text: `${header}\n${valid}\n${valid}\n${invalid}\n`,
    fileName: "synthetic-test-only.csv",
    sourceId: "test-manual",
    registry,
    now: new Date("2026-08-20T12:00:00Z"),
  });

  assert.equal(batch.accepted.length, 1);
  assert.equal(batch.accepted[0].collectedAt, "2026-08-20T12:00:00.000Z");
  assert.equal(batch.accepted[0].rawPayload.collected_at, "2026-08-20T10:01:00Z");
  assert.equal(batch.duplicates.length, 1);
  assert.equal(batch.duplicates[0].rowNumber, 3);
  assert.equal(batch.quarantined.length, 1);
  assert.equal(batch.quarantined[0].rowNumber, 4);
  assert.equal(batch.quarantined[0].issues.some((issue) => issue.code === "currency_mismatch"), true);
});

test("accepted decimals fit PostgreSQL exactly without rounding", async () => {
  for (const value of ["99999999999999999999999999.999999999999", "1.123456789012000", "0.000000000001"]) {
    const result = await validateObservation({ ...validRawObservation, value }, registry, new Date("2026-08-20T12:00:00Z"));
    assert.deepEqual(result.issues, [], value);
  }
  for (const value of ["100000000000000000000000000", "1.1234567890123", "0.0000000000001"]) {
    const result = await validateObservation({ ...validRawObservation, value }, registry, new Date("2026-08-20T12:00:00Z"));
    assert.equal(result.observation, null);
    assert.equal(result.issues.some((issue) => issue.code === "decimal_precision_exceeded"), true, value);
  }
});

test("impossible calendar dates are rejected rather than normalized", async () => {
  for (const observedAt of ["2026-02-30T10:00:00Z", "2026-02-29T10:00:00.000Z"]) {
    const result = await validateObservation({ ...validRawObservation, observedAt }, registry, new Date("2026-08-20T12:00:00Z"));
    assert.equal(result.observation, null);
    assert.equal(result.issues.some((issue) => issue.code === "invalid_utc_timestamp"), true);
  }
});

test("metadata-only corrections have distinct stable identities", async () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const original = (await validateObservation(validRawObservation, registry, now)).observation;
  const input = { ...validRawObservation, correctionOf: original.id, effectiveFrom: "2026-08-20T10:00:01Z" };
  const revision = (await validateObservation(input, registry, now)).observation;
  assert.notEqual(revision.id, original.id);
  assert.equal(revision.correctionOf, original.id);
  assert.equal((await validateObservation(input, registry, now)).observation.id, revision.id);
});

test("redacts secret-like fields before raw payload storage", () => {
  assert.deepEqual(sanitizeRawPayload({ api_key: "never-store", nested: { Authorization: "never-store", safe: "kept" } }), {
    api_key: "[REDACTED]",
    nested: { Authorization: "[REDACTED]", safe: "kept" },
  });
});

test("persists a batch transactionally with parameterized PostgreSQL statements", async () => {
  const header = manualCsvHeaders.join(",");
  const valid = "TEST_GOLD_IRR,test-manual,1.00,TOMAN,gram,2026-08-20T10:00:00Z,,2026-08-20T10:01:00Z,2026-08-20T10:00:00Z,,";
  const invalid = "TEST_GOLD_IRR,test-manual,0,TOMAN,gram,2026-08-20T10:00:00Z,,2026-08-20T10:01:00Z,2026-08-20T10:00:00Z,,";
  const batch = await ingestManualCsv({
    text: `${header}\n${valid}\n${invalid}\n`,
    fileName: "synthetic-test-only.csv",
    sourceId: "test-manual",
    registry,
    now: new Date("2026-08-20T12:00:00Z"),
  });
  const calls = [];
  const runner = {
    async transaction(work) {
      return work({
        async query(sql, parameters = []) {
          calls.push({ sql, parameters });
          return { rowCount: 1 };
        },
      });
    },
  };

  const result = await new PostgresObservationRepository(runner).persistBatch(batch);
  assert.deepEqual(result, { alreadyProcessed: false, insertedObservations: 1, duplicateObservations: 0, insertedQuarantineRecords: 1 });
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO observations")), true);
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO quarantine_records")), true);
  assert.equal(postgresRepositoryStatements.insertObservation.includes("$7::numeric"), true);
  assert.equal(postgresRepositoryStatements.insertObservation.includes(validRawObservation.value), false);
});

test("treats an already-seen batch as an idempotent no-op", async () => {
  const runner = {
    async transaction(work) {
      return work({ async query() { return { rowCount: 0 }; } });
    },
  };
  const result = await new PostgresObservationRepository(runner).persistBatch({
    schemaVersion: DATA_CONTRACT_VERSION,
    id: "batch_existing",
    sourceId: "test-manual",
    fileName: "synthetic-test-only.csv",
    collectedAt: "2026-08-20T12:00:00.000Z",
    accepted: [],
    quarantined: [],
    duplicates: [],
  });
  assert.deepEqual(result, { alreadyProcessed: true, insertedObservations: 0, duplicateObservations: 0, insertedQuarantineRecords: 0 });
});

test("PostgreSQL migration preserves point-in-time fields and immutable audit records", async () => {
  const migration = await readFile(new URL("../db/migrations/0001_data_foundation.sql", import.meta.url), "utf8");
  const drizzleConfig = await readFile(new URL("../drizzle.config.ts", import.meta.url), "utf8");
  const databaseFactory = await readFile(new URL("../db/index.ts", import.meta.url), "utf8");
  for (const table of ["instruments", "sources", "ingestion_batches", "observations", "validation_results", "quarantine_records", "quarantine_resolutions"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  }
  for (const field of ["observed_at", "published_at", "collected_at", "effective_from", "effective_to", "correction_of", "idempotency_key", "payload_hash"]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /reject_immutable_data_mutation/);
  assert.match(migration, /value numeric\(38, 12\).*CHECK \(value > 0\)/);
  assert.match(drizzleConfig, /dialect: "postgresql"/);
  assert.doesNotMatch(drizzleConfig, /sqlite/);
  assert.doesNotMatch(databaseFactory, /drizzle-orm\/d1|cloudflare:workers/);
});
