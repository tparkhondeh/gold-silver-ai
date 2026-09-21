import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { identityStorageBooleanFields, identityStorageReport } from "../scripts/identity-storage-policy.ts";
import { runIdentityStoragePreflight } from "../scripts/identity-storage.mjs";

const safe = () => ({ ...Object.fromEntries(identityStorageBooleanFields.map(key => [key, true])), credentialPresent: false, probePresent: false, createdDirectories: false });
const metadata = facts => Object.fromEntries(Object.entries(facts).filter(([key]) => !["windowsSupported", "credentialSingleLink", "probeSingleLink"].includes(key)));
function harness(overrides = {}) {
  const calls = [], inspections = [];
  const state = { facts: safe(), fail: null, ...overrides };
  return { calls, inspections, state, dependencies: {
    platform: "win32",
    execute(program, args, options) {
      calls.push({ program, args, options });
      if (state.fail) throw Error(state.fail);
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
      const probe = path.endsWith("\\save-as-probe.txt");
      if (!state.facts[probe ? "probePresent" : "credentialPresent"]) throw Object.assign(Error("not present"), { code: "ENOENT" });
      return { isFile: () => true, isSymbolicLink: () => false, nlink: 1, ...(probe ? state.probeFile : state.file) };
    },
  } };
}

test("complete empty private path is ready only for manual direct Save As, not credential use", () => {
  const result = identityStorageReport(safe());
  assert.equal(result.version, "asha.identity_storage_preflight.v2");
  assert.equal(result.status, "ready_for_direct_save_as");
  assert.equal(result.canPrepare, true);
  assert.equal(result.credentialContentValidated, false);
  assert.equal(result.runtimeConfigured, false);
  assert.equal(result.networkUsed, false);
});

