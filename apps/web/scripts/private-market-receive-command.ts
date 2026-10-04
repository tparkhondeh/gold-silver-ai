import type { Readable } from "node:stream";
import { inspectOwnerIdentityBinding, type OwnerIdentityBinding } from "../auth/postgres-owner-identity-store.ts";
import { PRIVATE_MARKET_CONFIG_MAX_BYTES } from "./private-market-config.ts";
import { assertPrivateProcessEnvironment, type PrivateServerConfig } from "./private-server-config.ts";

const failure = () => new Error("Private provider input unavailable; contents withheld");
const denied = Object.freeze({ exitCode: 1 as const, output: "Private provider delivery failed; contents withheld. Existing or partial files require reviewed recovery.\n" });
const received = Object.freeze({ exitCode: 0 as const, output: '{"state":"received_only","runtimeAttached":false,"quotaAuthorityVerified":false}\n' });

/** Binary stdin only; no encoding fallback, file/argument/env secret or echo.
 * The caller invokes this only after the receiver's destination preflight.
 * Deadline injection is a synthetic test seam; the native command uses 10s.
 * Node-managed strings cannot provide a guaranteed memory-erasure boundary. */
export async function readPrivateMarketInput(input: Readable, deadlineMs = 10_000): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const buffers: Buffer[] = [];
  try {
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10_000) throw failure();
    const collect = async () => {
      let length = 0;
      for await (const chunk of input) {
        if (!Buffer.isBuffer(chunk)) throw failure();
        length += chunk.length;
        if (length > PRIVATE_MARKET_CONFIG_MAX_BYTES) throw failure();
        buffers.push(Buffer.from(chunk));
      }
      if (length === 0) throw failure();
      const joined = Buffer.concat(buffers, length);
      try { return new TextDecoder("utf-8", { fatal: true }).decode(joined); }
      finally { joined.fill(0); }
    };
    return await Promise.race([collect(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { input.destroy(); reject(failure()); }, deadlineMs);
    })]);
  } catch { throw failure(); }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    input.destroy();
    for (const buffer of buffers) buffer.fill(0);
  }
}

type CommandOptions = {
  args: readonly string[];
  execArgs: readonly string[];
  environment: Record<string, string | undefined>;
  platform: string;
  uid: number | undefined;
  input: Readable & { isTTY?: boolean };
  readConfiguration(): Promise<PrivateServerConfig>;
  receive(binding: OwnerIdentityBinding, payload: () => Promise<string>): Promise<{
    state: string; configurationStored: boolean; runtimeAttached: boolean; quotaAuthorityVerified: boolean;
  }>;
};

/** Operator-only command, not an HTTP route or startup step. The explicit flag
 * describes the operator's invocation; it is NOT evidence of owner permission,
 * source fencing, an authenticated SSH transport or quota reconciliation.
 * Call only after separately recorded owner transfer approval. */
export async function runPrivateMarketReceiveCommand(options: CommandOptions) {
  try {
    if (options.platform !== "linux" || !Number.isSafeInteger(options.uid) || options.uid! <= 0
      || options.input.isTTY === true || options.args.length !== 1 || options.args[0] !== "--receive-approved-key") throw failure();
    // Prevent accidental debug/module-injection settings before reading either
    // configuration or stdin. A hostile loader may already have executed before
    // JS: verified launcher + clean environment remain external prerequisites.
    if (options.execArgs.length > 1 || options.execArgs.some(value => value !== "--experimental-strip-types")
      || ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH"].some(name => options.environment[name] !== undefined && options.environment[name] !== "")) throw failure();
    assertPrivateProcessEnvironment(options.environment);
    const config = await options.readConfiguration();
    const binding = inspectOwnerIdentityBinding({ origin: config.origin,
      issuer: config.version === 2 ? config.origin : "https://accounts.google.com",
      ownerSubject: config.ownerSubject, portfolioSubject: config.portfolioSubject });
    const result = await options.receive(binding, () => readPrivateMarketInput(options.input));
    if (result.state !== "received_only" || result.configurationStored !== true
      || result.runtimeAttached !== false || result.quotaAuthorityVerified !== false) throw failure();
    // Never serialize the dependency's object, configuration, binding or error.
    return received;
  } catch { return denied; }
  finally { options.input.destroy(); }
}
