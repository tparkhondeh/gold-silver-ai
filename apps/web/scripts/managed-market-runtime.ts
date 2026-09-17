import { execFileSync } from "node:child_process";
import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

// Called by the Windows-only local launcher, never by a request or hosted code.
export async function prepareManagedMarketDirectory(directory: string, execute: typeof execFileSync = execFileSync) {
  if (!isAbsolute(directory)) throw Error("Absolute local cache directory required");
  const parent = dirname(directory);
  if (!(await lstat(parent)).isDirectory() || resolve(await realpath(parent)) !== resolve(parent)) throw Error("Unsafe cache parent");
  try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || resolve(await realpath(directory)) !== resolve(directory)) throw Error("Unsafe cache directory");
  const targets = [directory];
  for (const name of await readdir(directory)) {
    if (!["latest.json", "latest.pending", "latest.lock"].includes(name)) throw Error("Unexpected cache entry; review required");
    const path = join(directory, name), entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || resolve(await realpath(path)) !== resolve(path)) throw Error("Unsafe cache entry");
    targets.push(path);
  }
  const identity = execute("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true, stdio: "pipe" }).toString();
  const sid = identity.match(/S-1-5-[0-9-]+/)?.[0];
  if (!sid) throw Error("Cannot identify local cache owner");
  for (const target of targets) {
    // /grant:r alone would leave unexpected explicit grants for other SIDs.
    // Reset only prevalidated exact targets, never traverse a directory tree.
    execute("icacls.exe", [target, "/reset"], { windowsHide: true, stdio: "pipe" });
    execute("icacls.exe", [target, "/inheritance:r", "/grant:r", `*${sid}:${target === directory ? "(OI)(CI)" : ""}F`], { windowsHide: true, stdio: "pipe" });
  }
  return resolve(directory);
}
