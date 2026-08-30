[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$webRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $webRoot ".env.local"

function ConvertFrom-SecretInput {
  param([Security.SecureString]$Secret)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Set-DotEnvValue {
  param(
    [string]$Name,
    [string]$Value
  )

  if ($Value -match "[\r\n']") {
    throw "$Name contains a character that cannot be stored safely in .env.local."
  }

  $serialized = "$Name='$Value'"

  $lines = if (Test-Path -LiteralPath $envPath) {
    @(Get-Content -LiteralPath $envPath)
  }
  else {
    @("# Local server-side secrets. This file is ignored by Git.")
  }
  $lines = @($lines)

  $pattern = "^$([Regex]::Escape($Name))="
  $updated = $false
  for ($index = 0; $index -lt $lines.Count; $index += 1) {
    if ($lines[$index] -match $pattern) {
      $lines[$index] = $serialized
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines += $serialized
  }

  Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8
}

Write-Host "Asha market API setup" -ForegroundColor Cyan
Write-Host "Secrets are hidden while typing and are written only to apps/web/.env.local."
Write-Host "Press Enter at a secret prompt to leave that provider unchanged."

$navasanSecret = Read-Host "Navasan API key" -AsSecureString
$navasanKey = ConvertFrom-SecretInput $navasanSecret
if ($navasanKey.Length -gt 0) {
  $rotationConfirmation = (Read-Host "Revoke the key previously pasted in chat. Type ROTATED only if this is a newly issued replacement key").Trim()
  if ($rotationConfirmation -cne "ROTATED") {
    throw "Navasan remains disabled until the compromised key is revoked and replaced."
  }
  $navasanUnit = (Read-Host "Confirmed Navasan contract unit (IRR or TOMAN)").Trim().ToUpperInvariant()
  if ($navasanUnit -notin @("IRR", "TOMAN")) {
    throw "Navasan unit must be IRR or TOMAN. Confirm it with the provider before continuing."
  }
  $navasanPlan = (Read-Host "Navasan plan (free, standard, or gold) [free]").Trim().ToLowerInvariant()
  if ($navasanPlan.Length -eq 0) { $navasanPlan = "free" }
  $refreshSeconds = switch ($navasanPlan) {
    "free" { "21600" }
    "standard" { "120" }
    "gold" { "30" }
    default { throw "Navasan plan must be free, standard, or gold." }
  }
  Set-DotEnvValue -Name "NAVASAN_API_KEY" -Value $navasanKey
  Set-DotEnvValue -Name "NAVASAN_VALUE_UNIT" -Value $navasanUnit
  Set-DotEnvValue -Name "NAVASAN_REFRESH_SECONDS" -Value $refreshSeconds
  Set-DotEnvValue -Name "NAVASAN_KEY_ROTATION_CONFIRMED" -Value "true"
}

$goldApiSecret = Read-Host "GoldAPI.io token" -AsSecureString
$goldApiToken = ConvertFrom-SecretInput $goldApiSecret
if ($goldApiToken.Length -gt 0) {
  Set-DotEnvValue -Name "GOLD_API_TOKEN" -Value $goldApiToken
}

$navasanKey = $null
$goldApiToken = $null
[GC]::Collect()

Write-Host "Local configuration updated. Restart the web server, then check /api/health and /api/market." -ForegroundColor Green
