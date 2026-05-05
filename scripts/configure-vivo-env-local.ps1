param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$PrivateEnvFile,
  [switch]$SkipAsr,
  [switch]$UseDefaults,
  [switch]$Force,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

$VivoEnvNames = @(
  "VIVO_APP_KEY",
  "VIVO_APP_ID",
  "VIVO_BASE_URL",
  "VIVO_LLM_MODEL",
  "VIVO_OCR_PATH",
  "VIVO_ASR_PACKAGE",
  "VIVO_ASR_CLIENT_VERSION",
  "VIVO_ASR_USER_ID",
  "VIVO_ASR_ENGINE_ID"
)

$AsrEnvNames = @(
  "VIVO_ASR_PACKAGE",
  "VIVO_ASR_CLIENT_VERSION",
  "VIVO_ASR_USER_ID",
  "VIVO_ASR_ENGINE_ID"
)

function Resolve-FullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd([char[]]@("\", "/"))
}

function Test-IsPathInside([string]$Child, [string]$Parent) {
  $childFull = Resolve-FullPath $Child
  $parentFull = Resolve-FullPath $Parent
  return $childFull.Equals($parentFull, [System.StringComparison]::OrdinalIgnoreCase) -or
    $childFull.StartsWith("$parentFull$([System.IO.Path]::DirectorySeparatorChar)", [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-Placeholder([string]$Value) {
  if ($null -eq $Value) { return $true }
  $trimmed = $Value.Trim()
  if ($trimmed.Length -eq 0) { return $true }
  if ($trimmed.StartsWith("填入")) { return $true }
  $lower = $trimmed.ToLowerInvariant()
  $placeholders = @(
    "unknown",
    "n/a",
    "na",
    "null",
    "undefined",
    "your_appkey",
    "your_appid",
    "your_vivo_app_key",
    "your_vivo_app_id",
    "your_vivo_base_url",
    "your_vivo_llm_model",
    "your_vivo_ocr_path",
    "your_vivo_asr_package",
    "your_vivo_asr_client_version",
    "your_vivo_asr_user_id",
    "your_vivo_asr_engine_id",
    "placeholder",
    "changeme",
    "change_me"
  )
  return $placeholders -contains $lower
}

function ConvertFrom-EnvFile([string]$PathValue) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $PathValue)) { return $values }
  foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
    if ($line -match "^\s*#" -or $line -notmatch "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$") {
      continue
    }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$name] = $value
  }
  return $values
}

function ConvertTo-EnvLine([string]$Name, [string]$Value) {
  if ($Value -match "[`r`n]") {
    throw "$Name MISSING"
  }
  if ($Value -match "\s|#|`"|'") {
    $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    return "$Name=""$escaped"""
  }
  return "$Name=$Value"
}

function Read-SecurePlainText([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  return [System.Net.NetworkCredential]::new("", $secure).Password
}

$ProjectRoot = Resolve-FullPath $ProjectRoot
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
  throw "package.json MISSING"
}
Write-Host "package.json SET"

$gitignorePath = Join-Path $ProjectRoot ".gitignore"
if (-not (Test-Path -LiteralPath $gitignorePath)) {
  throw ".gitignore MISSING"
}
$gitignore = Get-Content -Raw -LiteralPath $gitignorePath -Encoding UTF8
foreach ($pattern in @(".env.local", ".env", ".env.*.local")) {
  if ($gitignore -match "(?m)^\s*$([regex]::Escape($pattern))\s*$") {
    Write-Host "$pattern SET"
  } else {
    Write-Host "$pattern MISSING"
    throw "$pattern MISSING"
  }
}

if ($NonInteractive -and -not $PrivateEnvFile) {
  throw "PrivateEnvFile MISSING"
}

$privateValues = @{}
if ($PrivateEnvFile) {
  $privatePath = Resolve-FullPath $PrivateEnvFile
  if (-not (Test-Path -LiteralPath $privatePath)) {
    throw "PrivateEnvFile MISSING"
  }
  if (Test-IsPathInside $privatePath $ProjectRoot) {
    throw "PrivateEnvFile MISSING"
  }
  $privateValues = ConvertFrom-EnvFile $privatePath
  Write-Host "PrivateEnvFile SET"
}

