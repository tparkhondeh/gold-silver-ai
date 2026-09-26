import assert from "node:assert/strict";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, opendir, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, join, resolve, sep, basename } from "node:path";
import test from "node:test";
import { PRIVATE_DATA_ROOT } from "../scripts/private-supervision.ts";
import { PRIVATE_MARKET_CACHE_DIRECTORY as destination, createPrivateMarketCacheStorage } from "../scripts/private-market-cache-storage.ts";

const uid = 1001;
const errno = code => Object.assign(Error("SYNTHETIC_SECRET_MUST_NOT_ESCAPE"), { code });
function fixture({ present = false, context = { platform: "linux", uid } } = {}) {
  let inode = 1, descriptor = 10;
  const calls = [], handles = new Map();
  const node = (kind = "directory", changes = {}) => ({ kind, uid, mode: kind === "directory" ? 0o700 : 0o600,
    nlink: kind === "directory" ? 2 : 1, ino: inode++, dev: 1, size: 0, children: new Map(), ...changes });
  const root = node("directory", { uid: 0, mode: 0o755 });
  const lookup = path => {
    const fd = /^\/proc\/self\/fd\/(\d+)(?:\/(.*))?$/.exec(path);
    let current = fd ? handles.get(Number(fd[1]))?.node : root;
    const parts = (fd ? fd[2] ?? "" : path).split("/").filter(Boolean);
    for (const part of parts) current = current?.children.get(part);
    if (!current) throw errno("ENOENT");
    return current;
  };
  const add = (path, value = node()) => { lookup(posix.dirname(path)).children.set(posix.basename(path), value); return value; };
  const stat = current => ({ ...current, isDirectory: () => current.kind === "directory", isFile: () => current.kind === "file", isSymbolicLink: () => current.kind === "link" });
  for (const path of ["/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", PRIVATE_DATA_ROOT]) {
    add(path, node("directory", path === "/home" ? { uid: 0, mode: 0o755 } : {}));
  }
  if (present) add(destination);
  const f = { calls, handles, lookup, add, node, hook: null, mkdirCount: 0 };
  const invoke = async (operation, path, extra) => { calls.push({ operation, path, extra }); await f.hook?.(operation, path, extra); };
  const io = {
    context: () => context,
    async lstat(path) { await invoke("lstat", path); return stat(lookup(path)); },
    async open(path, flags) {
      await invoke("open", path, flags);
      const current = lookup(path); if (current.kind === "link") throw errno("ELOOP");
      const fd = descriptor++; handles.set(fd, { node: current });
      return { fd, async stat() { await invoke("fstat", path); return stat(current); }, async close() { calls.push({ operation: "close", path }); handles.delete(fd); } };
    },
    async names(path) { await invoke("names", path); return [...lookup(path).children.keys()]; },
    async mkdir(path, options) {
      await invoke("mkdir", path, options);
      const parent = lookup(posix.dirname(path)), name = posix.basename(path);
      if (parent.children.has(name)) throw errno("EEXIST");
      parent.children.set(name, node("directory", { mode: options.mode })); f.mkdirCount++;
    },
  };
  f.storage = createPrivateMarketCacheStorage(io); f.io = io;
  return f;
}
const assertDetached = result => {
  assert.equal(result.contentValidated, false); assert.equal(result.quotaReady, false); assert.equal(result.runtimeAttached, false);
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_SECRET"), false);
};

