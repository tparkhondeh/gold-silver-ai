import { constants, type Stats } from "node:fs";
import { lstat, open, opendir, rename, unlink } from "node:fs/promises";
import { posix } from "node:path";
import { decodeManagedCache, encodeManagedCache, MANAGED_CACHE_FILE, selectManagedCacheSnapshot, type ManagedMarketCache } from "../data/managed-market-cache.ts";
import type { TransactionRunner } from "../data/postgres-observation-repository.ts";
import { assertPrivateMetadata } from "./private-linux-plan.ts";
import { PRIVATE_DATA_ROOT } from "./private-supervision.ts";
import { PRIVATE_MARKET_CACHE_DIRECTORY } from "./private-market-cache-storage.ts";

const MAX_BYTES = 65_536;
const failure = () => new Error("Private latest cache unavailable or unsafe; details withheld");
type Metadata = Pick<Stats, "uid" | "mode" | "nlink" | "ino" | "dev" | "size" | "mtimeMs" | "ctimeMs" | "isDirectory" | "isFile" | "isSymbolicLink">;
type Handle = {
  fd: number; stat(): Promise<Metadata>; close(): Promise<void>; sync(): Promise<void>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  writeFile(value: string, encoding: "utf8"): Promise<void>;
};
export type PrivateMarketCacheIo = {
  context(): { platform: string; uid: number | undefined };
  lstat(path: string): Promise<Metadata>;
  open(path: string, flags: number, mode?: number): Promise<Handle>;
  names(path: string): Promise<string[]>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
};
const sameEntry = (a: Metadata, b: Metadata) => a.dev === b.dev && a.ino === b.ino;
const sameFile = (a: Metadata, b: Metadata) => sameEntry(a, b) && a.uid === b.uid && a.mode === b.mode && a.nlink === b.nlink
  && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const absent = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";

/** Fixed Linux runtime backend, inactive until explicitly composed by its caller.
 * No configuration, provider, directory creation, grant or startup attachment.
 * Pins prevent ancestor redirection and checks detect observed replacement. Unix
 * rename/unlink are not inode-conditional: a fully malicious same-UID process can
 * still race the final check/syscall. This does not claim isolation from that UID.
 * Existing locks/pending files block reads as well as writes and are never adopted,
 * repaired or automatically removed; availability waits for explicit recovery. */
