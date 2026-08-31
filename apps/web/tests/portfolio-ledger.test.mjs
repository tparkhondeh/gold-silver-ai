import assert from "node:assert/strict";
import test from "node:test";

import { buildTransactionEvent, buildValuationSnapshot, PostgresPortfolioLedgerRepository } from "../data/portfolio-ledger.ts";

const observationA = "obs_" + "a".repeat(64);
const observationB = "obs_" + "b".repeat(64);
const transaction = {
  subjectId: "test-owner",
  eventKind: "trade",
  assetKey: "TEST_GOLD",
  quantityDelta: "1.5000",
  quantityUnit: "gram",
  cashDelta: "-1000.00",
  cashCurrency: "TOMAN",
  feeAmount: "10.00",
  occurredAt: "2026-08-20T10:00:00Z",
  correctionOf: null,
  correctionReason: null,
  evidenceHash: null,
};

const valuation = {
  subjectId: "test-owner",
  portfolioVersion: 2,
  asOf: "2026-08-20T12:00:00Z",
  dataset: { entityId: "dataset_test", version: 1 },
  methodology: { entityId: "method_test", version: 1 },
  reportingCurrency: "TOMAN",
  totalValue: "30.00",
  positions: [
    { positionKey: "b", assetKey: "TEST_SILVER", quantity: "2", unit: "gram", observationId: observationB, price: "10", value: "20" },
    { positionKey: "a", assetKey: "TEST_GOLD", quantity: "1", unit: "gram", observationId: observationA, price: "10", value: "10" },
  ],
  transactionIds: [],
};

function runnerFor(query) { return { async transaction(work) { return work({ query }); } }; }

test("transaction events normalize decimals and require correction reasons", () => {
  const event = buildTransactionEvent(transaction);
  assert.equal(event.quantityDelta, "1.5");
  assert.equal(event.cashDelta, "-1000");
  assert.match(event.id, /^transaction_[a-f0-9]{64}$/);
  assert.deepEqual(event, buildTransactionEvent({ ...transaction }));
  assert.throws(() => buildTransactionEvent({ ...transaction, correctionOf: event.id }), /correction reason/);
  assert.throws(() => buildTransactionEvent({ ...transaction, quantityDelta: null, quantityUnit: null, cashDelta: null, cashCurrency: null, feeAmount: "0" }), /deltas/);
});

test("valuation snapshot sorts exact inputs and verifies the total", () => {
  const snapshot = buildValuationSnapshot(valuation);
  assert.deepEqual(snapshot.positions.map((position) => position.positionKey), ["a", "b"]);
  assert.match(snapshot.id, /^valuation_[a-f0-9]{64}$/);
  assert.throws(() => buildValuationSnapshot({ ...valuation, totalValue: "29.99" }), /does not equal/);
  assert.throws(() => buildValuationSnapshot({ ...valuation, positions: [valuation.positions[0], valuation.positions[0]] }), /membership/);
});

test("ledger repository keeps SQL parameterized and point-in-time bounded", async () => {
  const calls = [];
  const repository = new PostgresPortfolioLedgerRepository(runnerFor(async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    if (sql.includes("SELECT version")) return { rowCount: 1, rows: [{ version: 2 }] };
    if (sql.includes("count(*)::integer")) return { rowCount: 1, rows: [{ count: 2 }] };
    return { rowCount: 1, rows: [] };
  }));
  assert.equal((await repository.recordTransaction(transaction)).alreadyRecorded, false);
  const result = await repository.recordValuation(valuation);
  assert.equal(result.alreadyRecorded, false);
  assert.equal(calls.some((call) => call.sql.includes("test-owner")), false);
  assert.equal(calls.some((call) => call.parameters.includes("test-owner")), true);

  const built = buildValuationSnapshot(valuation);
  const replay = new PostgresPortfolioLedgerRepository(runnerFor(async (sql) => sql.includes("SELECT input_hash")
    ? { rowCount: 1, rows: [{ input_hash: built.inputHash, output_hash: built.outputHash }] }
    : { rowCount: 1, rows: [] }));
  assert.equal((await replay.recordValuation(valuation)).alreadyRecorded, true);

  const rejected = new PostgresPortfolioLedgerRepository(runnerFor(async (sql) => {
    if (sql.includes("SELECT input_hash")) return { rowCount: 0, rows: [] };
    if (sql.includes("SELECT version")) return { rowCount: 1, rows: [{ version: 2 }] };
    return { rowCount: 1, rows: [{ count: 1 }] };
  }));
  await assert.rejects(rejected.recordValuation(valuation), /unavailable at the cutoff/);
});
