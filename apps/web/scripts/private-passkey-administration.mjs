// Explicit administrator-only operation, NEVER imported by a served route.
// Actual enrollment/reset requires separately recorded owner authorization.
// No .env, token arguments, clipboard, URL, stdout token or automatic enrollment.
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Pool } from "pg";
import { createPgTransactionRunner } from "../db/postgres-runtime.ts";
import { issuePasskeyBootstrap, resetOwnerPasskeys } from "../auth/postgres-passkey-store.ts";
import { readPrivateServerConfig, readPrivateAdministrationConfig, PRIVATE_SERVER_CONFIG, assertPrivateProcessEnvironment } from "./private-server-config.ts";

let pool;
try {
  const args = process.argv.slice(2);
  const issue = args.length === 1 && args[0] === "issue-bootstrap";
  const reset = args.length === 2 && args[0] === "reset-owner" && args[1] === "--confirmed-owner-recovery";
  if (!issue && !reset) throw Error();
  assertPrivateProcessEnvironment(process.env);
  const config = await readPrivateServerConfig(), administrator = await readPrivateAdministrationConfig();
  if (config.version !== 2) throw Error();
  const runtimeUrl = new URL(config.databaseUrl), adminUrl = new URL(administrator.databaseUrl);
  if (runtimeUrl.host !== adminUrl.host || runtimeUrl.pathname !== adminUrl.pathname) throw Error();
  pool = new Pool({ connectionString: administrator.databaseUrl, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000, idle_in_transaction_session_timeout: 5000 });
  pool.on("error", () => { /* Never expose database errors/connection strings. */ });
  const runner = createPgTransactionRunner(pool);
  const binding = { origin: config.origin, issuer: config.origin, ownerSubject: config.ownerSubject, portfolioSubject: config.portfolioSubject };
  if (reset) {
    await resetOwnerPasskeys(runner, binding);
    process.stdout.write("Owner access revoked. Portfolio unchanged. A separate approved enrollment is required.\n");
  } else {
    const now = Date.now(), expiresAt = now + 5 * 60_000;
    const destination = join(dirname(PRIVATE_SERVER_CONFIG), `bootstrap-grant-${now}.txt`);
    // Verified private ancestors + exclusive non-following owner-only creation.
    // Preserve any existing file instead of overwriting it. No fallback directory.
    const file = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.nlink !== 1 || metadata.uid !== process.getuid() || (metadata.mode & 0o077) !== 0) throw Error();
      const token = randomBytes(32).toString("base64url");
      await file.writeFile(token, "utf8"); await file.sync();
      await issuePasskeyBootstrap(runner, binding, { grantHash: createHash("sha256").update(token).digest("base64url"), now, expiresAt });
    } finally { await file.close(); }
    process.stdout.write(JSON.stringify({ state: "private-handoff-ready", file: destination, expiresAt: new Date(expiresAt).toISOString(), secret: "withheld" }) + "\n");
  }
} catch {
  process.stderr.write("Private administration NOT confirmed. No secret details logged. Any private handoff artifact is preserved; do not assume it is usable.\n");
  process.exitCode = 1;
} finally { await pool?.end(); }
