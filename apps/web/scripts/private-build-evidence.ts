import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { posix } from "node:path";
import { assertPrivateReleaseDirectory } from "./private-supervision.ts";

type Metadata = Pick<Stats, "uid" | "mode" | "nlink" | "ino" | "dev" | "size" | "mtimeMs" | "ctimeMs" | "isDirectory" | "isFile" | "isSymbolicLink">;
type Handle = {
  fd: number;
  stat(): Promise<Metadata>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
};
export type PrivateBuildEvidenceIo = {
  context(): { platform: string; uid: number | undefined };
  lstat(path: string): Promise<Metadata>;
  open(path: string, flags: number): Promise<Handle>;
};
const failure = () => new Error("Private build evidence unavailable or unsafe; details withheld");
const sameIdentity = (a: Metadata, b: Metadata) => a.dev === b.dev && a.ino === b.ino;
const sameFile = (a: Metadata, b: Metadata) => sameIdentity(a, b) && a.uid === b.uid && a.mode === b.mode
  && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

/** Read only the fixed build manifest beneath an exact reviewed release path.
 * Pin every ancestor with NOFOLLOW; descriptor-relative traversal cannot be
 * redirected through a changed directory name. All descriptors and original
 * paths are checked again before returning. No private config/DB/cache is read. */
export function createPrivateBuildEvidenceReader(io: PrivateBuildEvidenceIo) {
  return async function read(repository: string): Promise<unknown> {
    const directories: { path: string; handle: Handle; info: Metadata }[] = [];
    let file: Handle | null = null, result: unknown;
    let failed = false;
    try {
      const { platform, uid } = io.context();
      if (platform !== "linux" || !Number.isSafeInteger(uid) || uid === undefined || uid <= 0) throw failure();
      assertPrivateReleaseDirectory(repository);
      const metadata = (value: Metadata, path: string, directory: boolean) => {
        const owner = path === "/" || path === "/home" ? 0 : uid;
        if (value.isSymbolicLink() || value.uid !== owner || !Number.isSafeInteger(value.mode)
          || (value.mode & 0o7022) !== 0 || !Number.isSafeInteger(value.nlink) || value.nlink < 1
          || (directory ? !value.isDirectory() : !value.isFile() || value.nlink !== 1
            || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 4096
            || !Number.isFinite(value.mtimeMs) || !Number.isFinite(value.ctimeMs))) throw failure();
      };
      const anchored = (handle: Handle) => {
        if (!Number.isSafeInteger(handle.fd) || handle.fd < 0) throw failure();
        return `/proc/self/fd/${handle.fd}`;
      };
      const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
      const pin = async (path: string, source: string) => {
        const before = await io.lstat(source); metadata(before, path, true);
        const handle = await io.open(source, flags | constants.O_DIRECTORY);
        const item = { path, handle, info: before }; directories.push(item);
        const opened = await handle.stat(); metadata(opened, path, true);
        if (!sameIdentity(before, opened)) throw failure();
        anchored(handle); return item;
      };
      let parent = await pin("/", "/");
      const directory = `${repository}/apps/web/dist-private`;
      for (const segment of directory.split("/").filter(Boolean)) {
        parent = await pin(posix.join(parent.path, segment), `${anchored(parent.handle)}/${segment}`);
      }
      const path = `${directory}/release.json`, source = `${anchored(parent.handle)}/release.json`;
      const before = await io.lstat(source); metadata(before, path, false);
      file = await io.open(source, flags);
      const opened = await file.stat(); metadata(opened, path, false);
      if (!sameFile(before, opened)) throw failure();
      const bytes = Buffer.alloc(4097);
      let length = 0;
      while (length < bytes.length) {
        const read = await file.read(bytes, length, bytes.length - length, length);
        if (!Number.isSafeInteger(read.bytesRead) || read.bytesRead < 0 || read.bytesRead > bytes.length - length) throw failure();
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      if (length !== opened.size) throw failure();
      result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
      for (const item of directories) {
        const named = await io.lstat(item.path), held = await item.handle.stat();
        metadata(named, item.path, true); metadata(held, item.path, true);
        if (!sameIdentity(item.info, named) || !sameIdentity(item.info, held)) throw failure();
      }
      const held = await file.stat(), named = await io.lstat(source), absolute = await io.lstat(path);
      for (const value of [held, named, absolute]) {
        metadata(value, path, false); if (!sameFile(opened, value)) throw failure();
      }
    } catch { failed = true; }
    finally {
      if (file) try { await file.close(); } catch { failed = true; }
      for (const item of directories.reverse()) try { await item.handle.close(); } catch { failed = true; }
    }
    if (failed) throw failure();
    return result;
  };
}

const read = createPrivateBuildEvidenceReader({ context: () => ({ platform: process.platform, uid: process.getuid?.() }), lstat, open });
export function readPrivateBuildEvidence(repository: string): Promise<unknown> { return read(repository); }
