import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, opendir } from "node:fs/promises";
import { posix } from "node:path";
import { MANAGED_CACHE_FILE } from "../data/managed-market-cache.ts";
import { assertPrivateMetadata } from "./private-linux-plan.ts";
import { PRIVATE_DATA_ROOT } from "./private-supervision.ts";

// Sibling of database/backups, never part of either. No runtime attachment here.
export const PRIVATE_MARKET_CACHE_DIRECTORY = `${PRIVATE_DATA_ROOT}/latest-market`;
const allowedFiles = Object.freeze([MANAGED_CACHE_FILE, "latest.pending", "latest.lock"]);
const privateParent = posix.dirname(PRIVATE_DATA_ROOT);
type Metadata = Pick<Stats, "uid" | "mode" | "nlink" | "ino" | "dev" | "size" | "isDirectory" | "isFile" | "isSymbolicLink">;
type Handle = { fd: number; stat(): Promise<Metadata>; close(): Promise<void> };
export type PrivateMarketCacheStorageIo = {
  context(): { platform: string; uid: number | undefined };
  lstat(path: string): Promise<Metadata>;
  open(path: string, flags: number): Promise<Handle>;
  names(path: string): Promise<string[]>;
  mkdir(path: string, options: { mode: number }): Promise<unknown>;
};
type Code = "metadata_safe" | "directory_missing" | "unsupported_context" | "unsafe_ancestor"
  | "unsafe_directory" | "unexpected_entry" | "unsafe_file" | "changed_during_check" | "storage_unavailable";
export type PrivateMarketCacheStorageReport = {
  version: "asha.private_market_cache_storage.v1";
  status: "safe" | "missing" | "blocked";
  code: Code;
  created: boolean;
  lockPresent: boolean;
  pendingPresent: boolean;
  contentValidated: false;
  quotaReady: false;
  runtimeAttached: false;
};
class Denied extends Error {
  readonly code: Code;
  constructor(code: Code) { super("Private latest-cache storage denied; details withheld"); this.code = code; }
}
function report(code: Code, created: boolean, names: readonly string[] = []): PrivateMarketCacheStorageReport {
  return { version: "asha.private_market_cache_storage.v1", status: code === "metadata_safe" ? "safe" : code === "directory_missing" ? "missing" : "blocked",
    code, created, lockPresent: names.includes("latest.lock"), pendingPresent: names.includes("latest.pending"),
    contentValidated: false, quotaReady: false, runtimeAttached: false };
}
function hasCode(error: unknown, code: string) { return !!error && typeof error === "object" && "code" in error && error.code === code; }
function sameEntry(a: Metadata, b: Metadata) { return a.ino === b.ino && a.dev === b.dev; }
function metadata(info: Metadata, uid: number, kind: "ancestor" | "directory" | "file", code: Code) {
  try {
    assertPrivateMetadata({ uid: info.uid, mode: info.mode, nlink: info.nlink, directory: info.isDirectory(), file: info.isFile(), symlink: info.isSymbolicLink() }, uid, kind);
    if (kind === "file" && (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > 65_536)) throw Error();
  } catch { throw new Denied(code); }
}
type Pin = { path: string; handle: Handle; info: Metadata; kind: "ancestor" | "directory" };
const fdPath = (handle: Handle) => {
  if (!Number.isSafeInteger(handle.fd) || handle.fd < 0) throw new Denied("storage_unavailable");
  return `/proc/self/fd/${handle.fd}`;
};

/** Explicit dependency seam for synthetic tests; production exports below accept no path/env overrides.
 * Metadata only: a safe report does not validate quote contents or a leftover writer lock.
 * Pinned Linux directory descriptors prevent writes through a replaced ancestor/symlink.
 * A race/failure preserves any newly created leaf for review; nothing is repaired or removed. */
