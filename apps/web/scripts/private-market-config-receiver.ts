import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { posix } from "node:path";
import { inspectOwnerIdentityBinding, type OwnerIdentityBinding } from "../auth/postgres-owner-identity-store.ts";
import { parsePrivateMarketConfig, PRIVATE_MARKET_CONFIG, PRIVATE_MARKET_CONFIG_MAX_BYTES } from "./private-market-config.ts";
import { assertPrivateMetadata, PRIVATE_LINUX_PLAN } from "./private-linux-plan.ts";
import { PRIVATE_DATA_ROOT } from "./private-supervision.ts";

type Metadata = Pick<Stats, "uid" | "mode" | "nlink" | "ino" | "dev" | "size" | "mtimeMs" | "ctimeMs" | "isDirectory" | "isFile" | "isSymbolicLink">;
type Handle = {
  fd: number; stat(): Promise<Metadata>; close(): Promise<void>; sync(): Promise<void>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  writeFile(value: string, encoding: "utf8"): Promise<void>;
};
export type PrivateMarketConfigReceiverIo = Readonly<{
  context(): { platform: string; uid: number | undefined };
  lstat(path: string): Promise<Metadata>;
  open(path: string, flags: number, mode?: number): Promise<Handle>;
}>;
export type PrivateMarketConfigPayloadSupplier = () => Promise<string>;
const receipt = Object.freeze({
  state: "received_only", configurationStored: true, transferApprovalVerified: false,
  quotaAuthorityVerified: false, accountAccessVerified: false, runtimeAttached: false,
} as const);
export type PrivateMarketConfigReceiveReceipt = typeof receipt;
const failure = () => new Error("Private provider configuration receive failed; contents withheld; preserve destination for review");
const sameEntry = (a: Metadata, b: Metadata) => a.ino === b.ino && a.dev === b.dev;
const sameFile = (a: Metadata, b: Metadata) => sameEntry(a, b) && a.uid === b.uid && a.mode === b.mode
  && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const absent = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";

/** Fixed-path, exclusive receiver; not transfer approval, account/quota evidence or
 * activation. Its trusted supplier must bound incoming bytes before returning a
 * string. No directory creation, repair, replacement, deletion or network access.
 * All directory descriptors stay pinned across the payload await. A failure after
 * exclusive creation retains the partial/ambiguous file for explicit review; retry
 * must not adopt it. Checks detect observed races, not a fully malicious same-UID
 * process that can mutate entries between final checks/syscalls or after return. */
