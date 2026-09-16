import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withSnapshotLock, snapshotFailure, SnapshotStorageError } from "../app/browser-snapshot-storage.ts";
import { createSharedPortfolio, encodeSharedPortfolio, evaluateSharedPortfolio, SHARED_STORAGE_KEY } from "../app/shared-portfolio.ts";
import { saveSharedPortfolio, restoreSharedPortfolio } from "../app/shared-portfolio-storage.ts";
import { createMarketTestPortfolio, MARKET_TEST_STORAGE } from "../app/market-test-contract.ts";
import { saveMarketTest, restoreMarketTest } from "../app/market-test-storage.ts";
import { createFileTestPortfolio, saveFileTest, restoreFileTest, FILE_TEST_STORAGE } from "../app/file-market-contract.ts";
import { createTestLocks } from "./helpers/snapshot-locks.mjs";

const now = Date.parse("2000-01-01T12:00:00.000Z");
const adapters = [
  { key: SHARED_STORAGE_KEY, create: createSharedPortfolio, edit: p => { p.input.cashToman += 10; p.revision++; }, save: (s,p,raw,l) => saveSharedPortfolio(s,p,raw,l), restore: s => restoreSharedPortfolio(s) },
  { key: MARKET_TEST_STORAGE, create: createMarketTestPortfolio, edit: p => { p.cashRial = "100001"; p.revision++; }, save: (s,p,raw,l) => saveMarketTest(s,p,now,raw,l), restore: s => restoreMarketTest(s,now) },
  { key: FILE_TEST_STORAGE, create: createFileTestPortfolio, edit: p => { p.inputs.cashRial = "100001"; p.inputs.revision++; }, save: (s,p,raw,l) => saveFileTest(s,p,now,raw,l), restore: s => restoreFileTest(s,now) },
];
function fixture() {
  const data = new Map([["private-untouched", "do-not-read-or-write"]]);
  const writes = [];
  return { data, writes, storage: { getItem: k => data.get(k) ?? null, setItem: (k,v) => { writes.push(k); data.set(k,v); } }, locks: createTestLocks() };
}

for (const adapter of adapters) {
  test(`${adapter.key}: two tabs cannot silently replace the new saved input`, async () => {
    const { data, storage, locks } = fixture();
    const original = adapter.create();
    const base = await adapter.save(storage,original,null,locks);
    const tabA = await adapter.restore(storage), tabB = await adapter.restore(storage);
    adapter.edit(tabA.portfolio);
    const saved = await adapter.save(storage,tabA.portfolio,tabA.raw,locks);
    await assert.rejects(() => adapter.save(storage,tabB.portfolio,tabB.raw,locks), /بازنویسی نشد/);
    assert.equal(data.get(adapter.key),saved);
    assert.notEqual(saved,base);
    assert.deepEqual((await adapter.restore(storage)).portfolio,tabA.portfolio);
    const latest = await adapter.restore(storage);
    await adapter.save(storage,latest.portfolio,latest.raw,locks);
    assert.equal(data.get("private-untouched"),"do-not-read-or-write");
    // Even a removed snapshot is a conflict, not permission to recreate stale state.
    data.delete(adapter.key);
    await assert.rejects(() => adapter.save(storage,original,saved,locks), /بازنویسی نشد/);
    assert.equal(data.has(adapter.key),false);
  });

  test(`${adapter.key}: unread, corrupt, quota and unavailable storage never get replaced`, async () => {
    const { data, storage, locks, writes } = fixture();
    const p = adapter.create();
    data.set(adapter.key,"corrupt");
    await assert.rejects(async () => adapter.restore(storage));
    for (const expected of [null,undefined,"corrupt"]) await assert.rejects(() => adapter.save(storage,p,expected,locks));
    assert.deepEqual(writes,[]); assert.equal(data.get(adapter.key),"corrupt");
    data.delete(adapter.key);
    const saved = await adapter.save(storage,p,null,locks);
    adapter.edit(p);
    const denied = { ...storage, getItem() { throw Error("private-storage-detail"); } };
    await assert.rejects(() => adapter.save(denied,p,saved,locks));
    await assert.rejects(() => adapter.save({ ...storage, setItem() { throw Error("quota"); } },p,saved,locks));
    assert.equal(data.get(adapter.key),saved);
  });
}

