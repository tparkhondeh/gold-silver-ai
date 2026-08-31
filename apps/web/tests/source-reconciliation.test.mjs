import assert from "node:assert/strict";
import test from "node:test";

import { buildSourceReconciliation, PostgresSourceReconciliationRepository } from "../data/source-reconciliation.ts";

const first = "obs_" + "a".repeat(64);
const second = "obs_" + "b".repeat(64);
const input = {
  policyId: "source_precedence_v1",
  policyVersion: 1,
  instrumentCode: "TEST_ONLY",
  cutoffAt: "2026-08-20T12:00:00.000Z",
  orderedCandidateIds: [first, second],
  selectedObservationId: first,
  reasonCode: "source_quality",
};

function runnerFor(query) {
  return { async transaction(work) { return work({ query }); } };
}

test("reconciliation identity is deterministic and locks candidate order", () => {
  assert.deepEqual(buildSourceReconciliation(input), buildSourceReconciliation({ ...input }));
  assert.notEqual(buildSourceReconciliation(input).id, buildSourceReconciliation({ ...input, orderedCandidateIds: [second, first], selectedObservationId: second }).id);
  assert.throws(() => buildSourceReconciliation({ ...input, selectedObservationId: second }), /first ranked/);
  assert.throws(() => buildSourceReconciliation({ ...input, orderedCandidateIds: [first, first] }), /unique candidates/);
});

test("repository records exact ranks with parameterized statements", async () => {
  const calls = [];
  const repository = new PostgresSourceReconciliationRepository(runnerFor(async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    if (sql.includes("count(DISTINCT")) return { rowCount: 1, rows: [{ count: 2, instruments: 1, instrument_code: "TEST_ONLY" }] };
    return { rowCount: 1, rows: [] };
  }));
  const result = await repository.record(input);
  assert.match(result.id, /^reconciliation_[a-f0-9]{64}$/);
  const candidates = calls.filter((call) => call.sql.includes("INSERT INTO source_reconciliation_candidates"));
  assert.deepEqual(candidates.map((call) => call.parameters.slice(1)), [[first, 1, true], [second, 2, false]]);
  assert.equal(calls.some((call) => call.sql.includes(input.instrumentCode)), false);
});

test("repository rejects candidates unavailable at the point-in-time cutoff", async () => {
  const repository = new PostgresSourceReconciliationRepository(runnerFor(async () => ({ rowCount: 1, rows: [{ count: 1, instruments: 1, instrument_code: "TEST_ONLY" }] })));
  await assert.rejects(repository.record(input), /unavailable at the cutoff/);
});
