import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readPrivateMarketInput, runPrivateMarketReceiveCommand } from "../scripts/private-market-receive-command.ts";

const canary = "SYNTHETIC-SECRET-CANARY";
const configuration = { version: 2, authentication: "passkey", origin: "https://goldsilver.wealthos.ir",
  ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-portfolio",
  databaseUrl: "postgresql://asha_private_runtime:synthetic-only@127.0.0.1:15432/asha_private" };
const success = { state: "received_only", configurationStored: true, runtimeAttached: false, quotaAuthorityVerified: false };
function options(changes = {}) {
  let read = 0, receive = 0, consumed = 0;
  const input = Readable.from((async function* () { consumed++; yield Buffer.from(canary); })());
  return { input, counts: () => ({ read, receive, consumed }), value: {
    args: ["--receive-approved-key"], execArgs: [], environment: {}, platform: "linux", uid: 1056, input,
    async readConfiguration() { read++; return configuration; },
    async receive(binding, payload) { receive++; assert.equal(binding.ownerSubject, "synthetic-owner"); assert.equal(await payload(), canary); return success; },
    ...changes,
  } };
}
const assertDenied = result => { assert.equal(result.exitCode, 1); assert.doesNotMatch(result.output, /SYNTHETIC|postgresql|apiKey/); };

test("private provider stdin preserves exact UTF8 bytes, including split multibyte sequences", async () => {
  const bytes = Buffer.from(`{"test":"آزمون-${canary}"}`);
  const input = Readable.from([...bytes].map(byte => Buffer.from([byte])));
  assert.equal(await readPrivateMarketInput(input), bytes.toString("utf8"));
  assert.equal(input.destroyed, true);
});

test("stdin rejects empty, oversized, text-mode, invalid UTF8 and source error without contents", async () => {
  const error = { message: "Private provider input unavailable; contents withheld" };
  for (const chunks of [[], [Buffer.alloc(16385)], [canary], [Buffer.from([0xff])]]) {
    const input = Readable.from(chunks); await assert.rejects(readPrivateMarketInput(input), error); assert.equal(input.destroyed, true);
  }
  const source = new Readable({ read() { this.destroy(Error(canary)); } });
  await assert.rejects(readPrivateMarketInput(source), error);
  assert.equal(source.destroyed, true);
  assert.equal((await readPrivateMarketInput(Readable.from([Buffer.alloc(16384, 65)]))).length, 16384);
});

test("stdin deadline ends a stalled stream and never passes a partial secret", async () => {
  const input = new Readable({ read() {} }); input.push(Buffer.from(canary));
  await assert.rejects(readPrivateMarketInput(input, 15), /contents withheld/);
  assert.equal(input.destroyed, true);
  for (const deadline of [0, NaN, 10001]) await assert.rejects(readPrivateMarketInput(Readable.from([]), deadline), /contents withheld/);
});

test("wrong context, TTY, secret-bearing environment and unsupported arguments reject before configuration or input", async () => {
  for (const change of [{ platform: "win32" }, { uid: 0 }, { uid: undefined }, { uid: NaN }, { args: [] },
    { args: ["--receive-approved-key", canary] }, { args: [canary] }, { environment: { NAVASAN_API_KEY: canary } },
    { environment: { ASHA_MANAGED_MARKET_ENABLED: "true" } },
    ...["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH"].map(name => ({ environment: { [name]: canary } })),
    ...[["--inspect"], ["--import", "synthetic-module"], ["--experimental-strip-types", "--inspect"], ["--experimental-strip-types", "--experimental-strip-types"]].map(execArgs => ({ execArgs }))]) {
    const f = options(change); assertDenied(await runPrivateMarketReceiveCommand(f.value));
    assert.deepEqual(f.counts(), { read: 0, receive: 0, consumed: 0 }); assert.equal(f.input.destroyed, true);
  }
  const f = options(); f.input.isTTY = true; assertDenied(await runPrivateMarketReceiveCommand(f.value));
  assert.deepEqual(f.counts(), { read: 0, receive: 0, consumed: 0 });
});

test("destination rejection and invalid binding do not request or echo stdin", async () => {
  for (const change of [{ receive: async () => { throw Error(canary); } },
    { readConfiguration: async () => { throw Error(canary); } },
    { readConfiguration: async () => ({ ...configuration, origin: "http://goldsilver.wealthos.ir" }) }]) {
    const f = options(change); assertDenied(await runPrivateMarketReceiveCommand(f.value));
    assert.equal(f.counts().consumed, 0); assert.equal(f.input.destroyed, true);
  }
});

test("only a metadata-only receipt is printed, never receiver/config/binding contents", async () => {
  const f = options(), result = await runPrivateMarketReceiveCommand(f.value);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.output), { state: "received_only", runtimeAttached: false, quotaAuthorityVerified: false });
  assert.deepEqual(f.counts(), { read: 1, receive: 1, consumed: 1 }); assert.equal(f.input.destroyed, true);
  const extra = options({ receive: async () => ({ ...success, apiKey: canary }) });
  assert.deepEqual(await runPrivateMarketReceiveCommand(extra.value), result);
  const stripping = options({ execArgs: ["--experimental-strip-types"] });
  assert.deepEqual(await runPrivateMarketReceiveCommand(stripping.value), result);
  for (const change of [{ state: "activated" }, { configurationStored: false }, { runtimeAttached: true }, { quotaAuthorityVerified: true }]) {
    const denied = options({ receive: async () => ({ ...success, ...change, apiKey: canary }) });
    assertDenied(await runPrivateMarketReceiveCommand(denied.value));
  }
});

test("receiver entry remains operator-only, outside startup/HTTP and never receives a path or secret argument", () => {
  const entry = readFileSync(new URL("../scripts/receive-private-market-config.mjs", import.meta.url), "utf8");
  assert.match(entry, /input: process.stdin/); assert.match(entry, /readConfiguration: readPrivateServerConfig, receive: receivePrivateMarketConfig/);
  const startup = readFileSync(new URL("../scripts/start-private-server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(startup, /receivePrivateMarketConfig|receive-private-market-config|private-market-receive-command/);
});