test("cache destination is a fixed latest-only sibling outside database and backup trees", async () => {
  assert.equal(destination, `${PRIVATE_DATA_ROOT}/latest-market`);
  assert.equal(destination.startsWith(`${PRIVATE_DATA_ROOT}/database/`), false);
  assert.equal(destination.startsWith(`${PRIVATE_DATA_ROOT}/backups/`), false);
  const source = await readFile(new URL("../scripts/private-market-cache-storage.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|readFile\(|writeFile\(|chmod\(|unlink\(|rename\(|fetch\(|\.transaction\(/);
  assert.match(source, /export function inspectPrivateMarketCacheStorage\(\)/);
  assert.match(source, /export function preparePrivateMarketCacheStorage\(\)/);
  assert.match(source, /process\.platform/); assert.match(source, /process\.getuid/);
});

test("inspection reports a safely missing leaf without creating or reading any contents", async () => {
  const f = fixture(), result = await f.storage.inspect();
  assert.equal(result.status, "missing"); assert.equal(result.code, "directory_missing"); assert.equal(result.created, false);
  assert.equal(f.mkdirCount, 0); assert.equal(f.calls.some(call => call.operation === "names"), false);
  assert.equal(f.handles.size, 0); assertDetached(result);
});

test("explicit preparation creates only one anchored mode0700 leaf and is idempotent", async () => {
  const f = fixture(), result = await f.storage.prepare();
  assert.equal(result.code, "metadata_safe"); assert.equal(result.created, true); assert.equal(f.mkdirCount, 1);
  assert.equal(f.lookup(destination).mode, 0o700);
  const creation = f.calls.find(call => call.operation === "mkdir");
  assert.match(creation.path, /^\/proc\/self\/fd\/\d+\/latest-market$/); assert.deepEqual(creation.extra, { mode: 0o700 });
  const again = await f.storage.prepare(); assert.equal(again.code, "metadata_safe"); assert.equal(again.created, false); assert.equal(f.mkdirCount, 1);
  assert.equal(f.handles.size, 0); assertDetached(result);
});

test("recognized latest, pending and lock files remain unchanged and do not imply usable quotes or an unlocked writer", async () => {
  const f = fixture({ present: true });
  for (const name of ["latest.json", "latest.pending", "latest.lock"]) f.add(`${destination}/${name}`, f.node("file", { size: name === "latest.lock" ? 0 : 65_536 }));
  const before = [...f.lookup(destination).children.entries()];
  for (const operation of ["inspect", "prepare"]) {
    const result = await f.storage[operation](); assert.equal(result.code, "metadata_safe"); assert.equal(result.lockPresent, true); assert.equal(result.pendingPresent, true); assertDetached(result);
  }
  assert.deepEqual([...f.lookup(destination).children.entries()], before); assert.equal(f.mkdirCount, 0); assert.equal(f.handles.size, 0);
});

test("unsupported platform, root and invalid current identities fail before filesystem access", async () => {
  for (const context of [{ platform: "win32", uid }, { platform: "linux", uid: 0 }, { platform: "linux", uid: undefined }, { platform: "linux", uid: -1 }, { platform: "linux", uid: 1.5 }]) {
    const f = fixture({ context });
    assert.equal((await f.storage.prepare()).code, "unsupported_context"); assert.deepEqual(f.calls, []);
  }
});

test("every unsafe ancestor fails closed without creating, repairing or inspecting siblings", async () => {
  for (const path of ["/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", PRIVATE_DATA_ROOT]) {
    for (const change of [{ kind: "link" }, { kind: "file" }, { uid: 999 }, { mode: 0o777 }, { mode: 0o4755 }]) {
      const f = fixture(); Object.assign(f.lookup(path), change);
      assert.equal((await f.storage.prepare()).code, "unsafe_ancestor", `${path} ${JSON.stringify(change)}`);
      assert.equal(f.mkdirCount, 0); assert.equal(f.handles.size, 0);
    }
  }
  for (const path of ["/home/wealthos_dev/.asha-private", PRIVATE_DATA_ROOT]) {
    for (const change of [{ uid: 0 }, { mode: 0o750 }, { mode: 0o1700 }]) {
      const f = fixture(); Object.assign(f.lookup(path), change); assert.equal((await f.storage.prepare()).code, "unsafe_ancestor"); assert.equal(f.mkdirCount, 0);
    }
  }
});

test("missing private parent is not created recursively and underlying errors are sanitized", async () => {
  const f = fixture(); f.lookup("/home/wealthos_dev").children.delete(".asha-private");
  const result = await f.storage.prepare(); assert.equal(result.code, "storage_unavailable"); assert.equal(f.mkdirCount, 0); assertDetached(result); assert.equal(f.handles.size, 0);
});

test("existing unsafe leaf is never repaired or overwritten", async () => {
  for (const change of [{ kind: "link" }, { kind: "file" }, { uid: 0 }, { mode: 0o750 }, { mode: 0o1700 }]) {
    const f = fixture({ present: true }); Object.assign(f.lookup(destination), change);
    const result = await f.storage.prepare(); assert.equal(result.code, "unsafe_directory"); assert.equal(f.mkdirCount, 0); assert.equal(f.handles.size, 0);
  }
});

test("unknown entries and nested directories are rejected without traversing them", async () => {
  for (const name of ["history.json", "credentials.json", "backup", "latest.JSON"]) {
    const f = fixture({ present: true }); f.add(`${destination}/${name}`);
    assert.equal((await f.storage.prepare()).code, "unexpected_entry"); assert.equal(f.mkdirCount, 0);
    assert.equal(f.calls.some(call => call.path?.endsWith(`/${name}`)), false);
  }
});

test("allowed files require exact current owner0600, ordinary single-link bounded metadata", async () => {
  for (const name of ["latest.json", "latest.pending", "latest.lock"]) {
    for (const change of [{ kind: "directory" }, { kind: "link" }, { kind: "fifo" }, { uid: 0 }, { mode: 0o640 }, { mode: 0o1600 }, { nlink: 2 }, { size: 65_537 }]) {
      const f = fixture({ present: true }); f.add(`${destination}/${name}`, f.node("file", change));
      assert.equal((await f.storage.inspect()).code, "unsafe_file", `${name} ${JSON.stringify(change)}`); assert.equal(f.handles.size, 0);
    }
  }
});

test("file open uses no-follow/nonblocking read-only and rejects inode replacement", async () => {
  const f = fixture({ present: true }); f.add(`${destination}/latest.json`, f.node("file"));
  f.hook = (operation, path) => { if (operation === "open" && path.endsWith("/latest.json")) f.add(`${destination}/latest.json`, f.node("file")); };
  assert.equal((await f.storage.inspect()).code, "changed_during_check"); assert.equal(f.handles.size, 0);
  const flags = f.calls.find(call => call.operation === "open" && call.path.endsWith("/latest.json")).extra;
  assert.equal(flags, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
});

test("ancestor substitution before mkdir cannot redirect the creation through a new path", async () => {
  const f = fixture(), oldParent = f.lookup(PRIVATE_DATA_ROOT), replacement = f.node();
  f.hook = (operation) => { if (operation === "mkdir") f.add(PRIVATE_DATA_ROOT, replacement); };
  const result = await f.storage.prepare();
  assert.equal(result.code, "changed_during_check"); assert.equal(result.created, true);
  assert.equal(replacement.children.size, 0); assert.equal(oldParent.children.has("latest-market"), true);
  assert.equal(f.handles.size, 0); // The retained newly created leaf is not automatically removed.
});

test("ancestor mutation detected before creation blocks writes", async () => {
  const f = fixture(); let altered = false;
  f.hook = (operation, path) => {
    if (!altered && operation === "lstat" && path.endsWith("/latest-market")) { altered = true; f.lookup(PRIVATE_DATA_ROOT).mode = 0o777; }
  };
  assert.equal((await f.storage.prepare()).code, "unsafe_ancestor"); assert.equal(f.mkdirCount, 0); assert.equal(f.handles.size, 0);
});

test("two preparers never overwrite a concurrently created leaf", async () => {
  const f = fixture(); const results = await Promise.all([f.storage.prepare(), f.storage.prepare()]);
  assert.equal(f.mkdirCount, 1); assert.equal(results.filter(result => result.created).length, 1);
  assert.ok(results.every(result => ["metadata_safe", "changed_during_check"].includes(result.code))); assert.equal(f.handles.size, 0);
});

test("new leaf failing its metadata check is preserved without cleanup", async () => {
  const f = fixture();
  f.hook = (operation, path) => { if (operation === "open" && path.endsWith("/latest-market")) f.lookup(destination).mode = 0o750; };
  const result = await f.storage.prepare(); assert.equal(result.code, "unsafe_directory"); assert.equal(result.created, true);
  assert.equal(f.lookup(destination).mode, 0o750); assert.equal(f.mkdirCount, 1); assert.equal(f.handles.size, 0);
});

test("directory contents changing during inspection fail closed and remain preserved", async () => {
  const f = fixture({ present: true }); let names = 0;
  f.hook = operation => { if (operation === "names" && ++names === 2) f.add(`${destination}/latest.lock`, f.node("file")); };
  assert.equal((await f.storage.inspect()).code, "changed_during_check"); assert.equal(f.lookup(destination).children.has("latest.lock"), true); assert.equal(f.handles.size, 0);
});

test("late same-name file replacement and permission/link-count mutation cannot pass a names-only recheck", async () => {
  for (const change of ["symlink", "new_inode", "hardlink", "permissions", "owner"]) {
    const f = fixture({ present: true }); f.add(`${destination}/latest.json`, f.node("file")); let names = 0;
    f.hook = operation => {
      if (operation !== "names" || ++names !== 2) return;
      if (change === "symlink") f.add(`${destination}/latest.json`, f.node("link"));
      if (change === "new_inode") f.add(`${destination}/latest.json`, f.node("file"));
      if (change === "hardlink") f.lookup(`${destination}/latest.json`).nlink = 2;
      if (change === "permissions") f.lookup(`${destination}/latest.json`).mode = 0o644;
      if (change === "owner") f.lookup(`${destination}/latest.json`).uid = 999;
    };
    const result = await f.storage.inspect();
    assert.equal(result.code, change === "new_inode" ? "changed_during_check" : "unsafe_file", change);
    assert.equal(result.status, "blocked"); assert.equal(f.handles.size, 0); assert.equal(f.mkdirCount, 0);
  }
});

test("unavailable proc descriptor or failed open never falls back to absolute writes or leaks errors", async () => {
  for (const operation of ["open", "fstat", "names", "mkdir"]) {
    const f = fixture({ present: operation === "names" });
    f.hook = (name, path) => { if (name === operation && path !== "/") throw errno("EACCES"); };
    const result = await f.storage.prepare(); assert.equal(result.code, "storage_unavailable"); assertDetached(result); assert.equal(f.handles.size, 0);
    assert.ok(f.calls.filter(call => call.operation === "mkdir").every(call => call.path.startsWith("/proc/self/fd/")));
  }
});

test("Linux real filesystem: fixed-path mapping retains actual proc/no-follow anchoring and never redirects writes", {
  skip: process.platform !== "linux" ? "Linux /proc/self/fd semantics; virtual coverage runs on Windows" : process.getuid?.() === 0 ? "Requires a nonroot Linux test user" : false,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), "asha-cache-storage-test-"));
  // Every ordinary test path maps into this newly created tree. Descriptor paths
  // remain real Linux /proc/self/fd operations; no actual private path is touched.
  const mappedFixture = async name => {
    const tree = join(temporary, name); await mkdir(tree, { mode: 0o700 });
    const map = path => {
      if (/^\/proc\/self\/fd\/\d+(?:\/[^/]*)?$/.test(path)) return path;
      assert.ok(path === "/" || path === "/home" || path === "/home/wealthos_dev" || path === "/home/wealthos_dev/.asha-private" || path === PRIVATE_DATA_ROOT || path.startsWith(`${PRIVATE_DATA_ROOT}/`));
      const result = resolve(tree, `.${path}`); assert.ok(result === tree || result.startsWith(tree + sep)); return result;
    };
    for (const path of ["/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", PRIVATE_DATA_ROOT]) await mkdir(map(path), { mode: 0o700 });
    const hooks = { beforeOpen: null, beforeMkdir: null }, descriptors = new Set();
    const io = {
      context: () => ({ platform: process.platform, uid: process.getuid() }),
      lstat: path => lstat(map(path)),
      async open(path, flags) {
        await hooks.beforeOpen?.(path); const handle = await open(map(path), flags); descriptors.add(handle.fd);
        return { fd: handle.fd, stat: () => handle.stat(), async close() { const fd = handle.fd; await handle.close(); descriptors.delete(fd); } };
      },
      async names(path) { const names = []; for await (const entry of await opendir(map(path))) { names.push(entry.name); if (names.length > 3) break; } return names; },
      async mkdir(path, options) { await hooks.beforeMkdir?.(path); return mkdir(map(path), options); },
    };
    return { map, hooks, descriptors, storage: createPrivateMarketCacheStorage(io) };
  };
  try {
    const normal = await mappedFixture("normal");
    assert.equal((await normal.storage.inspect()).code, "directory_missing");
    assert.equal((await normal.storage.prepare()).created, true);
    assert.equal((await lstat(normal.map(destination))).mode & 0o7777, 0o700);
    const currentFile = normal.map(`${destination}/latest.json`), target = join(temporary, "nonprivate-synthetic-target.txt");
    await writeFile(currentFile, "NONPRIVATE SYNTHETIC CACHE BYTES", { mode: 0o600, flag: "wx" });
    await writeFile(target, "NONPRIVATE TARGET MUST REMAIN UNCHANGED", { mode: 0o600, flag: "wx" });
    const valid = await normal.storage.inspect(); assert.equal(valid.code, "metadata_safe"); assertDetached(valid);
    let swapped = false;
    normal.hooks.beforeOpen = async path => {
      if (!swapped && path.endsWith("/latest.json")) { swapped = true; await unlink(currentFile); await symlink(target, currentFile); }
    };
    // lstat saw an ordinary file, but the real O_NOFOLLOW open must reject its
    // same-name symlink replacement without opening/reading the target.
    const denied = await normal.storage.inspect(); assert.equal(denied.status, "blocked"); assertDetached(denied);
    assert.equal(await readFile(target, "utf8"), "NONPRIVATE TARGET MUST REMAIN UNCHANGED"); assert.equal(normal.descriptors.size, 0);

    const raced = await mappedFixture("raced"), originalParent = raced.map(PRIVATE_DATA_ROOT), retainedParent = originalParent + "-retained";
    const replacement = join(temporary, "nonprivate-replacement"); await mkdir(replacement, { mode: 0o700 });
    raced.hooks.beforeMkdir = async path => {
      assert.match(path, /^\/proc\/self\/fd\/\d+\/latest-market$/);
      await rename(originalParent, retainedParent); await symlink(replacement, originalParent, "dir");
    };
    const changed = await raced.storage.prepare(); assert.equal(changed.code, "unsafe_ancestor"); assert.equal(changed.created, true);
    assert.equal((await lstat(join(retainedParent, "latest-market"))).mode & 0o7777, 0o700);
    await assert.rejects(lstat(join(replacement, "latest-market")), { code: "ENOENT" });
    assert.equal(raced.descriptors.size, 0);
  } finally {
    // Only this generated, validated synthetic test fixture is removed.
    assert.equal(resolve(temporary), temporary); assert.equal(resolve(posix.dirname(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("asha-cache-storage-test-"));
    await rm(temporary, { recursive: true, force: false });
  }
});
