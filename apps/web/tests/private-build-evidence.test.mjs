import test from "node:test";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { posix } from "node:path";
import { createPrivateBuildEvidenceReader } from "../scripts/private-build-evidence.ts";

const uid = 1056, commit = "a".repeat(40), repository = `/home/wealthos_dev/.goldsilver-service/releases/${commit}`;
const directory = repository + "/apps/web/dist-private", path = directory + "/release.json";
const manifest = { target: "private-node", commit, sourceBranch: "codex/phase-2-decision-engine", workingTreeClean: true, deploymentEligible: true };
const safeError = { message: "Private build evidence unavailable or unsafe; details withheld" };
function fixture() {
  let inode = 1, descriptor = 10;
  const handles = new Map(), calls = [];
  const node = (kind = "directory", extra = {}) => ({ kind, uid, mode: kind === "directory" ? 0o755 : 0o644,
    nlink: kind === "directory" ? 2 : 1, ino: inode++, dev: 1, size: 0, mtimeMs: 1, ctimeMs: 1, children: new Map(), ...extra });
  const root = node("directory", { uid: 0 });
  const lookup = name => {
    const fd = /^\/proc\/self\/fd\/(\d+)(?:\/(.*))?$/.exec(name);
    let current = fd ? handles.get(Number(fd[1])) : root;
    for (const part of (fd ? fd[2] ?? "" : name).split("/").filter(Boolean)) current = current?.children.get(part);
    if (!current) throw Error("SYNTHETIC-SECRET-MISSING");
    return current;
  };
  const add = (name, value = node()) => { lookup(posix.dirname(name)).children.set(posix.basename(name), value); return value; };
  let parent = "/";
  for (const segment of directory.split("/").filter(Boolean)) { parent = posix.join(parent, segment); add(parent, node("directory", parent === "/home" ? { uid: 0 } : {})); }
  const bytes = Buffer.from(JSON.stringify(manifest)); add(path, node("file", { bytes, size: bytes.length }));
  const stat = entry => ({ ...entry, isDirectory: () => entry.kind === "directory", isFile: () => entry.kind === "file", isSymbolicLink: () => entry.kind === "link" });
  const f = { handles, calls, lookup, add, node, hook: null, context: { platform: "linux", uid }, chunkSize: 7 };
  const invoke = async (operation, name, extra) => { calls.push({ operation, path: name, extra }); await f.hook?.(operation, name, extra); };
  const io = {
    context: () => f.context,
    lstat: async name => { await invoke("lstat", name); return stat(lookup(name)); },
    open: async (name, flags) => {
      await invoke("open", name, flags); const entry = lookup(name);
      if (entry.kind === "link") throw Error("SYNTHETIC-SECRET-LINK");
      const fd = descriptor++; handles.set(fd, entry);
      return { fd, stat: async () => { await invoke("fstat", name); return stat(entry); },
        read: async (buffer, offset, length, position) => { await invoke("read", name); const count = Math.max(0, Math.min(length, f.chunkSize, entry.bytes.length - position)); entry.bytes.copy(buffer, offset, position, position + count); return { bytesRead: count }; },
        close: async () => { handles.delete(fd); await invoke("close", name); },
      };
    },
  };
  f.read = createPrivateBuildEvidenceReader(io); return f;
}

