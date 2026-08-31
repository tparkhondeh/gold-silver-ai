import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactVersionConflictError,
  PostgresProvenanceRepository,
  buildArtifactVersion,
} from "../data/provenance-registry.ts";

function runnerFor(query) {
  return { async transaction(work) { return work({ query }); } };
}

test("artifact fingerprints are deterministic across object key order", () => {
  const base = { kind: "feature", entityId: "momentum_20", version: 1, status: "draft", description: "Synthetic test feature", validFrom: null, validUntil: null };
  const left = buildArtifactVersion({ ...base, content: { dataType: "decimal", unit: "percent", transformation: { window: 20, method: "return" } } });
  const right = buildArtifactVersion({ ...base, content: { transformation: { method: "return", window: 20 }, unit: "percent", dataType: "decimal" } });
  assert.equal(left.contentHash, right.contentHash);
  assert.match(left.contentHash, /^[a-f0-9]{64}$/);
});

test("artifact registration is parameterized and rejects version drift", async () => {
  const artifact = buildArtifactVersion({
    kind: "assumption", entityId: "test_assumption", version: 1, status: "draft",
    description: "Test-only assumption", content: { value: 1, unit: "unit", source: "test", sourceDate: "2026-08-31", confidence: "test_only" }, validFrom: null, validUntil: null,
  });
  const calls = [];
  const repository = new PostgresProvenanceRepository(runnerFor(async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    return { rowCount: 1, rows: [] };
  }));
  assert.deepEqual(await repository.registerArtifact(artifact), { alreadyRegistered: false });
  assert.equal(calls[0].sql.includes("INSERT INTO artifact_versions"), true);
  assert.equal(calls[0].sql.includes(artifact.description), false);
  assert.equal(calls[0].parameters.includes(artifact.description), true);

  const conflicting = new PostgresProvenanceRepository(runnerFor(async (sql) => sql.includes("AS matches")
    ? { rowCount: 1, rows: [{ matches: false }] }
    : { rowCount: 0, rows: [] }));
  await assert.rejects(conflicting.registerArtifact(artifact), ArtifactVersionConflictError);
});

test("dataset snapshot refuses observations unavailable at its cutoff", async () => {
  const repository = new PostgresProvenanceRepository(runnerFor(async () => ({ rowCount: 1, rows: [{ count: 0 }] })));
  await assert.rejects(repository.createDatasetSnapshot({
    entityId: "dataset_test", version: 1, description: "Test dataset", purpose: "contract test",
    cutoffAt: "2026-08-20T12:00:00.000Z", observationIds: ["obs_" + "a".repeat(64)],
  }), /not-yet-known/);
});

test("dataset fingerprint locks exact observation membership independent of input order", async () => {
  const artifacts = [];
  const repository = new PostgresProvenanceRepository(runnerFor(async (sql, parameters = []) => {
    if (sql.includes("SELECT count")) return { rowCount: 1, rows: [{ count: 2 }] };
    if (sql.includes("INSERT INTO artifact_versions")) {
      artifacts.push(JSON.parse(parameters[5]));
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  }));
  const result = await repository.createDatasetSnapshot({
    entityId: "dataset_membership", version: 1, description: "Membership test", purpose: "contract test",
    cutoffAt: "2026-08-20T12:00:00.000Z", observationIds: ["obs_" + "b".repeat(64), "obs_" + "a".repeat(64)],
  });
  assert.deepEqual(artifacts[0].observationIds, ["obs_" + "a".repeat(64), "obs_" + "b".repeat(64)]);
  assert.equal(result.artifact.contentHash.length, 64);
});

test("decision records remain evaluation-only and reference the full chain", async () => {
  const calls = [];
  const repository = new PostgresProvenanceRepository(runnerFor(async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    return { rowCount: 1, rows: [] };
  }));
  const result = await repository.recordEvaluationDecision({
    version: 1,
    model: { entityId: "model_test", version: 1 },
    methodology: { entityId: "method_test", version: 1 },
    dataset: { entityId: "dataset_test", version: 1 },
    assumptions: [{ entityId: "assumption_test", version: 1 }],
    features: [{ entityId: "feature_test", version: 1 }],
    producedAt: "2026-08-31T12:00:00.000Z",
    riskState: "execution_disabled",
    inputs: { dataset: "dataset_test" },
    output: { state: "no_decision", reason: "test only" },
  });
  assert.match(result.id, /^decision_[a-f0-9]{64}$/);
  assert.equal(calls[0].sql.includes("'evaluation_only',false"), true);
  assert.equal(calls.some((call) => call.sql.includes("decision_assumptions")), true);
  assert.equal(calls.some((call) => call.sql.includes("decision_features")), true);
});
