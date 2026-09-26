import { constants, type Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { posix } from "node:path";
import { inspectOwnerIdentityBinding, identityBindingHash, type OwnerIdentityBinding } from "../auth/postgres-owner-identity-store.ts";
import { resolveNavasanRefreshPolicy } from "../data/navasan-refresh-policy.ts";
import { assertPrivateMetadata } from "./private-linux-plan.ts";
import { PRIVATE_DATA_ROOT } from "./private-supervision.ts";

export const PRIVATE_MARKET_CONFIG = `${PRIVATE_DATA_ROOT}/market-provider.json`;
export const PRIVATE_MARKET_CONFIG_VERSION = "asha.private_market_config.v1";
const MAX_BYTES = 16_384;
const ORIGIN = "https://goldsilver.wealthos.ir";
const failure = () => new Error("Private provider configuration unavailable or unsafe; contents withheld");
/** Secret-bearing server value. Never serialize this object into a status, log or HTTP response. */
export type PrivateMarketConfig = Readonly<{
  version: typeof PRIVATE_MARKET_CONFIG_VERSION; provider: "navasan"; plan: "free";
  origin: typeof ORIGIN; ownerBindingHash: string; valueUnit: "IRR" | "TOMAN";
  refreshSeconds: number; keyRotationConfirmed: true; apiKey: string;
}>;
type NotActivated = { quotaAuthorityVerified: false; keyTransferVerified: false; runtimeAttached: false };
export type PrivateMarketConfiguration = Readonly<NotActivated & (
  { state: "disabled" } | { state: "configured_only"; configuration: PrivateMarketConfig }
)>;

/** Provider configuration is NOT transfer permission or quota-cutover evidence.
 * No enabled switch, inferred account ID or future handoff placeholder is accepted. */
export function parsePrivateMarketConfig(raw: string, ownerBinding: OwnerIdentityBinding): PrivateMarketConfig {
  try {
    const binding = inspectOwnerIdentityBinding(ownerBinding);
    if (binding.origin !== ORIGIN || typeof raw !== "string" || Buffer.byteLength(raw) > MAX_BYTES) throw failure();
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== "apiKey,keyRotationConfirmed,origin,ownerBindingHash,plan,provider,refreshSeconds,valueUnit,version"
      || value.version !== PRIVATE_MARKET_CONFIG_VERSION || value.provider !== "navasan" || value.plan !== "free"
      || value.origin !== ORIGIN || value.ownerBindingHash !== identityBindingHash(binding)
      || (value.valueUnit !== "IRR" && value.valueUnit !== "TOMAN") || value.keyRotationConfirmed !== true
      || !Number.isSafeInteger(value.refreshSeconds) || value.refreshSeconds <= 0
      || typeof value.apiKey !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(value.apiKey)) throw failure();
    const policy = resolveNavasanRefreshPolicy({ NAVASAN_PLAN: value.plan, NAVASAN_REFRESH_SECONDS: String(value.refreshSeconds) });
    if (!policy.configurationValid || policy.adjustedForSafety || policy.effectiveRefreshSeconds !== value.refreshSeconds) throw failure();
    return Object.freeze({ ...value });
  } catch { throw failure(); }
}

type Metadata = Pick<Stats, "uid" | "mode" | "nlink" | "ino" | "dev" | "size" | "mtimeMs" | "ctimeMs" | "isDirectory" | "isFile" | "isSymbolicLink">;
type Handle = { fd: number; stat(): Promise<Metadata>; read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>; close(): Promise<void> };
export type PrivateMarketConfigIo = {
  context(): { platform: string; uid: number | undefined };
  lstat(path: string): Promise<Metadata>;
  open(path: string, flags: number): Promise<Handle>;
};
const sameEntry = (a: Metadata, b: Metadata) => a.ino === b.ino && a.dev === b.dev;
const sameFile = (a: Metadata, b: Metadata) => sameEntry(a, b) && a.uid === b.uid && a.mode === b.mode
  && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const unverified = Object.freeze({ quotaAuthorityVerified: false, keyTransferVerified: false, runtimeAttached: false } as const);

/** Explicit synthetic IO seam; no path override and no write/repair/creation API.
 * Every ancestor is descriptor-pinned. Only a missing fixed leaf is disabled;
 * unsafe/missing ancestors, malformed content or changed metadata fail closed. */
