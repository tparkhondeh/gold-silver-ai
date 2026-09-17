import assert from "node:assert/strict";
import test from "node:test";
import { identityStorageBooleanFields, identityStorageReport } from "../scripts/identity-storage-policy.ts";
import { runIdentityStoragePreflight } from "../scripts/identity-storage.mjs";

const safe = () => ({ ...Object.fromEntries(identityStorageBooleanFields.map(key => [key, true])), credentialPresent: false, createdDirectories: false });
const metadata = facts => Object.fromEntries(Object.entries(facts).filter(([key]) => !["windowsSupported", "gitIgnored", "gitUntracked", "credentialSingleLink"].includes(key)));
function harness(overrides = {}) {
  const calls = [], inspections = [];
  const state = { facts: safe(), tracked: "", fail: null, ...overrides };
  return { calls, inspections, state, dependencies: {
    platform: "win32",
    execute(program, args, options) {
      calls.push({ program, args, options });
      if (state.fail) throw Error(state.fail);
      if (args.includes("check-ignore")) return Buffer.alloc(0);
      if (args.includes("ls-files")) return Buffer.from(state.tracked);
      assert.equal(program, "powershell.exe");
      if (state.rawMetadata) return Buffer.from(state.rawMetadata);
      if (args.at(-1) === "Prepare") {
        state.facts = { ...state.facts, privateDirectoryPresent: true, privateDirectorySafe: true, createdDirectories: true };
      }
      return Buffer.from(JSON.stringify(metadata(state.facts)));
    },
    async inspect(path) {
      inspections.push(path);
      if (state.inspectError) throw state.inspectError;
      if (!state.facts.credentialPresent) throw Object.assign(Error("not present"), { code: "ENOENT" });
      return { isFile: () => true, isSymbolicLink: () => false, nlink: 1, ...state.file };
    },
  } };
}

test("complete empty private path is ready only for manual direct Save As, not credential use", () => {
  const result = identityStorageReport(safe());
  assert.equal(result.status, "ready_for_direct_save_as");
  assert.equal(result.canPrepare, true);
  assert.equal(result.credentialContentValidated, false);
  assert.equal(result.runtimeConfigured, false);
  assert.equal(result.networkUsed, false);
});

test("every required guard fails closed independently, including protected leaf under unsafe ancestors", () => {
  for (const key of identityStorageBooleanFields.filter(key => !["credentialPresent", "createdDirectories"].includes(key))) {
    const result = identityStorageReport({ ...safe(), [key]: false });
    assert.equal(result.readyForDirectSaveAs, false, key);
    assert.equal(result.retainedFileMetadataSafe, false, key);
  }
  assert.equal(identityStorageReport({ ...safe(), ancestorMutationSafe: false }).canPrepare, false);
  assert.equal(identityStorageReport({ ...safe(), privateParentSafe: false }).canPrepare, false);
});

test("missing or mistyped metadata never becomes success; raw extra fields cannot be reflected", () => {
  for (const value of [null, "PRIVATE", {}, { ...safe(), metadataComplete: "true" }]) {
    assert.equal(identityStorageReport(value).status, "blocked");
  }
  const result = identityStorageReport({ ...safe(), secret: "DO_NOT_EMIT", sid: "PRIVATE_ACCOUNT", path: "PRIVATE_PATH" });
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(result).includes("DO_NOT_EMIT"), false);
});

test("an existing safe file reports metadata only and never authorizes another save or prepare", () => {
  const result = identityStorageReport({ ...safe(), credentialPresent: true });
  assert.equal(result.status, "stored_file_metadata_safe");
  assert.equal(result.retainedFileMetadataSafe, true);
  assert.equal(result.readyForDirectSaveAs, false);
  assert.equal(result.canPrepare, false);
  assert.equal(result.credentialContentValidated, false);
});

test("missing directory can be prepared only below safe parents; existing unsafe paths cannot be repaired", () => {
  assert.equal(identityStorageReport({ ...safe(), privateDirectoryPresent: false, privateDirectorySafe: false }).canPrepare, true);
  assert.equal(identityStorageReport({ ...safe(), privateDirectorySafe: false }).canPrepare, false);
});

test("check uses fixed metadata subprocesses and lstat only, with no prepare or caller path", async () => {
  const h = harness();
  const result = await runIdentityStoragePreflight(["--check"], h.dependencies);
  assert.equal(result.readyForDirectSaveAs, true);
  assert.equal(h.calls.length, 5);
  assert.deepEqual(h.calls.map(call => call.program), ["git.exe", "git.exe", "git.exe", "git.exe", "powershell.exe"]);
  assert.deepEqual(h.calls.slice(0, 3).map(call => call.args.at(-1)), [".cache/identity/", ".cache/identity/google-owner-login/", ".cache/identity/google-owner-login/credentials.json"]);
  assert.equal(h.calls.at(-1).args.at(-1), "Check");
  assert.match(h.inspections[0], /[\\/]\.cache[\\/]identity[\\/]google-owner-login[\\/]credentials\.json$/);
  assert.ok(h.calls.every(call => call.options.stdio === "pipe" && call.options.windowsHide && call.options.timeout === 15000));
});

