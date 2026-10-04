import assert from "node:assert/strict";
import test from "node:test";
import { createNavasanQuotaHandoffManifest, validateNavasanQuotaHandoffReferences, NAVASAN_QUOTA_HANDOFF_VERSION } from "../data/navasan-quota-handoff.ts";
import { parsePrivateMarketCutoverReceipt, verifyPrivateMarketCutoverBaseline, fenceAndCapturePrivateMarketSource,
  importAndGrantPrivateMarketTarget, PRIVATE_MARKET_CUTOVER_VERSION, PRIVATE_MARKET_CUTOVER_MAX_BYTES } from "../scripts/private-market-cutover.ts";

const at = "2000-02-01T00:00:00.123456Z", now = "2000-02-02T00:00:00.123456Z";
const withheld = /Private market cutover unavailable; details withheld/;
function fixture() {
  const manifest = createNavasanQuotaHandoffManifest({ version: NAVASAN_QUOTA_HANDOFF_VERSION, provider: "navasan", plan: "free",
    quotaScopeRef: `qscope_${"1".repeat(32)}`, sourceLedgerId: `qledger_${"2".repeat(32)}`, targetLedgerId: `qledger_${"3".repeat(32)}`,
    targetOrigin: "https://goldsilver.wealthos.ir", identityBindingHash: "4".repeat(64), ownerTransferApprovalRef: `approval_${"5".repeat(32)}`,
    capturedAt: at, sourceRefreshSeconds: 24000, latestReservationId: null, reservations: [] }, at);
  const expectedReferences = validateNavasanQuotaHandoffReferences({ quotaScopeRef: manifest.data.quotaScopeRef, targetLedgerId: manifest.data.targetLedgerId,
    targetOrigin: manifest.data.targetOrigin, identityBindingHash: manifest.data.identityBindingHash, handoffSha256: manifest.sha256,
    ownerTransferApprovalRef: manifest.data.ownerTransferApprovalRef });
  const receipt = { version: PRIVATE_MARKET_CUTOVER_VERSION, expectedReferences,
    sourceDatabase: { database: "asha_local", address: "127.0.0.1", port: 55432, databaseOid: "1234", role: "postgres" },
    sourceFenceRecordedAt: at, sourceRetirement: { evidenceRef: `retirement_${"6".repeat(64)}`, recordedAt: at }, handoffRaw: JSON.stringify(manifest),
    targetDatabase: { database: "asha_private", address: "127.0.0.1", port: 15432, databaseOid: "5678", role: "asha_private_admin" },
    targetRuntimeDatabase: { database: "asha_private", address: "127.0.0.1", port: 15432, databaseOid: "5678", role: "asha_private_runtime" },
    targetAdmissionNotBefore: at, targetRefreshSeconds: 24000 };
  return { receipt, manifest, config: { bindingHash: manifest.data.identityBindingHash, origin: manifest.data.targetOrigin, refreshSeconds: 24000 } };
}
function database(receipt, changes = {}) {
  const statements = [], state = { matched: 0, additions: true, cadence: true, outcomes: true, ...changes };
  return { statements, state, async query(sql, values) {
    statements.push({ sql, values });
    if (sql.startsWith("SET LOCAL") || sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
    if (sql.startsWith("SELECT to_char")) return { rows: [{ at: now }] };
    if (sql.startsWith("SELECT current_database")) return { rows: [receipt.targetRuntimeDatabase] };
    if (sql.startsWith("WITH expected")) return { rows: [state] };
    assert.fail(`Unexpected synthetic query: ${sql}`);
  } };
}

test("cutover receipt is strict canonical frozen evidence, preserving six-digit clock and explicit target runtime", () => {
  const { receipt } = fixture(), parsed = parsePrivateMarketCutoverReceipt(JSON.stringify(receipt), now);
  assert.deepEqual(parsed, receipt); assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.sourceRetirement));
  assert.ok(Object.isFrozen(parsed.expectedReferences)); assert.equal(parsed.sourceFenceRecordedAt, at);
  assert.equal(PRIVATE_MARKET_CUTOVER_MAX_BYTES, 4 * 1024 * 1024 + 16 * 1024);
  for (const raw of ["null", "{}", JSON.stringify(receipt) + "\n", JSON.stringify({ ...receipt, secret: "SYNTHETIC_SECRET" }), " ".repeat(PRIVATE_MARKET_CUTOVER_MAX_BYTES + 1)]) {
    assert.throws(() => parsePrivateMarketCutoverReceipt(raw, now), withheld);
  }
});

