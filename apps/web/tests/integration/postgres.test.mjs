import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { Client, Pool } from "pg";
import { applyMigrations, readMigrations } from "../../db/migrations.ts";
import { createPgTransactionRunner, inspectOperatorDatabaseEnvironment } from "../../db/postgres-runtime.ts";
import { ingestManualCsv, manualCsvHeaders } from "../../data/csv-ingestion.ts";
import { validateObservation } from "../../data/validation.ts";
import { PostgresObservationRepository } from "../../data/postgres-observation-repository.ts";
import { PortfolioVersionConflictError, PostgresPortfolioRepository } from "../../data/postgres-portfolio-repository.ts";
import { PostgresProvenanceRepository, buildArtifactVersion } from "../../data/provenance-registry.ts";
import { PostgresSourceReconciliationRepository } from "../../data/source-reconciliation.ts";
import { PostgresPortfolioLedgerRepository } from "../../data/portfolio-ledger.ts";
import { fingerprintNavasanRequest, NAVASAN_DURABLE_CALL_LIMIT, PostgresNavasanQuotaLedger } from "../../data/navasan-quota-ledger.ts";

// Never use DATABASE_URL or load .env.local: only an explicitly disposable database.
const connectionString = process.env.ASHA_TEST_DATABASE_URL;
const configuration = inspectOperatorDatabaseEnvironment({ ASHA_OPERATOR_COMMIT_ENABLED: "true", DATABASE_URL: connectionString });
if (!configuration.available || new URL(connectionString).pathname !== "/asha_integration") {
  throw new Error("Real DB tests require a loopback ASHA_TEST_DATABASE_URL with database asha_integration. No tests skipped.");
}

const registry = {
  instruments: new Map([["TEST_ONLY", { schemaVersion: 1, code: "TEST_ONLY", displayName: "Synthetic integration fixture", assetClass: "test", canonicalCurrency: "TOMAN", canonicalUnit: "gram", activeFrom: "2026-01-01T00:00:00Z", retiredAt: null }]]),
  sources: new Map([["test-only", { schemaVersion: 1, id: "test-only", displayName: "Synthetic test source", quality: "test_only", accessMode: "test", active: true }]]),
};
const raw = { instrumentCode: "TEST_ONLY", sourceId: "test-only", value: "1.00", currency: "TOMAN", unit: "gram", observedAt: "2026-08-20T10:00:00Z", publishedAt: null, collectedAt: "2026-08-20T10:01:00Z", effectiveFrom: "2026-08-20T10:00:00Z", effectiveTo: null, correctionOf: null, correctionReason: null, rawPayload: { synthetic: true } };

