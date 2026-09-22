// Fed as fixed source to the pinned SSH peer, never installed as a web endpoint.
// This function's ONLY secret output is the private SSH pipe consumed by the
// exclusive Windows destination handle. Never invoke it from an interactive tool.
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

export const HANDOFF_RELEASE = "51e0791b94416f8c85c0e6d01ab4c1ee2013ffed";
const root = "/home/wealthos_dev/.asha-private/goldsilver";
export async function issueAndReadPasskeyGrant(dependencies = {}) {
  const inspect = dependencies.inspect ?? lstat, openFile = dependencies.open ?? open;
  const execute = dependencies.execute ?? execFileSync;
  const now = dependencies.now ?? Date.now;
  if ((dependencies.platform ?? process.platform) !== "linux" || (dependencies.uid ?? process.getuid?.()) !== 1056) throw Error("Handoff unavailable");
  const protectedFile = stat => stat.isFile() && !stat.isSymbolicLink() && stat.uid === 1056 && stat.nlink === 1 && (stat.mode & 0o7777) === 0o600 && stat.size === 43;
  const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
  for (const path of ["/", "/home", "/home/wealthos_dev", "/home/wealthos_dev/.asha-private", root]) {
    const stat = await inspect(path);
    const privatePath = path.startsWith("/home/wealthos_dev/.");
    if (!stat.isDirectory() || stat.isSymbolicLink() || ![0, 1056].includes(stat.uid) || (stat.mode & 0o022)
      || (privatePath && (stat.uid !== 1056 || (stat.mode & 0o7777) !== 0o700))) throw Error("Handoff unavailable");
  }
  // Exactly one existing, owner-approved administration invocation. It retains
  // the original private server artifact; its output contains metadata only.
  const output = execute("/usr/local/bin/node", ["--experimental-strip-types", `/home/wealthos_dev/.goldsilver-service/releases/${HANDOFF_RELEASE}/apps/web/scripts/private-passkey-administration.mjs`, "issue-bootstrap"], {
    timeout: 45_000, maxBuffer: 4096, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { HOME: "/home/wealthos_dev", PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
  });
  const metadata = JSON.parse(output);
  if (!metadata || Object.keys(metadata).sort().join(",") !== "expiresAt,file,secret,state" || metadata.state !== "private-handoff-ready" || metadata.secret !== "withheld"
    || typeof metadata.file !== "string" || !metadata.file.startsWith(`${root}/`) || !/^bootstrap-grant-[0-9]{13}\.txt$/.test(metadata.file.slice(root.length + 1))) throw Error("Handoff unavailable");
  const created = Number(metadata.file.match(/([0-9]{13})\.txt$/)[1]);
  const expiry = Date.parse(metadata.expiresAt);
  if (!Number.isFinite(expiry) || new Date(expiry).toISOString() !== metadata.expiresAt || expiry !== created + 300_000 || created > now() || expiry <= now() + 30_000) throw Error("Handoff unavailable");
  const before = await inspect(metadata.file);
  if (!protectedFile(before)) throw Error("Handoff unavailable");
  const file = await openFile(metadata.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const bytes = Buffer.alloc(44);
  try {
    const opened = await file.stat();
    if (!protectedFile(opened) || !same(before, opened)) throw Error("Handoff unavailable");
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(bytes, size, bytes.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(bytes.subarray(0, size).toString("ascii"))
      || bytes.subarray(0, size).some(byte => byte > 127)) throw Error("Handoff unavailable");
    const after = await file.stat(), pathAfter = await inspect(metadata.file);
    if (!protectedFile(after) || !protectedFile(pathAfter) || !same(opened, after) || !same(opened, pathAfter) || expiry <= now() + 30_000) throw Error("Handoff unavailable");
    // Fixed 68-byte framing: 43 ASCII token bytes, LF, canonical UTC expiry.
    return Buffer.concat([bytes.subarray(0, 43), Buffer.from(`\n${metadata.expiresAt}`, "ascii")]);
  } finally { bytes.fill(0); await file.close(); }
}

export async function deliverPasskeyGrantToPrivatePipe(dependencies = {}) {
  let frame;
  const fail = dependencies.fail ?? (() => { process.exitCode = 1; });
  try { frame = await (dependencies.issue ?? issueAndReadPasskeyGrant)(); await new Promise((resolve, reject) => (dependencies.write ?? process.stdout.write.bind(process.stdout))(frame, error => error ? reject(error) : resolve())); }
  catch { fail(); /* No captured output/error can escape. */ }
  finally { frame?.fill(0); }
}
