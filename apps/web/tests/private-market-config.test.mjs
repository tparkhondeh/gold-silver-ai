import assert from "node:assert/strict";
import test from "node:test";
import { constants, readFileSync } from "node:fs";
import { posix } from "node:path";
import { PRIVATE_MARKET_CONFIG, PRIVATE_MARKET_CONFIG_VERSION, parsePrivateMarketConfig, createPrivateMarketConfigReader } from "../scripts/private-market-config.ts";
import { identityBindingHash } from "../auth/postgres-owner-identity-store.ts";
import { assertPrivateProcessEnvironment } from "../scripts/private-server-config.ts";

const uid = 1056, binding = { origin: "https://goldsilver.wealthos.ir", issuer: "https://goldsilver.wealthos.ir", ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-hosted-portfolio" };
const value = { version: PRIVATE_MARKET_CONFIG_VERSION, provider: "navasan", plan: "free", origin: binding.origin, ownerBindingHash: identityBindingHash(binding), valueUnit: "TOMAN", refreshSeconds: 24_000, keyRotationConfirmed: true, apiKey: "SYNTHETIC-SECRET-CANARY" };
const safeError = { message: "Private provider configuration unavailable or unsafe; contents withheld" };
const serialized = change => JSON.stringify({ ...value, ...change });

function fixture() {
  let inode = 1, fd = 10;
  const handles = new Map(), calls = [];
  const node = (kind = "directory", extra = {}) => ({ kind, uid, mode: kind === "directory" ? 0o700 : 0o600, nlink: kind === "directory" ? 2 : 1,
    dev: 1, ino: inode++, size: 0, mtimeMs: 1, ctimeMs: 1, children: new Map(), ...extra });
  const root = node("directory", { uid: 0, mode: 0o755 });
  const lookup = path => {
    const matched = /^\/proc\/self\/fd\/(\d+)(?:\/(.*))?$/.exec(path);
    let current = matched ? handles.get(Number(matched[1])) : root;
    for (const part of (matched ? matched[2] ?? "" : path).split("/").filter(Boolean)) current = current?.children.get(part);
    if (!current) throw Object.assign(Error("SYNTHETIC-SECRET-CANARY missing"), { code: "ENOENT" });
    return current;
  };
  const add = (path, entry) => { lookup(posix.dirname(path)).children.set(posix.basename(path), entry); return entry; };
  let parent = "/";
  for (const part of posix.dirname(PRIVATE_MARKET_CONFIG).split("/").filter(Boolean)) {
    parent = posix.join(parent, part); add(parent, node("directory", parent === "/home" ? { uid: 0, mode: 0o755 } : {}));
  }
  const bytes = Buffer.from(serialized()); add(PRIVATE_MARKET_CONFIG, node("file", { bytes, size: bytes.length }));
  const stat = entry => ({ ...entry, isFile: () => entry.kind === "file", isDirectory: () => entry.kind === "directory", isSymbolicLink: () => entry.kind === "link" });
  const f = { context: { platform: "linux", uid }, handles, calls, lookup, node, add, hook: null, chunkSize: 7 };
  const invoke = async (operation, path, flags) => { calls.push({ operation, path, flags }); await f.hook?.(operation, path, flags); };
  f.read = createPrivateMarketConfigReader({
    context: () => f.context,
    lstat: async path => { await invoke("lstat", path); return stat(lookup(path)); },
    open: async (path, flags) => {
      await invoke("open", path, flags); const entry = lookup(path);
      if (entry.kind === "link") throw Error("SYNTHETIC-SECRET-CANARY link");
      const number = fd++; handles.set(number, entry);
      return { fd: number, stat: async () => { await invoke("fstat", path); return stat(entry); },
        read: async (buffer, offset, length, position) => { await invoke("read", path); const bytesRead = Math.max(0, Math.min(length, f.chunkSize, entry.bytes.length - position)); entry.bytes.copy(buffer, offset, position, position + bytesRead); return { bytesRead }; },
        close: async () => { handles.delete(number); await invoke("close", path); },
      };
    },
  });
  f.remove = path => lookup(posix.dirname(path)).children.delete(posix.basename(path));
  return f;
}

test("exact provider-only configuration keeps owner binding, free-plan safe cadence and no activation fields", () => {
  for (const valueUnit of ["IRR", "TOMAN"]) for (const refreshSeconds of [24_000, 24_001, 31_536_000]) {
    const result = parsePrivateMarketConfig(serialized({ valueUnit, refreshSeconds }), binding);
    assert.deepEqual(result, { ...value, valueUnit, refreshSeconds }); assert.equal(Object.isFrozen(result), true);
  }
  for (const change of [{ enabled: true }, { quotaAuthorityVerified: true }, { handoffSha256: "a".repeat(64) }, { version: 1 }, { provider: "other" }, { plan: "gold" }, { valueUnit: "USD" }, { valueUnit: " toman " }, { keyRotationConfirmed: false }, { keyRotationConfirmed: "true" }, { apiKey: "" }, { apiKey: " padded" }, { apiKey: "canary\n" }, { apiKey: "a".repeat(4097) }, ...[0, 1, 23_999, 24_000.1, "24000", 31_536_001, null].map(refreshSeconds => ({ refreshSeconds }))]) assert.throws(() => parsePrivateMarketConfig(serialized(change), binding), safeError);
  for (const raw of ["null", "[]", "true", "{", JSON.stringify({ apiKey: value.apiKey }), " ".repeat(16_385), undefined]) assert.throws(() => parsePrivateMarketConfig(raw, binding), safeError);
});

test("other origins/owner bindings and arbitrary fields cannot authorize this provider configuration", () => {
  for (const change of [{ origin: "https://other.invalid" }, { ownerBindingHash: "a".repeat(64) }]) assert.throws(() => parsePrivateMarketConfig(serialized(change), binding), safeError);
  for (const change of [{ ownerSubject: "other" }, { issuer: "https://identity.invalid" }, { portfolioSubject: "other" }, { portfolioSubject: "local-owner-v1" }, { origin: "http://goldsilver.wealthos.ir" }]) assert.throws(() => parsePrivateMarketConfig(serialized(), { ...binding, ...change }), safeError);
});

test("fixed protected reader pins readonly descriptors and reports configured-only, never ready", async () => {
  const f = fixture(), result = await f.read(binding);
  assert.deepEqual(result, { state: "configured_only", configuration: value, quotaAuthorityVerified: false, keyTransferVerified: false, runtimeAttached: false });
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.configuration), true); assert.equal(f.handles.size, 0);
  assert.equal(PRIVATE_MARKET_CONFIG, "/home/wealthos_dev/.asha-private/goldsilver/market-provider.json");
  for (const call of f.calls.filter(call => call.operation === "open")) {
    assert.equal(call.flags, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | (call.path.endsWith("/market-provider.json") ? 0 : constants.O_DIRECTORY));
    if (call.path !== "/") assert.match(call.path, /^\/proc\/self\/fd\/\d+\//);
  }
  assert.ok(f.calls.filter(call => call.operation === "read").every(call => call.path.endsWith("/market-provider.json")));
});

