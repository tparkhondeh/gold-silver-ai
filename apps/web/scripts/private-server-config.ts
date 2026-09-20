import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname } from "node:path";

export const PRIVATE_SERVER_CONFIG = "/home/wealthos_dev/.asha-private/goldsilver/runtime.json";
export interface PrivateServerConfig { version: 1; origin: string; ownerSubject: string; portfolioSubject: string; googleClientId: string; googleClientSecret: string; databaseUrl: string }
export function assertPrivateProcessEnvironment(environment: Record<string, string | undefined>) {
  // This runtime takes private configuration only from the reviewed file. Its
  // internal framework listener must not activate legacy local/provider APIs.
  const forbidden = /^(?:DATABASE_URL$|NAVASAN_|GOLDAPI_|ASHA_(?:LOCAL_|OPERATOR_|MARKET_|MANAGED_|HISTORY_)|GOOGLE_(?:CLIENT|SECRET)|OIDC_)/;
  if (Object.entries(environment).some(([key, value]) => forbidden.test(key) && value !== undefined && value !== "" && value !== "false")) throw new Error("Incompatible private runtime environment; values withheld");
}
export function parsePrivateServerConfig(raw: string): PrivateServerConfig {
  try {
    if (Buffer.byteLength(raw) > 16_384) throw Error();
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "databaseUrl,googleClientId,googleClientSecret,origin,ownerSubject,portfolioSubject,version"
      || value.version !== 1 || value.origin !== "https://goldsilver.wealthos.ir"
      || typeof value.ownerSubject !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(value.ownerSubject)
      || typeof value.portfolioSubject !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value.portfolioSubject) || value.portfolioSubject === "local-owner-v1"
      || typeof value.googleClientId !== "string" || !/^[A-Za-z0-9_-]{1,400}\.apps\.googleusercontent\.com$/.test(value.googleClientId)
      || typeof value.googleClientSecret !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(value.googleClientSecret) || typeof value.databaseUrl !== "string") throw Error();
    const db = new URL(value.databaseUrl);
    if (!["postgres:", "postgresql:"].includes(db.protocol) || db.hostname !== "127.0.0.1" || !db.port || !db.username || !db.password
      || db.pathname !== "/asha_private" || db.search || db.hash || decodeURIComponent(db.username) !== "asha_private_runtime") throw Error();
    return Object.freeze({ ...value });
  } catch { throw new Error("Private configuration invalid; contents withheld"); }
}

/** Linux deployment only. Fixed destination, never env/Downloads fallback or auto-creation. */
export async function readPrivateServerConfig(): Promise<PrivateServerConfig> {
  try {
    const uid = process.getuid?.();
    if (process.platform !== "linux" || uid === undefined || uid === 0) throw Error();
    for (let path = dirname(PRIVATE_SERVER_CONFIG);; path = dirname(path)) {
      const entry = await lstat(path);
      if (!entry.isDirectory() || entry.isSymbolicLink() || ![0, uid].includes(entry.uid) || (entry.mode & 0o022) !== 0) throw Error();
      if (path.includes("/.asha-private") && (entry.uid !== uid || (entry.mode & 0o077) !== 0)) throw Error();
      if (path === "/") break;
    }
    const file = await open(PRIVATE_SERVER_CONFIG, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== uid || (stat.mode & 0o077) !== 0 || stat.size < 1 || stat.size > 16_384) throw Error();
      // Bounded read even if the trusted owner changes the file during startup.
      const buffer = Buffer.alloc(16_385);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== stat.size || bytesRead > 16_384) throw Error();
      return parsePrivateServerConfig(buffer.subarray(0, bytesRead).toString("utf8"));
    } finally { await file.close(); }
  } catch { throw new Error("Private configuration unavailable or unsafe; contents withheld"); }
}