test("invalid options, arbitrary paths and unsupported platforms do not invoke any I/O", async () => {
  for (const args of [[], ["--check", "--path", "PRIVATE"], ["--prepare=PRIVATE"], ["--import"], ["--check", "--check"]]) {
    const h = harness(); assert.equal((await runIdentityStoragePreflight(args, h.dependencies)).status, "blocked");
    assert.equal(h.calls.length, 0); assert.equal(h.inspections.length, 0);
  }
  const h = harness();
  assert.equal((await runIdentityStoragePreflight(["--prepare"], { ...h.dependencies, platform: "linux" })).status, "blocked");
  assert.equal(h.calls.length, 0);
});

test("prepare rechecks safe missing directories and returns the verified creation result", async () => {
  const h = harness({ facts: { ...safe(), privateDirectoryPresent: false, privateDirectorySafe: false } });
  const result = await runIdentityStoragePreflight(["--prepare"], h.dependencies);
  assert.equal(result.readyForDirectSaveAs, true); assert.equal(result.createdDirectories, true);
  assert.deepEqual(h.calls.filter(call => call.program === "powershell.exe").map(call => call.args.at(-1)), ["Check", "Prepare"]);
  assert.equal(h.inspections.length, 2);
});

test("prepare never runs after unsafe ancestry, ACL, tracked file, unexpected entry or retained credentials", async () => {
  for (const change of [{ ancestorMutationSafe: false }, { privateParentSafe: false }, { privateDirectorySafe: false }, { directoryContentsExpected: false }, { credentialPresent: true }]) {
    const h = harness({ facts: { ...safe(), ...change } });
    await runIdentityStoragePreflight(["--prepare"], h.dependencies);
    assert.equal(h.calls.some(call => call.args.at(-1) === "Prepare"), false);
  }
  const h = harness({ tracked: ".cache/identity/PRIVATE\0" });
  const result = await runIdentityStoragePreflight(["--prepare"], h.dependencies);
  assert.equal(result.status, "blocked"); assert.equal(result.gitUntracked, false);
  assert.equal(h.calls.some(call => call.args.at(-1) === "Prepare"), false);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
});

test("every directory and credential path must be ignored before filesystem work", async () => {
  for (const target of [".cache/identity/", ".cache/identity/google-owner-login/", ".cache/identity/google-owner-login/credentials.json"]) {
    const h = harness(), execute = h.dependencies.execute;
    h.dependencies.execute = (program, args, options) => {
      if (args.includes("check-ignore") && args.at(-1) === target) throw Error("PRIVATE raw Git error");
      return execute(program, args, options);
    };
    const result = await runIdentityStoragePreflight(["--prepare"], h.dependencies);
    assert.equal(result.status, "blocked"); assert.equal(result.gitIgnored, false);
    assert.equal(h.calls.some(call => call.program === "powershell.exe"), false);
    assert.equal(h.inspections.length, 0);
  }
});

test("reparse chain blocks even metadata inspection of the credential descendant", async () => {
  const h = harness({ facts: { ...safe(), pathChainSafe: false } });
  const result = await runIdentityStoragePreflight(["--prepare"], h.dependencies);
  assert.equal(result.status, "blocked"); assert.equal(h.inspections.length, 0);
});

test("hard links, symlinks and nonregular credential targets are not safe", async () => {
  for (const file of [{ nlink: 2 }, { isSymbolicLink: () => true }, { isFile: () => false }]) {
    const h = harness({ facts: { ...safe(), credentialPresent: true }, file });
    const result = await runIdentityStoragePreflight(["--check"], h.dependencies);
    assert.equal(result.status, "blocked"); assert.equal(result.credentialSingleLink, false);
  }
});

test("metadata appearance/disappearance and access errors fail without leaking raw exceptions", async () => {
  const states = [
    { facts: { ...safe(), credentialPresent: true }, inspectError: Object.assign(Error("PRIVATE"), { code: "ENOENT" }) },
    { inspectError: Object.assign(Error("PRIVATE"), { code: "EACCES" }) },
    { fail: "PRIVATE_ACCOUNT SECRET_PATH" },
    { rawMetadata: JSON.stringify({ ...metadata(safe()), secret: "PRIVATE" }) },
    { rawMetadata: "PRIVATE malformed output" },
  ];
  for (const state of states) {
    const h = harness(state); const result = await runIdentityStoragePreflight(["--prepare"], h.dependencies);
    assert.equal(result.status, "blocked"); assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
    assert.equal(h.calls.some(call => call.args.at(-1) === "Prepare"), false);
  }
  const h = harness(); h.dependencies.inspect = async () => ({ isFile: () => true, isSymbolicLink: () => false, nlink: 1 });
  assert.equal((await runIdentityStoragePreflight(["--check"], h.dependencies)).status, "blocked");
});

test("portable output has only fixed status/version strings and booleans", async () => {
  const h = harness(); const result = await runIdentityStoragePreflight(["--check"], h.dependencies);
  for (const [key, value] of Object.entries(result)) {
    if (!["version", "status"].includes(key)) assert.equal(typeof value, "boolean", key);
  }
});