export function createPrivateMarketCacheWithIo(io: PrivateMarketCacheIo, runner: TransactionRunner): ManagedMarketCache {
  if (typeof runner?.transaction !== "function") throw failure();
  const transaction = runner.transaction.bind(runner);
  async function operation(now: number, candidate?: { raw: string; snapshot: ReturnType<typeof decodeManagedCache> }) {
    const pins: { path: string; handle: Handle; info: Metadata; kind: "ancestor" | "directory" }[] = [];
    const handles: Handle[] = [];
    const owned: { name: string; handle: Handle; info: Metadata }[] = [];
    let failed = false, result: ReturnType<typeof decodeManagedCache> | null = null;
    try {
      const { platform, uid } = io.context();
      if (platform !== "linux" || uid === undefined || !Number.isSafeInteger(uid) || uid <= 0) throw failure();
      const metadata = (info: Metadata, kind: "ancestor" | "directory" | "file") => {
        assertPrivateMetadata({ uid: info.uid, mode: info.mode, nlink: info.nlink, directory: info.isDirectory(), file: info.isFile(), symlink: info.isSymbolicLink() }, uid, kind);
        if (kind === "file" && (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > MAX_BYTES || !Number.isFinite(info.mtimeMs) || !Number.isFinite(info.ctimeMs))) throw failure();
      };
      const fd = (handle: Handle) => { if (!Number.isSafeInteger(handle.fd) || handle.fd < 0) throw failure(); return `/proc/self/fd/${handle.fd}`; };
      const pin = async (path: string, source: string) => {
        const kind = path === posix.dirname(PRIVATE_DATA_ROOT) || path.startsWith(PRIVATE_DATA_ROOT) ? "directory" : "ancestor";
        const before = await io.lstat(source); metadata(before, kind);
        const handle = await io.open(source, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        handles.push(handle); const opened = await handle.stat(); metadata(opened, kind);
        if (!sameEntry(before, opened)) throw failure();
        const item: typeof pins[number] = { path, handle, info: opened, kind }; pins.push(item); fd(handle); return item;
      };
      let parent = await pin("/", "/");
      for (const segment of PRIVATE_MARKET_CACHE_DIRECTORY.split("/").filter(Boolean)) parent = await pin(posix.join(parent.path, segment), `${fd(parent.handle)}/${segment}`);
      const leaf = parent, entry = (name: string) => `${fd(leaf.handle)}/${name}`;
      const stable = async () => {
        for (const item of pins) {
          const named = await io.lstat(item.path), held = await item.handle.stat(); metadata(named, item.kind); metadata(held, item.kind);
          if (!sameEntry(item.info, named) || !sameEntry(item.info, held)) throw failure();
        }
      };
      const names = async (expected: readonly string[]) => {
        const actual = (await io.names(fd(leaf.handle))).sort();
        if (actual.length > 3 || JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw failure();
      };
      const infoOrNull = async (name: string) => {
        try { const info = await io.lstat(entry(name)); metadata(info, "file"); return info; }
        catch (error) { if (absent(error)) return null; throw error; }
      };
      const original = await infoOrNull(MANAGED_CACHE_FILE);
      // Even a valid prior pending file belongs to recovery, not this invocation.
      const initialNames = original ? [MANAGED_CACHE_FILE] : [];
      await names(initialNames); await stable();
      const unchanged = async () => {
        const current = await infoOrNull(MANAGED_CACHE_FILE);
        if (original ? !current || !sameFile(original, current) : current !== null) throw failure();
      };
      const readCurrent = async () => {
        if (!original) return null;
        const handle = await io.open(entry(MANAGED_CACHE_FILE), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        handles.push(handle); const opened = await handle.stat(); metadata(opened, "file");
        if (!sameFile(original, opened)) throw failure();
        const buffer = Buffer.alloc(MAX_BYTES + 1); let length = 0;
        while (length < buffer.length) {
          const chunk = await handle.read(buffer, length, buffer.length - length, length);
          if (!Number.isSafeInteger(chunk.bytesRead) || chunk.bytesRead < 0 || chunk.bytesRead > buffer.length - length) throw failure();
          if (!chunk.bytesRead) break; length += chunk.bytesRead;
        }
        const after = await handle.stat(); metadata(after, "file");
        if (length !== original.size || !sameFile(opened, after)) throw failure();
        await unchanged(); await stable();
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
        return { raw, snapshot: decodeManagedCache(raw, now) };
      };
      const create = async (name: string) => {
        const handle = await io.open(entry(name), constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
        handles.push(handle); const info = await handle.stat(); metadata(info, "file");
        // A failed fstat leaves an unidentifiable artifact for explicit recovery.
        const item = { name, handle, info }; owned.push(item); return item;
      };
      const ownStable = async (item: typeof owned[number]) => {
        const held = await item.handle.stat(), named = await io.lstat(entry(item.name)); metadata(held, "file"); metadata(named, "file");
        if (!sameEntry(item.info, held) || !sameFile(held, named)) throw failure();
      };
      try {
        if (candidate) {
          const lock = await create("latest.lock"); await ownStable(lock); await stable();
          await names([...initialNames, "latest.lock"]);
        }
        const current = await readCurrent();
        result = candidate ? selectManagedCacheSnapshot(current, candidate) : current?.snapshot ?? null;
        if (candidate && result === candidate.snapshot) {
          const pending = await create("latest.pending");
          await pending.handle.writeFile(candidate.raw, "utf8"); await pending.handle.sync();
          if ((await pending.handle.stat()).size !== Buffer.byteLength(candidate.raw)) throw failure();
          await names([...initialNames, "latest.lock", "latest.pending"]);
          await ownStable(pending); await ownStable(owned[0]); await unchanged(); await stable();
          await io.rename(entry("latest.pending"), entry(MANAGED_CACHE_FILE));
          owned.splice(owned.indexOf(pending), 1);
          const published = await io.lstat(entry(MANAGED_CACHE_FILE)); metadata(published, "file");
          if (!sameFile(await pending.handle.stat(), published)) throw failure();
          await leaf.handle.sync(); await stable();
        } else { await unchanged(); await stable(); }
      } finally {
        // Delete only entries created and still positively identified by this
        // invocation. On a changed ancestor/file, preserve artifacts for review.
        for (const item of [...owned].reverse()) {
          try { await stable(); await ownStable(item); await io.unlink(entry(item.name)); await leaf.handle.sync(); }
          catch { failed = true; }
        }
      }
    } catch { failed = true; }
    finally { for (const handle of handles.reverse()) try { await handle.close(); } catch { failed = true; } }
    if (failed) throw failure();
    return result;
  }
  return Object.freeze({
    read: (now: number) => operation(now),
    async replace(snapshot, now) {
      try {
        const raw = encodeManagedCache(snapshot, now), candidate = { raw, snapshot: decodeManagedCache(raw, now) };
        return await transaction(async database => {
          await database.query("SELECT pg_advisory_xact_lock(174228531, 11)");
          return (await operation(now, candidate))!;
        });
      } catch { throw failure(); }
    },
  });
}

const nativeIo: PrivateMarketCacheIo = {
  context: () => ({ platform: process.platform, uid: process.getuid?.() }), lstat, open, rename, unlink,
  async names(path) {
    const names: string[] = [];
    for await (const item of await opendir(path)) { names.push(item.name); if (names.length > 3) break; }
    return names;
  },
};
export function createPrivateMarketCache(runner: TransactionRunner): ManagedMarketCache { return createPrivateMarketCacheWithIo(nativeIo, runner); }