export function createPrivateMarketCacheStorage(io: PrivateMarketCacheStorageIo) {
  async function check(prepare: boolean): Promise<PrivateMarketCacheStorageReport> {
    const pins: Pin[] = [];
    const files: { path: string; handle: Handle; info: Metadata }[] = [];
    let created = false;
    let result: PrivateMarketCacheStorageReport;
    try {
      const { platform, uid } = io.context();
      if (platform !== "linux" || uid === undefined || !Number.isSafeInteger(uid) || uid <= 0) throw new Denied("unsupported_context");
      const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
      async function pin(path: string, anchored: string, kind: Pin["kind"], code: Code) {
        const before = await io.lstat(anchored); metadata(before, uid!, kind, code);
        const handle = await io.open(anchored, directoryFlags);
        // Register immediately so failed fstat/metadata checks still close the descriptor.
        const item: Pin = { path, handle, info: before, kind }; pins.push(item);
        const after = await handle.stat(); metadata(after, uid!, kind, code);
        if (!sameEntry(before, after)) throw new Denied("changed_during_check");
        fdPath(handle); return item;
      }
      async function stable() {
        for (const item of pins) {
          const current = await io.lstat(item.path), opened = await item.handle.stat();
          const code = item.path === PRIVATE_MARKET_CACHE_DIRECTORY ? "unsafe_directory" : "unsafe_ancestor";
          metadata(current, uid!, item.kind, code); metadata(opened, uid!, item.kind, code);
          if (!sameEntry(item.info, current) || !sameEntry(item.info, opened)) throw new Denied("changed_during_check");
        }
      }
      let parent = await pin("/", "/", "ancestor", "unsafe_ancestor");
      for (const segment of PRIVATE_DATA_ROOT.split("/").filter(Boolean)) {
        const path = posix.join(parent.path, segment);
        parent = await pin(path, `${fdPath(parent.handle)}/${segment}`, path === privateParent || path === PRIVATE_DATA_ROOT ? "directory" : "ancestor", "unsafe_ancestor");
      }
      const anchoredLeaf = `${fdPath(parent.handle)}/${posix.basename(PRIVATE_MARKET_CACHE_DIRECTORY)}`;
      let missing = false;
      try { await io.lstat(anchoredLeaf); } catch (error) { if (hasCode(error, "ENOENT")) missing = true; else throw error; }
      if (missing) {
        await stable();
        if (!prepare) {
          // Do not label a concurrent replacement as a missing/safe destination.
          try { await io.lstat(anchoredLeaf); throw new Denied("changed_during_check"); }
          catch (error) { if (!hasCode(error, "ENOENT")) throw error; }
          result = report("directory_missing", false);
        } else {
          try { await io.mkdir(anchoredLeaf, { mode: 0o700 }); created = true; }
          catch (error) { if (hasCode(error, "EEXIST")) throw new Denied("changed_during_check"); throw error; }
        }
      }
      if (!missing || prepare) {
        const leaf = await pin(PRIVATE_MARKET_CACHE_DIRECTORY, anchoredLeaf, "directory", "unsafe_directory");
        const names = (await io.names(fdPath(leaf.handle))).sort();
        if (names.length > 3 || new Set(names).size !== names.length || names.some(name => !allowedFiles.includes(name))) throw new Denied("unexpected_entry");
        for (const name of names) {
          const path = `${fdPath(leaf.handle)}/${name}`, before = await io.lstat(path);
          metadata(before, uid, "file", "unsafe_file");
          const handle = await io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
          files.push({ path, handle, info: before });
          const opened = await handle.stat(), after = await io.lstat(path);
          metadata(opened, uid, "file", "unsafe_file"); metadata(after, uid, "file", "unsafe_file");
          if (!sameEntry(before, opened) || !sameEntry(before, after)) throw new Denied("changed_during_check");
        }
        if (JSON.stringify((await io.names(fdPath(leaf.handle))).sort()) !== JSON.stringify(names)) throw new Denied("changed_during_check");
        await stable();
        // A same-name replacement or permission/link-count change is invisible to
        // readdir. Keep file pins alive and recheck both identities at completion.
        for (const file of files) {
          const opened = await file.handle.stat(), current = await io.lstat(file.path);
          metadata(opened, uid, "file", "unsafe_file"); metadata(current, uid, "file", "unsafe_file");
          if (!sameEntry(file.info, opened) || !sameEntry(file.info, current)) throw new Denied("changed_during_check");
        }
        result = report("metadata_safe", created, names);
      }
    } catch (error) { result = report(error instanceof Denied ? error.code : "storage_unavailable", created); }
    finally {
      for (const item of [...files.reverse(), ...pins.reverse()]) {
        try { await item.handle.close(); } catch { result = report("storage_unavailable", created); }
      }
    }
    return result!;
  }
  return Object.freeze({ inspect: () => check(false), prepare: () => check(true) });
}

const nativeIo: PrivateMarketCacheStorageIo = {
  context: () => ({ platform: process.platform, uid: process.getuid?.() }), lstat, open, mkdir,
  async names(path) {
    const result: string[] = [];
    // Stop after the first impossible fourth entry; never load an unbounded directory.
    for await (const entry of await opendir(path)) { result.push(entry.name); if (result.length > 3) break; }
    return result;
  },
};
export function inspectPrivateMarketCacheStorage() { return createPrivateMarketCacheStorage(nativeIo).inspect(); }
export function preparePrivateMarketCacheStorage() { return createPrivateMarketCacheStorage(nativeIo).prepare(); }