test("fixed build evidence uses only pinned read-only descriptors and closes all handles", async () => {
  const f = fixture(); assert.deepEqual(await f.read(repository), manifest); assert.equal(f.handles.size, 0);
  for (const call of f.calls.filter(call => call.operation === "open")) {
    assert.equal(call.extra, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | (call.path.endsWith("/release.json") ? 0 : constants.O_DIRECTORY));
    if (call.path !== "/") assert.match(call.path, /^\/proc\/self\/fd\/\d+\//);
  }
  assert.ok(f.calls.filter(call => call.operation === "read").every(call => call.path.endsWith("/release.json")));
});

test("foreign context and arbitrary release path fail before any filesystem access", async () => {
  for (const context of [{ platform: "win32", uid }, { platform: "linux", uid: 0 }, { platform: "linux", uid: undefined }, { platform: "linux", uid: NaN }]) {
    const f = fixture(); f.context = context; await assert.rejects(f.read(repository), safeError); assert.deepEqual(f.calls, []);
  }
  for (const target of ["/tmp/elsewhere", repository + "/../" + commit, repository + "/apps/web", repository.replace(commit, "A".repeat(40))]) {
    const f = fixture(); await assert.rejects(f.read(target), safeError); assert.deepEqual(f.calls, []);
  }
});

test("every ancestor must be ordinary, expected-owner and not foreign-writable", async () => {
  for (let name = directory;; name = posix.dirname(name)) {
    for (const extra of [{ kind: "link" }, { kind: "file" }, { uid: 999 }, { mode: 0o777 }, { mode: 0o1777 }]) {
      const f = fixture(); Object.assign(f.lookup(name), extra); await assert.rejects(f.read(repository), safeError);
      assert.equal(f.handles.size, 0); assert.equal(f.calls.some(call => call.operation === "read"), false);
    }
    if (name === "/") break;
  }
});

test("manifest links, broad write access, unsafe owner/type and bounds are rejected before payload read", async () => {
  for (const extra of [{ kind: "link" }, { kind: "directory" }, { kind: "fifo" }, { uid: 0 }, { mode: 0o666 }, { mode: 0o1644 }, { nlink: 2 }, { size: 0 }, { size: 4097 }, { size: Infinity }, { mtimeMs: NaN }]) {
    const f = fixture(); Object.assign(f.lookup(path), extra); await assert.rejects(f.read(repository), safeError);
    assert.equal(f.handles.size, 0); assert.equal(f.calls.some(call => call.operation === "read"), false);
  }
});

test("directory and file replacement during open or after read cannot attest another path", async () => {
  for (const target of [directory, path]) {
    const f = fixture(); let replaced = false;
    f.hook = (operation, name) => {
      if (!replaced && operation === "open" && name.endsWith("/" + posix.basename(target))) { replaced = true; f.add(target, f.node(target === path ? "file" : "directory", { ...f.lookup(target), ino: 9999 })); }
    };
    await assert.rejects(f.read(repository), safeError); assert.equal(f.handles.size, 0);
  }
  for (const target of [directory, path]) {
    const f = fixture(); let replaced = false;
    f.hook = operation => { if (!replaced && operation === "read") { replaced = true; f.add(target, f.node(target === path ? "file" : "directory", { ...f.lookup(target), ino: 9999 })); } };
    await assert.rejects(f.read(repository), safeError); assert.equal(f.handles.size, 0);
  }
});

test("same-size changes, new link, permission changes and growth during read fail closed", async () => {
  for (const extra of [{ mtimeMs: 2 }, { ctimeMs: 2 }, { nlink: 2 }, { mode: 0o666 }, { uid: 999 }, { size: 4097 }]) {
    const f = fixture(); let changed = false;
    f.hook = operation => { if (!changed && operation === "read") { changed = true; Object.assign(f.lookup(path), extra); } };
    await assert.rejects(f.read(repository), safeError); assert.equal(f.handles.size, 0);
  }
});

test("malformed payload, invalid UTF8, read/close/proc failures emit fixed error only", async () => {
  for (const bytes of [Buffer.from("SYNTHETIC-SECRET-not-json"), Buffer.from([0xff, 0xfe])]) {
    const f = fixture(); Object.assign(f.lookup(path), { bytes, size: bytes.length }); await assert.rejects(f.read(repository), safeError); assert.equal(f.handles.size, 0);
  }
  for (const operation of ["open", "read", "fstat", "close"]) {
    const f = fixture(); f.hook = (name, target) => { if (name === operation && target !== "/") throw Error("SYNTHETIC-SECRET-IO"); };
    await assert.rejects(f.read(repository), safeError); assert.equal(f.handles.size, 0);
  }
});
