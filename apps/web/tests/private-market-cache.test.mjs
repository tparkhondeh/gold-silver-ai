import assert from "node:assert/strict";
import test from "node:test";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, opendir, readFile, rename, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, resolve, sep } from "node:path";
import { makeNavasanSnapshot, MARKET_TTL_MS } from "../app/market-test-contract.ts";
import { emptyPurchaseBook, purchaseAssetCatalog } from "../app/purchase-book.ts";
import { evaluatePersonalMarketValuation } from "../app/personal-market-valuation.ts";
import { decodeManagedCache, encodeManagedCache } from "../data/managed-market-cache.ts";
import { createPrivateMarketCache, createPrivateMarketCacheWithIo } from "../scripts/private-market-cache.ts";
import { PRIVATE_MARKET_CACHE_DIRECTORY as destination } from "../scripts/private-market-cache-storage.ts";
import { PRIVATE_DATA_ROOT } from "../scripts/private-supervision.ts";

const now = Date.parse("2000-01-01T12:00:00.000Z"), uid = 1001;
const snapshot = (receipt = now, published = receipt, value = "5000000") => makeNavasanSnapshot({
  "18ayar": { value, timestamp: String(Math.floor(published / 1000)) },
  usd_sell: { value: "100000", timestamp: String(Math.floor(published / 1000)) },
}, "TOMAN", new Date(receipt).toISOString());
const errno = code => Object.assign(Error("SYNTHETIC_PRIVATE_DETAIL"), { code });
function runner() {
  let tail = Promise.resolve(); const calls = [];
  return { calls, transaction(work) {
    const task = tail.then(() => work({ async query(sql) { calls.push(sql); assert.equal(sql, "SELECT pg_advisory_xact_lock(174228531, 11)"); return { rows: [] }; } }));
    tail = task.catch(() => {}); return task;
  } };
}
function fixture(initial = null) {
  let inode = 1, descriptor = 10, tick = 1;
  const handles = new Map(), calls = [];
  const node = (kind = "directory", changes = {}) => ({ kind, uid, mode: kind === "directory" ? 0o700 : 0o600,
    ino: inode++, dev: 1, nlink: kind === "directory" ? 2 : 1, body: Buffer.alloc(0), mtimeMs: tick++, ctimeMs: tick++, children: new Map(), ...changes });
  const root = node("directory", { uid: 0, mode: 0o755 });
  const lookup = path => {
    const match = /^\/proc\/self\/fd\/(\d+)(?:\/(.*))?$/.exec(path);
    let current = match ? handles.get(Number(match[1])) : root;
    for (const part of (match ? match[2] ?? "" : path).split("/").filter(Boolean)) current = current?.children.get(part);
    if (!current) throw errno("ENOENT"); return current;
  };
  const add = (path, value) => { lookup(posix.dirname(path)).children.set(posix.basename(path), value); return value; };
  const stat = value => ({ ...value, size: value.body.length, isDirectory: () => value.kind === "directory", isFile: () => value.kind === "file", isSymbolicLink: () => value.kind === "link" });
  for (const path of ["/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", PRIVATE_DATA_ROOT, destination]) add(path, node("directory", path === "/home" ? { uid: 0, mode: 0o755 } : {}));
  const f = { calls, handles, lookup, add, node, hook: null, context: { platform: "linux", uid }, db: runner() };
  const invoke = async (operation, path, extra) => { calls.push({ operation, path, extra }); await f.hook?.(operation, path, extra); };
  const io = {
    context: () => f.context,
    async lstat(path) { await invoke("lstat", path); return stat(lookup(path)); },
    async open(path, flags, mode) {
      await invoke("open", path, { flags, mode });
      let value;
      try { value = lookup(path); } catch (error) { if (error.code !== "ENOENT" || !(flags & constants.O_CREAT)) throw error; }
      if (value && flags & constants.O_EXCL) throw errno("EEXIST");
      if (!value) value = add(path, node("file", { mode }));
      if (value.kind === "link") throw errno("ELOOP");
      if ((flags & constants.O_DIRECTORY) && value.kind !== "directory") throw errno("ENOTDIR");
      const fd = descriptor++; handles.set(fd, value);
      return { fd,
        async stat() { await invoke("fstat", path); return stat(value); },
        async close() { handles.delete(fd); await invoke("close", path); },
        async sync() { await invoke("sync", path); },
        async read(buffer, offset, length, position) { await invoke("read", path); const bytesRead = Math.max(0, Math.min(length, value.body.length - position)); value.body.copy(buffer, offset, position, position + bytesRead); return { bytesRead }; },
        async writeFile(raw) { await invoke("write", path, raw); value.body = Buffer.from(raw); value.mtimeMs = tick++; value.ctimeMs = tick++; },
      };
    },
    async names(path) { await invoke("names", path); return [...lookup(path).children.keys()]; },
    async rename(from, to) { await invoke("rename", from, to); const value = lookup(from); lookup(posix.dirname(to)).children.set(posix.basename(to), value); lookup(posix.dirname(from)).children.delete(posix.basename(from)); },
    async unlink(path) { await invoke("unlink", path); lookup(path); lookup(posix.dirname(path)).children.delete(posix.basename(path)); },
  };
  if (initial) add(`${destination}/latest.json`, node("file", { body: Buffer.from(encodeManagedCache(initial, now + 100_000)) }));
  f.io = io; f.cache = createPrivateMarketCacheWithIo(io, f.db); return f;
}
async function denied(f, work) {
  await assert.rejects(work, error => error.message === "Private latest cache unavailable or unsafe; details withheld");
  assert.equal(f.handles.size, 0);
}