export function createPrivateMarketConfigReader(io: PrivateMarketConfigIo) {
  return async function read(ownerBinding: OwnerIdentityBinding): Promise<PrivateMarketConfiguration> {
    const pins: { path: string; handle: Handle; info: Metadata; kind: "ancestor" | "directory" }[] = [];
    let file: Handle | null = null, failed = false, result: PrivateMarketConfiguration | null = null;
    try {
      const binding = inspectOwnerIdentityBinding(ownerBinding), { platform, uid } = io.context();
      if (binding.origin !== ORIGIN || platform !== "linux" || uid === undefined || !Number.isSafeInteger(uid) || uid <= 0) throw failure();
      const metadata = (info: Metadata, kind: "ancestor" | "directory" | "file") => {
        assertPrivateMetadata({ uid: info.uid, mode: info.mode, nlink: info.nlink, directory: info.isDirectory(), file: info.isFile(), symlink: info.isSymbolicLink() }, uid, kind);
        if (kind === "file" && (!Number.isSafeInteger(info.size) || info.size < 1 || info.size > MAX_BYTES || !Number.isFinite(info.mtimeMs) || !Number.isFinite(info.ctimeMs))) throw failure();
      };
      const anchored = (handle: Handle) => { if (!Number.isSafeInteger(handle.fd) || handle.fd < 0) throw failure(); return `/proc/self/fd/${handle.fd}`; };
      const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
      const pin = async (path: string, source: string) => {
        const kind = path === posix.dirname(PRIVATE_DATA_ROOT) || path === PRIVATE_DATA_ROOT ? "directory" : "ancestor";
        const before = await io.lstat(source); metadata(before, kind);
        const handle = await io.open(source, flags | constants.O_DIRECTORY), item: typeof pins[number] = { path, handle, info: before, kind }; pins.push(item);
        const opened = await handle.stat(); metadata(opened, kind); if (!sameEntry(before, opened)) throw failure(); anchored(handle); return item;
      };
      let parent = await pin("/", "/");
      for (const segment of PRIVATE_DATA_ROOT.split("/").filter(Boolean)) parent = await pin(posix.join(parent.path, segment), `${anchored(parent.handle)}/${segment}`);
      const source = `${anchored(parent.handle)}/${posix.basename(PRIVATE_MARKET_CONFIG)}`;
      let before: Metadata | null, openedFile: Metadata | null = null;
      try { before = await io.lstat(source); } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
        before = null;
      }
      if (before === null) result = Object.freeze({ state: "disabled", ...unverified });
      else {
        metadata(before, "file"); file = await io.open(source, flags);
        const opened = await file.stat(); openedFile = opened; metadata(opened, "file"); if (!sameFile(before, opened)) throw failure();
        const bytes = Buffer.alloc(MAX_BYTES + 1); let length = 0;
        while (length < bytes.length) {
          const chunk = await file.read(bytes, length, bytes.length - length, length);
          if (!Number.isSafeInteger(chunk.bytesRead) || chunk.bytesRead < 0 || chunk.bytesRead > bytes.length - length) throw failure();
          if (!chunk.bytesRead) break;
          length += chunk.bytesRead;
        }
        if (length !== opened.size) throw failure();
        const configuration = parsePrivateMarketConfig(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)), binding);
        result = Object.freeze({ state: "configured_only", configuration, ...unverified });
      }
      for (const item of pins) {
        const named = await io.lstat(item.path), held = await item.handle.stat(); metadata(named, item.kind); metadata(held, item.kind);
        if (!sameEntry(item.info, named) || !sameEntry(item.info, held)) throw failure();
      }
      if (file && openedFile) {
        for (const info of [await file.stat(), await io.lstat(source), await io.lstat(PRIVATE_MARKET_CONFIG)]) {
          metadata(info, "file"); if (!sameFile(openedFile, info)) throw failure();
        }
      } else {
        for (const path of [source, PRIVATE_MARKET_CONFIG]) {
          try { await io.lstat(path); throw failure(); }
          catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error; }
        }
      }
    } catch { failed = true; }
    finally {
      if (file) try { await file.close(); } catch { failed = true; }
      for (const item of pins.reverse()) try { await item.handle.close(); } catch { failed = true; }
    }
    if (failed || result === null) throw failure();
    return result;
  };
}

const read = createPrivateMarketConfigReader({ context: () => ({ platform: process.platform, uid: process.getuid?.() }), lstat, open });
export function readPrivateMarketConfig(binding: OwnerIdentityBinding): Promise<PrivateMarketConfiguration> { return read(binding); }
