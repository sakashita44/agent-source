[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'clear-curated-skill-python-cache.ps1')

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
    $candidateNames = @('rulesync.cmd', 'rulesync.exe', 'rulesync.ps1', 'rulesync')
    foreach ($candidateName in $candidateNames) {
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

function Get-TargetHome {
    $candidate = $env:HOME
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        $candidate = $env:USERPROFILE
    }
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        throw 'Neither HOME nor USERPROFILE identifies the target home.'
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
        throw "Target home does not exist: $candidate"
    }

    return (Resolve-Path -LiteralPath $candidate).ProviderPath
}

function Copy-HookScripts {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$TargetHome
    )

    $source = Join-Path $RepositoryRoot 'hooks'
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        return
    }

    # Rulesync は hook の設定ファイルだけを配り、コマンドが指すスクリプトを運ばない。
    $destination = Join-Path $TargetHome '.local/agent-source/hooks'
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -Path (Join-Path $source '*.mjs') -Destination $destination -Force
    Write-Host "Hook scripts copied to: $destination"
}

Assert-CommandExists -Name 'node'
$rulesyncCommand = Resolve-RulesyncCommand -RepositoryRoot $repoRoot
Set-Location -LiteralPath $repoRoot
Clear-CuratedSkillPythonCache -CuratedRoot (Join-Path $repoRoot '.rulesync\skills\.curated')

if ($DryRun) {
    Write-Host 'Running Rulesync dry-run. The target home will not be modified.'
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('doctor', '--strict')
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--dry-run')
    Write-Host 'Dry-run completed.'
    exit 0
}

Invoke-Rulesync -Command $rulesyncCommand -Arguments @('doctor', '--strict')
Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--dry-run')

# --delete は付けない。生成元にない Skill を、アプリが同期した ~/.claude/skills/synced/ や
# デスクトップアプリの定期タスク（~/.claude/scheduled-tasks/）まで含めて削除するため。
Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global')
Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--check')
Copy-HookScripts -RepositoryRoot $repoRoot -TargetHome (Get-TargetHome)

Write-Host 'Apply completed.'
