[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Assert-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "必要なコマンド '$Name' が見つからない。インストールまたは更新は自動実行しない。"
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

    throw '既存の Rulesync 実行ファイルが PATH または node_modules/.bin に見つからない。Rulesync の取得や更新は自動実行しない。'
}

function Invoke-Rulesync {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Rulesync が終了コード $LASTEXITCODE を返した: $($Arguments -join ' ')"
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
        throw "安全境界外のパスを拒否した: $childFullPath"
    }
}

function Assert-NoReparsePointInPath {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )

    $rootFullPath = [System.IO.Path]::GetFullPath($RootPath).TrimEnd('\', '/')
    $currentPath = [System.IO.Path]::GetFullPath($TargetPath).TrimEnd('\', '/')
    Assert-DescendantPath -ParentPath $rootFullPath -ChildPath $currentPath

    while ($currentPath.Length -gt $rootFullPath.Length) {
        if (Test-Path -LiteralPath $currentPath) {
            $item = Get-Item -LiteralPath $currentPath -Force
            if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                throw "再解析ポイントを含むパスを拒否した: $currentPath"
            }
        }
        $currentPath = Split-Path -Parent $currentPath
    }
}

function Assert-NoNestedReparsePoint {
    param([Parameter(Mandatory = $true)][string]$Directory)

    $reparsePoint = Get-ChildItem -LiteralPath $Directory -Recurse -Force |
        Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint } |
        Select-Object -First 1
    if ($reparsePoint) {
        throw "削除対象内の再解析ポイントを拒否した: $($reparsePoint.FullName)"
    }
}

function Get-RelativePathWithin {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$FullPath
    )

    $baseFullPath = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\', '/')
    $itemFullPath = [System.IO.Path]::GetFullPath($FullPath)
    Assert-DescendantPath -ParentPath $baseFullPath -ChildPath $itemFullPath
    return $itemFullPath.Substring($baseFullPath.Length).TrimStart('\', '/')
}

function Get-FileManifest {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string[]]$Directories
    )

    $entries = @()
    foreach ($directory in $Directories) {
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
            continue
        }

        foreach ($file in Get-ChildItem -LiteralPath $directory -Recurse -File | Sort-Object FullName) {
            $relativePath = Get-RelativePathWithin -BasePath $BasePath -FullPath $file.FullName
            $entries += "$relativePath`t$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)"
        }
    }

    return @($entries | Sort-Object)
}

function Get-TargetHome {
    $candidate = $env:HOME
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        $candidate = $env:USERPROFILE
    }
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        throw 'HOME と USERPROFILE のどちらからも対象ホームを解決できない。'
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
        throw "対象ホームが存在しない: $candidate"
    }

    return (Resolve-Path -LiteralPath $candidate).ProviderPath
}

function Get-SafeTemporaryRoot {
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $temporaryRoot = Join-Path $RepositoryRoot 'tmp'
    New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
    $resolvedTemporaryRoot = (Resolve-Path -LiteralPath $temporaryRoot).ProviderPath
    Assert-DescendantPath -ParentPath $RepositoryRoot -ChildPath $resolvedTemporaryRoot
    if ((Get-Item -LiteralPath $resolvedTemporaryRoot).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "一時ディレクトリが再解析ポイントであるため拒否した: $resolvedTemporaryRoot"
    }

    return $resolvedTemporaryRoot
}

function Get-LegacySkillDirectories {
    param([Parameter(Mandatory = $true)][string]$TargetHome)

    $skillRoots = @(
        '.claude\skills',
        '.agents\skills',
        '.gemini\config\skills',
        '.gemini\antigravity-cli\skills'
    )
    $legacySkillNames = @(
        'commit',
        'deep-research',
        'grill-me',
        'implement',
        'plan',
        'pr-merge',
        'release',
        'research',
        'verify-code',
        'verify-docs',
        'verify-manual',
        'write-docs'
    )

    $directories = @()
    foreach ($skillRootRelativePath in $skillRoots) {
        $skillRoot = Join-Path $TargetHome $skillRootRelativePath
        foreach ($skillName in $legacySkillNames) {
            $skillDirectory = Join-Path $skillRoot $skillName
            if (-not (Test-Path -LiteralPath $skillDirectory -PathType Container)) {
                continue
            }

            $resolvedSkillDirectory = (Resolve-Path -LiteralPath $skillDirectory).ProviderPath
            Assert-DescendantPath -ParentPath $skillRoot -ChildPath $resolvedSkillDirectory
            Assert-DescendantPath -ParentPath $TargetHome -ChildPath $resolvedSkillDirectory
            Assert-NoReparsePointInPath -RootPath $TargetHome -TargetPath $resolvedSkillDirectory
            if ((Split-Path -Leaf $resolvedSkillDirectory) -ne $skillName) {
                throw "削除候補名が一致しない: $resolvedSkillDirectory"
            }
            Assert-NoNestedReparsePoint -Directory $resolvedSkillDirectory

            $directories += $resolvedSkillDirectory
        }
    }

    return @($directories)
}

