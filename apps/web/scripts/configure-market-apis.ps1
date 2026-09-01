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

Write-Host "راه‌اندازی امن قیمت‌های بازار اشا" -ForegroundColor Cyan
Write-Host "کلیدها هنگام تایپ دیده نمی‌شوند و فقط در فایل محلیِ خارج از Git ذخیره می‌شوند."
Write-Host "کلید را داخل چت یا Git نفرستید. برای ردکردن هر بخش فقط Enter بزنید."

$navasanSecret = Read-Host "کلید جدید نوسان (اگر هنوز نگرفته‌اید Enter بزنید)" -AsSecureString
$navasanKey = ConvertFrom-SecretInput $navasanSecret
if ($navasanKey.Length -gt 0) {
  $rotationConfirmation = (Read-Host "فقط اگر کلید قبلی را لغو و کلید تازه گرفته‌اید بنویسید: تعویض شد").Trim()
  if ($rotationConfirmation -cne "تعویض شد" -and $rotationConfirmation -cne "ROTATED") {
    throw "نوسان غیرفعال می‌ماند تا کلید قبلی لغو و با کلید تازه جایگزین شود."
  }
  $navasanUnit = (Read-Host "واحد قیمت نوسان (TOMAN یا IRR) [TOMAN]").Trim().ToUpperInvariant()
  if ($navasanUnit.Length -eq 0) { $navasanUnit = "TOMAN" }
  if ($navasanUnit -notin @("IRR", "TOMAN")) {
    throw "واحد نوسان باید TOMAN یا IRR باشد."
  }
  $navasanPlanInput = (Read-Host "طرح نوسان: رایگان، استاندارد یا طلایی [رایگان]").Trim().ToLowerInvariant()
  $navasanPlan = switch ($navasanPlanInput) {
    "" { "free" }
    "رایگان" { "free" }
    "free" { "free" }
    "استاندارد" { "standard" }
    "standard" { "standard" }
    "طلایی" { "gold" }
    "gold" { "gold" }
    "golden" { "gold" }
    default { throw "طرح نوسان باید رایگان، استاندارد یا طلایی باشد." }
  }
  $refreshSeconds = switch ($navasanPlan) {
    "free" { "24000" }
    "standard" { "120" }
    "gold" { "30" }
  }
  Set-DotEnvValue -Name "NAVASAN_API_KEY" -Value $navasanKey
  Set-DotEnvValue -Name "NAVASAN_VALUE_UNIT" -Value $navasanUnit
  Set-DotEnvValue -Name "NAVASAN_PLAN" -Value $navasanPlan
  Set-DotEnvValue -Name "NAVASAN_REFRESH_SECONDS" -Value $refreshSeconds
  Set-DotEnvValue -Name "NAVASAN_KEY_ROTATION_CONFIRMED" -Value "true"
}

$goldApiSecret = Read-Host "کلید GoldAPI.io (اگر ندارید Enter بزنید)" -AsSecureString
$goldApiToken = ConvertFrom-SecretInput $goldApiSecret
if ($goldApiToken.Length -gt 0) {
  Set-DotEnvValue -Name "GOLD_API_TOKEN" -Value $goldApiToken
}

$navasanKey = $null
$goldApiToken = $null
[GC]::Collect()

Write-Host "تنظیمات محلی با موفقیت ذخیره شد. حالا برنامه را دوباره اجرا و وضعیت اتصال را بررسی کنید." -ForegroundColor Green
