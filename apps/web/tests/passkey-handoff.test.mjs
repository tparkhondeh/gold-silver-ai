import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runPasskeyHandoff } from "../scripts/passkey-handoff.mjs";
import { HANDOFF_RELEASE, issueAndReadPasskeyGrant, deliverPasskeyGrantToPrivatePipe } from "../scripts/passkey-handoff-remote.mjs";

const timestamp = 1_800_000_000_000, expiry = new Date(timestamp + 300_000).toISOString();
const root = "/home/wealthos_dev/.asha-private/goldsilver", destination = `${root}/bootstrap-grant-${timestamp}.txt`;
const synthetic = "A".repeat(43);
function fixture(overrides = {}) {
  const calls = [], state = { content: Buffer.from(synthetic), count: 0, closed: false };
  const metadata = { state: "private-handoff-ready", file: destination, expiresAt: expiry, secret: "withheld" };
  const stat = { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, uid: 1056, nlink: 1, mode: 0o100600, size: 43, dev: 1, ino: 2, mtimeMs: 1, ctimeMs: 1 };
  const dependencies = {
    platform: "linux", uid: 1056, now: () => timestamp + 1000,
    inspect: async path => path === metadata.file ? { ...stat } : { ...stat, uid: 1056, isSymbolicLink: () => false, isFile: () => false, isDirectory: () => true, mode: path.startsWith("/home/wealthos_dev/.") ? 0o40700 : 0o40755 },
    execute: (...args) => { calls.push(args); return JSON.stringify(metadata); },
    open: async (...args) => { calls.push(args); return { stat: async () => ({ ...stat }), read: async (buffer, offset, length, position) => { const slice = state.content.subarray(position, position + Math.min(length, 11)); slice.copy(buffer, offset); return { bytesRead: slice.length }; }, close: async () => { state.closed = true; } }; },
    ...overrides,
  };
  return { dependencies, metadata, stat, calls, state };
}

