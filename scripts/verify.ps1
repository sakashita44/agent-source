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
    foreach ($candidateName in @('rulesync.cmd', 'rulesync.exe', 'rulesync.ps1', 'rulesync')) {
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

function Assert-NoNestedReparsePoint {
    param([Parameter(Mandatory = $true)][string]$Directory)

    $reparsePoint = Get-ChildItem -LiteralPath $Directory -Recurse -Force |
        Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint } |
        Select-Object -First 1
    if ($reparsePoint) {
        throw "検証用ホーム内の再解析ポイントを拒否した: $($reparsePoint.FullName)"
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
    throw "一時ディレクトリが再解析ポイントであるため拒否した: $resolvedTemporaryRoot"
}

$testHome = Join-Path $resolvedTemporaryRoot 'home'
Assert-DescendantPath -ParentPath $resolvedTemporaryRoot -ChildPath $testHome
if (Test-Path -LiteralPath $testHome) {
    $resolvedTestHome = (Resolve-Path -LiteralPath $testHome).ProviderPath
    Assert-DescendantPath -ParentPath $resolvedTemporaryRoot -ChildPath $resolvedTestHome
    if ((Get-Item -LiteralPath $resolvedTestHome).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "検証用ホームが再解析ポイントであるため削除を拒否した: $resolvedTestHome"
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

    $content = Get-Content -LiteralPath $claudeConfig -Raw | ConvertFrom-Json
    if ($content.dummyKey -ne 'this-should-survive') {
        throw '非破壊性検証に失敗した。.claude.json の dummyKey が削除または変更された。'
    }
} finally {
    $env:HOME = $previousHome
    $env:USERPROFILE = $previousUserProfile
}

Write-Host "検証が完了した。一時ホーム: $testHome"