test("only absent fixed leaf is disabled; absent/unsafe ancestors and other IO errors are blocked", async () => {
  const absent = fixture(); absent.remove(PRIVATE_MARKET_CONFIG);
  assert.deepEqual(await absent.read(binding), { state: "disabled", quotaAuthorityVerified: false, keyTransferVerified: false, runtimeAttached: false });
  assert.equal(absent.handles.size, 0); assert.equal(absent.calls.some(call => call.operation === "read"), false);
  const parentMissing = fixture(); parentMissing.remove(posix.dirname(PRIVATE_MARKET_CONFIG)); await assert.rejects(parentMissing.read(binding), safeError); assert.equal(parentMissing.handles.size, 0);
  const denied = fixture(); denied.hook = (operation, path) => { if (operation === "lstat" && path.endsWith("market-provider.json")) throw Object.assign(Error("SYNTHETIC-SECRET-CANARY"), { code: "EACCES" }); };
  await assert.rejects(denied.read(binding), safeError); assert.equal(denied.handles.size, 0);
});

test("unsupported contexts and foreign binding reject before filesystem access", async () => {
  for (const context of [{ platform: "win32", uid }, { platform: "linux", uid: 0 }, { platform: "linux", uid: NaN }, { platform: "linux", uid: undefined }]) {
    const f = fixture(); f.context = context; await assert.rejects(f.read(binding), safeError); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); await assert.rejects(f.read({ ...binding, origin: "https://other.invalid" }), safeError); assert.deepEqual(f.calls, []);
});

test("every ancestor rejects symlinks, foreign mutation and unsafe private-directory ownership or mode", async () => {
  for (let path = posix.dirname(PRIVATE_MARKET_CONFIG);; path = posix.dirname(path)) {
    for (const extra of [{ kind: "link" }, { kind: "file" }, { uid: 999 }, { mode: 0o777 }, { mode: 0o1777 }]) {
      const f = fixture(); Object.assign(f.lookup(path), extra); await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0); assert.equal(f.calls.some(call => call.operation === "read"), false);
    }
    if (path === "/") break;
  }
  for (const path of [posix.dirname(PRIVATE_MARKET_CONFIG), posix.dirname(posix.dirname(PRIVATE_MARKET_CONFIG))]) for (const extra of [{ uid: 0 }, { mode: 0o750 }]) {
    const f = fixture(); Object.assign(f.lookup(path), extra); await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0);
  }
});