test("remote actual function issues once with fixed command and bounded private frame", async () => {
  const f = fixture(), bytes = await issueAndReadPasskeyGrant(f.dependencies);
  assert.equal(bytes.length, 68); assert.equal(bytes.toString(), `${synthetic}\n${expiry}`);
  assert.equal(f.calls[0][0], "/usr/local/bin/node");
  assert.deepEqual(f.calls[0][1], ["--experimental-strip-types", `/home/wealthos_dev/.goldsilver-service/releases/${HANDOFF_RELEASE}/apps/web/scripts/private-passkey-administration.mjs`, "issue-bootstrap"]);
  assert.equal(f.calls[0][2].timeout, 45000); assert.equal(f.calls[0][2].maxBuffer, 4096);
  assert.equal(f.calls.filter(call => call[0] === "/usr/local/bin/node").length, 1);
  assert.equal(f.state.closed, true);
});
test("remote platform, ancestor and uid failures cannot issue", async () => {
  for (const bad of [{ platform: "win32" }, { uid: 0 }, { inspect: async () => ({ isDirectory: () => true, isSymbolicLink: () => true }) }]) {
    const f = fixture(bad); await assert.rejects(issueAndReadPasskeyGrant(f.dependencies)); assert.equal(f.calls.length, 0);
  }
});
test("remote invalid metadata/traversal/expiry never opens a source", async () => {
  for (const patch of [{ file: `${root}/../bootstrap-grant-${timestamp}.txt` }, { file: destination.replace(".asha", "Xasha") }, { expiresAt: new Date(timestamp).toISOString() }, { secret: synthetic }, { extra: true }, { expiresAt: new Date(timestamp + 300001).toISOString() }]) {
    const f = fixture(); Object.assign(f.metadata, patch);
    await assert.rejects(issueAndReadPasskeyGrant(f.dependencies)); assert.equal(f.calls.length, 1);
  }
});
test("remote rejects links, broad mode, replaced inode and changing source", async () => {
  for (const patch of [{ nlink: 2 }, { mode: 0o100644 }, { uid: 0 }, { isSymbolicLink: () => true }, { size: 44 }]) {
    const f = fixture(); Object.assign(f.stat, patch); await assert.rejects(issueAndReadPasskeyGrant(f.dependencies)); assert.equal(f.calls.length, 1);
  }
  for (const field of ["ino", "ctimeMs"]) {
    const f = fixture(), original = f.dependencies.open;
    f.dependencies.open = async (...args) => { const file = await original(...args); file.stat = async () => ({ ...f.stat, [field]: 99 }); return file; };
    await assert.rejects(issueAndReadPasskeyGrant(f.dependencies)); assert.equal(f.state.closed, true);
  }
});
test("remote bounded read rejects short, overlong, non-ASCII or malformed token", async () => {
  for (const content of ["A".repeat(42), "A".repeat(44), "A".repeat(42) + "\n", "A".repeat(42) + "é"]) {
    const f = fixture(); f.state.content = Buffer.from(content); await assert.rejects(issueAndReadPasskeyGrant(f.dependencies)); assert.equal(f.state.closed, true);
  }
});
test("private pipe waits for write acknowledgement before zeroing; errors emit nothing", async () => {
  const frame = Buffer.from(`${synthetic}\n${expiry}`); let done, failed = false;
  const pending = deliverPasskeyGrantToPrivatePipe({ issue: async () => frame, write: (bytes, callback) => { assert.equal(bytes.toString(), `${synthetic}\n${expiry}`); done = callback; }, fail: () => { failed = true; } });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(frame[0], 65); done(); await pending;
  assert.equal(frame.every(byte => byte === 0), true); assert.equal(failed, false);
  await deliverPasskeyGrantToPrivatePipe({ issue: async () => { throw Error(synthetic); }, write: () => assert.fail(), fail: () => { failed = true; } });
  assert.equal(failed, true);
});
test("entry accepts only three fixed operations and never echoes captured failures", () => {
  for (const args of [[], ["--deliver"], ["--check", "arbitrary"], ["--prepare=C:\\other"]]) assert.equal(runPasskeyHandoff(args, { platform: "win32", execute: () => assert.fail() }).state, "blocked");
  assert.equal(runPasskeyHandoff(["--check"], { platform: "linux", execute: () => assert.fail() }).state, "blocked");
  const result = runPasskeyHandoff(["--issue-and-deliver-once"], { platform: "win32", execute: () => { throw Error(synthetic); } });
  assert.equal(result.state, "delivery_unconfirmed_do_not_retry"); assert.equal(JSON.stringify(result).includes(synthetic), false);
});

