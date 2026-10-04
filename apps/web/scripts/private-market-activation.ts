import { constants, type Stats } from "node:fs";
import { posix } from "node:path";
import { identityBindingHash, inspectOwnerIdentityBinding, type OwnerIdentityBinding } from "../auth/postgres-owner-identity-store.ts";
import { createPrivateManagedMarketAdapter } from "../auth/private-managed-market.ts";
import { probePrivateMarketDatabase } from "../auth/private-market-readiness.ts";
import type { TransactionRunner } from "../data/postgres-observation-repository.ts";
import type { Migration } from "../db/migrations.ts";
import { assertPrivateMetadata } from "./private-linux-plan.ts";
import { PRIVATE_DATA_ROOT } from "./private-supervision.ts";
import { readPrivateMarketConfig } from "./private-market-config.ts";
import { nativePrivateMarketConfigReceiverIo, type PrivateMarketConfigReceiverIo } from "./private-market-config-receiver.ts";
import { createPrivateMarketCache } from "./private-market-cache.ts";
import { inspectPrivateMarketCacheStorage } from "./private-market-cache-storage.ts";
import { parsePrivateMarketCutoverReceipt, verifyPrivateMarketCutoverBaseline, PRIVATE_MARKET_CUTOVER_MAX_BYTES } from "./private-market-cutover.ts";

export const PRIVATE_MARKET_ACTIVATION = `${PRIVATE_DATA_ROOT}/market-activation.json`;
export const PRIVATE_MARKET_ACTIVATION_MAX_BYTES = PRIVATE_MARKET_CUTOVER_MAX_BYTES;
const failure = () => Error("Private market activation unavailable or unsafe; details withheld; preserve evidence for review");
const absent = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
type Metadata = Pick<Stats, "uid" | "mode" | "nlink" | "ino" | "dev" | "size" | "mtimeMs" | "ctimeMs" | "isDirectory" | "isFile" | "isSymbolicLink">;
type Handle = Awaited<ReturnType<PrivateMarketConfigReceiverIo["open"]>>;
const sameEntry = (a: Metadata, b: Metadata) => a.ino === b.ino && a.dev === b.dev;
const sameFile = (a: Metadata, b: Metadata) => sameEntry(a, b) && a.uid === b.uid && a.mode === b.mode && a.nlink === b.nlink
  && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const nowText = (now: number) => {
  if (!Number.isSafeInteger(now)) throw failure();
  return new Date(now).toISOString().replace(/\.(\d{3})Z$/, (_, fraction: string) => `.${fraction}000Z`);
};

/** Fixed receipt only. No mkdir/repair/replacement/deletion. The operator's
 * verified cutover evidence is trusted within the protected OS-owner boundary,
 * not a signature or provider-account authentication. A malicious same UID can
 * still change files after checks. Ambiguous publications are always retained. */
