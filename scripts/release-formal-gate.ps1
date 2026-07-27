[CmdletBinding()]
param(
    [string]$EnvFile = ".env.release",
    [string]$ReportPath = "",
    [string]$NodePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$authoritativeCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release-formal-gate.ps1 -EnvFile .env.release"
Write-Host "[formal-release] Authoritative hostile-host entry: $authoritativeCommand"
Write-Host "[formal-release] npm scripts are convenience pointers only; direct PowerShell is the authority."

# Inspect the raw host environment before resolving or starting any Node binary.
$forbiddenExact = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
@(
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_REPL_EXTERNAL_MODULE",
    "NODE_CHANNEL_FD",
    "BASH_ENV",
    "ENV",
    "JAVA_TOOL_OPTIONS",
    "LD_PRELOAD",
    "PERL5OPT",
    "PYTHONHOME",
    "PYTHONINSPECT",
    "PYTHONPATH",
    "PYTHONSTARTUP",
    "RUBYOPT",
    "_JAVA_OPTIONS",
    "DYLD_INSERT_LIBRARIES"
) | ForEach-Object { [void]$forbiddenExact.Add($_) }

$forbiddenPrefixes = @("NPM_", "YARN_", "PNPM_", "COREPACK_", "GIT_")
$injectedKeys = @(
    [System.Environment]::GetEnvironmentVariables(
        [System.EnvironmentVariableTarget]::Process
    ).Keys | Where-Object {
        $key = [string]$_
        $forbiddenExact.Contains($key) -or
        @(
            $forbiddenPrefixes | Where-Object {
                $key.StartsWith(
                    $_,
                    [System.StringComparison]::OrdinalIgnoreCase
                )
            }
        ).Count -gt 0
    }
) | Sort-Object -Unique

if (@($injectedKeys).Count -gt 0) {
    [System.Console]::Error.WriteLine(
        "Refusing to start Node because the host contains executable injection variables: " +
        ($injectedKeys -join ", ") +
        ". Run the authoritative command directly from a clean PowerShell process."
    )
    exit 64
}

function Resolve-ApplicationPath {
    param(
        [string]$Label,
        [string[]]$Candidates,
        [string]$CommandName
    )

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    $command = Get-Command $CommandName -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $command) {
        throw "Unable to resolve the trusted $Label executable."
    }
    return (Resolve-Path -LiteralPath $command.Source).Path
}

$scriptRoot = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptRoot
$programFiles = [System.Environment]::GetFolderPath(
    [System.Environment+SpecialFolder]::ProgramFiles
)
$localAppData = [System.Environment]::GetFolderPath(
    [System.Environment+SpecialFolder]::LocalApplicationData
)
$systemDirectory = [System.Environment]::SystemDirectory
$windowsDirectory = Split-Path -Parent $systemDirectory

$nodeCandidates = @()
if ($NodePath) {
    $nodeCandidates += $NodePath
}
$nodeCandidates += @(
    (Join-Path $programFiles "nodejs\node.exe"),
    (Join-Path $localAppData "Programs\nodejs\node.exe")
)
$nodeExecutable = Resolve-ApplicationPath "Node" $nodeCandidates "node.exe"
$gitExecutable = Resolve-ApplicationPath "Git" @(
    (Join-Path $programFiles "Git\cmd\git.exe"),
    (Join-Path $programFiles "Git\bin\git.exe")
) "git.exe"

$pythonDirectories = @()
foreach ($pythonCommandName in @("py.exe", "python.exe")) {
    $pythonCommand = Get-Command $pythonCommandName -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $pythonCommand) {
        $pythonDirectories += Split-Path -Parent (
            (Resolve-Path -LiteralPath $pythonCommand.Source).Path
        )
    }
}

$launcherHome = Join-Path (
    [System.IO.Path]::GetTempPath()
) ("childcare-release-launcher-" + [System.Guid]::NewGuid().ToString("N"))
$npmUserConfig = Join-Path $launcherHome "npm-user-empty.rc"
$npmGlobalConfig = Join-Path $launcherHome "npm-global-empty.rc"
$gitHooksPath = Join-Path $launcherHome "git-hooks-empty"
$gitGlobalConfig = Join-Path $launcherHome "git-global-empty.config"

$originalEnvironment = @{}
[System.Environment]::GetEnvironmentVariables(
    [System.EnvironmentVariableTarget]::Process
).GetEnumerator() | ForEach-Object {
    $originalEnvironment[[string]$_.Key] = [string]$_.Value
}