test("native code compiles and exclusive secure handles enforce size, link and DACL rules on synthetic fixture only", { skip: process.platform !== "win32" }, () => {
  const native = fileURLToPath(new URL("../scripts/passkey-handoff-native.cs", import.meta.url));
  const identity = fileURLToPath(new URL("../scripts/identity-storage-windows.ps1", import.meta.url));
  const code = `$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; Add-Type -Path '${native.replaceAll("'", "''")}';
  $testDirectory=Join-Path ([IO.Path]::GetTempPath()) ('asha-handoff-synthetic-'+[Guid]::NewGuid().ToString('N'));
  [void][IO.Directory]::CreateDirectory($testDirectory); $testFile=Join-Path $testDirectory 'synthetic.txt';
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $stream=$null;
  try {
    $stream=[PasskeyHandoffNative]::CreatePrivate($testFile,$sid);
    try { [PasskeyHandoffNative]::CreatePrivate($testFile,$sid); throw 'duplicate accepted' } catch { if($_.Exception.Message -eq 'duplicate accepted'){throw} }
    $bytes=[Text.Encoding]::ASCII.GetBytes('SYNTHETIC-NOT-A-GRANT'); $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true);
    [PasskeyHandoffNative]::Verify($stream.SafeFileHandle,$testFile,$sid,$bytes.Length);
    try { [PasskeyHandoffNative]::Verify($stream.SafeFileHandle,$testFile,$sid,43); throw 'size accepted' } catch { if($_.Exception.Message -eq 'size accepted'){throw} }
    $stream.Dispose();$stream=$null; [PasskeyHandoffNative]::Inspect($testFile,$sid,$bytes.Length);
    New-Item -ItemType HardLink -Path (Join-Path $testDirectory 'synthetic-link.txt') -Value $testFile | Out-Null;
    try { [PasskeyHandoffNative]::Inspect($testFile,$sid,$bytes.Length); throw 'link accepted' } catch { if($_.Exception.Message -eq 'link accepted'){throw} }
    # A real synthetic parent gets an inheritable read-only foreign ACE. The
    # shipped atomic directory creator must prevent it reaching the new leaf.
    $currentSid=$sid;$systemSid='S-1-5-18';$tokens=$null;$errors=$null;
    $ast=[Management.Automation.Language.Parser]::ParseFile('${identity.replaceAll("'", "''")}',[ref]$tokens,[ref]$errors);
    foreach($function in $ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('New-PrivateDirectory','Get-Rules','Test-PrivateAcl')},$true)){Invoke-Expression $function.Extent.Text};
    $acl=Get-Acl -LiteralPath $testDirectory;
    $foreign=New-Object Security.Principal.SecurityIdentifier('S-1-5-21-1-2-3-1002');
    $rule=New-Object Security.AccessControl.FileSystemAccessRule($foreign,[Security.AccessControl.FileSystemRights]'ReadAndExecute,Synchronize',[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);
    $acl.AddAccessRule($rule);Set-Acl -LiteralPath $testDirectory -AclObject $acl;
    $testLeaf=Join-Path $testDirectory 'synthetic-leaf';New-PrivateDirectory $testLeaf;
    if(-not (Test-PrivateAcl $testLeaf $true)){throw 'inherited foreign permission'};
    'synthetic-native-passed'
  } finally {
    if($null -ne $stream){$stream.Dispose()};
    $resolved=[IO.Path]::GetFullPath($testDirectory);$expectedParent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\\');
    if([IO.Path]::GetDirectoryName($resolved) -ne $expectedParent -or [IO.Path]::GetFileName($resolved) -notmatch '^asha-handoff-synthetic-[a-f0-9]{32}$'){throw 'cleanup scope rejected'};
    foreach($name in @('synthetic-link.txt','synthetic.txt')){$fixturePath=Join-Path $resolved $name;if(Test-Path -LiteralPath $fixturePath){Remove-Item -LiteralPath $fixturePath -Force}};
    $leafCleanup=Join-Path $resolved 'synthetic-leaf';if(Test-Path -LiteralPath $leafCleanup){[IO.Directory]::Delete($leafCleanup,$false)};
    [IO.Directory]::Delete($resolved,$false)
  }`;
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", code], { encoding: "utf8", timeout: 30000, windowsHide: true, stdio: "pipe" });
  assert.equal(output.trim(), "synthetic-native-passed");
});

test("fixed SSH options and local controller contain no token arguments, retries, cleanup or alternate destination", () => {
  const native = readFileSync(new URL("../scripts/passkey-handoff-native.cs", import.meta.url), "utf8");
  for (const required of ["StrictHostKeyChecking=yes", "UserKnownHostsFile=C:\\Users\\pc\\.ssh\\known_hosts", "IdentitiesOnly=yes", "IdentityAgent=none", "-F NUL", "-p 2490", "wealthos_dev@62.204.61.18"]) assert.ok(native.includes(required));
  const source = readFileSync(new URL("../scripts/passkey-handoff-windows.ps1", import.meta.url), "utf8");
  assert.ok(source.includes("C:\\Users\\pc\\.goldsilver-private\\passkey-owner-login"));
  assert.ok(source.indexOf("CreatePrivate($attemptFile") < source.indexOf("::Transfer($source)"));
  assert.ok(source.indexOf("CreatePrivate($grantFile") < source.indexOf("::Transfer($source)"));
  assert.doesNotMatch(source, /Remove-Item|Set-Acl|Set-Clipboard|Get-Clipboard|Invoke-WebRequest|\.asha-private|google-owner-login/);
});