export function createPrivateMarketActivationStorage(io: PrivateMarketConfigReceiverIo) {
  async function operation(supplier?: () => Promise<string>): Promise<string | null> {
    const handles: Handle[] = [], pins: { path: string; handle: Handle; info: Metadata; kind: "ancestor" | "directory" }[] = [];
    let failed = false, result: string | null = null;
    try {
      const { platform, uid } = io.context();
      if (platform !== "linux" || uid === undefined || !Number.isSafeInteger(uid) || uid <= 0) throw failure();
      const metadata = (info: Metadata, kind: "ancestor" | "directory" | "file") => {
        assertPrivateMetadata({ uid: info.uid, mode: info.mode, nlink: info.nlink, directory: info.isDirectory(), file: info.isFile(), symlink: info.isSymbolicLink() }, uid, kind);
        if (kind === "file" && (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > PRIVATE_MARKET_ACTIVATION_MAX_BYTES
          || !Number.isFinite(info.mtimeMs) || !Number.isFinite(info.ctimeMs))) throw failure();
      };
      const fd = (handle: Handle) => { if (!Number.isSafeInteger(handle.fd) || handle.fd < 0) throw failure(); return `/proc/self/fd/${handle.fd}`; };
      const pin = async (path: string, source: string) => {
        const kind = path === posix.dirname(PRIVATE_DATA_ROOT) || path === PRIVATE_DATA_ROOT ? "directory" : "ancestor";
        const before = await io.lstat(source); metadata(before, kind);
        const handle = await io.open(source, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK); handles.push(handle);
        const opened = await handle.stat(); metadata(opened, kind); if (!sameEntry(before, opened)) throw failure();
        const item: typeof pins[number] = { path, handle, info: opened, kind }; pins.push(item); fd(handle); return item;
      };
      let parent = await pin("/", "/");
      for (const segment of PRIVATE_DATA_ROOT.split("/").filter(Boolean)) parent = await pin(posix.join(parent.path, segment), `${fd(parent.handle)}/${segment}`);
      const source = `${fd(parent.handle)}/${posix.basename(PRIVATE_MARKET_ACTIVATION)}`;
      const stable = async () => {
        for (const item of pins) {
          const named = await io.lstat(item.path), held = await item.handle.stat(); metadata(named, item.kind); metadata(held, item.kind);
          if (!sameEntry(item.info, named) || !sameEntry(item.info, held)) throw failure();
        }
      };
      const missing = async () => {
        for (const path of [source, PRIVATE_MARKET_ACTIVATION]) {
          try { await io.lstat(path); throw failure(); } catch (error) { if (!absent(error)) throw error; }
        }
      };
      let before: Metadata | null;
      try { before = await io.lstat(source); } catch (error) { if (!absent(error)) throw error; before = null; }
      if (supplier && before !== null) throw failure();
      if (!supplier && before === null) { await stable(); await missing(); }
      else {
        let expected: Buffer | null = null;
        if (supplier) {
          await stable(); await missing();
          const payload = await supplier();
          if (typeof payload !== "string" || Buffer.byteLength(payload) < 1 || Buffer.byteLength(payload) > PRIVATE_MARKET_ACTIVATION_MAX_BYTES
            || new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(payload)) !== payload) throw failure();
          expected = Buffer.from(payload); await stable(); await missing();
        } else { metadata(before!, "file"); if (before!.size < 1) throw failure(); }
        const file = await io.open(source, supplier ? constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK
          : constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK, supplier ? 0o600 : undefined); handles.push(file);
        const opened = await file.stat(); metadata(opened, "file");
        if (supplier ? opened.size !== 0 : !sameFile(before!, opened)) throw failure();
        const fileStable = async (expectedInfo: Metadata) => {
          for (const info of [await file.stat(), await io.lstat(source), await io.lstat(PRIVATE_MARKET_ACTIVATION)]) {
            metadata(info, "file"); if (!sameFile(expectedInfo, info)) throw failure();
          }
        };
        await stable(); await fileStable(opened);
        if (expected) { await file.writeFile(expected.toString("utf8"), "utf8"); await file.sync(); }
        const written = await file.stat(); metadata(written, "file");
        if (!sameEntry(opened, written) || (expected ? written.size !== expected.length : !sameFile(opened, written))) throw failure();
        const bytes = Buffer.alloc(PRIVATE_MARKET_ACTIVATION_MAX_BYTES + 1); let length = 0;
        while (length < bytes.length) {
          const chunk = await file.read(bytes, length, bytes.length - length, length);
          if (!Number.isSafeInteger(chunk.bytesRead) || chunk.bytesRead < 0 || chunk.bytesRead > bytes.length - length) throw failure();
          if (!chunk.bytesRead) break; length += chunk.bytesRead;
        }
        if (length !== written.size || length < 1 || length > PRIVATE_MARKET_ACTIVATION_MAX_BYTES || (expected && !expected.equals(bytes.subarray(0, length)))) throw failure();
        result = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
        await stable(); await fileStable(written);
        if (supplier) { await parent.handle.sync(); await stable(); await fileStable(written); }
      }
    } catch { failed = true; }
    finally { for (const handle of handles.reverse()) try { await handle.close(); } catch { failed = true; } }
    if (failed) throw failure(); return result;
  }
  return Object.freeze({ read: () => operation(), async publish(supplier: () => Promise<string>) { if (typeof supplier !== "function") throw failure(); await operation(supplier); } });
}