$exitCode = 1
try {
    [System.IO.Directory]::CreateDirectory($launcherHome) | Out-Null
    [System.IO.Directory]::CreateDirectory($gitHooksPath) | Out-Null
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($npmUserConfig, "", $utf8WithoutBom)
    [System.IO.File]::WriteAllText($npmGlobalConfig, "", $utf8WithoutBom)
    [System.IO.File]::WriteAllText($gitGlobalConfig, "", $utf8WithoutBom)

    $safeEnvironment = @{}
    @(
        "APPDATA",
        "CI",
        "COLORTERM",
        "CommonProgramFiles",
        "CommonProgramFiles(x86)",
        "CommonProgramW6432",
        "DriverData",
        "FORCE_COLOR",
        "LANG",
        "LC_ALL",
        "LOCALAPPDATA",
        "LOGONSERVER",
        "NUMBER_OF_PROCESSORS",
        "NUGET_PACKAGES",
        "OS",
        "PATHEXT",
        "PROCESSOR_ARCHITECTURE",
        "PROCESSOR_IDENTIFIER",
        "PROCESSOR_LEVEL",
        "PROCESSOR_REVISION",
        "ProgramData",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "ProgramW6432",
        "PUBLIC",
        "PYTHONIOENCODING",
        "PYTHONUTF8",
        "SSL_CERT_FILE",
        "SystemDrive",
        "SystemRoot",
        "TERM",
        "USERDOMAIN",
        "USERDOMAIN_ROAMINGPROFILE",
        "USERNAME",
        "windir"
    ) | ForEach-Object {
        if ($originalEnvironment.ContainsKey($_)) {
            $safeEnvironment[$_] = $originalEnvironment[$_]
        }
    }

    # Keep transport proxy settings, but never inherit execution configuration.
    @("ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY") | ForEach-Object {
        if ($originalEnvironment.ContainsKey($_)) {
            $safeEnvironment[$_] = $originalEnvironment[$_]
        }
    }

    $trustedPathEntries = @(
        (Split-Path -Parent $nodeExecutable),
        (Split-Path -Parent $gitExecutable)
    ) + $pythonDirectories + @($systemDirectory, $windowsDirectory)
    $safeEnvironment["Path"] = (
        $trustedPathEntries |
        Where-Object { $_ } |
        Select-Object -Unique
    ) -join [System.IO.Path]::PathSeparator
    $safeEnvironment["ComSpec"] = Join-Path $systemDirectory "cmd.exe"
    $safeEnvironment["HOME"] = $launcherHome
    $safeEnvironment["USERPROFILE"] = $launcherHome
    $safeEnvironment["TEMP"] = [System.IO.Path]::GetTempPath().TrimEnd("\")
    $safeEnvironment["TMP"] = $safeEnvironment["TEMP"]
    $safeEnvironment["RELEASE_TRUSTED_POWERSHELL"] = "1"
    $safeEnvironment["RELEASE_TRUSTED_LAUNCHER_HOME"] = $launcherHome
    $safeEnvironment["RELEASE_GIT_EXECUTABLE"] = $gitExecutable
    $safeEnvironment["RELEASE_NPM_USER_CONFIG"] = $npmUserConfig
    $safeEnvironment["RELEASE_NPM_GLOBAL_CONFIG"] = $npmGlobalConfig

    Get-ChildItem Env: | ForEach-Object {
        Remove-Item -LiteralPath ("Env:" + $_.Name)
    }
    foreach ($entry in $safeEnvironment.GetEnumerator()) {
        Set-Item -LiteralPath ("Env:" + $entry.Key) -Value ([string]$entry.Value)
    }

    $nodeArguments = @(
        (Join-Path $scriptRoot "release-formal-gate.mjs"),
        ("--env-file=" + $EnvFile)
    )
    if ($ReportPath) {
        $nodeArguments += "--report-path=$ReportPath"
    }

    Push-Location $repoRoot
    try {
        & $nodeExecutable @nodeArguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}
finally {
    Get-ChildItem Env: | ForEach-Object {
        Remove-Item -LiteralPath ("Env:" + $_.Name)
    }
    foreach ($entry in $originalEnvironment.GetEnumerator()) {
        Set-Item -LiteralPath ("Env:" + $entry.Key) -Value ([string]$entry.Value)
    }
    if (
        $launcherHome.StartsWith(
            [System.IO.Path]::GetTempPath(),
            [System.StringComparison]::OrdinalIgnoreCase
        )
    ) {
        Remove-Item -LiteralPath $launcherHome -Recurse -Force -ErrorAction SilentlyContinue
    }
}

exit $exitCode