test("shared previous copy survives a no-op save and failed backup/current writes", async () => {
  const { data, storage, locks, writes } = fixture(); const p = createSharedPortfolio();
  const initial = await saveSharedPortfolio(storage,p,null,locks);
  p.input.cashToman += 100; p.revision++;
  const updated = await saveSharedPortfolio(storage,p,initial,locks);
  const backupKey = `${SHARED_STORAGE_KEY}-previous`;
  assert.equal(data.get(backupKey),initial);
  const count = writes.length;
  assert.equal(await saveSharedPortfolio(storage,p,updated,locks),updated);
  assert.equal(writes.length,count); assert.equal(data.get(backupKey),initial);
  p.input.cashToman += 10;
  await assert.rejects(() => saveSharedPortfolio({ ...storage, setItem(k,v) { if (k === backupKey) throw Error("backup quota"); storage.setItem(k,v); } },p,updated,locks));
  assert.equal(data.get(SHARED_STORAGE_KEY),updated); assert.equal(data.get(backupKey),initial);
  await assert.rejects(() => saveSharedPortfolio({ ...storage, setItem(k,v) { if (k === SHARED_STORAGE_KEY) throw Error("current quota"); storage.setItem(k,v); } },p,updated,locks));
  assert.equal(data.get(SHARED_STORAGE_KEY),updated); assert.equal(data.get(backupKey),updated);
});

test("V1 shared document migrates read-only and remains in the previous slot on explicit save", async () => {
  const { data, storage, locks } = fixture(); const p = createSharedPortfolio();
  const payload = JSON.parse(encodeSharedPortfolio(p));
  payload.schemaVersion = "asha.synthetic.shared_document.v1";
  payload.portfolio.schemaVersion = "asha.synthetic.shared_portfolio.v1";
  delete payload.metalDiagnostics; delete payload.portfolio.metalReferences;
  const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
  const legacy = canonical(payload); data.set(SHARED_STORAGE_KEY,legacy);
  const restored = restoreSharedPortfolio(storage);
  assert.equal(data.get(SHARED_STORAGE_KEY),legacy);
  const saved = await saveSharedPortfolio(storage,restored.portfolio,restored.raw,locks);
  assert.equal(data.get(`${SHARED_STORAGE_KEY}-previous`),legacy);
  assert.equal(data.get(SHARED_STORAGE_KEY),saved);
  assert.deepEqual(evaluateSharedPortfolio(restored.portfolio),evaluateSharedPortfolio(p));
});

test("exclusive lock rejects simultaneous writes, releases on failure, and never falls back", async () => {
  const locks = createTestLocks(); let release; let calls = 0;
  const first = withSnapshotLock("test",()=>new Promise(resolve => { release=resolve; }),locks);
  await assert.rejects(() => withSnapshotLock("test",()=>{ calls++; },locks), /تب دیگری/);
  release("saved"); assert.equal(await first,"saved");
  await assert.rejects(() => withSnapshotLock("test",()=>{ throw Error("failed"); },locks), /failed/);
  assert.equal(await withSnapshotLock("test",()=>"retry",locks),"retry");
  await assert.rejects(() => withSnapshotLock("test",()=>{ calls++; },null), /ذخیرهٔ امن/);
  assert.equal(calls,0);
  assert.equal(snapshotFailure(new Error("private raw content"),"safe"),"safe");
  assert.equal(snapshotFailure(new SnapshotStorageError("known"),"safe"),"known");
});

test("all three UIs retain unread-storage guards and disable writes during save", () => {
  for (const name of ["shared-portfolio-workspace", "market-test-workspace", "file-market-workspace"]) {
    const source = readFileSync(new URL(`../app/${name}.tsx`,import.meta.url),"utf8");
    assert.match(source,/storedRaw === undefined/); assert.match(source,/setBusy\(true\)/);
    assert.match(source,/snapshotFailure/); assert.doesNotMatch(source,/localStorage\.(clear|removeItem|setItem)\(/);
  }
});