test("secret file must be current-owner0600 ordinary single-link and bounded before payload read", async () => {
  for (const extra of [{ kind: "link" }, { kind: "directory" }, { kind: "fifo" }, { uid: 0 }, { mode: 0o640 }, { mode: 0o1600 }, { nlink: 2 }, { size: 0 }, { size: 16_385 }, { size: Infinity }, { mtimeMs: NaN }, { ctimeMs: Infinity }]) {
    const f = fixture(); Object.assign(f.lookup(PRIVATE_MARKET_CONFIG), extra); await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0); assert.equal(f.calls.some(call => call.operation === "read"), false);
  }
});

test("directory/file replacement before open or during read never follows substituted contents", async () => {
  for (const operation of ["open", "read"]) for (const target of [posix.dirname(PRIVATE_MARKET_CONFIG), PRIVATE_MARKET_CONFIG]) {
    const f = fixture(); let replaced = false;
    f.hook = (step, path) => { if (!replaced && step === operation && (step === "read" || path.endsWith("/" + posix.basename(target)))) { replaced = true; f.add(target, f.node(target === PRIVATE_MARKET_CONFIG ? "file" : "directory", { ...f.lookup(target), ino: 9999 })); } };
    await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0);
  }
});

test("metadata changes, truncation/growth, invalid UTF8 and malformed secret content all fail with fixed error", async () => {
  for (const extra of [{ mtimeMs: 2 }, { ctimeMs: 2 }, { nlink: 2 }, { uid: 999 }, { mode: 0o666 }, { size: 16_385 }]) {
    const f = fixture(); let changed = false; f.hook = operation => { if (!changed && operation === "read") { changed = true; Object.assign(f.lookup(PRIVATE_MARKET_CONFIG), extra); } };
    await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0);
  }
  for (const bytes of [Buffer.from([255, 254]), Buffer.from("SYNTHETIC-SECRET-CANARY"), Buffer.alloc(16_385, 32)]) {
    const f = fixture(); Object.assign(f.lookup(PRIVATE_MARKET_CONFIG), { bytes, size: Math.min(bytes.length, 16_384) }); await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0);
  }
  const short = fixture(); short.chunkSize = 0; await assert.rejects(short.read(binding), safeError); assert.equal(short.handles.size, 0);
});

test("open/read/stat/close failure sanitizes errors and closes all successfully opened descriptors", async () => {
  for (const selected of ["open", "read", "fstat", "close"]) {
    const f = fixture(); f.hook = (operation, path) => { if (operation === selected && path !== "/") throw Error("SYNTHETIC-SECRET-CANARY"); };
    await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0);
  }
});

test("final ancestor inspection cannot hide a late file substitution, permission change or newly appearing config", async () => {
  for (const extra of [{ mode: 0o640 }, { nlink: 2 }, { ino: 9999 }]) {
    const f = fixture();
    f.hook = (operation, path) => {
      if (operation === "lstat" && path === posix.dirname(PRIVATE_MARKET_CONFIG)) {
        f.add(PRIVATE_MARKET_CONFIG, f.node("file", { ...f.lookup(PRIVATE_MARKET_CONFIG), ...extra }));
      }
    };
    await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0);
  }
  const f = fixture(), saved = f.lookup(PRIVATE_MARKET_CONFIG); f.remove(PRIVATE_MARKET_CONFIG);
  f.hook = (operation, path) => { if (operation === "lstat" && path === posix.dirname(PRIVATE_MARKET_CONFIG)) f.add(PRIVATE_MARKET_CONFIG, saved); };
  await assert.rejects(f.read(binding), safeError); assert.equal(f.handles.size, 0); assert.equal(f.calls.some(call => call.operation === "read"), false);
});

test("owner binding is copied before await; later caller mutation cannot relabel the configuration", async () => {
  const f = fixture(), supplied = { ...binding }; f.hook = operation => { if (operation === "read") supplied.ownerSubject = "changed"; };
  const result = await f.read(supplied); assert.equal(result.configuration.ownerBindingHash, identityBindingHash(binding)); assert.equal(result.state, "configured_only");
});

test("key/config presence does not attach startup and existing environment bypass remains denied", async () => {
  const f = fixture(), result = await f.read(binding); assert.equal(result.runtimeAttached, false); assert.equal(result.quotaAuthorityVerified, false); assert.equal(result.keyTransferVerified, false);
  const startup = readFileSync(new URL("../scripts/start-private-server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(startup, /readPrivateMarketConfig|private-market-config|createPrivateManagedMarketAdapter|market\s*:/);
  assert.throws(() => assertPrivateProcessEnvironment({ NAVASAN_API_KEY: value.apiKey }));
  assert.throws(() => assertPrivateProcessEnvironment({ ASHA_MANAGED_MARKET_ENABLED: "true" }));
});