type ActivationInput = { binding: OwnerIdentityBinding; runner: TransactionRunner; migrations: readonly Migration[]; fetcher: typeof fetch; clock?: () => number };
type Dependencies = {
  storage: ReturnType<typeof createPrivateMarketActivationStorage>;
  readConfiguration: typeof readPrivateMarketConfig;
  inspectCache: typeof inspectPrivateMarketCacheStorage;
  createCache: typeof createPrivateMarketCache;
  probeDatabase: typeof probePrivateMarketDatabase;
  verifyBaseline: typeof verifyPrivateMarketCutoverBaseline;
};

/** No provider work at construction/startup. Only the existing session-gated
 * application receives the returned adapter. Receipt absence reads no key,
 * optional cache or market tables; present bad evidence never becomes disabled. */
export function createPrivateMarketActivation(dependencies: Dependencies) {
  async function check(raw: string, input: ActivationInput) {
    const binding = inspectOwnerIdentityBinding(input.binding), now = (input.clock ?? Date.now)();
    const receipt = parsePrivateMarketCutoverReceipt(raw, nowText(now));
    const configured = await dependencies.readConfiguration(binding);
    if (configured.state !== "configured_only") throw failure();
    const configuration = configured.configuration;
    const verified = await input.runner.transaction(async database => {
      if ((await dependencies.probeDatabase(database, input.migrations)).state !== "ready") throw failure();
      return dependencies.verifyBaseline(database, receipt, { bindingHash: identityBindingHash(binding), origin: binding.origin, refreshSeconds: configuration.refreshSeconds });
    });
    // This activation is bound to the transferred cadence. A later cadence
    // change needs separately reviewed evidence, even if it would be slower.
    if (verified.sourceRefreshSeconds !== configuration.refreshSeconds || verified.targetRefreshSeconds !== configuration.refreshSeconds) throw failure();
    const storage = await dependencies.inspectCache();
    if (storage.status !== "safe" || storage.lockPresent !== false || storage.pendingPresent !== false) throw failure();
    const cache = dependencies.createCache(input.runner); await cache.read(now);
    return { binding, cache, configuration };
  }
  return Object.freeze({
    async prepare(input: ActivationInput) {
      try {
        const raw = await dependencies.storage.read();
        if (raw === null) return undefined;
        const { binding, cache, configuration } = await check(raw, input);
        return createPrivateManagedMarketAdapter({ binding, cache, runner: input.runner, fetcher: input.fetcher, clock: input.clock,
          environment: { NAVASAN_API_KEY: configuration.apiKey, NAVASAN_PLAN: configuration.plan, NAVASAN_VALUE_UNIT: configuration.valueUnit,
            NAVASAN_REFRESH_SECONDS: String(configuration.refreshSeconds), NAVASAN_KEY_ROTATION_CONFIRMED: "true" } });
      } catch { throw failure(); }
    },
    async publish(raw: string, input: ActivationInput) {
      try {
        await dependencies.storage.publish(async () => { await check(raw, input); return raw; });
        return Object.freeze({ state: "activation_receipt_stored" as const, runtimeAttached: false as const, accountAccessVerified: false as const });
      } catch { throw failure(); }
    },
  });
}

const activation = createPrivateMarketActivation({ storage: createPrivateMarketActivationStorage(nativePrivateMarketConfigReceiverIo),
  readConfiguration: readPrivateMarketConfig, inspectCache: inspectPrivateMarketCacheStorage, createCache: createPrivateMarketCache,
  probeDatabase: probePrivateMarketDatabase, verifyBaseline: verifyPrivateMarketCutoverBaseline });
export const preparePrivateMarketActivation = activation.prepare;
export const publishPrivateMarketActivation = activation.publish;