test("executed Windows controller prepares only leaf, writes only token, retains failed attempt and refuses repeat", { skip: process.platform !== "win32" }, () => {
  const filename = fileURLToPath(new URL("../scripts/passkey-handoff-windows.ps1", import.meta.url));
  const code = `$ErrorActionPreference='Stop';
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
public class SyntheticHandoffStream {
  public MemoryStream Content=new MemoryStream();
  public SyntheticHandoffStream SafeFileHandle { get { return this; } }
  public void Write(byte[] bytes,int offset,int count) { Content.Write(bytes,offset,count); }
  public void Flush(bool disk) {} public void Dispose() {}
}
public static class PasskeyHandoffNative {
  public static Dictionary<string,SyntheticHandoffStream> Files=new Dictionary<string,SyntheticHandoffStream>();
  public static int Calls=0; public static bool Leaf=true,Safe=true,Reparse=false; public static string Failure="";
  public static void Reset(){Files.Clear();Calls=0;Leaf=true;Safe=true;Reparse=false;Failure="";}
  public static SyntheticHandoffStream CreatePrivate(string path,string sid){if(Files.ContainsKey(path))throw new IOException();var file=new SyntheticHandoffStream();Files.Add(path,file);return file;}
  public static void Inspect(string path,string sid,long size){Verify(Files[path],path,sid,size);}
  public static void Verify(SyntheticHandoffStream file,string path,string sid,long size){if(size>=0 && file.Content.Length!=size)throw new IOException();}
  public static byte[] Transfer(string source){Calls++;if(Failure=="throw")throw new IOException("SYNTHETIC-RAW-FAILURE-MUST-NOT-ESCAPE");if(Failure=="short")return new byte[2];return Encoding.ASCII.GetBytes(new string(Failure=="invalid"?'!':'A',43)+"\\n"+DateTime.UtcNow.AddMinutes(4).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));}
}
'@
  $source=[IO.File]::ReadAllText('${filename.replaceAll("'", "''")}');
  $source=$source -replace "(?m)^param\\([^\\r\\n]+", '$Mode = $TestMode';
  $replacement=@'
    $repository='C:\\synthetic-repository'; $identityDirectory='C:\\Users\\pc\\.goldsilver-private'; $currentSid='synthetic';
    $PSScriptRoot='${fileURLToPath(new URL("../scripts/", import.meta.url)).replaceAll("'", "''")}';
    $Mode='Check'; # Simulate the dot-sourced default parameter: caller must retain its operation.
    function Get-OptionalItem([string]$Path) {
      if($Path.EndsWith('.git')){return $null}
      if([PasskeyHandoffNative]::Files.ContainsKey($Path)){return [pscustomobject]@{PSIsContainer=$false;Attributes=0;Name=[IO.Path]::GetFileName($Path)}}
      if($Path.EndsWith('bootstrap-grant.txt') -or $Path.EndsWith('delivery-attempt.json')){return $null}
      if($Path.EndsWith('passkey-owner-login') -and -not [PasskeyHandoffNative]::Leaf){return $null}
      return [pscustomobject]@{PSIsContainer=$true;Attributes=$(if([PasskeyHandoffNative]::Reparse){1024}else{0})}
    }
    function Test-PrivateAcl([string]$Path,[bool]$Directory){return [PasskeyHandoffNative]::Safe}
    function Test-AncestorMutation([string]$Path){return [PasskeyHandoffNative]::Safe}
    function New-PrivateDirectory([string]$Path){if($Path -cne 'C:\\Users\\pc\\.goldsilver-private\\passkey-owner-login' -or [PasskeyHandoffNative]::Leaf){throw 'wrong-create'};[PasskeyHandoffNative]::Leaf=$true}
    function Get-ChildItem {param($LiteralPath,[switch]$Force);foreach($name in [PasskeyHandoffNative]::Files.Keys){[pscustomobject]@{Name=[IO.Path]::GetFileName($name)}}}
'@
  # Match the literal variable text, not the outer harness's own script directory.
  $source=[regex]::Replace($source,'(?m)^    \\. \\(Join-Path \\$PSScriptRoot ''identity-storage-windows.ps1''\\) -DefinitionsOnly', [System.Text.RegularExpressions.MatchEvaluator]{param($m) $replacement});
  $source=$source -replace '(?m)^    Add-Type -Path[^\\r\\n]+','';
  # Inject the ACL boundary only; its shipped predicate is exercised separately.
  $source=$source.Replace('(Test-HandoffParentAcl $identityDirectory)','(Test-PrivateAcl $identityDirectory $true)');
  $runner=[scriptblock]::Create('param($TestMode)'+[Environment]::NewLine+$source);
  $script:step=0;function Assert-Condition($condition){$script:step++;if(-not $condition){throw ('synthetic-assertion-failed-'+$script:step+':'+($result|ConvertTo-Json -Compress))}}
  [PasskeyHandoffNative]::Reset();[PasskeyHandoffNative]::Leaf=$false;
  $result=(& $runner 'Check')|ConvertFrom-Json;Assert-Condition ($result.pathSafe -and -not $result.directoryPresent -and [PasskeyHandoffNative]::Calls -eq 0);
  $result=(& $runner 'Prepare')|ConvertFrom-Json;Assert-Condition ($result.state -eq 'ready' -and $result.createdDirectory -and [PasskeyHandoffNative]::Files.Count -eq 0);
  $result=(& $runner 'Deliver')|ConvertFrom-Json;Assert-Condition ($result.state -eq 'delivered' -and $result.grantMetadataSafe -and [PasskeyHandoffNative]::Calls -eq 1);
  $grant=[PasskeyHandoffNative]::Files['C:\\Users\\pc\\.goldsilver-private\\passkey-owner-login\\bootstrap-grant.txt'];Assert-Condition ($grant.Content.Length -eq 43 -and [Text.Encoding]::ASCII.GetString($grant.Content.ToArray()) -eq ('A'*43));
  $result=(& $runner 'Deliver')|ConvertFrom-Json;Assert-Condition ($result.state -eq 'blocked' -and [PasskeyHandoffNative]::Calls -eq 1);
  foreach($failure in @('throw','short','invalid')){
    [PasskeyHandoffNative]::Reset();[PasskeyHandoffNative]::Failure=$failure;
    $raw=& $runner 'Deliver';Assert-Condition (-not ($raw -match 'SYNTHETIC-RAW|AAAAAA'));
    $result=$raw|ConvertFrom-Json;Assert-Condition ($result.state -eq 'blocked' -and $result.attemptPresent -and [PasskeyHandoffNative]::Calls -eq 1 -and [PasskeyHandoffNative]::Files.Count -eq 2);
    $result=(& $runner 'Deliver')|ConvertFrom-Json;Assert-Condition ($result.state -eq 'blocked' -and [PasskeyHandoffNative]::Calls -eq 1);
  }
  [PasskeyHandoffNative]::Reset();[PasskeyHandoffNative]::Safe=$false;
  $result=(& $runner 'Prepare')|ConvertFrom-Json;Assert-Condition ($result.state -eq 'blocked' -and [PasskeyHandoffNative]::Files.Count -eq 0 -and [PasskeyHandoffNative]::Calls -eq 0);
  [PasskeyHandoffNative]::Reset();[PasskeyHandoffNative]::Reparse=$true;
  $result=(& $runner 'Prepare')|ConvertFrom-Json;Assert-Condition ($result.state -eq 'blocked' -and [PasskeyHandoffNative]::Files.Count -eq 0 -and [PasskeyHandoffNative]::Calls -eq 0);
  'synthetic-controller-passed'`;
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", code], { encoding: "utf8", timeout: 30000, windowsHide: true, stdio: "pipe" });
  assert.equal(output.trim(), "synthetic-controller-passed");
});

