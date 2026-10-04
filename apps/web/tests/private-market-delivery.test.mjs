import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const native = new URL("../scripts/private-market-delivery-native.cs", import.meta.url);
const wrapper = fileURLToPath(new URL("../scripts/private-market-delivery-windows.ps1", import.meta.url));
const privateFileCreator = fileURLToPath(new URL("../scripts/passkey-handoff-native.cs", import.meta.url));

test("Windows sender fixes the source, pinned SSH destination and reviewed receiver without repair or startup", () => {
  const source = readFileSync(native, "utf8");
  assert.match(source, /gold silver\\apps\\web\\\.env\.local/);
  assert.match(source, /59f7e513156671350bc2f89bb6f9d07dd80db6da/);
  for (const setting of ["StrictHostKeyChecking=yes", "UpdateHostKeys=no", "IdentityAgent=none", "ClearAllForwardings=yes", "UseShellExecute=false", "CreateNoWindow=true", "StandardInput.BaseStream.WriteAsync", "EnvironmentVariables.Clear()"]) assert.ok(source.includes(setting));
  assert.match(source, /ValidatePreflight\(Probe\(false\)\)[\s\S]*if\(mode=="Check"\) return Checked;[\s\S]*source=pin\.Read\(\)/);
  assert.match(source, /new SourcePin\(expectedSourceIdentity\)[\s\S]*ValidatePreflight\(Probe\(false\)\)/);
  assert.match(source, /if\(!directory\) RequireExpectedIdentity\(pin.Info,expectedIdentity\)/);
  assert.match(source, /pin.Recheck\(\);\s*ValidateReceipt\(Ssh\(payload,true\)\)/);
  assert.doesNotMatch(source, /File\.(?:Write|Delete|Move)|Process\.Start\(|Console\.|https:\/\/api\.navasan/);
  assert.match(source, /CreateFile\(path,0x80020080u,directory\?3u:1u/); // Match the native fixture: GENERIC_READ enforces sharing, unlike attrs-only directory pins.
  assert.match(source, /GetSecurityInfo\(handle,1,5/);
  assert.match(source, /info\.Links!=1/);
  assert.match(source, /ValidateReceipt\(Ssh\(payload,true\)\)/);
  assert.match(source, /ValidatePostflight\(Probe\(true\)/);
  assert.match(source, /git\('status','--porcelain=v1','--untracked-files=all'\)/);
  assert.doesNotMatch(source, /readPrivateBuildEvidence/);
  const wrapperSource = readFileSync(wrapper, "utf8");
  assert.match(wrapperSource, /verifiedLoaderRequired/);
  assert.doesNotMatch(wrapperSource, /^\s*(?:Add-Type|\$result|.*::Execute\()/m);
});

test("native Windows pure sender parsing rejects ambiguity and validators never expose synthetic secrets", {
  skip: process.platform !== "win32" ? "Windows native compilation; no real source or SSH is invoked" : false,
}, () => {
  const script = `
$ErrorActionPreference='Stop'
Add-Type -Path '${fileURLToPath(native).replaceAll("'", "''")}'
$canary='SYNTHETIC-SENDER-SECRET-CANARY'
$binding='a' * 64
$source="NAVASAN_API_KEY='$canary'\nNAVASAN_PLAN='free'\nNAVASAN_VALUE_UNIT='TOMAN'\nNAVASAN_REFRESH_SECONDS='24000'\nNAVASAN_KEY_ROTATION_CONFIRMED='true'\nUNRELATED_SECRET='MUST_NOT_TRANSFER'\n"
$bytes=[PrivateMarketDeliveryNative]::BuildPayload($source,$binding)
try {
  $payload=[Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
  if ($payload.apiKey -cne $canary -or $payload.ownerBindingHash -cne $binding -or $payload.refreshSeconds -ne 24000 -or @($payload.PSObject.Properties).Count -ne 9) { throw 'synthetic parsing failure' }
  if ([Text.Encoding]::UTF8.GetString($bytes).Contains('MUST_NOT_TRANSFER')) { throw 'unrelated setting escaped' }
} finally { [Array]::Clear($bytes,0,$bytes.Length) }
$rejected=0
foreach ($bad in @(($source + "NAVASAN_API_KEY='duplicate'\n"),$source.Replace("'free'","'gold'"),$source.Replace("'24000'","'1'"),$source.Replace("'true'","'false'"),$source.Replace("'TOMAN'","'USD'"),$source.Replace("'$canary'",'"ambiguous\\n"'),$source.Replace("'$canary'",'bare#comment'),('x' * 65537),'',($source + 'NAVASAN_API_KEY without equals'),($source + 'NAVASAN_UNKNOWN=value'))) {
  try { [void][PrivateMarketDeliveryNative]::BuildPayload($bad,$binding); throw 'accepted invalid source' }
  catch { if ($_.Exception.ToString().Contains($canary) -or $_.Exception.ToString().Contains('MUST_NOT_TRANSFER') -or -not $_.Exception.ToString().Contains('contents withheld')) { throw 'unsafe parser error' }; $rejected++ }
}
$pre="ASHA_MARKET_ABSENT_V1 $binding\n"
if ([PrivateMarketDeliveryNative]::ValidatePreflight($pre) -cne $binding) { throw 'invalid preflight parser' }
$receipt='{"state":"received_only","runtimeAttached":false,"quotaAuthorityVerified":false}' + "\n"
[PrivateMarketDeliveryNative]::ValidateReceipt($receipt)
[PrivateMarketDeliveryNative]::ValidatePostflight("ASHA_MARKET_CONFIGURED_V1 $binding TOMAN 24000\n",$binding,'TOMAN',24000)
$quoted=$source.Replace("'$canary'", "'key" + [char]92 + 'with"quote' + "'")
$quotedBytes=[PrivateMarketDeliveryNative]::BuildPayload($quoted,$binding)
try { if (([Text.Encoding]::UTF8.GetString($quotedBytes) | ConvertFrom-Json).apiKey -cne ('key' + [char]92 + 'with"quote')) { throw 'quoted key corrupted' } }
finally { [Array]::Clear($quotedBytes,0,$quotedBytes.Length) }
foreach ($bad in @($canary,($pre+'extra'),($pre+$pre),$pre.Replace('ABSENT','CONFIGURED'))) {
  try { [void][PrivateMarketDeliveryNative]::ValidatePreflight($bad); throw 'accepted invalid preflight' }
  catch { if (-not $_.Exception.ToString().Contains('contents withheld') -or $_.Exception.ToString().Contains($canary)) { throw 'unsafe preflight error' } }
}
foreach ($bad in @($canary,($receipt+'extra'),($receipt+$receipt),$receipt.Replace('false','true'))) {
  try { [PrivateMarketDeliveryNative]::ValidateReceipt($bad); throw 'accepted invalid receipt' }
  catch { if (-not $_.Exception.ToString().Contains('contents withheld') -or $_.Exception.ToString().Contains($canary)) { throw 'unsafe receipt error' } }
}
foreach ($bad in @($canary,"ASHA_MARKET_CONFIGURED_V1 $binding IRR 24000\n","ASHA_MARKET_CONFIGURED_V1 $binding TOMAN 24000\nextra")) {
  try { [PrivateMarketDeliveryNative]::ValidatePostflight($bad,$binding,'TOMAN',24000); throw 'accepted invalid postflight' }
  catch { if (-not $_.Exception.ToString().Contains('contents withheld') -or $_.Exception.ToString().Contains($canary)) { throw 'unsafe postflight error' } }
}
if ($rejected -ne 11) { throw 'missing cases' }
[Console]::Out.WriteLine('SYNTHETIC_SENDER_TESTS_PASS')
`;
  const output = execFileSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 8192,
  });
  assert.equal(output.trim(), "SYNTHETIC_SENDER_TESTS_PASS");
});

test("Windows synthetic handles enforce owner-only ACL, size, links, no-reparse and write/delete sharing", {
  skip: process.platform !== "win32" ? "Windows native synthetic ACLs; no production source or network" : false,
}, () => {
  const script = `
$ErrorActionPreference='Stop'
Add-Type -Path '${fileURLToPath(native).replaceAll("'", "''")}'
Add-Type -Path '${privateFileCreator.replaceAll("'", "''")}'
$flags=[Reflection.BindingFlags]'NonPublic,Static'
$inspect=[PrivateMarketDeliveryNative].GetMethod('Inspect',$flags)
$identity=[PrivateMarketDeliveryNative].GetMethod('SourceIdentity',$flags)
$requireIdentity=[PrivateMarketDeliveryNative].GetMethod('RequireExpectedIdentity',$flags)
$create=[PrivateMarketDeliveryNative].GetMethod('CreateFile',$flags)
$attributeType=[PrivateMarketDeliveryNative].GetNestedType('Attributes',[Reflection.BindingFlags]::NonPublic)
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$folder=Join-Path ([IO.Path]::GetTempPath()) ('asha-sender-synthetic-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($folder)
$path=Join-Path $folder 'source.fixture'
$link=Join-Path $folder 'hardlink.fixture'
$junction=Join-Path $folder 'junction.fixture'
$original=Join-Path $folder 'original.fixture'
$handle=$null
function Open-Synthetic([string]$target,[bool]$directory=$false) {
  $attributes=[Activator]::CreateInstance($attributeType)
  $attributeType.GetField('Length').SetValue($attributes,[Runtime.InteropServices.Marshal]::SizeOf($attributes))
  $access=[uint32]2147614848; $share=[uint32]1; $openFlags=[uint32]2097280
  if ($directory) { $share=[uint32]3; $openFlags=[uint32]35651584 }
  return $create.Invoke($null,@($target,$access,$share,$attributes,[uint32]3,$openFlags,[IntPtr]::Zero))
}
function New-Synthetic([int]$size) {
  $file=[PasskeyHandoffNative]::CreatePrivate($path,$sid)
  try { $bytes=New-Object byte[] $size; $file.Write($bytes,0,$bytes.Length); $file.Flush() } finally { $file.Dispose() }
}
function Assert-Blocked([scriptblock]$action) {
  $rejected=$false
  try { & $action } catch { if (-not $_.Exception.ToString().Contains('contents withheld')) { throw 'unexpected synthetic guard failure' }; $rejected=$true }
  if (-not $rejected) { throw 'unsafe synthetic metadata accepted' }
}
function Inspect-Synthetic($held,[string]$target,[bool]$directory=$false) {
  [void]$inspect.Invoke($null,@($held,[string]$target,[string]$sid,$directory))
}
try {
  New-Synthetic 4
  $handle=Open-Synthetic $path
  Inspect-Synthetic $handle $path
  $originalInfo=$inspect.Invoke($null,@($handle,[string]$path,[string]$sid,$false))
  $expectedIdentity=$identity.Invoke($null,@($originalInfo))
  [void]$requireIdentity.Invoke($null,@($originalInfo,[string]$expectedIdentity))
  $writeBlocked=$false; $deleteBlocked=$false
  try { $writer=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite); $writer.Dispose() } catch [IO.IOException] { $writeBlocked=$true }
  try { [IO.File]::Delete($path) } catch [IO.IOException] { $deleteBlocked=$true }
  if (-not $writeBlocked -or -not $deleteBlocked) { throw 'held source sharing not enforced' }
  Assert-Blocked { Inspect-Synthetic $handle ($path+'.different') }
  $handle.Dispose(); $handle=$null
  $writer=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite)
  try {
    $contended=Open-Synthetic $path
    try { if (-not $contended.IsInvalid) { throw 'source pinned despite existing writer' } }
    finally { $contended.Dispose() }
  } finally { $writer.Dispose() }
  [IO.File]::Move($path,$original)
  New-Synthetic 4
  $handle=Open-Synthetic $path
  $replacementInfo=$inspect.Invoke($null,@($handle,[string]$path,[string]$sid,$false))
  Assert-Blocked { [void]$requireIdentity.Invoke($null,@($replacementInfo,[string]$expectedIdentity)) }
  $handle.Dispose(); $handle=$null; [IO.File]::Delete($path)
  [IO.File]::Move($original,$path)
  $directoryAcl=New-Object Security.AccessControl.DirectorySecurity
  $directoryAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier $sid))
  $directoryAcl.SetAccessRuleProtection($true,$false)
  foreach ($principal in @($sid,'S-1-5-18')) {
    $permission=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier $principal),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow)
    $directoryAcl.AddAccessRule($permission)
  }
  $foreign=New-Object Security.Principal.SecurityIdentifier 'S-1-1-0'
  $modify=New-Object Security.AccessControl.FileSystemAccessRule($foreign,[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.AccessControlType]::Allow)
  $directoryAcl.AddAccessRule($modify); [IO.Directory]::SetAccessControl($folder,$directoryAcl)
  $parentHandle=Open-Synthetic $folder $true
  try {
    Inspect-Synthetic $parentHandle $folder $true
    $renameBlocked=$false
    try { [IO.Directory]::Move($folder,($folder+'.moved')) } catch [IO.IOException] { $renameBlocked=$true }
    if (-not $renameBlocked) { [IO.Directory]::Move(($folder+'.moved'),$folder) }
    if (-not $renameBlocked) { throw 'held ancestor could be moved' }
    foreach ($dangerous in @([Security.AccessControl.FileSystemRights]::ChangePermissions,[Security.AccessControl.FileSystemRights]::TakeOwnership,[Security.AccessControl.FileSystemRights]::FullControl)) {
      $danger=New-Object Security.AccessControl.FileSystemAccessRule($foreign,$dangerous,[Security.AccessControl.AccessControlType]::Allow)
      $directoryAcl.AddAccessRule($danger); [IO.Directory]::SetAccessControl($folder,$directoryAcl)
      Assert-Blocked { Inspect-Synthetic $parentHandle $folder $true }
      $directoryAcl.RemoveAccessRuleAll($danger); $directoryAcl.AddAccessRule($modify); [IO.Directory]::SetAccessControl($folder,$directoryAcl)
    }
  } finally { $parentHandle.Dispose() }
  [void](New-Item -ItemType HardLink -Path $link -Target $path)
  $handle=Open-Synthetic $path
  Assert-Blocked { Inspect-Synthetic $handle $path }
  $handle.Dispose(); $handle=$null
  [IO.File]::Delete($link)
  $acl=[IO.File]::GetAccessControl($path)
  $everyone=New-Object Security.Principal.SecurityIdentifier 'S-1-1-0'
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($everyone,[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule); [IO.File]::SetAccessControl($path,$acl)
  $handle=Open-Synthetic $path
  Assert-Blocked { Inspect-Synthetic $handle $path }
  $handle.Dispose(); $handle=$null
  [IO.File]::Delete($path)
  foreach ($size in @(0,65537)) {
    New-Synthetic $size; $handle=Open-Synthetic $path
    Assert-Blocked { Inspect-Synthetic $handle $path }
    $handle.Dispose(); $handle=$null; [IO.File]::Delete($path)
  }
  [void](New-Item -ItemType Junction -Path $junction -Target $folder)
  $handle=Open-Synthetic $junction $true
  Assert-Blocked { Inspect-Synthetic $handle $junction $true }
  $handle.Dispose(); $handle=$null
  [Console]::Out.WriteLine('SYNTHETIC_HANDLE_TESTS_PASS')
} finally {
  if ($handle) { $handle.Dispose() }
  # Only exact test-created children; never recursively follow the junction.
  if ([IO.Directory]::Exists($junction)) { [IO.Directory]::Delete($junction) }
  if ([IO.File]::Exists($link)) { [IO.File]::Delete($link) }
  if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
  if ([IO.File]::Exists($original)) { [IO.File]::Delete($original) }
  [IO.Directory]::Delete($folder)
}
`;
  const output = execFileSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 8192,
  });
  assert.equal(output.trim(), "SYNTHETIC_HANDLE_TESTS_PASS");
});

test("Windows SSH uses only fixed OS paths and can report its version without network or credentials", {
  skip: process.platform !== "win32" ? "Windows OpenSSH local version probe only" : false,
}, () => {
  const script = `
$ErrorActionPreference='Stop'
Add-Type -Path '${fileURLToPath(native).replaceAll("'", "''")}'
$factory=[PrivateMarketDeliveryNative].GetMethod('SshStartInfo',[Reflection.BindingFlags]'NonPublic,Static')
$start=$factory.Invoke($null,@($false))
$expected=@{SystemRoot='C:\\Windows';PATH='C:\\Windows\\System32';USERPROFILE='C:\\Users\\pc';ProgramData='C:\\ProgramData'}
if ($start.EnvironmentVariables.Count -ne $expected.Count) { throw 'inherited environment' }
foreach ($name in $expected.Keys) { if ($start.EnvironmentVariables[$name] -cne $expected[$name]) { throw 'unexpected OS environment path' } }
if ($start.FileName -cne 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' -or $start.UseShellExecute -or -not $start.CreateNoWindow) { throw 'unexpected SSH launch' }
# Replace the complete reviewed connection arguments before creating a process.
# -V exits before any host, identity, configuration or network operation.
$start.Arguments='-V'
$child=New-Object Diagnostics.Process; $child.StartInfo=$start
try {
  [void]$child.Start(); $child.StandardInput.Close()
  if (-not $child.WaitForExit(5000)) { $child.Kill(); throw 'local version timeout' }
  $out=$child.StandardOutput.ReadToEnd(); $err=$child.StandardError.ReadToEnd()
  if ($child.ExitCode -ne 0 -or $out.Length -ne 0 -or $err.Length -gt 512 -or $err -notmatch '^OpenSSH_for_Windows_[^\\r\\n]+\\r?\\n$') { throw 'local version invalid' }
  [Console]::Out.WriteLine('SYNTHETIC_SSH_VERSION_PASS')
} finally { $child.Dispose() }
`;
  const output = execFileSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 8192,
  });
  assert.equal(output.trim(), "SYNTHETIC_SSH_VERSION_PASS");
});
