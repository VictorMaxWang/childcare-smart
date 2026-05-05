param(
  [string]$ProjectRoot = (Get-Location).Path,
  [switch]$Production,
  [switch]$Preview,
  [switch]$Development,
  [switch]$Force
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

function Resolve-FullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd([char[]]@("\", "/"))
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

function Write-ManualChecklist([string]$Reason) {
  $artifactDir = Join-Path $ProjectRoot "artifacts/product-completion/R04"
  New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
  $checklistPath = Join-Path $artifactDir "vercel-env-manual-checklist.md"
  $content = @(
    "# Vercel vivo env manual checklist",
    "",
    "Reason: $Reason",
    "",
    "Add these variables in Vercel Project -> Settings -> Environment Variables. Select Production, Preview, and Development, then redeploy.",
    "",
    "- VIVO_APP_KEY",
    "- VIVO_APP_ID",
    "- VIVO_BASE_URL",
    "- VIVO_LLM_MODEL",
    "- VIVO_OCR_PATH",
    "- VIVO_ASR_PACKAGE",
    "- VIVO_ASR_CLIENT_VERSION",
    "- VIVO_ASR_USER_ID",
    "- VIVO_ASR_ENGINE_ID",
    "",
    "Do not use NEXT_PUBLIC_VIVO_*.",
    "Do not paste real AppKEY values into docs, tickets, logs, or chat."
  )
  Set-Content -LiteralPath $checklistPath -Value $content -Encoding UTF8
  Write-Host "vercel-env-manual-checklist READY"
}

function Invoke-VercelEnvAdd([string]$VercelPath, [string]$Name, [string]$Environment, [string]$Value) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $extension = [System.IO.Path]::GetExtension($VercelPath).ToLowerInvariant()
  if ($extension -eq ".cmd" -or $extension -eq ".bat") {
    $psi.FileName = "cmd.exe"
    $psi.ArgumentList.Add("/d")
    $psi.ArgumentList.Add("/c")
    $psi.ArgumentList.Add("`"$VercelPath`"")
    $psi.ArgumentList.Add("env")
    $psi.ArgumentList.Add("add")
    $psi.ArgumentList.Add($Name)
    $psi.ArgumentList.Add($Environment)
  } else {
    $psi.FileName = $VercelPath
    $psi.ArgumentList.Add("env")
    $psi.ArgumentList.Add("add")
    $psi.ArgumentList.Add($Name)
    $psi.ArgumentList.Add($Environment)
  }
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $process = [System.Diagnostics.Process]::Start($psi)
  $process.StandardInput.WriteLine($Value)
  $process.StandardInput.Close()
  $process.StandardOutput.ReadToEnd() | Out-Null
  $process.StandardError.ReadToEnd() | Out-Null
  $process.WaitForExit()
  return $process.ExitCode
}

function Test-VercelEnvExists([string]$VercelPath, [string]$Name, [string]$Environment) {
  try {
    $output = & $VercelPath env ls $Environment 2>$null
    return ($output -match "(^|\s)$([regex]::Escape($Name))(\s|$)")
  } catch {
    return $false
  }
}

$ProjectRoot = Resolve-FullPath $ProjectRoot
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
  throw "package.json MISSING"
}

$environments = @()
if ($Production) { $environments += "production" }
if ($Preview) { $environments += "preview" }
if ($Development) { $environments += "development" }
if ($environments.Count -eq 0) {
  $environments = @("production", "preview", "development")
}

$vercel = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercel) {
  Write-Host "VercelCLI MISSING"
  Write-ManualChecklist "Vercel CLI missing"
  exit 1
}
Write-Host "VercelCLI SET"

try {
  & $vercel.Source --version | Out-Null
  Write-Host "VercelVersion SET"
} catch {
  Write-Host "VercelVersion MISSING"
  Write-ManualChecklist "Vercel CLI version check failed"
  exit 1
}

try {
  & $vercel.Source whoami | Out-Null
  Write-Host "VercelLogin SET"
} catch {
  Write-Host "VercelLogin MISSING"
  Write-ManualChecklist "Vercel CLI not logged in"
  exit 1
}

$projectJson = Join-Path $ProjectRoot ".vercel/project.json"
if (-not (Test-Path -LiteralPath $projectJson)) {
  Write-Host "VercelProjectLink MISSING"
  Write-ManualChecklist "Vercel project link missing; run vercel link"
  exit 1
}
Write-Host "VercelProjectLink SET"

$envLocalPath = Join-Path $ProjectRoot ".env.local"
if (-not (Test-Path -LiteralPath $envLocalPath)) {
  Write-Host ".env.local MISSING"
  Write-ManualChecklist ".env.local missing"
  exit 1
}
Write-Host ".env.local SET"

$values = ConvertFrom-EnvFile $envLocalPath
$missing = @()
foreach ($name in $VivoEnvNames) {
  if ($values.ContainsKey($name) -and -not (Test-Placeholder $values[$name])) {
    Write-Host "$name SET"
  } else {
    Write-Host "$name MISSING"
    $missing += $name
  }
}

if ($missing.Count -gt 0) {
  Write-ManualChecklist "Local .env.local missing VIVO variables"
  exit 1
}

$publicVivo = @()
foreach ($name in $values.Keys) {
  if ($name.StartsWith("NEXT_PUBLIC_VIVO_")) {
    $publicVivo += $name
  }
}
if ($publicVivo.Count -gt 0) {
  Write-Host "NEXT_PUBLIC_VIVO_* SET"
  Write-ManualChecklist "NEXT_PUBLIC_VIVO_* security risk"
  exit 1
}
Write-Host "NEXT_PUBLIC_VIVO_* MISSING"

foreach ($environment in $environments) {
  foreach ($name in $VivoEnvNames) {
    $exists = Test-VercelEnvExists $vercel.Source $name $environment
    if ($exists -and -not $Force) {
      $answer = Read-Host -Prompt "$environment $name SET overwrite"
      if ($answer -ne "YES") {
        Write-Host "$environment $name SET"
        continue
      }
    }
    if ($Force -or $exists) {
      & $vercel.Source env rm $name $environment --yes | Out-Null
    }
    $exitCode = Invoke-VercelEnvAdd $vercel.Source $name $environment $values[$name]
    if ($exitCode -eq 0) {
      Write-Host "$environment $name SET"
    } else {
      Write-Host "$environment $name MISSING"
      Write-ManualChecklist "Vercel env add failed"
      exit 1
    }
  }
}

Write-Host "VercelRedeploy READY"
