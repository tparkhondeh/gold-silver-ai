param([ValidateSet('Check','Prepare','Deliver')][string]$Mode = 'Check')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$handoffMode = $Mode
$result = [ordered]@{ version=1; state='blocked'; networkUsed=$false; secretWithheld=$true; pathSafe=$false; directoryPresent=$false; attemptPresent=$false; grantPresent=$false; grantMetadataSafe=$false; createdDirectory=$false; expiresAt=$null }
$destination = $null; $markerHandle = $null; $frame = $null
try {
    # Load reviewed definitions only: no Google directory/file metadata access.
    . (Join-Path $PSScriptRoot 'identity-storage-windows.ps1') -DefinitionsOnly
    $Mode = $handoffMode
    $privateDirectory = 'C:\Users\pc\.goldsilver-private\passkey-owner-login'
    $grantFile = Join-Path $privateDirectory 'bootstrap-grant.txt'
    $attemptFile = Join-Path $privateDirectory 'delivery-attempt.json'
    Add-Type -Path (Join-Path $PSScriptRoot 'passkey-handoff-native.cs')

    function Test-HandoffParentAcl([string]$Path) {
        # This parent contains names, never the secret. Additional read/list-only
        # ACEs are safe here because CreateDirectoryW attaches D:P to the new
        # leaf atomically: these inheritable ACEs cannot enter that leaf. The
        # original EXACT two-entry leaf/file and Google policies are unchanged.
        $acl = Get-Acl -LiteralPath $Path
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $currentSid -or -not $acl.AreAccessRulesProtected) { return $false }
        $seen = @{}
        $readOnly = [int][Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [int][Security.AccessControl.FileSystemRights]::Synchronize
        foreach ($rule in @(Get-Rules $acl)) {
            if ($rule.AccessControlType -ne 'Allow' -or $rule.IsInherited -or
                $rule.PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None -or
                $rule.InheritanceFlags -ne [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit') { return $false }
            $sid = $rule.IdentityReference.Value
            if ($sid -in @($currentSid, $systemSid)) {
                if ($seen.ContainsKey($sid) -or $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) { return $false }
                $seen[$sid] = $true
            } elseif (([int]$rule.FileSystemRights -band (-bnot $readOnly)) -ne 0 -or [int]$rule.FileSystemRights -eq 0) { return $false }
        }
        return $seen.ContainsKey($currentSid) -and $seen.ContainsKey($systemSid)
    }
    function Get-HandoffFacts {
        $safe = $true
        # Parent MUST already exist, remain protected, and deny foreign mutation.
        # This unit may create the leaf only; it never repairs or creates parents.
        foreach ($part in @('C:\','C:\Users','C:\Users\pc','C:\Users\pc\.goldsilver-private',$privateDirectory)) {
            $entry = Get-OptionalItem $part
            if ($null -eq $entry) { if ($part -ne $privateDirectory) { $safe=$false }; break }
            if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $safe=$false; break }
            if (-not (Test-AncestorMutation $part) -or $null -ne (Get-OptionalItem (Join-Path $part '.git'))) { $safe=$false; break }
        }
        if (-not $safe) { return $false }
        if (-not (Test-HandoffParentAcl $identityDirectory)) { return $false }
        $repositoryPrefix=$repository.TrimEnd('\','/')+'\'
        if ($privateDirectory.StartsWith($repositoryPrefix,[StringComparison]::OrdinalIgnoreCase) -or $privateDirectory.Equals($repository,[StringComparison]::OrdinalIgnoreCase)) { return $false }
        $result.directoryPresent=$null -ne (Get-OptionalItem $privateDirectory)
        if (-not $result.directoryPresent) { return $true }
        if (-not (Test-PrivateAcl $privateDirectory $true)) { return $false }
        foreach ($entry in @(Get-ChildItem -LiteralPath $privateDirectory -Force)) {
            if ($entry.Name -cnotin @('bootstrap-grant.txt','delivery-attempt.json')) { return $false }
        }
        $result.attemptPresent=$null -ne (Get-OptionalItem $attemptFile)
        $result.grantPresent=$null -ne (Get-OptionalItem $grantFile)
        if ($result.attemptPresent) { [PasskeyHandoffNative]::Inspect($attemptFile,$currentSid,-1) }
        if ($result.grantPresent) { [PasskeyHandoffNative]::Inspect($grantFile,$currentSid,43); $result.grantMetadataSafe=$true }
        return $true
    }
    $result.pathSafe=Get-HandoffFacts
    if (-not $result.pathSafe -or $result.attemptPresent -or $result.grantPresent) { throw 'Blocked' }
    if ($Mode -eq 'Prepare' -and -not $result.directoryPresent) {
        if (-not (Get-HandoffFacts)) { throw 'Blocked' }
        New-PrivateDirectory $privateDirectory
        $result.createdDirectory=$true
        $result.pathSafe=Get-HandoffFacts
    }
    if ($result.pathSafe -and $result.directoryPresent) { $result.state='ready' }
    if ($Mode -eq 'Deliver') {
        if ($result.state -ne 'ready' -or -not (Get-HandoffFacts)) { throw 'Blocked' }
        # Compile/read nonsecret shipped code BEFORE claiming the one-use attempt.
        $source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'passkey-handoff-remote.mjs')) + "`nawait deliverPasskeyGrantToPrivatePipe();`n"
        $markerHandle=[PasskeyHandoffNative]::CreatePrivate($attemptFile,$currentSid)
        $result.attemptPresent=$true
        $markerBytes=[Text.Encoding]::UTF8.GetBytes('{"version":1,"attempted":true}')
        $markerHandle.Write($markerBytes,0,$markerBytes.Length); $markerHandle.Flush($true)
        [PasskeyHandoffNative]::Verify($markerHandle.SafeFileHandle,$attemptFile,$currentSid,$markerBytes.Length)
        $destination=[PasskeyHandoffNative]::CreatePrivate($grantFile,$currentSid)
        $result.grantPresent=$true
        $result.networkUsed=$true
        $frame=[PasskeyHandoffNative]::Transfer($source)
        if ($frame.Length -ne 68 -or $frame[43] -ne 10) { throw 'Blocked' }
        for ($i=0; $i -lt 43; $i++) {
            $byte=$frame[$i]
            if (-not (($byte -ge 65 -and $byte -le 90) -or ($byte -ge 97 -and $byte -le 122) -or ($byte -ge 48 -and $byte -le 57) -or $byte -eq 45 -or $byte -eq 95)) { throw 'Blocked' }
        }
        $expiry=[Text.Encoding]::ASCII.GetString($frame,44,24)
        $date=[DateTimeOffset]::ParseExact($expiry,'yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal)
        if ($date -le [DateTimeOffset]::UtcNow.AddSeconds(30) -or $date -gt [DateTimeOffset]::UtcNow.AddMinutes(5)) { throw 'Blocked' }
        [PasskeyHandoffNative]::Verify($destination.SafeFileHandle,$grantFile,$currentSid,0)
        $destination.Write($frame,0,43); $destination.Flush($true)
        [PasskeyHandoffNative]::Verify($destination.SafeFileHandle,$grantFile,$currentSid,43)
        $result.grantMetadataSafe=$true; $result.expiresAt=$expiry; $result.state='delivered'
    }
} catch { $result.state='blocked' }
finally {
    if ($null -ne $frame) { [Array]::Clear($frame,0,$frame.Length) }
    try { if ($null -ne $destination) { $destination.Dispose() }; if ($null -ne $markerHandle) { $markerHandle.Dispose() } } catch { $result.state='blocked' }
}
# Strict metadata only. Never forward SSH stdout/stderr/PowerShell exceptions.
[pscustomobject]$result | ConvertTo-Json -Compress