test("every required guard fails closed independently, including protected leaf under unsafe ancestors", () => {
  for (const key of identityStorageBooleanFields.filter(key => !["credentialPresent", "probePresent", "createdDirectories"].includes(key))) {
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

test("check uses only the newly approved fixed private path and metadata, never either prior destination", async () => {
  const h = harness();
  const result = await runIdentityStoragePreflight(["--check"], h.dependencies);
  assert.equal(result.readyForDirectSaveAs, true);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls.map(call => call.program), ["powershell.exe"]);
  assert.equal(h.calls.at(-1).args.at(-1), "Check");
  assert.deepEqual(h.inspections, [String.raw`C:\Users\pc\.goldsilver-private\google-owner-login\credentials.json`, String.raw`C:\Users\pc\.goldsilver-private\google-owner-login\save-as-probe.txt`]);
  assert.ok(h.calls.every(call => call.options.stdio === "pipe" && call.options.windowsHide && call.options.timeout === 15000));
});

test("Windows helper pins the same new parent and contains no old-path or environment fallback", () => {
  // Read code only. Never invoke the checker or inspect any private destination.
  const source = readFileSync(new URL("../scripts/identity-storage-windows.ps1", import.meta.url), "utf8");
  assert.match(source, /^\s*\$identityDirectory = 'C:\\Users\\pc\\\.goldsilver-private'\r?$/m);
  assert.equal([...source.matchAll(/^\s*\$identityDirectory\s*=/gm)].length, 1);
  assert.match(source, /^\s*\$privateDirectory = Join-Path \$identityDirectory 'google-owner-login'\r?$/m);
  assert.equal([...source.matchAll(/^\s*\$privateDirectory\s*=/gm)].length, 1);
  for (const forbidden of [".asha-private", ".cache", "$env:", "GetEnvironmentVariable"]) assert.equal(source.includes(forbidden), false);
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

test("old and new paths cannot be supplied as CLI overrides to check or prepare", async () => {
  const destinations = [
    String.raw`C:\Users\pc\.asha-private\google-owner-login`,
    String.raw`C:\Users\pc\Desktop\project\gold silver\.cache\identity\google-owner-login`,
    String.raw`C:\Users\pc\.goldsilver-private\google-owner-login`,
  ];
  for (const destination of destinations) {
    for (const args of [["--check", destination], ["--prepare", "--path", destination], [`--prepare=${destination}`]]) {
      const h = harness();
      assert.equal((await runIdentityStoragePreflight(args, h.dependencies)).status, "blocked");
      assert.equal(h.calls.length, 0); assert.equal(h.inspections.length, 0);
    }
  }
});

test("prepare rechecks safe missing directories and returns the verified creation result", async () => {
  const h = harness({ facts: { ...safe(), privateDirectoryPresent: false, privateDirectorySafe: false } });
  const result = await runIdentityStoragePreflight(["--prepare"], h.dependencies);
  assert.equal(result.readyForDirectSaveAs, true); assert.equal(result.createdDirectories, true);
  assert.deepEqual(h.calls.filter(call => call.program === "powershell.exe").map(call => call.args.at(-1)), ["Check", "Prepare"]);
  assert.equal(h.inspections.length, 4);
});

test("prepare never runs after unsafe ancestry, ACL, Git boundary, unexpected entry or retained credentials", async () => {
  for (const change of [{ ancestorMutationSafe: false }, { privateParentSafe: false }, { privateDirectorySafe: false }, { outsideRepository: false }, { gitBoundarySafe: false }, { directoryContentsExpected: false }, { credentialPresent: true }, { probeMetadataSafe: false }]) {
    const h = harness({ facts: { ...safe(), ...change } });
    await runIdentityStoragePreflight(["--prepare"], h.dependencies);
    assert.equal(h.calls.some(call => call.args.at(-1) === "Prepare"), false);
  }
});

test("repository and Git boundaries are required before even file metadata inspection", async () => {
  for (const key of ["outsideRepository", "gitBoundarySafe"]) {
    const h = harness({ facts: { ...safe(), [key]: false } });
    const result = await runIdentityStoragePreflight(["--prepare"], h.dependencies);
    assert.equal(result.status, "blocked"); assert.equal(result[key], false);
    assert.equal(h.calls.some(call => call.args.at(-1) === "Prepare"), false);
    assert.equal(h.inspections.length, 0);
  }
});

test("known harmless probe may remain without authorizing contents or hiding another file", async () => {
  const h = harness({ facts: { ...safe(), probePresent: true } });
  const result = await runIdentityStoragePreflight(["--check"], h.dependencies);
  assert.equal(result.readyForDirectSaveAs, true); assert.equal(result.probePresent, true);
  assert.equal(result.probeContentValidated, false); assert.equal(result.credentialPresent, false);
  assert.equal(identityStorageReport({ ...h.state.facts, directoryContentsExpected: false }).status, "blocked");
  for (const facts of [{ probeMetadataSafe: false }, { probeSingleLink: false }]) {
    assert.equal(identityStorageReport({ ...h.state.facts, ...facts }).status, "blocked");
  }
  const stored = identityStorageReport({ ...h.state.facts, credentialPresent: true });
  assert.equal(stored.retainedFileMetadataSafe, true); assert.equal(stored.readyForDirectSaveAs, false);
});

test("probe symlinks, hardlinks and nonregular targets are rejected without content reads", async () => {
  for (const probeFile of [{ nlink: 2 }, { isSymbolicLink: () => true }, { isFile: () => false }]) {
    const h = harness({ facts: { ...safe(), probePresent: true }, probeFile });
    const result = await runIdentityStoragePreflight(["--check"], h.dependencies);
    assert.equal(result.status, "blocked"); assert.equal(result.probeSingleLink, false);
  }
});

test("old workspace fact schema cannot certify a new outside-repository destination", () => {
  const old = { ...safe(), gitIgnored: true, gitUntracked: true };
  delete old.outsideRepository; delete old.gitBoundarySafe;
  const result = identityStorageReport(old);
  assert.equal(result.status, "blocked"); assert.equal(result.metadataComplete, false);
  assert.equal("gitIgnored" in result, false); assert.equal("gitUntracked" in result, false);
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

test("actual Windows ACL predicates allow only the volume-root servicing owner, never its grants or private ownership", { skip: process.platform !== "win32", timeout: 20_000 }, () => {
  // Execute the shipped predicate functions against synthetic ACL objects. The
  // only file read is script source; no Get-Acl or private metadata is accessed.
  const source = fileURLToPath(new URL("../scripts/identity-storage-windows.ps1", import.meta.url)).replaceAll("'", "''");
  const command = `
$ErrorActionPreference='Stop'
$currentSid='S-1-5-21-1-2-3-1001'
$systemSid='S-1-5-18'
$adminSid='S-1-5-32-544'
$installerSid='S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
$fixtureAcl=[pscustomobject]@{OwnerSid=$currentSid;Rules=@();AreAccessRulesProtected=$true}
$fixtureAcl|Add-Member ScriptMethod GetOwner {param($type) [pscustomobject]@{Value=$this.OwnerSid}}
$fixtureAcl|Add-Member ScriptMethod GetAccessRules {param($explicit,$inherited,$type) $this.Rules}
function Get-Acl {param($LiteralPath) return $fixtureAcl}
function New-FixtureRule($sid) {
 [pscustomobject]@{IdentityReference=[pscustomobject]@{Value=$sid};AccessControlType='Allow';FileSystemRights=[Security.AccessControl.FileSystemRights]::FullControl;PropagationFlags=[Security.AccessControl.PropagationFlags]::None;InheritanceFlags=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit';IsInherited=$false}
}
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile('${source}',[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Invalid source'}
$functions=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Get-Rules','Test-PrivateAcl','Test-AncestorMutation')},$true))
if($functions.Count -ne 3){throw 'Missing predicates'}
foreach($function in $functions){Invoke-Expression $function.Extent.Text}
$checks=New-Object 'System.Collections.Generic.List[bool]'
$fixtureAcl.OwnerSid=$installerSid
$checks.Add((Test-AncestorMutation 'C:\\'))
$checks.Add((-not (Test-AncestorMutation 'C:\\Users\\pc')))
$checks.Add((-not (Test-AncestorMutation 'C:\\Users\\pc\\.goldsilver-private')))
$fixtureAcl.OwnerSid='S-1-5-21-1-2-3-1002'
$checks.Add((-not (Test-AncestorMutation 'C:\\')))
$fixtureAcl.OwnerSid=$installerSid
$fixtureAcl.Rules=@((New-FixtureRule 'S-1-5-21-1-2-3-1002'))
$checks.Add((-not (Test-AncestorMutation 'C:\\')))
$fixtureAcl.OwnerSid=$currentSid
$fixtureAcl.Rules=@((New-FixtureRule $installerSid))
$checks.Add((-not (Test-AncestorMutation 'C:\\Users\\pc')))
$fixtureAcl.Rules=@((New-FixtureRule $currentSid),(New-FixtureRule $systemSid))
$checks.Add((Test-PrivateAcl 'C:\\synthetic-private' $true))
$readOnlyRule=New-FixtureRule 'S-1-5-21-1-2-3-1002'
$readOnlyRule.FileSystemRights=[Security.AccessControl.FileSystemRights]'ReadAndExecute,Synchronize'
$fixtureAcl.Rules+=@($readOnlyRule)
$checks.Add((-not (Test-PrivateAcl 'C:\\synthetic-private' $true)))
$fixtureAcl.Rules=@((New-FixtureRule $currentSid),(New-FixtureRule $systemSid))
$fixtureAcl.OwnerSid=$installerSid
$checks.Add((-not (Test-PrivateAcl 'C:\\synthetic-private' $true)))
$fixtureAcl.OwnerSid=$currentSid
$fixtureAcl.Rules=@((New-FixtureRule $currentSid),(New-FixtureRule $installerSid))
$checks.Add((-not (Test-PrivateAcl 'C:\\synthetic-private' $true)))
$fixtureAcl.Rules=@((New-FixtureRule $currentSid),(New-FixtureRule $systemSid))
$fixtureAcl.AreAccessRulesProtected=$false
$checks.Add((-not (Test-PrivateAcl 'C:\\synthetic-private' $true)))
$checks.ToArray()|ConvertTo-Json -Compress
`;
  const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, stdio: "pipe", timeout: 15_000, maxBuffer: 16_384 });
  assert.deepEqual(JSON.parse(result.toString("utf8")), Array(11).fill(true));
});
