[CmdletBinding()]
param(
  [ValidateSet("ssh-shell", "ssh-pm2", "ssh-docker", "ssh-systemd", "manual")]
  [string]$Mode,
  [string]$SshHost,
  [string]$Pm2App,
  [string]$DockerContainer,
  [string]$SystemdService,
  [string]$ManualFile,
  [string]$ProjectRoot = (Get-Location).Path
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

$PlaceholderValues = @(
  "",
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

function ConvertTo-SafeMessage {
  param([AllowNull()][string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  return ($Text -replace '(VIVO_[A-Z0-9_]+\s*[:=]\s*)[^\s\r\n]+', '$1<redacted>')
}

function Resolve-ProjectRoot {
  param([string]$Path)

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  if (-not (Test-Path -LiteralPath (Join-Path $resolved "package.json"))) {
    throw "ProjectRoot is not a project root: package.json is missing."
  }

  return $resolved
}

function Test-GitIgnored {
  param(
    [string]$Root,
    [string]$RelativePath
  )

  Push-Location $Root
  try {
    & git check-ignore -q $RelativePath 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  } finally {
    Pop-Location
  }
}

function Assert-LocalSafety {
  param([string]$Root)

  $gitignorePath = Join-Path $Root ".gitignore"
  if (-not (Test-Path -LiteralPath $gitignorePath)) {
    throw ".gitignore is missing. Refusing to write .env.local."
  }

  $gitignoreLines = Get-Content -LiteralPath $gitignorePath
  $requiredIgnoreLines = @(".env.local", ".env", ".env.*.local")
  $missingIgnoreLines = @($requiredIgnoreLines | Where-Object { $gitignoreLines -notcontains $_ })
  if ($missingIgnoreLines.Count -gt 0) {
    Write-Host ("WARN .gitignore missing explicit entries: " + ($missingIgnoreLines -join ", "))
  }

  if (-not (Test-GitIgnored -Root $Root -RelativePath ".env.local")) {
    throw ".env.local is not ignored by git. Refusing to write secrets."
  }

  $envExamplePath = Join-Path $Root ".env.example"
  if (Test-Path -LiteralPath $envExamplePath) {
    $suspectKeys = New-Object System.Collections.Generic.List[string]
    foreach ($line in (Get-Content -LiteralPath $envExamplePath)) {
      $trimmed = $line.Trim()
      if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
        continue
      }

      $key = $trimmed.Substring(0, $trimmed.IndexOf("=")).Trim()
      $value = ($trimmed.Substring($trimmed.IndexOf("=") + 1).Trim() -replace '^[''"]|[''"]$', "")
      if ($key.StartsWith("VIVO_") -and $value.Length -gt 0 -and -not $PlaceholderValues.Contains($value.ToLowerInvariant()) -and -not $value.StartsWith("your_") -and -not ($value.StartsWith("<") -and $value.EndsWith(">"))) {
        $suspectKeys.Add($key)
      }
    }

    if ($suspectKeys.Count -gt 0) {
      Write-Host ("WARN .env.example has non-placeholder VIVO entries: " + (($suspectKeys | Sort-Object -Unique) -join ", "))
    }
  }
}

function Read-ModeInteractively {
  Write-Host "Select Tencent Cloud deployment mode:"
  Write-Host "1. ssh-shell    remote shell already has VIVO_*"
  Write-Host "2. ssh-pm2      Tencent CVM/Lighthouse with pm2"
  Write-Host "3. ssh-docker   Docker/docker-compose container"
  Write-Host "4. ssh-systemd  systemd service"
  Write-Host "5. manual       local temp file copied from console"

  while ($true) {
    $choice = (Read-Host "Mode").Trim()
    switch ($choice) {
      "1" { return "ssh-shell" }
      "2" { return "ssh-pm2" }
      "3" { return "ssh-docker" }
      "4" { return "ssh-systemd" }
      "5" { return "manual" }
      "ssh-shell" { return "ssh-shell" }
      "ssh-pm2" { return "ssh-pm2" }
      "ssh-docker" { return "ssh-docker" }
      "ssh-systemd" { return "ssh-systemd" }
      "manual" { return "manual" }
      default { Write-Host "Invalid mode. Choose 1-5 or a mode name." }
    }
  }
}

function Read-RequiredText {
  param(
    [AllowNull()][string]$Value,
    [string]$Prompt
  )

  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    return $Value.Trim()
  }

  while ($true) {
    $inputValue = (Read-Host $Prompt).Trim()
    if (-not [string]::IsNullOrWhiteSpace($inputValue)) {
      return $inputValue
    }
    Write-Host "Value is required."
  }
}

function Quote-RemoteArg {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'\''") + "'"
}

function Invoke-RemoteCommand {
  param(
    [string]$HostName,
    [string]$RemoteCommand
  )

  Write-Host ("Reading remote VIVO_* with ssh from " + $HostName + " (values hidden)...")
  $stderrFile = New-TemporaryFile

  try {
    $output = & ssh $HostName $RemoteCommand 2>$stderrFile
    $exitCode = $LASTEXITCODE
    $stderr = ""
    if (Test-Path -LiteralPath $stderrFile) {
      $stderr = Get-Content -LiteralPath $stderrFile -Raw -ErrorAction SilentlyContinue
    }

    if ($exitCode -ne 0) {
      $safeError = ConvertTo-SafeMessage $stderr
      if ([string]::IsNullOrWhiteSpace($safeError)) {
        $safeError = "remote command exited with code $exitCode"
      }
      throw "ssh command failed (exit $exitCode): $safeError"
    }

    return ($output -join "`n")
  } finally {
    Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
  }
}

function Read-RawEnvText {
  param(
    [string]$SelectedMode,
    [string]$Root
  )

  switch ($SelectedMode) {
    "ssh-shell" {
      $script:SshHost = Read-RequiredText -Value $script:SshHost -Prompt "SSH host, for example root@1.2.3.4"
      return Invoke-RemoteCommand -HostName $script:SshHost -RemoteCommand "printenv | grep '^VIVO_' || true"
    }
    "ssh-pm2" {
      $script:SshHost = Read-RequiredText -Value $script:SshHost -Prompt "SSH host, for example root@1.2.3.4"
      $script:Pm2App = Read-RequiredText -Value $script:Pm2App -Prompt "pm2 app name or id"
      return Invoke-RemoteCommand -HostName $script:SshHost -RemoteCommand ("pm2 env " + (Quote-RemoteArg $script:Pm2App))
    }
    "ssh-docker" {
      $script:SshHost = Read-RequiredText -Value $script:SshHost -Prompt "SSH host, for example root@1.2.3.4"
      $script:DockerContainer = Read-RequiredText -Value $script:DockerContainer -Prompt "Docker container name or id"
      $inner = "printenv | grep '^VIVO_' || true"
      return Invoke-RemoteCommand -HostName $script:SshHost -RemoteCommand ("docker exec " + (Quote-RemoteArg $script:DockerContainer) + " sh -lc " + (Quote-RemoteArg $inner))
    }
    "ssh-systemd" {
      $script:SshHost = Read-RequiredText -Value $script:SshHost -Prompt "SSH host, for example root@1.2.3.4"
      $script:SystemdService = Read-RequiredText -Value $script:SystemdService -Prompt "systemd service name"
      $remote = "systemctl show " + (Quote-RemoteArg $script:SystemdService) + " --property=Environment --property=EnvironmentFiles"
      return Invoke-RemoteCommand -HostName $script:SshHost -RemoteCommand $remote
    }
    "manual" {
      $script:ManualFile = Read-RequiredText -Value $script:ManualFile -Prompt "Manual VIVO env temp file path"
      $manualPath = $script:ManualFile
      if (-not [System.IO.Path]::IsPathRooted($manualPath)) {
        $manualPath = Join-Path $Root $manualPath
      }
      if (-not (Test-Path -LiteralPath $manualPath)) {
        throw "ManualFile not found."
      }
      return Get-Content -LiteralPath $manualPath -Raw
    }
    default {
      throw "Unsupported mode: $SelectedMode"
    }
  }
}

function Clean-EnvValue {
  param([AllowNull()][string]$Value)
  if ($null -eq $Value) {
    return ""
  }

  $clean = $Value.Trim()
  if (($clean.StartsWith('"') -and $clean.EndsWith('"')) -or ($clean.StartsWith("'") -and $clean.EndsWith("'"))) {
    $clean = $clean.Substring(1, $clean.Length - 2)
  }

  return $clean.Trim()
}

function Add-ParsedEnvValue {
  param(
    [System.Collections.IDictionary]$Map,
    [string]$Key,
    [AllowNull()][string]$Value
  )

  if ($VivoEnvNames -notcontains $Key) {
    return
  }

  $clean = Clean-EnvValue $Value
  if ($PlaceholderValues.Contains($clean.ToLowerInvariant())) {
    return
  }

  if ($clean.Length -gt 0) {
    $Map[$Key] = $clean
  }
}

function ConvertFrom-EnvText {
  param([AllowNull()][string]$Text)

  $map = [ordered]@{}
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $map
  }

  $assignmentPattern = '(?:^|\s)(VIVO_[A-Z0-9_]+)\s*=\s*("[^"]*"|''[^'']*''|[^\s]+)'

  foreach ($rawLine in ($Text -split "`r?`n")) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) {
      continue
    }

    if ($line.StartsWith("export ")) {
      $line = $line.Substring(7).Trim()
    }

    if (($line.StartsWith("|") -or $line.StartsWith([string][char]0x2502)) -and $line.Contains("VIVO_")) {
      $parts = @($line.Split([char[]]@("|", [char]0x2502)) | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
      for ($i = 0; $i -lt $parts.Count; $i++) {
        if ($parts[$i] -match '^(VIVO_[A-Z0-9_]+)$' -and ($i + 1) -lt $parts.Count) {
          Add-ParsedEnvValue -Map $map -Key $Matches[1] -Value $parts[$i + 1]
        }
      }
      continue
    }

    if ($line -match '^Environment=(.*)$') {
      $line = $Matches[1].Trim()
    }

    if ($line -match '^(VIVO_[A-Z0-9_]+)\s*:\s*(.*)$') {
      Add-ParsedEnvValue -Map $map -Key $Matches[1] -Value $Matches[2]
      continue
    }

    foreach ($match in [regex]::Matches($line, $assignmentPattern)) {
      Add-ParsedEnvValue -Map $map -Key $match.Groups[1].Value -Value $match.Groups[2].Value
    }
  }

  return $map
}