function Backup-LegacySkills {
    param(
        [Parameter(Mandatory = $true)][string]$TargetHome,
        [Parameter(Mandatory = $true)][string[]]$SkillDirectories,
        [Parameter(Mandatory = $true)][string]$BackupRoot
    )

    New-Item -ItemType Directory -Path $BackupRoot | Out-Null
    foreach ($skillDirectory in $SkillDirectories) {
        $relativeDirectory = Get-RelativePathWithin -BasePath $TargetHome -FullPath $skillDirectory
        $backupDirectory = Join-Path $BackupRoot $relativeDirectory
        New-Item -ItemType Directory -Path (Split-Path -Parent $backupDirectory) -Force | Out-Null
        Copy-Item -LiteralPath $skillDirectory -Destination $backupDirectory -Recurse
    }

    [string[]]$sourceManifest = @(Get-FileManifest -BasePath $TargetHome -Directories $SkillDirectories)
    [string[]]$backupManifest = @(Get-FileManifest -BasePath $BackupRoot -Directories @($BackupRoot))
    if ($sourceManifest.Count -ne $backupManifest.Count) {
        throw "バックアップのファイル数が一致しない。source=$($sourceManifest.Count), backup=$($backupManifest.Count)"
    }

    if ($sourceManifest.Count -gt 0) {
        $difference = Compare-Object -ReferenceObject $sourceManifest -DifferenceObject $backupManifest
        if ($difference) {
            throw 'バックアップの相対パスまたは SHA-256 が一致しない。旧 Skill は削除しない。'
        }
    }
}

Assert-CommandExists -Name 'node'
$rulesyncCommand = Resolve-RulesyncCommand -RepositoryRoot $repoRoot
Set-Location -LiteralPath $repoRoot

if ($DryRun) {
    Write-Host 'ホームを変更せず Rulesync の dry-run を実行する。'
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('doctor', '--strict')
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--dry-run')
    Write-Host 'Dry-run が完了した。'
    exit 0
}

Invoke-Rulesync -Command $rulesyncCommand -Arguments @('doctor', '--strict')
Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--dry-run')

$targetHome = Get-TargetHome
$temporaryRoot = Get-SafeTemporaryRoot -RepositoryRoot $repoRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $temporaryRoot "backups\$timestamp-pre-rulesync-apply"
Assert-DescendantPath -ParentPath $temporaryRoot -ChildPath $backupRoot
$legacySkillDirectories = @(Get-LegacySkillDirectories -TargetHome $targetHome)

if ($legacySkillDirectories.Count -gt 0) {
    Write-Host "旧 Skill をバックアップする: $backupRoot"
    Backup-LegacySkills -TargetHome $targetHome -SkillDirectories $legacySkillDirectories -BackupRoot $backupRoot

} else {
    Write-Host '削除対象の旧 Skill は存在しない。'
}

try {
    foreach ($skillDirectory in $legacySkillDirectories) {
        Write-Host "検証済みの旧 Skill を削除する: $skillDirectory"
        Remove-Item -LiteralPath $skillDirectory -Recurse -Force
    }

    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global')
    Invoke-Rulesync -Command $rulesyncCommand -Arguments @('generate', '--global', '--check')
} catch {
    if ($legacySkillDirectories.Count -gt 0) {
        throw "Rulesync の適用に失敗した。旧 Skill のバックアップを元の相対パスへ再配置して復旧すること。backup=$backupRoot; error=$_"
    }
    throw
}

if ($legacySkillDirectories.Count -gt 0) {
    Write-Host "適用が完了した。バックアップ: $backupRoot"
} else {
    Write-Host '適用が完了した。'
}
