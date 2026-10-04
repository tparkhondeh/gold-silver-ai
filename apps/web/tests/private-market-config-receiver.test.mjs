import assert from "node:assert/strict";
import test from "node:test";
import { constants, readFileSync } from "node:fs";
import { lstat, open, mkdtemp, mkdir, readFile, rm, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, join, resolve, dirname, basename, sep } from "node:path";
import { identityBindingHash } from "../auth/postgres-owner-identity-store.ts";
import { PRIVATE_MARKET_CONFIG, PRIVATE_MARKET_CONFIG_VERSION, PRIVATE_MARKET_CONFIG_MAX_BYTES, createPrivateMarketConfigReader } from "../scripts/private-market-config.ts";
import { createPrivateMarketConfigReceiver, nativePrivateMarketConfigReceiverIo, receivePrivateMarketConfig } from "../scripts/private-market-config-receiver.ts";

const uid = 1056, destination = PRIVATE_MARKET_CONFIG, directory = posix.dirname(destination);
const canary = "SYNTHETIC-RECEIVER-SECRET-CANARY";
const binding = { origin: "https://goldsilver.wealthos.ir", issuer: "https://goldsilver.wealthos.ir", ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-hosted-portfolio" };
const value = { version: PRIVATE_MARKET_CONFIG_VERSION, provider: "navasan", plan: "free", origin: binding.origin, ownerBindingHash: identityBindingHash(binding), valueUnit: "TOMAN", refreshSeconds: 24_000, keyRotationConfirmed: true, apiKey: canary };
const raw = JSON.stringify(value), expectedReceipt = { state: "received_only", configurationStored: true, transferApprovalVerified: false, quotaAuthorityVerified: false, accountAccessVerified: false, runtimeAttached: false };
const safeMessage = "Private provider configuration receive failed; contents withheld; preserve destination for review";
const errno = code => Object.assign(Error(`${canary} private error`), { code });

function fixture() {
  let inode = 1, fd = 10;
  const handles = new Map(), calls = [];
  const node = (kind = "directory", extra = {}) => ({ kind, uid, mode: kind === "directory" ? 0o700 : 0o600, nlink: kind === "directory" ? 2 : 1,
    dev: 1, ino: inode++, bytes: Buffer.alloc(0), size: 0, mtimeMs: 1, ctimeMs: 1, children: new Map(), ...extra });
  const root = node("directory", { uid: 0, mode: 0o755 });
  const lookup = path => {
    const match = /^\/proc\/self\/fd\/(\d+)(?:\/(.*))?$/.exec(path);
    let current = match ? handles.get(Number(match[1])) : root;
    for (const part of (match ? match[2] ?? "" : path).split("/").filter(Boolean)) current = current?.children.get(part);
    if (!current) throw errno("ENOENT");
    return current;
  };
  const add = (path, entry) => { lookup(posix.dirname(path)).children.set(posix.basename(path), entry); return entry; };
  let parent = "/";
  for (const part of directory.split("/").filter(Boolean)) {
    parent = posix.join(parent, part); add(parent, node("directory", parent === "/home" ? { uid: 0, mode: 0o755 } : {}));
  }
  const stat = entry => ({ ...entry, isFile: () => entry.kind === "file", isDirectory: () => entry.kind === "directory", isSymbolicLink: () => entry.kind === "link" });
  const f = { context: { platform: "linux", uid }, handles, calls, lookup, node, add, hook: null, chunkSize: 7, readCount: null, partialWrite: false };
  const invoke = async (operation, path, flags, mode) => { calls.push({ operation, path, flags, mode }); await f.hook?.(operation, path, flags, mode); };
  f.io = {
    context: () => f.context,
    lstat: async path => { await invoke("lstat", path); return stat(lookup(path)); },
    open: async (path, flags, mode) => {
      await invoke("open", path, flags, mode);
      let entry;
      try { entry = lookup(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (flags & constants.O_CREAT) {
        assert.equal(flags, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK); assert.equal(mode, 0o600);
        if (entry) throw errno("EEXIST");
        entry = add(path, node("file", { mode }));
      }
      if (!entry) throw errno("ENOENT");
      if (entry.kind === "link") throw errno("ELOOP");
      const number = fd++; handles.set(number, entry);
      return { fd: number, stat: async () => { await invoke("fstat", path); return stat(entry); },
        read: async (buffer, offset, length, position) => {
          await invoke("read", path);
          const bytesRead = Math.max(0, Math.min(length, f.chunkSize, entry.bytes.length - position));
          entry.bytes.copy(buffer, offset, position, position + bytesRead); return { bytesRead: f.readCount === null ? bytesRead : f.readCount };
        },
        writeFile: async (text, encoding) => {
          await invoke("write", path); assert.equal(encoding, "utf8");
          entry.bytes = Buffer.from(text, encoding); if (f.partialWrite) entry.bytes = entry.bytes.subarray(0, 9);
          entry.size = entry.bytes.length; entry.mtimeMs++; entry.ctimeMs++;
          if (f.partialWrite === "throw") throw errno("EIO");
        },
        sync: async () => invoke("sync", path),
        close: async () => { handles.delete(number); await invoke("close", path); },
      };
    },
  };
  f.remove = path => lookup(posix.dirname(path)).children.delete(posix.basename(path));
  f.receive = createPrivateMarketConfigReceiver(f.io);
  return f;
}
async function denied(f, action = () => f.receive(binding, async () => raw)) {
  await assert.rejects(action(), error => {
    assert.equal(error.message, safeMessage); assert.equal(error.cause, undefined);
    assert.equal(`${error.stack}${JSON.stringify(error)}`.includes(canary), false); return true;
  });
  assert.equal(f.handles.size, 0);
}
const created = f => f.calls.some(call => call.operation === "open" && (call.flags & constants.O_CREAT));

test("receiver checks the absent fixed destination before supplier, writes one normalized0600 file and closes before receipt", async () => {
  const f = fixture(); let supplied = 0;
  const result = await f.receive(binding, async () => {
    supplied++; assert.equal(f.handles.size, 5); assert.equal(created(f), false);
    assert.ok(f.calls.some(call => call.operation === "lstat" && call.path === destination)); return raw;
  });
  assert.equal(supplied, 1); assert.deepEqual(result, expectedReceipt); assert.equal(Object.isFrozen(result), true); assert.equal(f.handles.size, 0);
  assert.equal(f.lookup(destination).bytes.toString(), raw); assert.equal(f.lookup(destination).mode, 0o600);
  assert.equal(f.calls.filter(call => call.operation === "write").length, 1);
  assert.equal(f.calls.filter(call => call.operation === "sync").length, 2);
  for (const call of f.calls.filter(call => call.operation === "open")) {
    assert.equal(call.flags, call.path.endsWith("market-provider.json")
      ? constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK
      : constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    if (call.path !== "/") assert.match(call.path, /^\/proc\/self\/fd\/\d+\//);
  }
  assert.equal(JSON.stringify(result).includes(canary), false);
  const read = await createPrivateMarketConfigReader(f.io)(binding);
  assert.deepEqual(read, { state: "configured_only", configuration: value, quotaAuthorityVerified: false, keyTransferVerified: false, runtimeAttached: false });
  assert.equal(f.handles.size, 0);
});

test("validated representation drops whitespace and duplicate raw spellings before persistence", async () => {
  const f = fixture(); await f.receive(binding, async () => ` {"apiKey":"DISCARDED-SYNTHETIC",${raw.slice(1)} \n`);
  const stored = f.lookup(destination).bytes.toString();
  assert.equal(stored.includes("DISCARDED"), false); assert.equal(stored.includes("\n"), false); assert.deepEqual(JSON.parse(stored), value);
  assert.deepEqual((await createPrivateMarketConfigReader(f.io)(binding)).configuration, value);
});

test("unsupported context, invalid binding and invalid supplier fail before filesystem or payload access", async () => {
  for (const context of [{ platform: "win32", uid }, { platform: "linux", uid: 0 }, { platform: "linux", uid: undefined }, { platform: "linux", uid: NaN }, { platform: "linux", uid: -1 }]) {
    const f = fixture(); f.context = context; await denied(f, () => f.receive(binding, async () => assert.fail("supplier called"))); assert.deepEqual(f.calls, []);
  }
  for (const bad of [null, { ...binding, origin: "https://foreign.invalid" }, { ...binding, portfolioSubject: "local-owner-v1" }]) {
    const f = fixture(); await denied(f, () => f.receive(bad, async () => assert.fail("supplier called"))); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); await denied(f, () => f.receive(binding, null)); assert.deepEqual(f.calls, []);
});

test("missing or unsafe root-to-private-leaf ancestors never obtain the payload", async () => {
  for (let path = directory;; path = posix.dirname(path)) {
    for (const extra of [{ kind: "link" }, { kind: "file" }, { uid: 999 }, { mode: 0o777 }, { mode: 0o1700 }]) {
      const f = fixture(); Object.assign(f.lookup(path), extra);
      await denied(f, () => f.receive(binding, async () => assert.fail("supplier called"))); assert.equal(created(f), false);
    }
    if (path === "/") break;
    const f = fixture(); f.remove(path); await denied(f, () => f.receive(binding, async () => assert.fail("supplier called")));
  }
  for (const path of [directory, posix.dirname(directory)]) for (const extra of [{ mode: 0o750 }, { uid: 0 }]) {
    const f = fixture(); Object.assign(f.lookup(path), extra); await denied(f, () => f.receive(binding, async () => assert.fail("supplier called")));
  }
});

test("every preexisting destination including symlink, hardlink and partial file remains untouched with supplier uncalled", async () => {
  for (const extra of [{}, { kind: "link" }, { nlink: 2 }, { kind: "directory" }, { kind: "fifo" }, { mode: 0o666 }]) {
    const f = fixture(), prior = f.add(destination, f.node("file", { bytes: Buffer.from("PRIOR-SYNTHETIC"), ...extra }));
    await denied(f, () => f.receive(binding, async () => assert.fail("supplier called")));
    assert.equal(f.lookup(destination), prior); assert.equal(created(f), false); assert.equal(f.calls.some(call => call.operation === "read"), false);
  }
});

test("malformed, mismatched, oversized, nonstring and non-UTF8-representable payloads never create a file", async () => {
  for (const payload of [undefined, Buffer.from(raw), "", "{", "[]", "null", " ".repeat(PRIVATE_MARKET_CONFIG_MAX_BYTES + 1), "é".repeat(8193),
    JSON.stringify({ ...value, ownerBindingHash: "a".repeat(64) }), JSON.stringify({ ...value, enabled: true }), JSON.stringify({ ...value, refreshSeconds: 1 }), raw.replace(canary, "\ud800")]) {
    const f = fixture(); await denied(f, () => f.receive(binding, async () => payload)); assert.equal(created(f), false);
  }
  const f = fixture(); await denied(f, () => f.receive(binding, async () => { throw errno("SECRET"); })); assert.equal(created(f), false);
});

test("payload boundary uses UTF8 bytes and accepts exactly16KiB before normalization", async () => {
  const f = fixture(); await f.receive(binding, async () => raw + " ".repeat(PRIVATE_MARKET_CONFIG_MAX_BYTES - Buffer.byteLength(raw)));
  assert.equal(f.lookup(destination).bytes.toString(), raw);
});

test("caller mutation during await cannot relabel the copied owner binding", async () => {
  const f = fixture(), suppliedBinding = { ...binding };
  await f.receive(suppliedBinding, async () => { suppliedBinding.ownerSubject = "other"; return raw; });
  assert.deepEqual(JSON.parse(f.lookup(destination).bytes), value);
});

test("ancestor replacement or unsafe mutation inside supplier prevents creation in both original and new directories", async () => {
  for (const path of ["/home", "/home/wealthos_dev", posix.dirname(directory), directory]) for (const replace of [false, true]) {
    const f = fixture(), retained = f.lookup(directory);
    await denied(f, () => f.receive(binding, async () => {
      assert.equal(f.handles.size, 5);
      if (replace) f.add(path, f.node("directory", { ...f.lookup(path), ino: 9999 })); else f.lookup(path).mode = 0o777;
      return raw;
    }));
    assert.equal(created(f), false); assert.equal(retained.children.has("market-provider.json"), false);
  }
});

test("supplier-time destination creation and last-moment exclusive-create races cannot overwrite foreign entries", async () => {
  for (const when of ["supplier", "open"]) for (const kind of ["file", "link"]) {
    const f = fixture(), foreign = f.node(kind, { bytes: Buffer.from("FOREIGN-SYNTHETIC") });
    if (when === "open") f.hook = (op, path, flags) => { if (op === "open" && (flags & constants.O_CREAT)) f.add(destination, foreign); };
    await denied(f, () => f.receive(binding, async () => { if (when === "supplier") f.add(destination, foreign); return raw; }));
    assert.equal(f.lookup(destination), foreign); assert.equal(f.calls.some(call => call.operation === "write"), false);
  }
});

test("two already-awaited suppliers race to exclusive creation with exactly one success and no overwrite", async () => {
  const f = fixture(); let release, arrived; const gate = new Promise(done => { release = done; }), waiting = new Promise(done => { arrived = done; }); let count = 0;
  const supplier = async () => { if (++count === 2) arrived(); await gate; return raw; };
  const pending = [f.receive(binding, supplier), createPrivateMarketConfigReceiver(f.io)(binding, supplier)];
  await waiting; assert.equal(f.handles.size, 10); release();
  const results = await Promise.allSettled(pending);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.message, safeMessage);
  assert.equal(f.lookup(destination).bytes.toString(), raw); assert.equal(f.calls.filter(call => call.operation === "write").length, 1); assert.equal(f.handles.size, 0);
});

test("first stat, write, file sync, readback, directory sync and close failures retain artifacts and sanitize all errors", async () => {
  for (const failure of ["first-stat", "write", "file-sync", "read", "directory-sync", "file-close", "directory-close"]) {
    const f = fixture(); let failed = false;
    f.hook = (op, path) => {
      const file = path.endsWith("market-provider.json");
      if (!failed && ((failure === "first-stat" && op === "fstat" && file) || (failure === "write" && op === "write")
        || (failure === "file-sync" && op === "sync" && file) || (failure === "read" && op === "read")
        || (failure === "directory-sync" && op === "sync" && !file) || (failure === "file-close" && op === "close" && file)
        || (failure === "directory-close" && op === "close" && !file))) { failed = true; throw errno("EIO"); }
    };
    await denied(f); assert.ok(f.lookup(destination)); assert.equal(f.lookup(destination).mode, 0o600);
    f.hook = null; await denied(f, () => f.receive(binding, async () => assert.fail("retained file adopted")));
  }
  for (const partial of [true, "throw"]) {
    const f = fixture(); f.partialWrite = partial; await denied(f); assert.equal(f.lookup(destination).bytes.length, 9);
  }
});

test("readback rejects changed bytes, truncation, growth and invalid IO read counts", async () => {
  for (const mutation of ["bytes", "truncate", "grow", "metadata"]) {
    const f = fixture(); let changed = false;
    f.hook = op => { if (!changed && op === "read") {
      changed = true; const entry = f.lookup(destination);
      if (mutation === "bytes") entry.bytes[5] ^= 1;
      if (mutation === "truncate") entry.bytes = entry.bytes.subarray(0, entry.bytes.length - 1);
      if (mutation === "grow") entry.bytes = Buffer.concat([entry.bytes, Buffer.alloc(PRIVATE_MARKET_CONFIG_MAX_BYTES, 32)]);
      if (mutation === "metadata") entry.mtimeMs++;
    } };
    await denied(f); assert.ok(f.lookup(destination));
  }
  for (const bytesRead of [-1, NaN, 0.5, PRIVATE_MARKET_CONFIG_MAX_BYTES + 2, 0]) {
    const f = fixture(); f.readCount = bytesRead; await denied(f); assert.ok(f.lookup(destination));
  }
});

test("created-file replacement, unsafe metadata and ancestor swaps during publication preserve ambiguous entries", async () => {
  for (const mutation of [{ ino: 9999 }, { nlink: 2 }, { uid: 999 }, { mode: 0o640 }, { kind: "link" }, { ctimeMs: NaN }]) {
    const f = fixture(); let changed = false;
    f.hook = (op, path) => { if (!changed && op === "sync" && path.endsWith("market-provider.json")) {
      changed = true; f.add(destination, f.node("file", { ...f.lookup(destination), ...mutation }));
    } };
    await denied(f); assert.ok(f.lookup(destination));
  }
  for (const stage of ["open", "write", "read", "sync"]) {
    const f = fixture(), retained = f.lookup(directory); let changed = false;
    f.hook = (op, path, flags) => { if (!changed && op === stage && (stage !== "open" || (flags & constants.O_CREAT)) && path.endsWith("market-provider.json")) {
      changed = true; f.add(directory, f.node());
    } };
    await denied(f); assert.equal(f.lookup(directory).children.size, 0); assert.ok(retained.children.has("market-provider.json"));
    if (stage === "open") assert.equal(retained.children.get("market-provider.json").bytes.length, 0);
  }
});

test("pre-payload stat/open failures and final close checks release every obtained descriptor", async () => {
  for (const selected of ["lstat", "open", "fstat"]) {
    const f = fixture(); f.hook = (op, path) => { if (op === selected && path !== "/") throw errno("EIO"); };
    await denied(f, () => f.receive(binding, async () => assert.fail("supplier called"))); assert.equal(created(f), false);
  }
  const f = fixture(); let release, reached; const gate = new Promise(done => { release = done; }), waiting = new Promise(done => { reached = done; }); let completed = false;
  f.hook = async (op, path) => { if (op === "close" && path === "/") { reached(); await gate; } };
  const pending = f.receive(binding, async () => raw).then(result => { completed = true; return result; });
  await waiting; assert.equal(completed, false); release(); assert.deepEqual(await pending, expectedReceipt);
});

test("native IO is immutable, native entry point is fixed and receiver has no repair, network or activation APIs", async () => {
  assert.equal(Object.isFrozen(nativePrivateMarketConfigReceiverIo), true);
  assert.deepEqual(Object.keys(nativePrivateMarketConfigReceiverIo).sort(), ["context", "lstat", "open"]);
  if (process.platform !== "linux" || process.getuid?.() === 0) await assert.rejects(receivePrivateMarketConfig(binding, async () => assert.fail("native supplier called")), { message: safeMessage });
  const source = readFileSync(new URL("../scripts/private-market-config-receiver.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:mkdir|chmod|unlink|rename|fetch|console|process\.env)\b/);
  assert.equal(destination, "/home/wealthos_dev/.asha-private/goldsilver/market-provider.json");
});

test("Linux native exclusive/no-follow descriptors and durability work on a disposable mapped synthetic tree", {
  skip: process.platform !== "linux" ? "Linux /proc semantics; synthetic adversarial tests run on Windows" : process.getuid?.() === 0 ? "Requires nonroot Linux user" : false,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), "asha-private-receiver-test-")), descriptors = new Set();
  const map = path => /^\/proc\/self\/fd\/\d+(?:\/[^/]*)?$/.test(path) ? path : resolve(temporary, `.${path}`);
  try {
    for (const path of ["/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", directory]) await mkdir(map(path), { mode: 0o700 });
    const io = { context: () => ({ platform: process.platform, uid: process.getuid() }), lstat: path => lstat(map(path)),
      async open(path, flags, mode) {
        const handle = await open(map(path), flags, mode); descriptors.add(handle.fd);
        return { fd: handle.fd, stat: () => handle.stat(), read: (...args) => handle.read(...args), writeFile: (...args) => handle.writeFile(...args), sync: () => handle.sync(), async close() { descriptors.delete(handle.fd); await handle.close(); } };
      },
    };
    const receive = createPrivateMarketConfigReceiver(io);
    assert.deepEqual(await receive(binding, async () => raw), expectedReceipt);
    assert.deepEqual((await createPrivateMarketConfigReader(io)(binding)).configuration, value); assert.equal(descriptors.size, 0);
    const metadata = await lstat(map(destination)); assert.equal(metadata.mode & 0o7777, 0o600); assert.equal(metadata.nlink, 1);
    await assert.rejects(receive(binding, async () => assert.fail("existing supplier called")), { message: safeMessage });
    await rename(map(destination), map(`${directory}/retained-synthetic.json`)); await symlink(map(`${directory}/retained-synthetic.json`), map(destination));
    await assert.rejects(receive(binding, async () => assert.fail("symlink supplier called")), { message: safeMessage });
    assert.equal(await readFile(map(`${directory}/retained-synthetic.json`), "utf8"), raw); assert.equal(descriptors.size, 0);
  } finally {
    assert.equal(dirname(temporary), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("asha-private-receiver-test-"));
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep)); await rm(temporary, { recursive: true, force: false });
  }
});
