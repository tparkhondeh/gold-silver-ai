import assert from "node:assert/strict";
import test from "node:test";
import { EVALUATION_DOCUMENT_VERSION, EVALUATION_STORAGE_KEY, EVALUATION_MAX_BYTES, EvaluationStorageError, clearEvaluationState, decodeEvaluationDocument, emptyEvaluationDocument, encodeEvaluationDocument, readEvaluationState, saveEvaluationBook, saveEvaluationPlanning } from "../app/evaluation-client.ts";
import { emptyPersonalPlanning } from "../app/personal-planning.ts";
import { emptyPurchaseBook } from "../app/purchase-book.ts";

export const lot = (id = "synthetic-1", extra = {}) => ({ id, assetId: "GOLD_18K_IRR", assetClass: "gold", unit: "gram", purityPermille: 750, quantity: "1.000000000001", purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", unitPrice: "100.000000000001", fees: "0", note: "NONPRIVATE TEST", source: { kind: "manual", reference: null }, fx: null, ...extra });
export function fixture(initial = null) {
  const values = new Map([["asha-purchase-book-v1", "PRIVATE-SENTINEL"], ["gold-silver-holdings", "PRIVATE-SENTINEL"], ["asha-personal-latest-market-v1", "PRIVATE-SENTINEL"]]);
  if (initial !== null) values.set(EVALUATION_STORAGE_KEY, initial);
  const calls = [], failures = { read: false, write: false, remove: false, afterWrite: false };
  let written = false;
  const storage = {
    getItem(key) { calls.push(["read", key]); assert.equal(key, EVALUATION_STORAGE_KEY); if (failures.read || written && failures.afterWrite) throw Error("RAW-PRIVATE-ERROR"); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(["write", key]); assert.equal(key, EVALUATION_STORAGE_KEY); if (failures.write) throw Error("RAW-PRIVATE-ERROR"); written = true; values.set(key, value); },
    removeItem(key) { calls.push(["remove", key]); assert.equal(key, EVALUATION_STORAGE_KEY); if (failures.remove) throw Error("RAW-PRIVATE-ERROR"); values.delete(key); },
  };
  return { storage, values, calls, failures };
}
const book = (...lots) => ({ ...emptyPurchaseBook(), lots });

test("legacy evaluation remains byte-identical until explicit save; planning and purchases share one revision", () => {
  const legacy = JSON.stringify({ version: "asha.public_evaluation.v1", revision: 7, book: book(lot()) });
  const f = fixture(legacy), read = readEvaluationState(f.storage);
  assert.deepEqual(read.document.planning, emptyPersonalPlanning());
  assert.equal(f.values.get(EVALUATION_STORAGE_KEY), legacy);
  assert.equal(f.calls.some(([action]) => action === "write"), false);
  const planning = { ...emptyPersonalPlanning(), spendableCashToman: "0", mediumTermMonths: 9 };
  const saved = saveEvaluationPlanning(f.storage, legacy, planning);
  assert.equal(saved.document.revision, 8); assert.deepEqual(saved.document.book, book(lot()));
  assert.equal(saved.document.planning.spendableCashToman, "0");
  assert.throws(() => saveEvaluationBook(f.storage, legacy, book()), error => error.reason === "conflict");
  const purchaseSave = saveEvaluationBook(f.storage, saved.raw, book(lot("second")));
  assert.deepEqual(purchaseSave.document.planning, planning);
  assert.deepEqual(readEvaluationState(f.storage), purchaseSave);
  for (const [key, value] of f.values) if (key !== EVALUATION_STORAGE_KEY) assert.equal(value, "PRIVATE-SENTINEL");
});

test("invalid planning, malformed v2 and failed storage do not replace existing evaluation", () => {
  const valid = JSON.stringify(emptyEvaluationDocument());
  for (const extra of [{ spendableCashToman: "-1" }, { spendableCashToman: "0.001" }, { mediumTermMonths: 0 }, { mediumTermMonths: 1.5 }, { mediumTermMonths: 32768 }]) {
    const f = fixture(valid);
    assert.throws(() => saveEvaluationPlanning(f.storage, valid, { ...emptyPersonalPlanning(), ...extra }), EvaluationStorageError);
    assert.equal(f.values.get(EVALUATION_STORAGE_KEY), valid); assert.equal(f.calls.length, 0);
  }
  const f = fixture(valid); f.failures.write = true;
  assert.throws(() => saveEvaluationPlanning(f.storage, valid, { ...emptyPersonalPlanning(), spendableCashToman: "100.01" }), error => error.reason === "unavailable");
  assert.equal(f.values.get(EVALUATION_STORAGE_KEY), valid);
  const malformed = { ...emptyEvaluationDocument() }; delete malformed.planning;
  assert.throws(() => decodeEvaluationDocument(JSON.stringify(malformed)), EvaluationStorageError);
});

test("evaluation has one empty isolated namespace, no implicit storage write or personal recovery", () => {
  const f = fixture();
  assert.deepEqual(readEvaluationState(f.storage), { raw: null, document: emptyEvaluationDocument() });
  assert.deepEqual(f.calls, [["read", EVALUATION_STORAGE_KEY]]);
  assert.deepEqual(emptyEvaluationDocument(), { version: EVALUATION_DOCUMENT_VERSION, revision: 0, book: emptyPurchaseBook(), planning: emptyPersonalPlanning() });
  assert.equal([...f.values.values()].every(value => value === "PRIVATE-SENTINEL"), true);
});
test("evaluation roundtrip preserves exact decimals, IDs, dated FX and import receipts", () => {
  const f = fixture();
  const purchase = lot("imported", { source: { kind: "xlsx", reference: "synthetic invoice" }, fx: { tomanPerUsd: "20.000000000001", rateDate: "2000-01-01", rateType: "user", source: "NONPRIVATE TEST", receivedAt: "2000-01-02T00:00:00.000Z", validity: "user_entered_unverified" } });
  const candidate = { ...book(purchase), imports: [{ fileSha256: "a".repeat(64), importedAt: "2000-01-03T00:00:00.000Z", lotIds: [purchase.id] }] };
  const saved = saveEvaluationBook(f.storage, null, candidate);
  assert.equal(saved.document.revision, 1); assert.deepEqual(saved.document.book, candidate);
  assert.deepEqual(readEvaluationState(f.storage), saved);
  candidate.lots[0].quantity = "9"; assert.equal(saved.document.book.lots[0].quantity, "1.000000000001");
  const edited = structuredClone(saved.document.book); edited.lots[0].unitPrice = "123.000000000001";
  const next = saveEvaluationBook(f.storage, saved.raw, edited);
  assert.equal(next.document.revision, 2); assert.deepEqual(next.document.book.imports, saved.document.book.imports);
  for (const [key, value] of f.values) if (key !== EVALUATION_STORAGE_KEY) assert.equal(value, "PRIVATE-SENTINEL");
});
test("strict stored schema rejects foreign backups, invalid identity, duplicates, extras and oversize without clearing", () => {
  const valid = { ...emptyEvaluationDocument(), book: book(lot()) };
  const bad = ["{", "null", "[]", JSON.stringify({ format: "asha.personal_portfolio_backup.v1", snapshot: valid }),
    JSON.stringify({ ...valid, extra: true }), JSON.stringify({ ...valid, revision: -1 }), JSON.stringify({ ...valid, revision: 0.1 }),
    JSON.stringify({ ...valid, book: book(lot("same"), lot("same")) }),
    JSON.stringify({ ...valid, book: book(lot("wrong", { purityPermille: 999 })) }),
    JSON.stringify({ ...valid, book: book(lot("wrong", { quantity: 1 })) }), " ".repeat(EVALUATION_MAX_BYTES + 1)];
  for (const raw of bad) {
    assert.throws(() => decodeEvaluationDocument(raw), EvaluationStorageError);
    const f = fixture(raw); assert.deepEqual(readEvaluationState(f.storage), { raw, document: null });
    assert.equal(f.values.get(EVALUATION_STORAGE_KEY), raw);
    assert.equal(f.calls.some(([action]) => action !== "read"), false);
  }
});
test("invalid candidate or corrupt base cannot write; revision overflow fails before storage", () => {
  for (const [raw, next] of [[null, book(lot("invalid", { fees: "-1" }))], ["broken", book(lot())], [JSON.stringify({ ...emptyEvaluationDocument(), revision: Number.MAX_SAFE_INTEGER }), book(lot())]]) {
    const f = fixture(raw); assert.throws(() => saveEvaluationBook(f.storage, raw, next), EvaluationStorageError);
    assert.equal(f.calls.length, 0);
  }
  assert.throws(() => encodeEvaluationDocument({ ...emptyEvaluationDocument(), unexpected: true }), EvaluationStorageError);
});
test("changed entry cannot be overwritten or cleared by a stale view", () => {
  const f = fixture(), saved = saveEvaluationBook(f.storage, null, book(lot()));
  const external = JSON.stringify({ ...saved.document, revision: 9 }); f.values.set(EVALUATION_STORAGE_KEY, external);
  for (const work of [() => saveEvaluationBook(f.storage, saved.raw, book(lot("second"))), () => clearEvaluationState(f.storage, saved.raw)]) {
    assert.throws(work, error => error instanceof EvaluationStorageError && error.reason === "conflict");
    assert.equal(f.values.get(EVALUATION_STORAGE_KEY), external);
  }
});
test("storage errors and unconfirmed writes remain generic and preserve recoverable state", () => {
  for (const failure of ["read", "write", "afterWrite"]) {
    const f = fixture(); f.failures[failure] = true;
    assert.throws(() => saveEvaluationBook(f.storage, null, book(lot())), error => error instanceof EvaluationStorageError && !error.message.includes("RAW"));
    if (failure !== "afterWrite") assert.equal(f.values.has(EVALUATION_STORAGE_KEY), false);
    else { f.failures.afterWrite = false; assert.deepEqual(readEvaluationState(f.storage).document.book, book(lot())); }
  }
  const f = fixture("corrupt"); f.failures.remove = true;
  assert.throws(() => clearEvaluationState(f.storage, "corrupt"), EvaluationStorageError); assert.equal(f.values.get(EVALUATION_STORAGE_KEY), "corrupt");
});
test("explicit reset removes only evaluation bytes, including confirmed corrupt data", () => {
  for (const initial of [null, "corrupt", JSON.stringify({ ...emptyEvaluationDocument(), book: book(lot()) })]) {
    const f = fixture(initial); assert.deepEqual(clearEvaluationState(f.storage, initial), { raw: null, document: emptyEvaluationDocument() });
    assert.equal(f.values.has(EVALUATION_STORAGE_KEY), false); assert.equal(f.values.size, 3);
    assert.equal([...f.values.values()].every(value => value === "PRIVATE-SENTINEL"), true);
  }
});
