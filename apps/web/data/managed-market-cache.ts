import { constants } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { validateMarketSnapshot, type MarketSnapshot } from "../app/market-test-contract.ts";
import type { TransactionRunner } from "./postgres-observation-repository.ts";

export const MANAGED_CACHE_VERSION = "asha.managed_market_cache.v1";
export const MANAGED_CACHE_FILE = "latest.json";
const MAX_BYTES = 65_536;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function encodeManagedCache(snapshot: MarketSnapshot, now: number) {
  validateMarketSnapshot(snapshot, now);
  const raw = canonical({ version: MANAGED_CACHE_VERSION, snapshot });
  if (Buffer.byteLength(raw) > MAX_BYTES) throw Error("Invalid latest cache size");
  return raw;
}
export function decodeManagedCache(raw: string, now: number): MarketSnapshot {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw Error("Invalid latest cache size");
  const value = JSON.parse(raw);
  if (!value || Object.keys(value).sort().join("|") !== "snapshot|version" || value.version !== MANAGED_CACHE_VERSION || canonical(value) !== raw) throw Error("Invalid latest cache document");
  validateMarketSnapshot(value.snapshot, now);
  return value.snapshot;
}
export type ManagedMarketCache = {
  read(now: number): Promise<MarketSnapshot | null>;
  replace(snapshot: MarketSnapshot, now: number): Promise<MarketSnapshot>;
};

// The launcher creates this owner-only directory outside PostgreSQL data/backups.
// Only the committed latest.json, a lock and one recovery staging file can exist;
// this is a disposable latest cache, never an append-only quote/history archive.
export class FileManagedMarketCache implements ManagedMarketCache {
  private readonly directory: string;
  private readonly runner: TransactionRunner;
  constructor(directory: string, runner: TransactionRunner) {
    if (!isAbsolute(directory)) throw Error("Absolute cache directory required");
    this.directory = resolve(directory);
    this.runner = runner;
  }
  private async checkDirectory() {
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || resolve(await realpath(this.directory)) !== this.directory
      || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw Error("Unsafe cache directory");
  }
  private async readFile(name: string, now: number): Promise<{ raw: string; snapshot: MarketSnapshot } | null> {
    const path = join(this.directory, name);
    let info;
    try { info = await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_BYTES
      || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw Error("Unsafe cache file");
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size > MAX_BYTES) throw Error("Cache changed while opening");
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const chunk = await handle.read(buffer, bytes, buffer.length - bytes, null);
        if (chunk.bytesRead === 0) break;
        bytes += chunk.bytesRead;
      }
      if (bytes > MAX_BYTES) throw Error("Invalid latest cache size");
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes));
      return { raw, snapshot: decodeManagedCache(raw, now) };
    } finally { await handle.close(); }
  }
  async read(now: number) {
    await this.checkDirectory();
    return (await this.readFile(MANAGED_CACHE_FILE, now))?.snapshot ?? null;
  }
  async replace(snapshot: MarketSnapshot, now: number) {
    // Freeze validated input before waiting; later caller mutation cannot leak in.
    const raw = encodeManagedCache(snapshot, now);
    const candidate = decodeManagedCache(raw, now);
    return this.runner.transaction(async executor => {
      // Distinct from quota lock (174228531,10); no upstream call under this lock.
      await executor.query("SELECT pg_advisory_xact_lock(174228531, 11)");
      await this.checkDirectory();
      // Retain filesystem exclusion even if the DB connection dies and releases
      // its advisory lock before this write finishes. Never guess that another
      // process's lock is stale: crash residue requires reviewed local recovery.
      const lockPath = join(this.directory, "latest.lock");
      const lock = await open(lockPath, "wx", 0o600);
      try {
      const current = await this.readFile(MANAGED_CACHE_FILE, now);
      if (current && Date.parse(current.snapshot.receivedAt) >= Date.parse(candidate.receivedAt)) {
        if (current.snapshot.receivedAt === candidate.receivedAt && current.raw !== raw) throw Error("Conflicting latest receipt");
        return current.snapshot;
      }
      for (const prior of current?.snapshot.observations ?? []) {
        const next = candidate.observations.find(item => item.providerSymbol === prior.providerSymbol);
        if (!next || Date.parse(next.publishedAt) < Date.parse(prior.publishedAt)) throw Error("Latest source coverage or time regressed");
        const oldQuote = { ...prior, receivedAt: "" };
        const newQuote = { ...next, receivedAt: "" };
        if (next.publishedAt === prior.publishedAt && canonical(oldQuote) !== canonical(newQuote)) throw Error("Conflicting source publication");
      }
      const pendingPath = join(this.directory, "latest.pending");
      // Only a validated, recognized interrupted staging write is disposable.
      if (await this.readFile("latest.pending", now)) await unlink(pendingPath);
      let created = false;
      try {
        const handle = await open(pendingPath, "wx", 0o600);
        created = true;
        try { await handle.writeFile(raw, "utf8"); await handle.sync(); } finally { await handle.close(); }
        await rename(pendingPath, join(this.directory, MANAGED_CACHE_FILE));
        created = false;
        return candidate;
      } finally {
        if (created) await unlink(pendingPath).catch(() => {});
      }
      } finally {
        await lock.close();
        await unlink(lockPath);
      }
    });
  }
}
