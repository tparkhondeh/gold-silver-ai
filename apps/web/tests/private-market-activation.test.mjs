import assert from "node:assert/strict";
import test from "node:test";
import { constants, readFileSync } from "node:fs";
import { lstat, open, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, join, resolve, dirname, basename, sep } from "node:path";
import { createPrivateMarketActivation, createPrivateMarketActivationStorage, PRIVATE_MARKET_ACTIVATION, PRIVATE_MARKET_ACTIVATION_MAX_BYTES } from "../scripts/private-market-activation.ts";
import { identityBindingHash } from "../auth/postgres-owner-identity-store.ts";
import { createNavasanQuotaHandoffManifest, NAVASAN_QUOTA_HANDOFF_VERSION } from "../data/navasan-quota-handoff.ts";
import { PRIVATE_MARKET_CUTOVER_VERSION } from "../scripts/private-market-cutover.ts";
import { parsePrivateMarketConfig, PRIVATE_MARKET_CONFIG_VERSION } from "../scripts/private-market-config.ts";
import { createPrivatePasskeyRuntime } from "../auth/private-runtime.ts";

const uid = 1056, destination = PRIVATE_MARKET_ACTIVATION, directory = posix.dirname(destination);
const canary = "SYNTHETIC-ACTIVATION-PRIVATE-DETAIL";
const safeMessage = "Private market activation unavailable or unsafe; details withheld; preserve evidence for review";
const errno = code => Object.assign(Error(canary), { code });
const binding = { origin: "https://goldsilver.wealthos.ir", issuer: "https://goldsilver.wealthos.ir", ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-portfolio" };
const clock = Date.parse("2000-01-02T00:00:00.000Z"), capturedAt = "2000-01-01T00:00:00.000000Z";
const handoff = createNavasanQuotaHandoffManifest({ version: NAVASAN_QUOTA_HANDOFF_VERSION, provider: "navasan", plan: "free",
  quotaScopeRef: `qscope_${"1".repeat(32)}`, sourceLedgerId: `qledger_${"2".repeat(32)}`, targetLedgerId: `qledger_${"3".repeat(32)}`,
  targetOrigin: binding.origin, identityBindingHash: identityBindingHash(binding), ownerTransferApprovalRef: `approval_${"4".repeat(32)}`,
  capturedAt, sourceRefreshSeconds: 24000, latestReservationId: null, reservations: [] }, capturedAt);
const receipt = { version: PRIVATE_MARKET_CUTOVER_VERSION,
  expectedReferences: { quotaScopeRef: handoff.data.quotaScopeRef, targetLedgerId: handoff.data.targetLedgerId, targetOrigin: binding.origin,
    identityBindingHash: identityBindingHash(binding), handoffSha256: handoff.sha256, ownerTransferApprovalRef: handoff.data.ownerTransferApprovalRef },
  sourceDatabase: { database: "asha_local", address: "127.0.0.1", port: 55432, databaseOid: "1234", role: "postgres" },
  sourceFenceRecordedAt: capturedAt, sourceRetirement: { evidenceRef: "synthetic-only-process-retirement", recordedAt: capturedAt }, handoffRaw: JSON.stringify(handoff),
  targetDatabase: { database: "asha_private", address: "127.0.0.1", port: 15432, databaseOid: "5678", role: "asha_private_admin" },
  targetRuntimeDatabase: { database: "asha_private", address: "127.0.0.1", port: 15432, databaseOid: "5678", role: "asha_private_runtime" },
  targetAdmissionNotBefore: capturedAt, targetRefreshSeconds: 24000 };
const canonicalReceipt = JSON.stringify(receipt);

function composition() {
  const calls = [], state = { raw: canonicalReceipt }, configuration = parsePrivateMarketConfig(JSON.stringify({ version: PRIVATE_MARKET_CONFIG_VERSION,
    provider: "navasan", plan: "free", origin: binding.origin, ownerBindingHash: identityBindingHash(binding), valueUnit: "TOMAN",
    refreshSeconds: 24000, keyRotationConfirmed: true, apiKey: canary }), binding);
  const database = { query() { assert.fail("No provider, identity or portfolio SQL at construction"); } };
  const runner = { async transaction(work) { calls.push("transaction"); return work(database); } };
  const dependencies = {
    storage: { async read() { calls.push("receipt"); return state.raw; }, async publish(supplier) { calls.push("before-publication"); state.published = await supplier(); calls.push("published"); } },
    async readConfiguration(actual) { assert.deepEqual(actual, binding); calls.push("config"); return { state: "configured_only", configuration }; },
    async probeDatabase(actual, migrations) { assert.equal(actual, database); assert.deepEqual(migrations, []); calls.push("readiness"); return { state: "ready" }; },
    async verifyBaseline(actual, checked, config) {
      assert.equal(actual, database); assert.deepEqual(checked, receipt); assert.deepEqual(config, { bindingHash: identityBindingHash(binding), origin: binding.origin, refreshSeconds: 24000 });
      calls.push("baseline"); return { handoffSha256: handoff.sha256, baselineRows: 0, sourceRefreshSeconds: 24000, targetRefreshSeconds: 24000 };
    },
    async inspectCache() { calls.push("storage"); return { status: "safe", lockPresent: false, pendingPresent: false }; },
    createCache(actual) { assert.equal(actual, runner); calls.push("cache"); return { async read(at) { assert.equal(at, clock); calls.push("cache-read"); return null; }, replace() { assert.fail("Startup must not replace cache"); } }; },
  };
  const input = { binding, runner, migrations: [], clock: () => clock, fetcher: () => assert.fail("No provider call during activation or anonymous request") };
  return { calls, state, configuration, dependencies, input, activation: createPrivateMarketActivation(dependencies) };
}

function fixture() {
  let inode = 1, descriptor = 10;
  const handles = new Map(), calls = [];
  const node = (kind = "directory", extra = {}) => ({ kind, uid, mode: kind === "directory" ? 0o700 : 0o600, nlink: kind === "directory" ? 2 : 1,
    dev: 1, ino: inode++, bytes: Buffer.alloc(0), size: 0, mtimeMs: 1, ctimeMs: 1, children: new Map(), ...extra });
  const root = node("directory", { uid: 0, mode: 0o755 });
  const lookup = path => {
    const match = /^\/proc\/self\/fd\/(\d+)(?:\/(.*))?$/.exec(path);
    let current = match ? handles.get(Number(match[1])) : root;
    for (const part of (match ? match[2] ?? "" : path).split("/").filter(Boolean)) current = current?.children.get(part);
    if (!current) throw errno("ENOENT"); return current;
  };
  const add = (path, entry) => { lookup(posix.dirname(path)).children.set(posix.basename(path), entry); return entry; };
  let parent = "/";
  for (const part of directory.split("/").filter(Boolean)) {
    parent = posix.join(parent, part); add(parent, node("directory", parent === "/home" ? { uid: 0, mode: 0o755 } : {}));
  }
  const stat = entry => ({ ...entry, isFile: () => entry.kind === "file", isDirectory: () => entry.kind === "directory", isSymbolicLink: () => entry.kind === "link" });
  const f = { context: { platform: "linux", uid }, handles, calls, lookup, node, add, hook: null, chunkSize: 31, readCount: null, partialWrite: false };
  const invoke = async (operation, path, flags, mode) => { calls.push({ operation, path, flags, mode }); await f.hook?.(operation, path, flags, mode); };
  f.io = {
    context: () => f.context,
    lstat: async path => { await invoke("lstat", path); return stat(lookup(path)); },
    open: async (path, flags, mode) => {
      await invoke("open", path, flags, mode);
      let entry; try { entry = lookup(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (flags & constants.O_CREAT) {
        assert.equal(flags, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK); assert.equal(mode, 0o600);
        if (entry) throw errno("EEXIST"); entry = add(path, node("file", { mode }));
      }
      if (!entry) throw errno("ENOENT"); if (entry.kind === "link") throw errno("ELOOP");
      const fd = descriptor++; handles.set(fd, entry);
      return { fd, stat: async () => { await invoke("fstat", path); return stat(entry); },
        read: async (buffer, offset, length, position) => {
          await invoke("read", path); const bytesRead = Math.max(0, Math.min(length, f.chunkSize, entry.bytes.length - position));
          entry.bytes.copy(buffer, offset, position, position + bytesRead); return { bytesRead: f.readCount === null ? bytesRead : f.readCount };
        },
        writeFile: async value => { await invoke("write", path); entry.bytes = Buffer.from(value); if (f.partialWrite) entry.bytes = entry.bytes.subarray(0, 2); entry.size = entry.bytes.length; entry.mtimeMs++; entry.ctimeMs++; },
        sync: async () => invoke("sync", path),
        close: async () => { handles.delete(fd); await invoke("close", path); },
      };
    },
  };
  f.storage = createPrivateMarketActivationStorage(f.io);
  f.file = (raw = "synthetic-receipt", changes = {}) => add(destination, node("file", { bytes: Buffer.from(raw), size: Buffer.byteLength(raw), ...changes }));
  return f;
}
async function denied(f, action) {
  await assert.rejects(action(), error => { assert.equal(error.message, safeMessage); assert.equal(error.cause, undefined); assert.equal(error.stack.includes(canary), false); return true; });
  assert.equal(f.handles.size, 0);
}

test("activation receipt absence is explicit, pinned and read-only; exclusive durable publication roundtrips", async () => {
  const f = fixture(); assert.equal(await f.storage.read(), null); assert.equal(f.handles.size, 0);
  assert.equal(f.calls.some(call => call.flags & constants.O_CREAT), false);
  let supplied = 0;
  await f.storage.publish(async () => { supplied++; assert.equal(f.handles.size, 5); return "synthetic-receipt"; });
  assert.equal(supplied, 1); assert.equal(await f.storage.read(), "synthetic-receipt"); assert.equal(f.handles.size, 0);
  assert.equal(f.lookup(destination).mode, 0o600); assert.equal(f.calls.filter(call => call.operation === "sync").length, 2);
  await denied(f, () => f.storage.publish(async () => assert.fail("existing receipt must not invoke supplier")));
});

test("unsafe contexts, ancestors and existing activation entries fail closed without alteration", async () => {
  for (const changes of [{ mode: 0o644 }, { uid: uid + 1 }, { nlink: 2 }, { kind: "link" }, { size: 0 }, { size: PRIVATE_MARKET_ACTIVATION_MAX_BYTES + 1 }]) {
    const f = fixture(), original = f.file("synthetic", changes); await denied(f, () => f.storage.read()); assert.equal(f.lookup(destination), original);
  }
  for (const changes of [{ platform: "win32" }, { uid: 0 }, { uid: undefined }]) {
    const f = fixture(); Object.assign(f.context, changes); await denied(f, () => f.storage.read()); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.lookup(directory).mode = 0o770; await denied(f, () => f.storage.read());
});

test("publication holds ancestors across validation and preserves concurrent or ambiguous destinations", async () => {
  const f = fixture(); const old = f.lookup(directory);
  await denied(f, () => f.storage.publish(async () => { f.add(directory, f.node()); return "synthetic"; }));
  assert.equal(old.children.size, 0); assert.equal(f.lookup(directory).children.size, 0);
  const concurrent = fixture(); let other;
  concurrent.hook = (op, path, flags) => { if (op === "open" && flags & constants.O_CREAT) other = concurrent.file("other-operator-receipt"); };
  await denied(concurrent, () => concurrent.storage.publish(async () => "synthetic")); assert.equal(concurrent.lookup(destination), other);
  for (const operation of ["write", "sync", "read", "close"]) {
    const faulty = fixture(); faulty.hook = (op, path) => { if (op === operation && path.endsWith("market-activation.json")) throw errno("EIO"); };
    await denied(faulty, () => faulty.storage.publish(async () => "synthetic")); assert.ok(faulty.lookup(destination));
  }
  const partial = fixture(); partial.partialWrite = true; await denied(partial, () => partial.storage.publish(async () => "synthetic")); assert.equal(partial.lookup(destination).size, 2);
});

test("bounded read detects replacements, invalid counts and UTF8; failures never downgrade to missing", async () => {
  for (const count of [-1, NaN, PRIVATE_MARKET_ACTIVATION_MAX_BYTES + 2]) {
    const f = fixture(); f.file(); f.readCount = count; await denied(f, () => f.storage.read());
  }
  const invalid = fixture(); invalid.file("x", { bytes: Buffer.from([255]), size: 1 }); await denied(invalid, () => invalid.storage.read());
  for (const ancestor of [false, true]) {
    const f = fixture(); f.file(); let replaced = false;
    f.hook = op => { if (op === "read" && !replaced) { replaced = true; if (ancestor) f.add(directory, f.node()); else f.file("replacement"); } };
    await denied(f, () => f.storage.read());
  }
});

test("absent receipt does not read delivered key, optional database/cache, construct adapter or fetch", async () => {
  const only = { storage: { read: async () => null, publish: async () => assert.fail() } };
  for (const name of ["readConfiguration", "inspectCache", "createCache", "probeDatabase", "verifyBaseline"]) only[name] = () => assert.fail(`unexpected ${name}`);
  const activation = createPrivateMarketActivation(only);
  assert.equal(await activation.prepare({ fetcher: () => assert.fail("provider must not be called") }), undefined);
  only.storage.read = async () => "malformed-" + canary;
  await assert.rejects(activation.prepare({}), { message: safeMessage });
});

test("verified receipt checks native prerequisites then constructs adapter without fetching or bypassing owner gate", async () => {
  const f = composition(), market = await f.activation.prepare(f.input);
  assert.equal(typeof market.latest, "function"); assert.deepEqual(Object.keys(market), ["latest"]);
  assert.deepEqual(f.calls, ["receipt", "config", "transaction", "readiness", "baseline", "storage", "cache", "cache-read"]);
  const app = createPrivatePasskeyRuntime({ binding, runner: f.input.runner, release: "a".repeat(40), market, publicUi: async () => new Response("synthetic-evaluation") });
  const response = await app(new Request(`${binding.origin}/api/managed-market`, { method: "POST", headers: { origin: binding.origin, "sec-fetch-site": "same-origin", "x-asha-intent": "owner-action", "x-asha-managed-market": "latest" } }));
  assert.equal(response.status, 401); assert.equal(f.calls.filter(call => call === "transaction").length, 1);
  const evaluation = await app(new Request(`${binding.origin}/evaluation`)); assert.equal(await evaluation.text(), "synthetic-evaluation");
  assert.equal(f.calls.filter(call => call === "transaction").length, 1);
});

test("present invalid receipt, missing config, target baseline, grants and cache failures block rather than disable", async () => {
  for (const mutate of [
    f => { f.state.raw = JSON.stringify({ ...receipt, unexpected: true }); },
    f => { f.dependencies.readConfiguration = async () => ({ state: "disabled" }); },
    f => { f.dependencies.probeDatabase = async () => ({ state: "blocked" }); },
    f => { f.dependencies.verifyBaseline = async () => { throw Error(canary); }; },
    f => { f.dependencies.verifyBaseline = async () => ({ sourceRefreshSeconds: 25000, targetRefreshSeconds: 24000 }); },
    f => { f.dependencies.verifyBaseline = async () => ({ sourceRefreshSeconds: 24000, targetRefreshSeconds: 25000 }); },
    f => { f.dependencies.inspectCache = async () => ({ status: "missing" }); },
    f => { f.dependencies.inspectCache = async () => ({ status: "safe", lockPresent: true, pendingPresent: false }); },
    f => { f.dependencies.inspectCache = async () => ({ status: "safe", lockPresent: false, pendingPresent: true }); },
    f => { f.dependencies.createCache = () => ({ read: async () => { throw Error(canary); }, replace() { assert.fail(); } }); },
  ]) {
    const f = composition(); mutate(f);
    await assert.rejects(f.activation.prepare(f.input), error => { assert.equal(error.message, safeMessage); assert.equal(error.stack.includes(canary), false); return true; });
    assert.equal(f.state.published, undefined);
  }
});

test("publication requires the same fresh checks and never invokes adapter/provider or publishes failed evidence", async () => {
  const f = composition(); const result = await f.activation.publish(canonicalReceipt, f.input);
  assert.deepEqual(result, { state: "activation_receipt_stored", runtimeAttached: false, accountAccessVerified: false });
  assert.equal(f.state.published, canonicalReceipt);
  assert.deepEqual(f.calls, ["before-publication", "config", "transaction", "readiness", "baseline", "storage", "cache", "cache-read", "published"]);
  const blocked = composition(); blocked.dependencies.verifyBaseline = async () => { throw Error(canary); };
  await assert.rejects(blocked.activation.publish(canonicalReceipt, blocked.input), { message: safeMessage }); assert.equal(blocked.state.published, undefined);
});

test("production wiring places only prepared adapter behind private runtime, never public evaluation or startup fetch", () => {
  const startup = readFileSync(new URL("../scripts/start-private-server.mjs", import.meta.url), "utf8");
  assert.match(startup, /const market = await preparePrivateMarketActivation\(\{ binding, runner, migrations, fetcher: fetch \}\)/);
  assert.match(startup, /const common = \{ binding, runner, release, market,/);
  assert.ok(startup.indexOf("await preparePrivateMarketActivation") < startup.indexOf("await startProdServer"));
  const source = readFileSync(new URL("../scripts/private-market-activation.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:process\.env|console)\b|\b(?:mkdir|chmod|unlink|rename)\s*\(|\.latest\(/);
  assert.match(source, /if \(raw === null\) return undefined/);
  const publicRoute = readFileSync(new URL("../app/api/managed-market/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(publicRoute, /private-market-activation|market-activation\.json/);
});

test("Linux native activation storage is exclusive, private and durable on an isolated mapped tree", {
  skip: process.platform !== "linux" ? "Linux descriptors; adversarial synthetic tests run on all platforms" : process.getuid?.() === 0 ? "Nonroot Linux required" : false,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), "asha-activation-test-")), descriptors = new Set();
  const map = path => /^\/proc\/self\/fd\/\d+(?:\/[^/]*)?$/.test(path) ? path : resolve(temporary, `.${path}`);
  try {
    for (const path of ["/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", directory]) await mkdir(map(path), { mode: 0o700 });
    const io = { context: () => ({ platform: process.platform, uid: process.getuid() }), lstat: path => lstat(map(path)),
      async open(path, flags, mode) {
        const handle = await open(map(path), flags, mode); descriptors.add(handle.fd);
        return { fd: handle.fd, stat: () => handle.stat(), read: (...args) => handle.read(...args), writeFile: (...args) => handle.writeFile(...args), sync: () => handle.sync(), async close() { descriptors.delete(handle.fd); await handle.close(); } };
      },
    };
    const storage = createPrivateMarketActivationStorage(io); assert.equal(await storage.read(), null);
    await storage.publish(async () => "synthetic-receipt"); assert.equal(await storage.read(), "synthetic-receipt");
    const metadata = await lstat(map(destination)); assert.equal(metadata.mode & 0o7777, 0o600); assert.equal(metadata.nlink, 1);
    await assert.rejects(storage.publish(async () => assert.fail("existing supplier")), { message: safeMessage }); assert.equal(descriptors.size, 0);
  } finally {
    assert.equal(dirname(temporary), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("asha-activation-test-"));
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep)); await rm(temporary, { recursive: true, force: false });
  }
});
