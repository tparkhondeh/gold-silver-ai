import assert from "node:assert/strict";
import test from "node:test";
import { NAVASAN_QUOTA_HANDOFF_VERSION, NAVASAN_QUOTA_HANDOFF_MAX_ROWS, NAVASAN_QUOTA_HANDOFF_MAX_BYTES,
  validateNavasanQuotaHandoffReferences, validateNavasanQuotaHandoffData as validateData, createNavasanQuotaHandoffManifest as createManifest,
  encodeNavasanQuotaHandoff as encodeData, decodeNavasanQuotaHandoff as decodeData, inspectNavasanQuotaHandoff as inspectData } from "../data/navasan-quota-handoff.ts";

const observedAt = "2000-04-01T00:00:00.000000Z";
const validateNavasanQuotaHandoffData = (value, at = observedAt) => validateData(value, at);
const createNavasanQuotaHandoffManifest = (value, at = observedAt) => createManifest(value, at);
const encodeNavasanQuotaHandoff = (value, at = observedAt) => encodeData(value, at);
const decodeNavasanQuotaHandoff = (value, at = observedAt) => decodeData(value, at);
const inspectNavasanQuotaHandoff = (value, at = observedAt) => inspectData(value, at);

// Every reference and record below is synthetic; no account, key or source read.
const capturedAt = "2000-02-01T12:00:00.123456Z";
const cutoff = "2000-01-01T12:00:00.123456Z";
const id = index => `navasan_request_00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const row = (index = 1, changes = {}) => ({ id: id(index), endpoint: "latest", requestHash: "a".repeat(64),
  reservedAt: "2000-02-01T11:59:59.123455Z", createdAt: "2000-02-01T11:59:59.123456Z", windowDays: 31, limitSnapshot: 115, ...changes });
const data = (rows = [row()], changes = {}) => ({ version: NAVASAN_QUOTA_HANDOFF_VERSION, provider: "navasan", plan: "free",
  quotaScopeRef: `qscope_${"1".repeat(32)}`, sourceLedgerId: `qledger_${"2".repeat(32)}`, targetLedgerId: `qledger_${"3".repeat(32)}`,
  targetOrigin: "https://goldsilver.wealthos.ir", identityBindingHash: "4".repeat(64), ownerTransferApprovalRef: `approval_${"5".repeat(32)}`,
  capturedAt, sourceRefreshSeconds: 24_000, latestReservationId: rows.filter(row => row.endpoint === "latest").sort((a, b) => b.reservedAt.localeCompare(a.reservedAt))[0]?.id ?? null,
  reservations: rows, ...changes });
const references = (input = data()) => ({ quotaScopeRef: input.quotaScopeRef, targetLedgerId: input.targetLedgerId, targetOrigin: input.targetOrigin,
  identityBindingHash: input.identityBindingHash, handoffSha256: createNavasanQuotaHandoffManifest(input).sha256, ownerTransferApprovalRef: input.ownerTransferApprovalRef });
const assertInactive = result => {
  for (const key of ["sourceCompletenessVerified", "providerAccountVerified", "sourceFenced", "ownerTransferApproved", "activationReady"]) assert.equal(result[key], false, key);
};

test("strict opaque references canonicalize without key-derived account identity or approval claims", () => {
  const expected = references(), shuffled = Object.fromEntries(Object.entries(expected).reverse());
  assert.deepEqual(validateNavasanQuotaHandoffReferences(shuffled), expected);
  assert.equal(Object.isFrozen(validateNavasanQuotaHandoffReferences(expected)), true);
  for (const change of [{ quotaScopeRef: "api_key_synthetic" }, { quotaScopeRef: "qscope_" + "A".repeat(32) }, { targetLedgerId: "qledger_other" },
    { targetOrigin: "https://elsewhere.invalid" }, { identityBindingHash: "g".repeat(64) }, { handoffSha256: "short" }, { ownerTransferApprovalRef: "approved" }, { enabled: true }]) {
    assert.throws(() => validateNavasanQuotaHandoffReferences({ ...expected, ...change }), /details withheld/);
  }
  const missing = { ...expected }; delete missing.ownerTransferApprovalRef; assert.throws(() => validateNavasanQuotaHandoffReferences(missing));
});

test("canonical document order/hash ignores input field and row order while preserving exact values", () => {
  const original = data([row(2, { endpoint: "dailyCurrency" }), row(1)]), before = structuredClone(original);
  const shuffled = Object.fromEntries(Object.entries(original).reverse());
  shuffled.reservations = [...original.reservations].reverse().map(item => Object.fromEntries(Object.entries(item).reverse()));
  assert.equal(encodeNavasanQuotaHandoff(shuffled), encodeNavasanQuotaHandoff(original));
  const decoded = decodeNavasanQuotaHandoff(encodeNavasanQuotaHandoff(original));
  assert.match(decoded.sha256, /^[a-f0-9]{64}$/); assert.deepEqual(decoded.data.reservations.map(item => item.id), [id(1), id(2)]);
  assert.equal(decoded.data.reservations[0].reservedAt, "2000-02-01T11:59:59.123455Z"); assert.deepEqual(original, before);
});

test("caller mutation cannot alter the frozen canonical data, rows, manifest or inspection result", () => {
  const original = data(), manifest = createNavasanQuotaHandoffManifest(original), result = inspectNavasanQuotaHandoff(original);
  original.reservations[0].requestHash = "b".repeat(64); original.reservations.push(row(2)); original.quotaScopeRef = `qscope_${"9".repeat(32)}`;
  assert.equal(manifest.data.reservations.length, 1); assert.equal(manifest.data.reservations[0].requestHash, "a".repeat(64));
  for (const value of [manifest, manifest.data, manifest.data.reservations, manifest.data.reservations[0], result]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { manifest.data.reservations[0].reservedAt = capturedAt; }, TypeError); assertInactive(result);
});

test("inclusive31-day boundary retains the exact cutoff and one microsecond later", () => {
  const result = inspectNavasanQuotaHandoff(data([row(1, { reservedAt: cutoff, createdAt: cutoff }), row(2, { endpoint: "ohlcSearch", reservedAt: "2000-01-01T12:00:00.123457Z" })]));
  assert.equal(result.declaredWindowStart, cutoff); assert.equal(result.declaredUsed, 2); assert.equal(result.declaredRemaining, 113); assertInactive(result);
  const old = row(3, { endpoint: "dailyCurrency", reservedAt: "2000-01-01T12:00:00.123455Z" });
  assert.throws(() => validateNavasanQuotaHandoffData(data([old])), /details withheld/);
});

test("globally latest request survives outside31 days and preserves even a one-year cadence", () => {
  const old = row(1, { reservedAt: "1999-12-31T12:00:00.123456Z", createdAt: "1999-12-31T12:00:00.123456Z" });
  const result = inspectNavasanQuotaHandoff(data([old], { sourceRefreshSeconds: 31_536_000 }));
  assert.equal(result.declaredUsed, 0); assert.equal(result.declaredRemaining, 115);
  assert.equal(result.declaredLatestNextEligibleAt, "2000-12-30T12:00:00.123456Z");
  assert.equal(result.declaredCooldownSeconds, 333 * 86_400); assertInactive(result);
});

test("source cadence and microsecond cooldown are retained, never shortened to the default", () => {
  const result = inspectNavasanQuotaHandoff(data([row(1, { reservedAt: "2000-02-01T12:00:00.123455Z" })], { sourceRefreshSeconds: 86_400 }));
  assert.equal(result.declaredLatestNextEligibleAt, "2000-02-02T12:00:00.123455Z"); assert.equal(result.declaredCooldownSeconds, 86_400);
  assert.equal(result.manifest.data.sourceRefreshSeconds, 86_400);
  const exact = inspectNavasanQuotaHandoff(data([row(1, { reservedAt: "2000-02-01T05:20:00.123456Z" })]));
  assert.equal(exact.declaredCooldownSeconds, 0);
  const justBefore = inspectNavasanQuotaHandoff(data([row(1, { reservedAt: "2000-02-01T05:20:00.123457Z" })]));
  assert.equal(justBefore.declaredCooldownSeconds, 1);
});

test("all three endpoints and repeated request hashes count as distinct committed spend", () => {
  const rows = [row(1), row(2, { endpoint: "dailyCurrency" }), row(3, { endpoint: "ohlcSearch" })];
  const result = inspectNavasanQuotaHandoff(data(rows));
  assert.equal(result.declaredUsed, 3); assert.equal(new Set(result.manifest.data.reservations.map(item => item.requestHash)).size, 1); assertInactive(result);
  // No outcome filter exists: failed, unfinished or timed-out reservations cannot be refunded.
  assert.equal(result.manifest.data.reservations.length, 3);
});

test("at-limit and overlimit source accounting is retained and exhausted, never truncated or reset", () => {
  for (const length of [115, 116, 256]) {
    const input = data(Array.from({ length }, (_, index) => row(index + 1, { endpoint: index % 2 ? "dailyCurrency" : "latest" })));
    const result = inspectNavasanQuotaHandoff(input);
    assert.equal(result.declaredUsed, length); assert.equal(result.declaredRemaining, 0); assert.equal(result.declaredExhausted, true);
    assert.equal(result.manifest.data.reservations.length, length); assertInactive(result);
  }
});

test("duplicate reservation identity rejects even identical records, but does not mutate originals", () => {
  for (const duplicate of [row(), row(1, { requestHash: "b".repeat(64) })]) {
    const input = data([row(), duplicate]), before = JSON.stringify(input);
    assert.throws(() => validateNavasanQuotaHandoffData(input)); assert.equal(JSON.stringify(input), before);
  }
});

test("out-of-schema policy snapshots are rejected, never rewritten", () => {
  for (const change of [{ windowDays: 30 }, { limitSnapshot: 120 }, { windowDays: "31" }, { limitSnapshot: 0 }]) {
    const input = data([row(1, change)]), before = JSON.stringify(input);
    assert.throws(() => validateNavasanQuotaHandoffData(input)); assert.equal(JSON.stringify(input), before);
  }
});

test("latest pointer must identify the newest latest endpoint, not newer history or another row", () => {
  const newest = row(2, { reservedAt: capturedAt, createdAt: capturedAt });
  for (const latestReservationId of [null, id(1), id(3)]) {
    assert.throws(() => validateNavasanQuotaHandoffData(data([row(), newest], { latestReservationId })));
  }
  assert.throws(() => validateNavasanQuotaHandoffData(data([row(3, { endpoint: "dailyCurrency" })], { latestReservationId: id(3) })));
  const result = inspectNavasanQuotaHandoff(data([row(), row(2, { endpoint: "ohlcSearch", reservedAt: capturedAt })]));
  assert.equal(result.manifest.data.latestReservationId, id(1));
});

test("older unrelated history cannot be smuggled into the latest-only handoff exception", () => {
  const latest = row(1, { reservedAt: "1999-12-31T00:00:00.000000Z" });
  assert.throws(() => validateNavasanQuotaHandoffData(data([latest, row(2, { reservedAt: "1999-12-30T00:00:00.000000Z" })])));
  assert.throws(() => validateNavasanQuotaHandoffData(data([row(1, { endpoint: "dailyCurrency", reservedAt: "1999-12-31T00:00:00.000000Z" })], { latestReservationId: id(1) })));
});

test("future reserved/created timestamps and noncanonical or impossible calendar values fail closed", () => {
  for (const invalidTime of ["2000-02-01T12:00:00.123457Z", "2000-02-30T12:00:00.123456Z", "2001-02-29T00:00:00.000000Z", "2000-01-01T24:00:00.000000Z", "2000-01-01T00:00:60.000000Z", "2000-01-01T00:00:00.123Z", "2000-01-01T00:00:00.123456+00:00", "0000-01-01T00:00:00.000000Z"]) {
    for (const field of ["reservedAt", "createdAt"]) assert.throws(() => validateNavasanQuotaHandoffData(data([row(1, { [field]: invalidTime })])), `${field}:${invalidTime}`);
  }
  const leap = data([row(1, { reservedAt: "2000-02-29T12:00:00.000001Z", createdAt: "2000-02-29T12:00:00.000002Z" })], { capturedAt: "2000-03-01T00:00:00.000001Z" });
  assert.equal(validateNavasanQuotaHandoffData(leap).reservations[0].reservedAt, leap.reservations[0].reservedAt);
});

test("timestamp arithmetic remains exact before1970 and refuses year-range overflow", () => {
  const input = data([row(1, { reservedAt: "1900-02-01T00:00:00.000001Z", createdAt: "1900-02-01T00:00:00.000001Z" })], { capturedAt: "1900-02-01T00:00:00.000002Z" });
  const result = inspectNavasanQuotaHandoff(input); assert.equal(result.declaredWindowStart, "1900-01-01T00:00:00.000002Z");
  assert.equal(result.declaredLatestNextEligibleAt, "1900-02-01T06:40:00.000001Z");
  assert.throws(() => validateNavasanQuotaHandoffData(data([row(1, { reservedAt: "9999-12-31T23:59:59.999999Z", createdAt: "9999-12-31T23:59:59.999999Z" })], { capturedAt: "9999-12-31T23:59:59.999999Z" }), "9999-12-31T23:59:59.999999Z"));
});

test("explicit observation clock rejects future capture by one microsecond and never enters canonical data", () => {
  const input = data();
  assert.throws(() => validateData(input, "2000-02-01T12:00:00.123455Z"));
  assert.deepEqual(validateData(input, capturedAt), validateData(input, observedAt));
  assert.equal(createManifest(input, capturedAt).sha256, createManifest(input, observedAt).sha256);
  for (const at of [undefined, null, "bad", "2000-02-01T12:00:00.123Z"]) assert.throws(() => validateData(input, at));
  assert.throws(() => decodeData(encodeData(input, capturedAt), "2000-02-01T12:00:00.123455Z"));
  assertInactive(inspectData(input, capturedAt));
});

test("invalid envelope/version/refs/endpoints/cadence reject rather than infer missing facts", () => {
  for (const change of [{ version: "v2" }, { provider: "other" }, { plan: "gold" }, { sourceLedgerId: data().targetLedgerId },
    { sourceRefreshSeconds: 23_999 }, { sourceRefreshSeconds: 31_536_001 }, { sourceRefreshSeconds: 24_000.5 }, { sourceRefreshSeconds: Infinity },
    { capturedAt: "bad" }, { targetOrigin: "http://localhost" }, { quotaScopeRef: "" }, { ownerTransferApprovalRef: true }, { enabled: true }]) assert.throws(() => validateNavasanQuotaHandoffData(data([row()], change)));
  for (const change of [{ endpoint: "balance" }, { requestHash: "G".repeat(64) }, { id: "duplicate" }, { price: "secret" }, { outcome: "success" }]) assert.throws(() => validateNavasanQuotaHandoffData(data([row(1, change)])));
  const missing = data(); delete missing.latestReservationId; assert.throws(() => validateNavasanQuotaHandoffData(missing));
});

test("bounded inputs reject sparse/accessor/extra-property rows without invoking caller hooks", () => {
  let invoked = false;
  const array = [row()]; Object.defineProperty(array, "0", { enumerable: true, get() { invoked = true; return row(); } });
  assert.throws(() => validateNavasanQuotaHandoffData({ ...data(), reservations: array })); assert.equal(invoked, false);
  const accessor = data(); Object.defineProperty(accessor, "plan", { enumerable: true, get() { invoked = true; return "free"; } });
  assert.throws(() => validateNavasanQuotaHandoffData(accessor)); assert.equal(invoked, false);
  const sparse = Array(1); assert.throws(() => validateNavasanQuotaHandoffData({ ...data(), reservations: sparse }));
  const extra = [row()]; Object.defineProperty(extra, "toJSON", { value() { invoked = true; return []; } });
  assert.throws(() => validateNavasanQuotaHandoffData({ ...data(), reservations: extra })); assert.equal(invoked, false);
  assert.throws(() => validateNavasanQuotaHandoffData({ ...data(), reservations: Array(NAVASAN_QUOTA_HANDOFF_MAX_ROWS + 1).fill(row()) }));
  assert.throws(() => decodeNavasanQuotaHandoff(" ".repeat(NAVASAN_QUOTA_HANDOFF_MAX_BYTES + 1)), /details withheld/);
});

test("decoder verifies canonical bytes and digest; tampering/reformatting never becomes a new approved document", () => {
  const encoded = encodeNavasanQuotaHandoff(data()), manifest = JSON.parse(encoded);
  assert.throws(() => decodeNavasanQuotaHandoff(encoded + "\n")); assert.throws(() => decodeNavasanQuotaHandoff(JSON.stringify(manifest, null, 2)));
  manifest.data.reservations[0].reservedAt = "2000-02-01T11:59:59.123454Z";
  assert.throws(() => decodeNavasanQuotaHandoff(JSON.stringify(manifest)));
  assert.throws(() => decodeNavasanQuotaHandoff(encoded.replace('"sha256":', '"secret":"SYNTHETIC_SECRET","sha256":')), error => !error.message.includes("SYNTHETIC_SECRET"));
  assert.throws(() => decodeNavasanQuotaHandoff("not-json"), /details withheld/);
});

test("one-microsecond changes affect digest; key rotation has no field and cannot reset counts", () => {
  const original = data(), changed = data([row(1, { reservedAt: "2000-02-01T11:59:59.123454Z" })]);
  assert.notEqual(createNavasanQuotaHandoffManifest(original).sha256, createNavasanQuotaHandoffManifest(changed).sha256);
  for (const extra of [{ apiKey: "SYNTHETIC_KEY" }, { keyRotationConfirmed: true }, { providerAccountId: "invented" }, { refunded: true }]) assert.throws(() => validateNavasanQuotaHandoffData({ ...original, ...extra }));
  assert.equal(inspectNavasanQuotaHandoff(original).declaredUsed, 1);
});

test("even valid empty/full/overlimit documents never certify completeness, account, fence, approval or activation", () => {
  for (const input of [data([], { latestReservationId: null }), data(), data(Array.from({ length: 116 }, (_, index) => row(index + 1)))]) {
    const result = inspectNavasanQuotaHandoff(input); assertInactive(result);
    assert.equal(JSON.stringify(result).includes("apiKey"), false);
  }
});
