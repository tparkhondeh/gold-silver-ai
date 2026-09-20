param([ValidateSet('Check', 'Prepare')][string]$Mode = 'Check')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# This helper has no path/secret parameters. Only the exact owner-approved path
# is permitted. All exceptions are suppressed into a fixed metadata failure.
try {
    # A Node child can inherit PowerShell 7's module path while launching Windows
    # PowerShell. Load only this executable's bundled security module explicitly.
    Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
    $repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
    $profileDirectory = 'C:\Users\pc'
    $identityDirectory = 'C:\Users\pc\.asha-private'
    $privateDirectory = Join-Path $identityDirectory 'google-owner-login'
    $credentialFile = Join-Path $privateDirectory 'credentials.json'
    $probeFile = Join-Path $privateDirectory 'save-as-probe.txt'
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $systemSid = 'S-1-5-18'
    $adminSid = 'S-1-5-32-544'
    $installerSid = 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'

    function Get-OptionalItem([string]$Path) {
        try { return Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
        catch { if ($_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::ObjectNotFound) { return $null }; throw }
    }
    function Get-Rules($Acl) {
        return @($Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    }
    function Test-PrivateAcl([string]$Path, [bool]$Directory) {
        $acl = Get-Acl -LiteralPath $Path
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $currentSid) { return $false }
        if ($Directory -and -not $acl.AreAccessRulesProtected) { return $false }
        $rules = @(Get-Rules $acl)
        if ($rules.Count -ne 2) { return $false }
        $seen = @{}
        foreach ($rule in $rules) {
            $sid = $rule.IdentityReference.Value
            if ($sid -notin @($currentSid, $systemSid) -or $seen.ContainsKey($sid)) { return $false }
            if ($rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) { return $false }
            if ($rule.PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None) { return $false }
            $inheritance = if ($Directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
            if ($rule.InheritanceFlags -ne $inheritance -or ($Directory -and $rule.IsInherited)) { return $false }
            $seen[$sid] = $true
        }
        return $true
    }
    function Test-AncestorMutation([string]$Path) {
        # Administrators/SYSTEM can already take ownership; do not claim defense
        # against elevated administrators. Sandbox and other foreign principals
        # receive no exception. Inherit-only ACEs do not apply to this object.
        $acl = Get-Acl -LiteralPath $Path
        $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        # Windows may assign its volume root to the protected servicing identity.
        # This exception is OWNER ONLY on the volume root, never a grant exception
        # and never accepted as owner of a profile/private directory or file.
        $servicingRoot = $owner -eq $installerSid -and $Path.Equals([IO.Path]::GetPathRoot($Path), [StringComparison]::OrdinalIgnoreCase)
        if ($owner -notin @($currentSid, $systemSid, $adminSid) -and -not $servicingRoot) { return $false }
        $dangerous = [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
        foreach ($rule in @(Get-Rules $acl)) {
            if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($currentSid, $systemSid, $adminSid) -and
                -not ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and ($rule.FileSystemRights -band $dangerous)) { return $false }
        }
        return $true
    }
    function Get-Facts {
        $facts = [ordered]@{
            metadataComplete = $true; pathChainSafe = $true; ancestorMutationSafe = $true
            outsideRepository = $true; gitBoundarySafe = $true
            privateParentSafe = $true; privateDirectoryPresent = $false; privateDirectorySafe = $false
            directoryContentsExpected = $true; credentialPresent = $false; credentialMetadataSafe = $true
            probePresent = $false; probeMetadataSafe = $true
            createdDirectories = $false
        }
        $repositoryPrefix = $repository.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        $facts.outsideRepository = -not ($privateDirectory.Equals($repository, [StringComparison]::OrdinalIgnoreCase) -or $privateDirectory.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase))
        $parts = New-Object 'System.Collections.Generic.List[string]'
        $part = $privateDirectory
        while ($part) {
            $parts.Insert(0, $part)
            $parent = [IO.Directory]::GetParent($part)
            $part = if ($null -eq $parent) { $null } else { $parent.FullName }
        }
        foreach ($part in $parts) {
            $entry = Get-OptionalItem $part
            if ($null -ne $entry) {
                if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $facts.pathChainSafe = $false; break }
                if ($part -ne $privateDirectory -and -not (Test-AncestorMutation $part)) { $facts.ancestorMutationSafe = $false }
                # Check only marker metadata, never Git configuration or contents.
                # No GIT_* environment variable can hide a filesystem marker.
                if ($null -ne (Get-OptionalItem (Join-Path $part '.git'))) { $facts.gitBoundarySafe = $false }
            } elseif ($part -notin @($identityDirectory, $privateDirectory)) {
                $facts.pathChainSafe = $false; break
            }
        }
        # Never follow a detected reparse path to inspect descendants/ACLs.
        if (-not $facts.pathChainSafe) { return $facts }
        if ($null -ne (Get-OptionalItem $identityDirectory)) { $facts.privateParentSafe = Test-PrivateAcl $identityDirectory $true }
        if ($null -ne (Get-OptionalItem $privateDirectory)) {
            $facts.privateDirectoryPresent = $true
            $facts.privateDirectorySafe = Test-PrivateAcl $privateDirectory $true
            foreach ($entry in @(Get-ChildItem -LiteralPath $privateDirectory -Force)) {
                if ($entry.Name -cne 'credentials.json' -and $entry.Name -cne 'save-as-probe.txt') { $facts.directoryContentsExpected = $false }
            }
        }
        if ($null -ne (Get-OptionalItem $credentialFile)) {
            $facts.credentialPresent = $true
            $entry = Get-Item -LiteralPath $credentialFile -Force
            $facts.credentialMetadataSafe = -not $entry.PSIsContainer -and -not ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
                $entry.Length -gt 0 -and $entry.Length -le 16384
            if ($facts.credentialMetadataSafe) { $facts.credentialMetadataSafe = Test-PrivateAcl $credentialFile $false }
        }
        if ($null -ne (Get-OptionalItem $probeFile)) {
            $facts.probePresent = $true
            $entry = Get-Item -LiteralPath $probeFile -Force
            $facts.probeMetadataSafe = -not $entry.PSIsContainer -and -not ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
                $entry.Length -gt 0 -and $entry.Length -le 1024
            if ($facts.probeMetadataSafe) { $facts.probeMetadataSafe = Test-PrivateAcl $probeFile $false }
        }
        return $facts
    }
    function New-PrivateDirectory([string]$Path) {
        # CreateDirectoryW fails on an existing target. The DACL is attached at
        # creation: there is no permissive mkdir/reset/tighten window and no ACL
        # mutation of any existing path, even if another process races creation.
        if (-not ('AshaIdentityStorageNative' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AshaIdentityStorageNative {
  [StructLayout(LayoutKind.Sequential)] public struct Attributes { public int Length; public IntPtr Descriptor; public int Inherit; }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string s, uint revision, out IntPtr descriptor, out uint size);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CreateDirectory(string path, ref Attributes attributes);
  [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr pointer);
}
'@
        }
        $descriptor = [IntPtr]::Zero
        $size = [uint32]0
        try {
            $sddl = 'O:' + $currentSid + 'D:P(A;OICI;FA;;;' + $currentSid + ')(A;OICI;FA;;;SY)'
            if (-not [AshaIdentityStorageNative]::ConvertStringSecurityDescriptorToSecurityDescriptor($sddl, 1, [ref]$descriptor, [ref]$size)) { throw 'Private directory creation failed' }
            $attributes = New-Object AshaIdentityStorageNative+Attributes
            $attributes.Length = [Runtime.InteropServices.Marshal]::SizeOf($attributes)
            $attributes.Descriptor = $descriptor
            if (-not [AshaIdentityStorageNative]::CreateDirectory($Path, [ref]$attributes)) { throw 'Private directory creation failed' }
        } finally { if ($descriptor -ne [IntPtr]::Zero) { [void][AshaIdentityStorageNative]::LocalFree($descriptor) } }
    }

    $facts = Get-Facts
    if ($Mode -eq 'Prepare' -and $facts.outsideRepository -and $facts.gitBoundarySafe -and $facts.pathChainSafe -and $facts.ancestorMutationSafe -and $facts.privateParentSafe -and
        $facts.directoryContentsExpected -and $facts.probeMetadataSafe -and -not $facts.credentialPresent -and (-not $facts.privateDirectoryPresent -or $facts.privateDirectorySafe)) {
        $created = $false
        # Never create/alter the existing profile or any ancestor, only these two
        # exact private directories. No old workspace cache path is accessed.
        if (-not (Test-Path -LiteralPath $profileDirectory -PathType Container)) { throw 'Private parent unavailable' }
        foreach ($target in @($identityDirectory, $privateDirectory)) {
            $before = Get-Facts
            if (-not ($before.outsideRepository -and $before.gitBoundarySafe -and $before.pathChainSafe -and $before.ancestorMutationSafe -and $before.privateParentSafe)) { throw 'Private parent unavailable' }
            if ($null -eq (Get-OptionalItem $target)) {
                New-PrivateDirectory $target
                $created = $true
            }
            if (-not (Test-PrivateAcl $target $true)) { throw 'Private directory verification failed' }
        }
        $facts = Get-Facts
        $facts.createdDirectories = $created
    }
    [pscustomobject]$facts | ConvertTo-Json -Compress
} catch {
    # Do not emit exception text, paths, account identifiers or raw command output.
    '{"metadataComplete":false}'
    exit 1
}
