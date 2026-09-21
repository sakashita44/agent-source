$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Assert-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found. This script does not install or update dependencies."
    }
}

function Resolve-RulesyncCommand {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $pathCommand = Get-Command rulesync -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($pathCommand) {
        return $pathCommand.Source
    }

    $binDirectory = Join-Path $RepositoryRoot 'node_modules\.bin'
    foreach ($candidateName in @('rulesync.cmd', 'rulesync.exe', 'rulesync.ps1', 'rulesync')) {
        $candidate = Join-Path $binDirectory $candidateName
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).ProviderPath
        }
    }

    throw 'No Rulesync executable was found on PATH or in node_modules/.bin. This script does not install or update Rulesync.'
}

function Invoke-Rulesync {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Rulesync exited with code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
}

function Assert-DescendantPath {
    param(
        [Parameter(Mandatory = $true)][string]$ParentPath,
        [Parameter(Mandatory = $true)][string]$ChildPath
    )

    $parentFullPath = [System.IO.Path]::GetFullPath($ParentPath).TrimEnd('\', '/')
    $childFullPath = [System.IO.Path]::GetFullPath($ChildPath).TrimEnd('\', '/')
    $prefix = $parentFullPath + [System.IO.Path]::DirectorySeparatorChar
    if (-not $childFullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the allowed root: $childFullPath"
    }
}

function Assert-NoNestedReparsePoint {
    param([Parameter(Mandatory = $true)][string]$Directory)

    $reparsePoint = Get-ChildItem -LiteralPath $Directory -Recurse -Force |
        Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint } |
        Select-Object -First 1
    if ($reparsePoint) {
        throw "Test home contains a reparse point: $($reparsePoint.FullName)"
    }
}

function Get-GeneratedHookCommands {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Generated hook configuration was not found: $Path"
    }

    $hooks = (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json).hooks
    $commands = @{}
    foreach ($eventProperty in $hooks.PSObject.Properties) {
        foreach ($group in $eventProperty.Value) {
            foreach ($hook in $group.hooks) {
                $commands[$eventProperty.Name] = $hook
            }
        }
    }
    return $commands
}

function Assert-CompactHookCommands {
    param([Parameter(Mandatory = $true)][string]$TestHome)

    $modes = @{ PreCompact = 'save'; PostCompact = 'mark'; SessionStart = 'restore'; UserPromptSubmit = 'inject' }

    # Codex は Windows で hook を PowerShell 経由で実行し、`~` を展開しないため、Windows 専用コマンドの併記を検査する。
    $codexHooks = Get-GeneratedHookCommands -Path (Join-Path $TestHome '.codex/hooks.json')
    foreach ($eventName in $modes.Keys) {
        $mode = $modes[$eventName]
        $hook = $codexHooks[$eventName]
        if (-not $hook) {
            throw "Codex hook is missing: $eventName"
        }
        $expectedCommand = "node ~/.agent-source/hooks/compact-hook.mjs $mode"
        if ($hook.command -ne $expectedCommand) {
            throw "Codex $eventName command changed: $($hook.command)"
        }
        $expectedWindowsCommand = "node `"`$env:USERPROFILE\.agent-source\hooks\compact-hook.mjs`" $mode"
        if (-not $hook.PSObject.Properties['commandWindows'] -or $hook.commandWindows -ne $expectedWindowsCommand) {
            throw "Codex $eventName commandWindows is missing or unexpected."
        }
    }

    # Claude Code は自身が解決する shell で実行するため、Codex 専用フィールドが含まれないことを検査する。
    $claudeHooks = Get-GeneratedHookCommands -Path (Join-Path $TestHome '.claude/settings.json')
    foreach ($eventName in $modes.Keys) {
        $hook = $claudeHooks[$eventName]
        if (-not $hook) {
            throw "Claude Code hook is missing: $eventName"
        }
        if ($hook.PSObject.Properties['commandWindows']) {
            throw "Claude Code $eventName hook contains the Codex-only commandWindows field."
        }
    }
}

Assert-CommandExists -Name 'node'
$rulesyncCommand = Resolve-RulesyncCommand -RepositoryRoot $repoRoot
Set-Location -LiteralPath $repoRoot

$temporaryRoot = Join-Path $repoRoot 'tmp'
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
$resolvedTemporaryRoot = (Resolve-Path -LiteralPath $temporaryRoot).ProviderPath
Assert-DescendantPath -ParentPath $repoRoot -ChildPath $resolvedTemporaryRoot
if ((Get-Item -LiteralPath $resolvedTemporaryRoot).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw "Temporary directory is a reparse point: $resolvedTemporaryRoot"
}

$testHome = Join-Path $resolvedTemporaryRoot 'home'
Assert-DescendantPath -ParentPath $resolvedTemporaryRoot -ChildPath $testHome
if (Test-Path -LiteralPath $testHome) {
    $resolvedTestHome = (Resolve-Path -LiteralPath $testHome).ProviderPath
    Assert-DescendantPath -ParentPath $resolvedTemporaryRoot -ChildPath $resolvedTestHome
    if ((Get-Item -LiteralPath $resolvedTestHome).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Refusing to remove the test home because it is a reparse point: $resolvedTestHome"
    }
    Assert-NoNestedReparsePoint -Directory $resolvedTestHome
    Remove-Item -LiteralPath $resolvedTestHome -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $testHome '.claude') -Force | Out-Null
$claudeConfig = Join-Path $testHome '.claude.json'
'{ "mcpServers": {}, "dummyKey": "this-should-survive" }' |
    Set-Content -LiteralPath $claudeConfig -Encoding UTF8

$previousHome = $env:HOME
$previousUserProfile = $env:USERPROFILE
try {
    $env:HOME = $testHome
    $env:USERPROFILE = $testHome

    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('doctor', '--strict')
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--dry-run')
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global')
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--check')
    Assert-CompactHookCommands -TestHome $testHome

    # Rulesync は hook の設定ファイルだけを配るため、スクリプトの配置は apply.ps1 と同じ手順で確かめる。
    $hookSource = Join-Path $repoRoot 'hooks'
    if (Test-Path -LiteralPath $hookSource -PathType Container) {
        $hookDestination = Join-Path $testHome '.agent-source/hooks'
        New-Item -ItemType Directory -Path $hookDestination -Force | Out-Null
        Copy-Item -Path (Join-Path $hookSource '*.mjs') -Destination $hookDestination -Force
        if (-not (Test-Path -LiteralPath (Join-Path $hookDestination 'compact-hook.mjs') -PathType Leaf)) {
            throw 'Hook scripts were not placed in the test home.'
        }
    }
    $content = Get-Content -LiteralPath $claudeConfig -Raw | ConvertFrom-Json
    if ($content.dummyKey -ne 'this-should-survive') {
        throw 'Non-destructive configuration check failed: dummyKey was removed or changed in .claude.json.'
    }
} finally {
    $env:HOME = $previousHome
    $env:USERPROFILE = $previousUserProfile
}

Write-Host "Verification completed. Test home: $testHome"