test("receipt rejects temporal, binding, physical target, role and cadence inconsistencies", () => {
  const { receipt } = fixture();
  const variants = [
    { version: "other" }, { sourceFenceRecordedAt: now }, { sourceFenceRecordedAt: "2000-02-30T00:00:00.000000Z" },
    { sourceRetirement: { evidenceRef: "", recordedAt: at } }, { sourceRetirement: { evidenceRef: "retirement_synthetic", recordedAt: now } },
    { targetAdmissionNotBefore: "1999-01-01T00:00:00.000000Z" }, { targetAdmissionNotBefore: "2001-01-01T00:00:00.000000Z" },
    { targetRefreshSeconds: 23999 }, { targetRefreshSeconds: 31536001 }, { targetRefreshSeconds: 24000.5 },
    { targetRuntimeDatabase: { ...receipt.targetRuntimeDatabase, databaseOid: "1111" } },
    { targetRuntimeDatabase: { ...receipt.targetRuntimeDatabase, role: receipt.targetDatabase.role } },
    { targetDatabase: { ...receipt.targetDatabase, address: "127.0.0.2" } },
    { sourceDatabase: { ...receipt.sourceDatabase, databaseOid: "4294967296" } },
    { handoffRaw: receipt.handoffRaw + "\n" },
    ...["quotaScopeRef", "targetLedgerId", "identityBindingHash", "handoffSha256", "ownerTransferApprovalRef"].map(key => ({ expectedReferences: {
      ...receipt.expectedReferences, [key]: receipt.expectedReferences[key].replace(/[1-5a-f0-9]/g, "9"),
    } })),
  ];
  for (const change of variants) assert.throws(() => parsePrivateMarketCutoverReceipt(JSON.stringify({ ...receipt, ...change }), now), withheld);
  for (const invalid of [at.slice(0, 23) + "Z", "0000-01-01T00:00:00.000000Z", "not-time"]) assert.throws(() => parsePrivateMarketCutoverReceipt(JSON.stringify(receipt), invalid), withheld);
});

test("restart proof is read-only and exact-baseline rather than fixed lifetime count or empty outcomes", async () => {
  const { receipt, config, manifest } = fixture(), db = database(receipt);
  assert.deepEqual(await verifyPrivateMarketCutoverBaseline(db, receipt, config), { handoffSha256: manifest.sha256, baselineRows: 0, sourceRefreshSeconds: 24000, targetRefreshSeconds: 24000 });
  const final = db.statements.at(-1);
  for (const field of ["r.id=e.id", "r.provider_id='navasan'", "r.endpoint=e.endpoint", "r.request_hash=e.\"requestHash\"", "r.reserved_at=e.\"reservedAt\"", "r.created_at=e.\"createdAt\"", "r.window_days=e.\"windowDays\"", "r.limit_snapshot=e.\"limitSnapshot\""]) assert.ok(final.sql.includes(field));
  assert.ok(final.sql.includes("statement_timestamp()")); assert.equal(final.sql.includes("LIMIT 4097"), false);
  assert.equal(db.statements.some(({ sql }) => /^(GRANT|REVOKE|INSERT|UPDATE|DELETE)/.test(sql)), false);
  assert.deepEqual(final.values, ["[]", [], at, at, 24000]);
  for (const flags of [{ matched: 1 }, { additions: false }, { cadence: false }, { outcomes: false }]) await assert.rejects(verifyPrivateMarketCutoverBaseline(database(receipt, flags), receipt, config), withheld);
});

test("restart proof rejects changed declared database, owner, origin, faster cadence and unsafe schema", async () => {
  const { receipt, config } = fixture();
  for (const changes of [{ bindingHash: "b".repeat(64) }, { origin: "https://elsewhere.invalid" }, { refreshSeconds: 23999 }, { refreshSeconds: Infinity }]) {
    const db = database(receipt); await assert.rejects(verifyPrivateMarketCutoverBaseline(db, receipt, { ...config, ...changes }), withheld);
    assert.equal(db.statements.some(({ sql }) => sql.startsWith("WITH expected")), false);
  }
  const wrong = { ...receipt, targetRuntimeDatabase: { ...receipt.targetRuntimeDatabase, databaseOid: "7777" }, targetDatabase: { ...receipt.targetDatabase, databaseOid: "7777" } };
  await assert.rejects(verifyPrivateMarketCutoverBaseline(database(receipt), wrong, config), withheld);
  await assert.rejects(verifyPrivateMarketCutoverBaseline(database(receipt), receipt, config, { schema: 'public"; DROP TABLE x', runtimeRole: "asha_private_runtime" }), withheld);
  const badDb = { query() { throw Error("SYNTHETIC_PRIVATE_DATABASE_DETAIL"); } };
  await assert.rejects(verifyPrivateMarketCutoverBaseline(badDb, receipt, config), error => withheld.test(error.message) && !error.stack.includes("SYNTHETIC_PRIVATE_DATABASE_DETAIL"));
});

test("operator operations require complete explicit independently observed inputs before any transaction", async () => {
  const runner = { transaction() { assert.fail("Invalid operator inputs must not begin a transaction"); } }, { receipt } = fixture();
  await assert.rejects(fenceAndCapturePrivateMarketSource({ runner, expectedDatabase: receipt.sourceDatabase, expectedMigrations: [], references: {}, retireCallers: async () => assert.fail() }), withheld);
  await assert.rejects(importAndGrantPrivateMarketTarget({ runner, expectedDatabase: receipt.targetDatabase, targetRuntimeDatabase: receipt.targetRuntimeDatabase, expectedMigrations: [], capture: {}, expectedReferences: receipt.expectedReferences, refreshSeconds: 24000 }), withheld);
});