function Format-DotEnvLine {
  param(
    [string]$Name,
    [string]$Value
  )

  $singleLineValue = $Value.Replace("`r", "").Replace("`n", "")
  if ($singleLineValue -match '^[A-Za-z0-9_./:@+\-=]+$') {
    return "$Name=$singleLineValue"
  }

  $escaped = $singleLineValue.Replace("\", "\\").Replace('"', '\"')
  return "$Name=`"$escaped`""
}

function Backup-EnvLocal {
  param([string]$EnvLocalPath)

  if (-not (Test-Path -LiteralPath $EnvLocalPath)) {
    return $null
  }

  $backupPath = $EnvLocalPath + ".backup." + (Get-Date -Format "yyyyMMdd-HHmmss")
  Copy-Item -LiteralPath $EnvLocalPath -Destination $backupPath -Force
  return $backupPath
}

function Write-EnvLocal {
  param(
    [string]$EnvLocalPath,
    [System.Collections.IDictionary]$EnvMap
  )

  $existingLines = @()
  if (Test-Path -LiteralPath $EnvLocalPath) {
    $existingLines = @(Get-Content -LiteralPath $EnvLocalPath)
  }

  $targetPattern = '^(?:export\s+)?(' + (($VivoEnvNames | ForEach-Object { [regex]::Escape($_) }) -join "|") + ')\s*='
  $nextPublicPattern = '^(?:export\s+)?NEXT_PUBLIC_VIVO_[A-Z0-9_]*\s*='
  $lines = New-Object System.Collections.Generic.List[string]

  foreach ($line in $existingLines) {
    $trimmed = $line.Trim()
    if ($trimmed -match $targetPattern -or $trimmed -match $nextPublicPattern) {
      continue
    }
    $lines.Add($line)
  }

  while ($lines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($lines[$lines.Count - 1])) {
    $lines.RemoveAt($lines.Count - 1)
  }

  if ($lines.Count -gt 0) {
    $lines.Add("")
  }

  $lines.Add("# VIVO provider env synced from Tencent Cloud. Values intentionally hidden from terminal output.")
  foreach ($name in $VivoEnvNames) {
    if ($EnvMap.Contains($name)) {
      $lines.Add((Format-DotEnvLine -Name $name -Value $EnvMap[$name]))
    }
  }

  $content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($EnvLocalPath, $content, $utf8NoBom)
}

function Show-SafeStatus {
  param([System.Collections.IDictionary]$EnvMap)

  $missing = New-Object System.Collections.Generic.List[string]
  foreach ($name in $VivoEnvNames) {
    if ($EnvMap.Contains($name) -and -not [string]::IsNullOrWhiteSpace($EnvMap[$name])) {
      Write-Host "$name SET"
    } else {
      Write-Host "$name MISSING"
      $missing.Add($name)
    }
  }

  if ($missing.Count -gt 0) {
    Write-Host ("Missing variables: " + ($missing -join ", "))
  }

  return $missing.Count
}

try {
  $resolvedRoot = Resolve-ProjectRoot -Path $ProjectRoot
  Assert-LocalSafety -Root $resolvedRoot

  if ([string]::IsNullOrWhiteSpace($Mode)) {
    $Mode = Read-ModeInteractively
  }

  $rawText = Read-RawEnvText -SelectedMode $Mode -Root $resolvedRoot
  $envMap = ConvertFrom-EnvText -Text $rawText

  if ($envMap.Count -eq 0) {
    Write-Host "No configured VIVO_* variables were found."
    if ($Mode -eq "ssh-systemd") {
      Write-Host "The service may use EnvironmentFile. Check the service unit/drop-in and sync with -Mode manual if needed."
    } else {
      Write-Host "Add VIVO_* in the Tencent Cloud console or the server startup configuration, then run this script again."
    }
    exit 1
  }

  $envLocalPath = Join-Path $resolvedRoot ".env.local"
  $backupPath = Backup-EnvLocal -EnvLocalPath $envLocalPath
  if ($backupPath) {
    Write-Host ("Existing .env.local backup created: " + (Split-Path -Leaf $backupPath))
  }

  Write-EnvLocal -EnvLocalPath $envLocalPath -EnvMap $envMap
  Write-Host ".env.local updated. Values hidden."

  $finalEnvMap = ConvertFrom-EnvText -Text (Get-Content -LiteralPath $envLocalPath -Raw)
  $missingCount = Show-SafeStatus -EnvMap $finalEnvMap
  if ($missingCount -gt 0) {
    exit 1
  }

  exit 0
} catch {
  [Console]::Error.WriteLine(("ERROR: " + (ConvertTo-SafeMessage $_.Exception.Message)))
  exit 1
}