test("fixed Linux cache reuses canonical documents and leaves only the latest snapshot", async () => {
  const f = fixture(); assert.equal(await f.cache.read(now), null);
  assert.deepEqual(await f.cache.replace(snapshot(), now), snapshot());
  assert.deepEqual(await createPrivateMarketCacheWithIo(f.io, f.db).read(now), snapshot());
  assert.deepEqual([...f.lookup(destination).children.keys()], ["latest.json"]);
  assert.deepEqual(decodeManagedCache(f.lookup(`${destination}/latest.json`).body.toString(), now), snapshot());
  assert.equal(f.lookup(`${destination}/latest.json`).mode, 0o600);
  assert.ok(f.calls.filter(c => ["write", "rename", "unlink"].includes(c.operation)).every(c => /^\/proc\/self\/fd\/\d+\//.test(c.path)));
  assert.equal(f.handles.size, 0); assert.equal(f.db.calls.length, 1);
});

test("hosted-cache replay preserves exact synthetic multi-lot valuation, the purchase book and stale unavailability", async () => {
  const asset = purchaseAssetCatalog.find(item => item.id === "GOLD_18K_IRR");
  const lots = [["synthetic-first", "2.5", "8000000", "100000"], ["synthetic-second", "1.5", "10000000", "0"]].map(([id, quantity, unitPrice, fees]) => ({
    id, assetId: asset.id, assetClass: asset.assetClass, unit: asset.unit, purityPermille: asset.purityPermille, quantity, unitPrice, fees,
    purchaseDate: "2000-01-01", purchaseTime: null, paymentCurrency: "TOMAN", note: "[ساختگی]", source: { kind: "manual", reference: null }, fx: null,
  }));
  const book = { ...emptyPurchaseBook(), lots }, before = JSON.stringify(book), quote = snapshot(now, now, "10000000"), f = fixture();
  await f.cache.replace(quote, now);
  const replay = createPrivateMarketCacheWithIo(f.io, f.db);
  const actual = evaluatePersonalMarketValuation(book, [], await replay.read(now), now);
  assert.deepEqual(actual, evaluatePersonalMarketValuation(book, [], quote, now));
  assert.deepEqual(actual.rows[0].currentValueRial, { numerator: "400000000", denominator: "1" });
  assert.deepEqual(actual.rows[0].landedBasisRial.total, { numerator: "351000000", denominator: "1" });
  assert.deepEqual(actual.rows[0].profitLossRial, { numerator: "49000000", denominator: "1" });
  const staleAt = now + MARKET_TTL_MS + 1;
  const stale = evaluatePersonalMarketValuation(book, [], await replay.read(staleAt), staleAt);
  assert.equal(stale.rows[0].quoteState, "stale"); assert.equal(stale.rows[0].currentValueRial, null);
  assert.equal(stale.totals.profitLossRial, null); assert.equal(stale.financialUseAllowed, false);
  assert.equal(JSON.stringify(book), before); assert.equal(f.handles.size, 0);
});

test("receipt selection, source-time conflicts and immutable input match the existing cache contract", async () => {
  const f = fixture(snapshot(now + 2000));
  assert.deepEqual(await f.cache.replace(snapshot(), now + 3000), snapshot(now + 2000));
  await denied(f, () => f.cache.replace(snapshot(now + 2000, now + 2000, "5000001"), now + 3000));
  await denied(f, () => f.cache.replace(snapshot(now + 3000, now + 1000), now + 3000));
  await denied(f, () => f.cache.replace(snapshot(now + 3000, now + 2000, "5000001"), now + 3000));
  const candidate = snapshot(now + 4000), expected = structuredClone(candidate);
  const pending = f.cache.replace(candidate, now + 4000); candidate.observations[0].priceRial = "1";
  assert.deepEqual(await pending, expected); assert.equal(f.handles.size, 0);
});

test("preexisting locks, staging records and unknown entries are never removed or adopted", async () => {
  for (const name of ["latest.lock", "latest.pending", "other.json"]) {
    const f = fixture(snapshot()), existing = f.add(`${destination}/${name}`, f.node("file", { body: Buffer.from(encodeManagedCache(snapshot(), now)) }));
    await denied(f, () => f.cache.read(now));
    await denied(f, () => f.cache.replace(snapshot(now + 1000), now + 1000));
    assert.equal(f.lookup(`${destination}/${name}`), existing);
    assert.equal(f.calls.some(c => ["write", "rename", "unlink"].includes(c.operation)), false);
  }
});

test("unsupported contexts and unsafe ancestor/directory/file metadata fail closed", async () => {
  const cases = [
    f => { f.context.platform = "win32"; }, f => { f.context.uid = 0; },
    f => { f.lookup("/home").mode = 0o777; }, f => { f.lookup(destination).mode = 0o755; },
    f => { f.lookup(destination).uid = 999; }, f => { f.lookup(destination).kind = "link"; },
    f => { f.lookup(`${destination}/latest.json`).uid = 999; }, f => { f.lookup(`${destination}/latest.json`).mode = 0o640; },
    f => { f.lookup(`${destination}/latest.json`).nlink = 2; }, f => { f.lookup(`${destination}/latest.json`).kind = "link"; },
    f => { f.lookup(`${destination}/latest.json`).body = Buffer.alloc(65_537); },
    f => { f.lookup(`${destination}/latest.json`).body = Buffer.from("not a valid cache"); },
  ];
  for (const change of cases) { const f = fixture(snapshot()); change(f); await denied(f, () => f.cache.read(now)); assert.equal(f.calls.some(c => c.operation === "unlink"), false); }
  if (process.platform !== "linux") await assert.rejects(createPrivateMarketCache(runner()).read(now), /details withheld/);
});

test("same-name file replacement or in-place mutation during reading is rejected", async () => {
  for (const change of ["replacement", "mode", "owner", "content"]) {
    const f = fixture(snapshot()); let swapped = false;
    f.hook = (operation, path) => {
      if (operation !== "read" || swapped || !path.endsWith("/latest.json")) return; swapped = true;
      const value = f.lookup(path);
      if (change === "replacement") f.add(path, f.node("file", { body: value.body }));
      if (change === "mode") value.mode = 0o644;
      if (change === "owner") value.uid = 999;
      if (change === "content") { value.body = Buffer.from(value.body.toString().replace("50000000", "50000001")); value.mtimeMs++; }
    };
    await denied(f, () => f.cache.read(now));
  }
});

test("directory replacement cannot redirect writes and preserves ambiguous own artifacts", async () => {
  const f = fixture(), retained = f.lookup(destination), replacement = f.node(); let swapped = false;
  f.hook = (operation, path) => { if (operation === "write" && path.endsWith("/latest.pending") && !swapped) { swapped = true; f.add(destination, replacement); } };
  await denied(f, () => f.cache.replace(snapshot(), now));
  assert.equal(replacement.children.size, 0);
  assert.deepEqual([...retained.children.keys()].sort(), ["latest.lock", "latest.pending"]);
  assert.equal(f.calls.some(c => c.operation === "rename" || c.operation === "unlink"), false);
});

test("replacement of an owned pending or lock entry preserves the foreign entry", async () => {
  for (const name of ["latest.pending", "latest.lock"]) {
    const f = fixture(), foreign = f.node("file", { body: Buffer.from("FOREIGN") }); let swapped = false;
    f.hook = (operation, path) => { if (!swapped && operation === "sync" && path.endsWith("/latest.pending")) { swapped = true; f.add(`${destination}/${name}`, foreign); } };
    await denied(f, () => f.cache.replace(snapshot(), now));
    assert.equal(f.lookup(`${destination}/${name}`), foreign);
    assert.equal(f.calls.some(c => c.operation === "rename"), false);
  }
});

test("write/sync/rename failures clean up only this invocation and never leak private errors", async () => {
  for (const stage of ["write", "sync", "rename"]) {
    const f = fixture(snapshot()); let failed = false;
    f.hook = (operation, path) => { if (!failed && operation === stage && path.endsWith("/latest.pending")) { failed = true; throw errno("EIO"); } };
    await denied(f, () => f.cache.replace(snapshot(now + 1000), now + 1000));
    assert.deepEqual([...f.lookup(destination).children.keys()], ["latest.json"]);
    assert.deepEqual(await f.cache.read(now), snapshot());
  }
});

test("failed first fstat preserves the created unidentified artifact and closes all descriptors", async () => {
  for (const name of ["latest.lock", "latest.pending"]) {
    const f = fixture(); let failed = false;
    f.hook = (operation, path) => { if (!failed && operation === "fstat" && path.endsWith(`/${name}`)) { failed = true; throw errno("EIO"); } };
    await denied(f, () => f.cache.replace(snapshot(), now));
    assert.ok(f.lookup(`${destination}/${name}`));
    assert.equal(f.calls.some(c => c.operation === "unlink" && c.path.endsWith(`/${name}`)), false);
  }
});

test("post-publication fsync failure reports failure without undoing the published snapshot", async () => {
  const f = fixture(); let published = false, failed = false;
  f.hook = (operation, path) => {
    if (operation === "rename") published = true;
    if (published && !failed && operation === "sync" && !path.endsWith("/latest.pending")) { failed = true; throw errno("EIO"); }
  };
  await denied(f, () => f.cache.replace(snapshot(), now));
  assert.deepEqual(decodeManagedCache(f.lookup(`${destination}/latest.json`).body.toString(), now), snapshot());
  assert.deepEqual([...f.lookup(destination).children.keys()], ["latest.json"]);
});

test("DB serialization keeps the newest receipt and filesystem exclusion survives a lost DB lock", async () => {
  const f = fixture(), second = createPrivateMarketCacheWithIo(f.io, f.db);
  await Promise.all([f.cache.replace(snapshot(now + 2000), now + 2000), second.replace(snapshot(), now + 2000)]);
  assert.deepEqual(await f.cache.read(now + 2000), snapshot(now + 2000));
  let release, entered; const waiting = new Promise(done => { entered = done; }); const gate = new Promise(done => { release = done; });
  f.hook = async (operation, path) => { if (operation === "write" && path.endsWith("/latest.pending")) { entered(); await gate; } };
  const first = f.cache.replace(snapshot(now + 3000), now + 3000); await waiting;
  const competing = createPrivateMarketCacheWithIo(f.io, runner());
  await assert.rejects(competing.replace(snapshot(now + 4000), now + 4000), /details withheld/);
  release(); await first; assert.equal(f.handles.size, 0);
});

test("descriptor close failure rejects success; invalid input never touches disk or DB", async () => {
  const f = fixture(snapshot()); let closed = false;
  f.hook = operation => { if (operation === "close" && !closed) { closed = true; throw errno("EIO"); } };
  await denied(f, () => f.cache.read(now));
  const invalid = fixture(); await denied(invalid, () => invalid.cache.replace({}, now));
  assert.equal(invalid.calls.length, 0); assert.equal(invalid.db.calls.length, 0);
});

test("Linux native descriptors exercise publication and no-follow rejection in a disposable mapped tree", {
  skip: process.platform !== "linux" ? "Linux /proc semantics; synthetic adversarial tests run on Windows" : process.getuid?.() === 0 ? "Requires nonroot Linux user" : false,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), "asha-private-cache-test-")), descriptors = new Set();
  const map = value => /^\/proc\/self\/fd\/\d+(?:\/[^/]*)?$/.test(value) ? value : resolve(temporary, `.${value}`);
  try {
    for (const path of ["/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", PRIVATE_DATA_ROOT, destination]) await mkdir(map(path), { mode: 0o700 });
    let swap = false;
    const io = {
      context: () => ({ platform: process.platform, uid: process.getuid() }), lstat: path => lstat(map(path)),
      async open(path, flags, mode) {
        if (swap && path.endsWith("/latest.json")) { swap = false; await rename(map(`${destination}/latest.json`), map(`${destination}/retained.json`)); await symlink(map(`${destination}/retained.json`), map(`${destination}/latest.json`)); }
        const handle = await open(map(path), flags, mode); descriptors.add(handle.fd);
        return { fd: handle.fd, stat: () => handle.stat(), read: (...args) => handle.read(...args), writeFile: (...args) => handle.writeFile(...args), sync: () => handle.sync(), async close() { descriptors.delete(handle.fd); await handle.close(); } };
      },
      async names(path) { const names = []; for await (const item of await opendir(map(path))) { names.push(item.name); if (names.length > 3) break; } return names; },
      rename: (from, to) => rename(map(from), map(to)), unlink: path => unlink(map(path)),
    };
    const cache = createPrivateMarketCacheWithIo(io, runner());
    assert.deepEqual(await cache.replace(snapshot(), now), snapshot());
    assert.deepEqual(await cache.read(now), snapshot()); assert.equal(descriptors.size, 0);
    swap = true; await assert.rejects(cache.read(now), /details withheld/);
    assert.deepEqual(decodeManagedCache(await readFile(map(`${destination}/retained.json`), "utf8"), now), snapshot());
    assert.equal(descriptors.size, 0);
  } finally {
    assert.equal(dirname(temporary), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("asha-private-cache-test-"));
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep));
    await rm(temporary, { recursive: true, force: false });
  }
});