test("real PostgreSQL migration, isolation, persistence and restore", async (t) => {
  const admin = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  await admin.connect();
  const schema = `asha_test_${randomBytes(8).toString("hex")}`;
  const restoredSchema = `${schema}_restored`;
  const role = `${schema}_writer`;
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 3000 });
  let schemaCreated = false;
  let roleCreated = false;
  let restoredCreated = false;
  t.after(async () => {
    await pool.end();
    if (restoredCreated) await admin.query(`DROP SCHEMA "${restoredSchema}" CASCADE`);
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await admin.query(`SET search_path TO "${schema}"`);
  const migrations = await readMigrations();
  await t.test("applies migrations once, detects drift and rolls back failure", async () => {
    assert.equal((await applyMigrations(admin, migrations)).length, migrations.length);
    assert.deepEqual(await applyMigrations(admin, migrations), []);
    await assert.rejects(applyMigrations(admin, [{ ...migrations[0], checksum: "0".repeat(64) }, ...migrations.slice(1)]), /checksum/);
    await assert.rejects(applyMigrations(admin, [...migrations, { id: "9999_failure.sql", checksum: "f".repeat(64), sql: "CREATE TABLE rollback_probe(id integer); SELECT * FROM no_such_table_for_test" }]));
    assert.equal((await admin.query("SELECT to_regclass('rollback_probe') AS relation")).rows[0].relation, null);
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations")).rows[0].count), 0);
  });
  await admin.query("INSERT INTO instruments VALUES ('TEST_ONLY',1,'Synthetic integration fixture','test','TOMAN','gram','2026-01-01',NULL)");
  await admin.query("INSERT INTO sources VALUES ('test-only',1,'Synthetic test source','test_only','test',true)");
  await admin.query("INSERT INTO source_contract_versions (source_id,version,display_name,quality,access_mode,active) VALUES ('test-only',1,'Synthetic test source','test_only','test',true)");
  await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  roleCreated = true;
  await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`);
  await admin.query(`GRANT INSERT ON ingestion_batches, observations, quarantine_records, validation_results, quarantine_resolutions TO "${role}"`);
  await admin.query(`GRANT INSERT, UPDATE, DELETE ON user_portfolios, portfolio_holdings, portfolio_preferences TO "${role}"`);
  await admin.query(`GRANT INSERT ON artifact_versions, dataset_observations, decision_records, decision_assumptions, decision_features TO "${role}"`);
  await admin.query(`GRANT INSERT ON source_reconciliations, source_reconciliation_candidates TO "${role}"`);
  await admin.query(`GRANT INSERT ON portfolio_transaction_events, portfolio_valuation_snapshots, portfolio_valuation_positions, portfolio_valuation_transactions TO "${role}"`);
  await admin.query(`GRANT INSERT ON provider_request_reservations TO "${role}"`);
  const runtimePool = { async connect() {
    const client = await pool.connect();
    await client.query(`SET ROLE "${role}"`);
    await client.query(`SET search_path TO "${schema}"`);
    return client;
  } };
  const repository = new PostgresObservationRepository(createPgTransactionRunner(runtimePool));
  const portfolioRepository = new PostgresPortfolioRepository(createPgTransactionRunner(runtimePool));
  const provenanceRepository = new PostgresProvenanceRepository(createPgTransactionRunner(runtimePool));
  const reconciliationRepository = new PostgresSourceReconciliationRepository(createPgTransactionRunner(runtimePool));
  const ledgerRepository = new PostgresPortfolioLedgerRepository(createPgTransactionRunner(runtimePool));
  const quotaLedger = new PostgresNavasanQuotaLedger(createPgTransactionRunner(runtimePool));
  const valid = "TEST_ONLY,test-only,1.00,TOMAN,gram,2026-08-20T10:00:00Z,,2026-08-20T10:01:00Z,2026-08-20T10:00:00Z,,";
  const batch = await ingestManualCsv({ text: `${manualCsvHeaders.join(",")}\n${valid}\n${valid}\n${valid.replace(",1.00,", ",0,")}\n`, fileName: "synthetic-integration.csv", sourceId: "test-only", registry, now: new Date("2026-08-20T12:00:00Z") });
  await t.test("least-privilege writer commits and concurrently replays without duplicates", async () => {
    const results = await Promise.all([repository.persistBatch(batch), repository.persistBatch(batch)]);
    assert.equal(results.filter((result) => result.alreadyProcessed).length, 1);
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations")).rows[0].count), 1);
    assert.equal(Number((await admin.query("SELECT count(*) FROM quarantine_records")).rows[0].count), 1);
    const stored = (await admin.query("SELECT value::text, collected_at, raw_payload FROM observations")).rows[0];
    assert.equal(stored.value, "1.000000000000");
    assert.equal(stored.collected_at.toISOString(), "2026-08-20T12:00:00.000Z");
    assert.equal(stored.raw_payload.collected_at, "2026-08-20T10:01:00Z");
  });
  await t.test("runtime cannot mutate/truncate audit data, registries or schema", async () => {
    const client = await runtimePool.connect();
    try {
      for (const sql of ["UPDATE observations SET value=2", "DELETE FROM observations", "TRUNCATE observations CASCADE", "ALTER TABLE observations DISABLE TRIGGER ALL", "UPDATE instruments SET display_name='changed'", "UPDATE ingestion_batches SET accepted_count=99", "UPDATE source_contract_versions SET active=false", "TRUNCATE decision_records CASCADE", "UPDATE source_reconciliations SET reason_code='stable_identity'", "UPDATE portfolio_transaction_events SET fee_amount=1", "UPDATE provider_request_reservations SET limit_snapshot=1", "TRUNCATE provider_request_reservations", "CREATE TABLE forbidden(id integer)"]) {
        await assert.rejects(client.query(sql), /permission denied|must be owner/);
      }
    } finally { client.release(); }
  });
  await t.test("owner is also blocked by immutable audit triggers", async () => {
    for (const sql of ["UPDATE observations SET value=2", "DELETE FROM observations", "TRUNCATE observations CASCADE", "UPDATE ingestion_batches SET accepted_count=99", "TRUNCATE ingestion_batches CASCADE", "TRUNCATE quarantine_records CASCADE", "TRUNCATE validation_results CASCADE", "TRUNCATE quarantine_resolutions CASCADE", "UPDATE source_contract_versions SET active=false", "TRUNCATE decision_records CASCADE", "TRUNCATE source_reconciliations CASCADE", "TRUNCATE portfolio_transaction_events CASCADE", "TRUNCATE portfolio_valuation_snapshots CASCADE", "TRUNCATE provider_request_reservations"]) {
      await admin.query("BEGIN");
      try { await assert.rejects(admin.query(sql), /immutable data records/); }
      finally { await admin.query("ROLLBACK"); }
    }
  });
  await t.test("late failure rolls back the whole batch and pool remains usable", async () => {
    const observation = (await validateObservation({ ...raw, value: "2" }, registry, new Date("2026-08-20T12:00:00Z"))).observation;
    await assert.rejects(repository.persistBatch({ ...batch, id: "rollback-batch", accepted: [observation, { ...observation, id: "invalid", idempotencyKey: "b".repeat(64), instrumentCode: "UNKNOWN" }], quarantined: [], duplicates: [] }));
    assert.equal(Number((await admin.query("SELECT count(*) FROM ingestion_batches WHERE id='rollback-batch'")).rows[0].count), 0);
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations WHERE value=2")).rows[0].count), 0);
    assert.equal((await repository.persistBatch(batch)).alreadyProcessed, true);
  });
  await t.test("numeric limits round-trip exactly and invalid precision never reaches SQL", async () => {
    const value = "99999999999999999999999999.999999999999";
    const observation = (await validateObservation({ ...raw, value }, registry, new Date("2026-08-20T12:00:00Z"))).observation;
    await repository.persistBatch({ ...batch, id: "precision-batch", accepted: [observation], quarantined: [], duplicates: [] });
    assert.equal((await admin.query("SELECT value::text FROM observations WHERE id=$1", [observation.id])).rows[0].value, value);
    assert.equal((await validateObservation({ ...raw, value: "1.1234567890123" }, registry)).observation, null);
  });
  await t.test("corrections remain append-only and cannot rewrite earlier cutoffs", async () => {
    const original = batch.accepted[0];
    const revision = (await validateObservation({ ...raw, correctionOf: original.id, correctionReason: "Provider issued a corrected synthetic fixture", effectiveFrom: "2026-08-20T10:00:01Z", collectedAt: "2026-08-21T12:00:00Z" }, registry, new Date("2026-08-22T12:00:00Z"))).observation;
    await repository.persistBatch({ ...batch, id: "correction-batch", accepted: [revision], quarantined: [], duplicates: [] });
    assert.notEqual(revision.id, original.id);
    assert.equal((await admin.query("SELECT correction_reason FROM observations WHERE id=$1", [revision.id])).rows[0].correction_reason, "Provider issued a corrected synthetic fixture");
    assert.equal(Number((await admin.query("SELECT count(*) FROM observations WHERE id=$1", [original.id])).rows[0].count), 1);
    const known = async (cutoff) => (await admin.query("SELECT id FROM observations WHERE id=ANY($1::text[]) AND greatest(observed_at,published_at,collected_at) <= $2::timestamptz ORDER BY id", [[original.id, revision.id], cutoff])).rows.map((row) => row.id);
    assert.deepEqual(await known("2026-08-20T11:00:00Z"), []);
    assert.deepEqual(await known("2026-08-20T13:00:00Z"), [original.id]);
    assert.equal((await known("2026-08-22T13:00:00Z")).length, 2);
    await admin.query("INSERT INTO sources VALUES ('test-other',1,'Other test source','test_only','test',true)");
    await assert.rejects(repository.persistBatch({ ...batch, id: "cross-source-correction", accepted: [{ ...revision, id: 'obs_' + 'c'.repeat(64), idempotencyKey: 'c'.repeat(64), sourceId: 'test-other' }], quarantined: [], duplicates: [] }), /correction target/);
  });
  await t.test("source reconciliation records exact ranks, reasons and cutoffs immutably", async () => {
    const candidateIds = (await admin.query("SELECT id FROM observations WHERE instrument_code='TEST_ONLY' ORDER BY collected_at DESC, id LIMIT 2")).rows.map((row) => row.id);
    assert.equal(candidateIds.length, 2);
    const input = {
      policyId: "source_precedence_v1",
      policyVersion: 1,
      instrumentCode: "TEST_ONLY",
      cutoffAt: "2026-08-22T13:00:00.000Z",
      orderedCandidateIds: candidateIds,
      selectedObservationId: candidateIds[0],
      reasonCode: "latest_availability",
    };
    assert.equal((await reconciliationRepository.record(input)).alreadyRecorded, false);
    assert.equal((await reconciliationRepository.record(input)).alreadyRecorded, true);
    const stored = await admin.query(`SELECT r.reason_code, count(c.*)::integer AS candidates,
      count(*) FILTER (WHERE c.selected)::integer AS selected
      FROM source_reconciliations r JOIN source_reconciliation_candidates c ON c.reconciliation_id=r.id
      GROUP BY r.reason_code`);
    assert.deepEqual(stored.rows[0], { reason_code: "latest_availability", candidates: 2, selected: 1 });
    await assert.rejects(reconciliationRepository.record({ ...input, cutoffAt: "2026-08-20T11:00:00.000Z" }), /unavailable at the cutoff/);
  });
  await t.test("portfolio rows are durable, versioned and isolated by owner subject", async () => {
    const ownerA = "integration-owner-a";
    const ownerB = "integration-owner-b";
    const preferences = {
      liquidityReservePercent: "15",
      maxSingleAssetPercent: "40",
      maxAcceptableDrawdownPercent: "20",
      shortTermMonths: "6",
      longTermYears: "5",
      analysisHorizon: "long",
      decisionHorizon: "short",
    };
    const first = await portfolioRepository.save(ownerA, 0, [{
      id: "owner-a-gold",
      name: "Synthetic holding A",
      amount: 2.5,
      unit: "gram",
      costToman: 1000,
      purchaseDate: "2026-08-20",
      note: "test only",
    }], preferences);
    assert.equal(first.version, 1);
    assert.deepEqual(await portfolioRepository.load(ownerA), first);
    assert.deepEqual(await portfolioRepository.load(ownerB), {
      version: 0,
      holdings: [],
      preferences: {
        liquidityReservePercent: "",
        maxSingleAssetPercent: "",
        maxAcceptableDrawdownPercent: "",
        shortTermMonths: "",
        longTermYears: "",
        analysisHorizon: "short",
        decisionHorizon: "short",
      },
    });
    await assert.rejects(portfolioRepository.save(ownerA, 0, [], preferences), PortfolioVersionConflictError);
    const second = await portfolioRepository.save(ownerB, 0, [{
      id: "owner-b-silver",
      name: "Synthetic holding B",
      amount: 3,
      unit: "gram",
      costToman: null,
      purchaseDate: null,
      note: "",
    }], { ...preferences, liquidityReservePercent: "" });
    assert.equal(second.version, 1);
    assert.equal((await portfolioRepository.load(ownerA)).holdings[0].id, "owner-a-gold");
    assert.equal((await portfolioRepository.load(ownerB)).holdings[0].id, "owner-b-silver");
  });
  await t.test("provenance chain is versioned, point-in-time bounded and immutable", async () => {
    const artifacts = [
      buildArtifactVersion({ kind: "assumption", entityId: "test_assumption", version: 1, status: "draft", description: "Test-only assumption", content: { value: 1, unit: "unit", source: "integration-test", sourceDate: "2026-08-31", confidence: "test_only" }, validFrom: null, validUntil: null }),
      buildArtifactVersion({ kind: "feature", entityId: "test_feature", version: 1, status: "draft", description: "Test-only feature", content: { dataType: "decimal", unit: "percent", transformation: "identity" }, validFrom: null, validUntil: null }),
      buildArtifactVersion({ kind: "model", entityId: "test_model", version: 1, status: "draft", description: "Test-only model", content: { implementationRef: "tests/integration/postgres.test.mjs" }, validFrom: null, validUntil: null }),
      buildArtifactVersion({ kind: "methodology", entityId: "test_methodology", version: 1, status: "draft", description: "Test-only methodology", content: { decisionRecordRef: "integration-test-only" }, validFrom: null, validUntil: null }),
    ];
    for (const artifact of artifacts) assert.equal((await provenanceRepository.registerArtifact(artifact)).alreadyRegistered, false);
    const observationId = (await admin.query("SELECT id FROM observations ORDER BY created_at LIMIT 1")).rows[0].id;
    const dataset = await provenanceRepository.createDatasetSnapshot({ entityId: "test_dataset", version: 1, description: "Point-in-time test dataset", purpose: "integration test only", cutoffAt: "2026-08-20T13:00:00.000Z", observationIds: [observationId] });
    assert.equal(dataset.alreadyRegistered, false);
    const decision = await provenanceRepository.recordEvaluationDecision({
      version: 1, model: { entityId: "test_model", version: 1 }, methodology: { entityId: "test_methodology", version: 1 }, dataset: { entityId: "test_dataset", version: 1 },
      assumptions: [{ entityId: "test_assumption", version: 1 }], features: [{ entityId: "test_feature", version: 1 }], producedAt: "2026-08-31T12:00:00.000Z", riskState: "execution_disabled",
      inputs: { observationId }, output: { state: "no_decision", reason: "integration test only" },
    });
    assert.equal(decision.alreadyRecorded, false);
    const chain = await admin.query(`SELECT d.status, d.execution_allowed, av.kind AS methodology_kind, ds.kind AS dataset_kind,
      count(da.assumption_id)::integer AS assumptions, count(df.feature_id)::integer AS features
      FROM decision_records d
      JOIN artifact_versions av ON av.kind='methodology' AND av.entity_id=d.methodology_id AND av.version=d.methodology_version
      JOIN artifact_versions ds ON ds.kind='dataset' AND ds.entity_id=d.dataset_id AND ds.version=d.dataset_version
      LEFT JOIN decision_assumptions da ON da.decision_id=d.id AND da.decision_version=d.version
      LEFT JOIN decision_features df ON df.decision_id=d.id AND df.decision_version=d.version
      WHERE d.id=$1 GROUP BY d.status,d.execution_allowed,av.kind,ds.kind`, [decision.id]);
    assert.deepEqual(chain.rows[0], { status: "evaluation_only", execution_allowed: false, methodology_kind: "methodology", dataset_kind: "dataset", assumptions: 1, features: 1 });
    await assert.rejects(provenanceRepository.createDatasetSnapshot({ entityId: "future_dataset", version: 1, description: "Invalid future dataset", purpose: "integration test only", cutoffAt: "2026-08-20T11:00:00.000Z", observationIds: [observationId] }), /not-yet-known/);
  });
  await t.test("transaction and valuation ledger is exact, isolated and evaluation-only", async () => {
    const subjectId = "integration-owner-a";
    const observationId = (await admin.query("SELECT id FROM observations ORDER BY created_at LIMIT 1")).rows[0].id;
    const transactionInput = {
      subjectId, eventKind: "trade", assetKey: "TEST_ONLY", quantityDelta: "1", quantityUnit: "gram",
      cashDelta: "-1", cashCurrency: "TOMAN", feeAmount: "0", occurredAt: "2026-08-20T09:00:00.000Z",
      correctionOf: null, correctionReason: null, evidenceHash: null,
    };
    const transaction = await ledgerRepository.recordTransaction(transactionInput);
    assert.equal(transaction.alreadyRecorded, false);
    assert.equal((await ledgerRepository.recordTransaction(transactionInput)).alreadyRecorded, true);
    const valuationInput = {
      subjectId, portfolioVersion: 1, asOf: "2026-08-20T13:00:00.000Z",
      dataset: { entityId: "test_dataset", version: 1 }, methodology: { entityId: "test_methodology", version: 1 },
      reportingCurrency: "TOMAN", totalValue: "1", transactionIds: [transaction.id],
      positions: [{ positionKey: "position-test", assetKey: "TEST_ONLY", quantity: "1", unit: "gram", observationId, price: "1", value: "1" }],
    };
    const valuation = await ledgerRepository.recordValuation(valuationInput);
    assert.equal(valuation.alreadyRecorded, false);
    const stored = await admin.query(`SELECT s.status,s.total_value::text,count(p.*)::integer AS positions,count(vt.*)::integer AS transactions
      FROM portfolio_valuation_snapshots s JOIN portfolio_valuation_positions p ON p.valuation_id=s.id
      JOIN portfolio_valuation_transactions vt ON vt.valuation_id=s.id
      WHERE s.id=$1 GROUP BY s.status,s.total_value`, [valuation.id]);
    assert.deepEqual(stored.rows[0], { status: "evaluation_only", total_value: "1.00", positions: 1, transactions: 1 });
    const isolated = await runtimePool.connect();
    try {
      await isolated.query("BEGIN");
      await isolated.query("SELECT set_config('asha.subject_id','integration-owner-b',true)");
      assert.equal(Number((await isolated.query("SELECT count(*) FROM portfolio_transaction_events")).rows[0].count), 0);
    } finally { await isolated.query("ROLLBACK"); isolated.release(); }
    await admin.query("BEGIN");
    try { await assert.rejects(admin.query("UPDATE portfolio_transaction_events SET fee_amount=2"), /immutable data records/); }
    finally { await admin.query("ROLLBACK"); }
    await assert.rejects(ledgerRepository.recordTransaction({ ...transactionInput, assetKey: "OTHER_ASSET", correctionOf: transaction.id, correctionReason: "Synthetic wrong-asset correction" }), /correction target/);
    const otherOwnerTransaction = await ledgerRepository.recordTransaction({ ...transactionInput, subjectId: "integration-owner-b" });
    await assert.rejects(ledgerRepository.recordValuation({
      subjectId, portfolioVersion: 1, asOf: "2026-08-20T13:00:00.000Z",
      dataset: { entityId: "test_dataset", version: 1 }, methodology: { entityId: "test_methodology", version: 1 },
      reportingCurrency: "TOMAN", totalValue: "1", transactionIds: [otherOwnerTransaction.id],
      positions: [{ positionKey: "position-cross-owner", assetKey: "TEST_ONLY", quantity: "1", unit: "gram", observationId, price: "1", value: "1" }],
    }), /owner lineage|query returned no rows/);
    const currentPortfolio = await portfolioRepository.load(subjectId);
    assert.equal((await portfolioRepository.save(subjectId, 1, currentPortfolio.holdings, currentPortfolio.preferences)).version, 2);
    assert.equal((await ledgerRepository.recordValuation(valuationInput)).alreadyRecorded, true);
  });
  await t.test("durable Navasan quota serializes concurrent workers and fails closed at the safety limit", async () => {
    await admin.query(`INSERT INTO provider_request_reservations
      (id,provider_id,endpoint,request_hash,window_days,limit_snapshot)
      SELECT 'navasan_request_' || lpad(to_hex(g),8,'0') || '-0000-4000-8000-' || lpad(to_hex(g),12,'0'),
        'navasan','latest',repeat('a',64),31,115
      FROM generate_series(1,114) AS g`);
    const hash = fingerprintNavasanRequest("latest", { item: "approved-phase-1-set" });
    const outcomes = await Promise.all([quotaLedger.reserve("latest", hash), quotaLedger.reserve("latest", hash)]);
    assert.equal(outcomes.filter((outcome) => outcome.allowed).length, 1);
    assert.equal(outcomes.filter((outcome) => !outcome.allowed).length, 1);
    assert.equal(Number((await admin.query("SELECT count(*) FROM provider_request_reservations")).rows[0].count), NAVASAN_DURABLE_CALL_LIMIT);
    await assert.rejects(admin.query("UPDATE provider_request_reservations SET limit_snapshot=1"), /immutable data records/);
  });
  await t.test("backup restores into an independently created test schema", async () => {
    const url = new URL(connectionString);
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
    const args = ["--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", "asha_integration", "--no-password"];
    const executable = (name) => process.env.ASHA_PG_BIN ? join(process.env.ASHA_PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name;
    const container = process.env.ASHA_PG_CONTAINER_ID;
    if (container && !/^[a-f0-9]{12,64}$/.test(container)) throw new Error("Unexpected CI PostgreSQL container identifier");
    const clientCommand = (name, commandArgs, input) => execFileSync(
      container ? "docker" : executable(name),
      container ? ["exec", "-i", "--env", "PGPASSWORD", container, name, ...commandArgs] : commandArgs,
      { input, env, windowsHide: true, stdio: "pipe", timeout: 30_000, maxBuffer: 10_485_760 },
    ).toString();
    for (const name of ["pg_dump", "psql"]) assert.match(clientCommand(name, ["--version"]), /\b17\./);
    const dump = clientCommand("pg_dump", [...args, "--schema", schema, "--no-owner", "--no-privileges"]).replaceAll(schema, restoredSchema);
    // pg_dump plain output includes psql meta commands; use psql's parser.
    clientCommand("psql", [...args, "--set", "ON_ERROR_STOP=1", "--single-transaction"], dump);
    restoredCreated = true;
    for (const table of ["asha_schema_migrations", "instruments", "sources", "source_contract_versions", "ingestion_batches", "observations", "quarantine_records", "quarantine_resolutions", "validation_results", "user_portfolios", "portfolio_holdings", "portfolio_preferences", "artifact_versions", "dataset_observations", "decision_records", "decision_assumptions", "decision_features", "source_reconciliations", "source_reconciliation_candidates", "portfolio_transaction_events", "portfolio_valuation_snapshots", "portfolio_valuation_positions", "portfolio_valuation_transactions", "provider_request_reservations"]) {
      const allRows = async (schemaName) => (await admin.query(`SELECT to_jsonb(t) AS row FROM "${schemaName}"."${table}" t ORDER BY to_jsonb(t)::text`)).rows;
      assert.deepEqual(await allRows(restoredSchema), await allRows(schema));
    }
    await admin.query(`SET search_path TO "${restoredSchema}"`);
    try {
      await admin.query(`GRANT USAGE ON SCHEMA "${restoredSchema}" TO "${role}"`);
      await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${restoredSchema}" TO "${role}"`);
      await admin.query(`GRANT INSERT ON ingestion_batches, observations, quarantine_records, validation_results, quarantine_resolutions TO "${role}"`);
      await admin.query(`GRANT INSERT, UPDATE, DELETE ON user_portfolios, portfolio_holdings, portfolio_preferences TO "${role}"`);
      await admin.query(`GRANT INSERT ON artifact_versions, dataset_observations, decision_records, decision_assumptions, decision_features TO "${role}"`);
      await admin.query(`GRANT INSERT ON source_reconciliations, source_reconciliation_candidates TO "${role}"`);
      await admin.query(`GRANT INSERT ON portfolio_transaction_events, portfolio_valuation_snapshots, portfolio_valuation_positions, portfolio_valuation_transactions TO "${role}"`);
      await admin.query(`GRANT INSERT ON provider_request_reservations TO "${role}"`);
      const restoredPool = { async connect() {
        const client = await pool.connect();
        await client.query(`SET ROLE "${role}"`);
        await client.query(`SET search_path TO "${restoredSchema}"`);
        return client;
      } };
      const restoredRepository = new PostgresObservationRepository(createPgTransactionRunner(restoredPool));
      assert.equal((await restoredRepository.persistBatch(batch)).alreadyProcessed, true);
      const observation = (await validateObservation({ ...raw, value: "3" }, registry, new Date("2026-08-20T12:00:00Z"))).observation;
      assert.equal((await restoredRepository.persistBatch({ ...batch, id: "restored-write", accepted: [observation], quarantined: [], duplicates: [] })).insertedObservations, 1);
      await assert.rejects(admin.query("UPDATE observations SET value=4"), /immutable data records/);
      const runtime = await restoredPool.connect();
      try { await assert.rejects(runtime.query("TRUNCATE observations CASCADE"), /permission denied/); }
      finally { runtime.release(); }
    } finally { await admin.query(`SET search_path TO "${schema}"`); }
  });
});