$envLocalPath = Join-Path $ProjectRoot ".env.local"
$existingLines = @()
$existingValues = @{}
if (Test-Path -LiteralPath $envLocalPath) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = Join-Path $ProjectRoot ".env.local.backup.$timestamp"
  Copy-Item -LiteralPath $envLocalPath -Destination $backupPath
  Write-Host ".env.local SET"
  Write-Host ".env.local.backup SET"
  $existingLines = Get-Content -LiteralPath $envLocalPath -Encoding UTF8
  $existingValues = ConvertFrom-EnvFile $envLocalPath
} else {
  Write-Host ".env.local MISSING"
}

$publicVivoKeys = @()
foreach ($key in $existingValues.Keys) {
  if ($key.StartsWith("NEXT_PUBLIC_VIVO_")) {
    $publicVivoKeys += $key
  }
}
foreach ($key in [Environment]::GetEnvironmentVariables("Process").Keys) {
  if ([string]$key -like "NEXT_PUBLIC_VIVO_*") {
    $publicVivoKeys += [string]$key
  }
}
if ($publicVivoKeys.Count -gt 0) {
  Write-Host "NEXT_PUBLIC_VIVO_* SET"
  throw "NEXT_PUBLIC_VIVO_* SET"
}
Write-Host "NEXT_PUBLIC_VIVO_* MISSING"

$defaultValues = @{
  VIVO_APP_ID = "2026676457"
}
if ($UseDefaults) {
  $defaultValues["VIVO_BASE_URL"] = "https://api-ai.vivo.com.cn"
  $defaultValues["VIVO_OCR_PATH"] = "/ocr/general_recognition"
}

$finalValues = @{}
foreach ($name in $VivoEnvNames) {
  if ($SkipAsr -and ($AsrEnvNames -contains $name)) {
    continue
  }

  $value = $null
  if ($name -eq "VIVO_APP_ID") {
    $value = "2026676457"
  } elseif (-not $Force -and $existingValues.ContainsKey($name) -and -not (Test-Placeholder $existingValues[$name])) {
    $value = $existingValues[$name]
  } elseif ($privateValues.ContainsKey($name) -and -not (Test-Placeholder $privateValues[$name])) {
    $value = $privateValues[$name]
  } elseif ([Environment]::GetEnvironmentVariable($name, "Process") -and -not (Test-Placeholder ([Environment]::GetEnvironmentVariable($name, "Process")))) {
    $value = [Environment]::GetEnvironmentVariable($name, "Process")
  } elseif ($defaultValues.ContainsKey($name)) {
    $value = $defaultValues[$name]
  }

  if ((Test-Placeholder $value) -and -not $NonInteractive) {
    if ($name -eq "VIVO_APP_KEY") {
      $value = Read-SecurePlainText "$name"
    } else {
      $value = Read-Host -Prompt $name
    }
  }

  if (-not (Test-Placeholder $value)) {
    $finalValues[$name] = $value
  }
}

foreach ($name in $VivoEnvNames) {
  if ($finalValues.ContainsKey($name)) {
    Write-Host "$name SET"
  } else {
    Write-Host "$name MISSING"
  }
}

$nonTargetLines = @()
foreach ($line in $existingLines) {
  if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=") {
    $name = $Matches[1]
    if ($VivoEnvNames -contains $name) {
      continue
    }
  }
  $nonTargetLines += $line
}

$newLines = @()
$newLines += $nonTargetLines
if ($newLines.Count -gt 0 -and $newLines[-1].Trim().Length -ne 0) {
  $newLines += ""
}
$newLines += "# vivo AIGC provider env; keep this file local only."
foreach ($name in $VivoEnvNames) {
  if ($finalValues.ContainsKey($name)) {
    $newLines += ConvertTo-EnvLine $name $finalValues[$name]
  }
}

Set-Content -LiteralPath $envLocalPath -Value $newLines -Encoding UTF8
Write-Host ".env.local READY"

if ($PrivateEnvFile) {
  Write-Host "DeletePrivateEnvFile READY"
}

Push-Location $ProjectRoot
try {
  if ($SkipAsr) {
    npm run vivo:check-env:partial
  } else {
    npm run vivo:check-env
  }
} finally {
  Pop-Location
}