test("executed parent ACL predicate permits metadata visibility only; leaf and Google remain exact", { skip: process.platform !== "win32" }, () => {
  const source = fileURLToPath(new URL("../scripts/passkey-handoff-windows.ps1", import.meta.url));
  const identity = fileURLToPath(new URL("../scripts/identity-storage-windows.ps1", import.meta.url));
  const code = `$ErrorActionPreference='Stop';
    $currentSid='S-1-5-21-1-2-3-1001';$systemSid='S-1-5-18';$adminSid='S-1-5-32-544';$installerSid='S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464';
    $fixtureAcl=[pscustomobject]@{OwnerSid=$currentSid;Rules=@();AreAccessRulesProtected=$true};
    $fixtureAcl|Add-Member ScriptMethod GetOwner {param($type)[pscustomobject]@{Value=$this.OwnerSid}};
    $fixtureAcl|Add-Member ScriptMethod GetAccessRules {param($explicit,$inherited,$type)$this.Rules};
    function Get-Acl {param($LiteralPath)return $fixtureAcl};
    function Rule($sid,$rights){[pscustomobject]@{IdentityReference=[pscustomobject]@{Value=$sid};AccessControlType='Allow';FileSystemRights=[Security.AccessControl.FileSystemRights]$rights;PropagationFlags=[Security.AccessControl.PropagationFlags]::None;InheritanceFlags=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit';IsInherited=$false}};
    function Reset-Fixture {
      $fixtureAcl.OwnerSid=$currentSid;$fixtureAcl.AreAccessRulesProtected=$true;
      $fixtureAcl.Rules=@((Rule $currentSid 'FullControl'),(Rule $systemSid 'FullControl'),(Rule 'S-1-5-21-1-2-3-1002' 'ReadAndExecute,Synchronize'));
    };
    foreach($file in @('${source.replaceAll("'", "''")}','${identity.replaceAll("'", "''")}')){
      $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'source'};
      foreach($function in $ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Get-Rules','Test-HandoffParentAcl','Test-PrivateAcl','Test-AncestorMutation')},$true)){Invoke-Expression $function.Extent.Text};
    };
    $checks=New-Object 'System.Collections.Generic.List[bool]';Reset-Fixture;
    $checks.Add((Test-HandoffParentAcl 'C:\\synthetic-parent'));$checks.Add((Test-AncestorMutation 'C:\\synthetic-parent'));$checks.Add((-not (Test-PrivateAcl 'C:\\synthetic-parent' $true)));
    # Every mutation bit must reject, even when mixed with an otherwise allowed read mask.
    foreach($right in @('WriteData','AppendData','WriteExtendedAttributes','DeleteSubdirectoriesAndFiles','WriteAttributes','Delete','ChangePermissions','TakeOwnership','FullControl','Modify','Write')){
      Reset-Fixture;$fixtureAcl.Rules[2].FileSystemRights=$fixtureAcl.Rules[2].FileSystemRights -bor [Security.AccessControl.FileSystemRights]$right;
      $checks.Add((-not (Test-HandoffParentAcl 'C:\\synthetic-parent')));
    };
    foreach($case in @('owner','protection','missing-system','duplicate-owner','inherited','deny','inherit-only','no-inheritance','owner-readonly')){
      Reset-Fixture;
      switch($case){
        owner {$fixtureAcl.OwnerSid=$adminSid};protection {$fixtureAcl.AreAccessRulesProtected=$false};
        missing-system {$fixtureAcl.Rules=@($fixtureAcl.Rules[0],$fixtureAcl.Rules[2])};
        duplicate-owner {$fixtureAcl.Rules+=@((Rule $currentSid 'FullControl'))};
        inherited {$fixtureAcl.Rules[2].IsInherited=$true};deny {$fixtureAcl.Rules[2].AccessControlType='Deny'};
        inherit-only {$fixtureAcl.Rules[2].PropagationFlags=[Security.AccessControl.PropagationFlags]::InheritOnly};
        no-inheritance {$fixtureAcl.Rules[2].InheritanceFlags=[Security.AccessControl.InheritanceFlags]::None};
        owner-readonly {$fixtureAcl.Rules[0].FileSystemRights=[Security.AccessControl.FileSystemRights]::Read};
      };
      $checks.Add((-not (Test-HandoffParentAcl 'C:\\synthetic-parent')));
    };
    Reset-Fixture;$fixtureAcl.Rules=@($fixtureAcl.Rules[0],$fixtureAcl.Rules[1]);$checks.Add((Test-HandoffParentAcl 'C:\\synthetic-parent'));$checks.Add((Test-PrivateAcl 'C:\\synthetic-leaf' $true));
    $checks.ToArray()|ConvertTo-Json -Compress`;
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", code], { encoding: "utf8", timeout: 30000, windowsHide: true, stdio: "pipe" });
  assert.deepEqual(JSON.parse(output), Array(25).fill(true));
});