export function createPrivateMarketConfigReceiver(io: PrivateMarketConfigReceiverIo) {
  return async function receive(bindingValue: OwnerIdentityBinding, payloadSupplier: PrivateMarketConfigPayloadSupplier): Promise<PrivateMarketConfigReceiveReceipt> {
    const handles: Handle[] = [];
    const pins: { path: string; handle: Handle; info: Metadata; kind: "ancestor" | "directory" }[] = [];
    let failed = false;
    try {
      const binding = inspectOwnerIdentityBinding(bindingValue), { platform, uid } = io.context();
      if (typeof payloadSupplier !== "function" || binding.origin !== PRIVATE_LINUX_PLAN.origin
        || platform !== "linux" || uid === undefined || !Number.isSafeInteger(uid) || uid <= 0) throw failure();
      const metadata = (info: Metadata, kind: "ancestor" | "directory" | "file") => {
        assertPrivateMetadata({ uid: info.uid, mode: info.mode, nlink: info.nlink, directory: info.isDirectory(), file: info.isFile(), symlink: info.isSymbolicLink() }, uid, kind);
        if (kind === "file" && (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > PRIVATE_MARKET_CONFIG_MAX_BYTES
          || !Number.isFinite(info.mtimeMs) || !Number.isFinite(info.ctimeMs))) throw failure();
      };
      const fd = (handle: Handle) => { if (!Number.isSafeInteger(handle.fd) || handle.fd < 0) throw failure(); return `/proc/self/fd/${handle.fd}`; };
      const pin = async (path: string, source: string) => {
        const kind = path === posix.dirname(PRIVATE_DATA_ROOT) || path === PRIVATE_DATA_ROOT ? "directory" : "ancestor";
        const before = await io.lstat(source); metadata(before, kind);
        const handle = await io.open(source, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        handles.push(handle);
        const opened = await handle.stat(); metadata(opened, kind);
        if (!sameEntry(before, opened)) throw failure();
        const item: typeof pins[number] = { path, handle, info: opened, kind }; pins.push(item); fd(handle); return item;
      };
      let parent = await pin("/", "/");
      for (const segment of PRIVATE_DATA_ROOT.split("/").filter(Boolean)) parent = await pin(posix.join(parent.path, segment), `${fd(parent.handle)}/${segment}`);
      const source = `${fd(parent.handle)}/${posix.basename(PRIVATE_MARKET_CONFIG)}`;
      const stable = async () => {
        for (const item of pins) {
          const named = await io.lstat(item.path), held = await item.handle.stat(); metadata(named, item.kind); metadata(held, item.kind);
          if (!sameEntry(item.info, named) || !sameEntry(item.info, held)) throw failure();
        }
      };
      const destinationAbsent = async () => {
        for (const path of [source, PRIVATE_MARKET_CONFIG]) {
          try { await io.lstat(path); throw failure(); }
          catch (error) { if (!absent(error)) throw error; }
        }
      };
      await stable(); await destinationAbsent();
      const supplied = await payloadSupplier();
      if (typeof supplied !== "string" || Buffer.byteLength(supplied, "utf8") > PRIVATE_MARKET_CONFIG_MAX_BYTES
        || new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(supplied, "utf8")) !== supplied) throw failure();
      // Persist only the validated contract, not duplicate keys or arbitrary input
      // spelling. The unchanged parser owns all provider/owner/refresh rules.
      const payload = JSON.stringify(parsePrivateMarketConfig(supplied, binding)), expected = Buffer.from(payload, "utf8");
      if (expected.length < 1 || expected.length > PRIVATE_MARKET_CONFIG_MAX_BYTES) throw failure();
      await stable(); await destinationAbsent();
      const file = await io.open(source, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
      handles.push(file);
      const created = await file.stat(); metadata(created, "file"); if (created.size !== 0) throw failure();
      const fileStable = async (expectedInfo?: Metadata) => {
        const held = await file.stat(); metadata(held, "file");
        if (!sameEntry(created, held) || (expectedInfo && !sameFile(expectedInfo, held))) throw failure();
        for (const path of [source, PRIVATE_MARKET_CONFIG]) {
          const named = await io.lstat(path); metadata(named, "file"); if (!sameFile(held, named)) throw failure();
        }
        return held;
      };
      await stable(); await fileStable(created);
      await file.writeFile(payload, "utf8"); await file.sync();
      const written = await fileStable(); if (written.size !== expected.length) throw failure();
      const bytes = Buffer.alloc(PRIVATE_MARKET_CONFIG_MAX_BYTES + 1); let length = 0;
      while (length < bytes.length) {
        const chunk = await file.read(bytes, length, bytes.length - length, length);
        if (!Number.isSafeInteger(chunk.bytesRead) || chunk.bytesRead < 0 || chunk.bytesRead > bytes.length - length) throw failure();
        if (!chunk.bytesRead) break; length += chunk.bytesRead;
      }
      if (length !== expected.length || !expected.equals(bytes.subarray(0, length))) throw failure();
      await stable(); await fileStable(written);
      await parent.handle.sync();
      await stable(); await fileStable(written);
    } catch { failed = true; }
    finally { for (const handle of handles.reverse()) try { await handle.close(); } catch { failed = true; } }
    if (failed) throw failure();
    return receipt;
  };
}

/** Explicit native implementation; tests may supply synthetic IO, never a path override. */
export const nativePrivateMarketConfigReceiverIo: PrivateMarketConfigReceiverIo = Object.freeze({
  context: () => ({ platform: process.platform, uid: process.getuid?.() }), lstat, open,
});
const receive = createPrivateMarketConfigReceiver(nativePrivateMarketConfigReceiverIo);
export function receivePrivateMarketConfig(binding: OwnerIdentityBinding, payloadSupplier: PrivateMarketConfigPayloadSupplier): Promise<PrivateMarketConfigReceiveReceipt> {
  return receive(binding, payloadSupplier);
}
