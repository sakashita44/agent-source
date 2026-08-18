$ErrorActionPreference = 'Stop'

# Load Node environment
. D:\UserData\Workspace\tools\Set-Env.ps1

$repoRoot = "D:\UserData\Workspace\repos\agent-source"
Set-Location $repoRoot

$testHome = Join-Path $repoRoot "tmp\userdir"
if (Test-Path $testHome) {
    Remove-Item -Recurse -Force $testHome
}
New-Item -ItemType Directory -Force $testHome | Out-Null
New-Item -ItemType Directory -Force (Join-Path $testHome ".claude") | Out-Null

# Create a mock .claude.json with a dummy key
$claudeConfig = "$testHome\.claude.json"
'{ "mcpServers": {}, "dummyKey": "this-should-survive" }' | Set-Content $claudeConfig

Write-Host "Setting temporary home directory to $testHome"
$env:HOME = $testHome
$env:USERPROFILE = $testHome

Write-Host "Running rulesync generate into temporary home..."
npx --yes rulesync generate --global

Write-Host "Checking if dummy key survived in .claude.json..."
$content = Get-Content $claudeConfig -Raw | ConvertFrom-Json
if (-not $content.dummyKey -or $content.dummyKey -ne "this-should-survive") {
    Write-Error "Reconcile Non-destruction Test FAILED: dummyKey was removed or altered."
} else {
    Write-Host "PASS: dummyKey survived."
}

Write-Host "Verification script completed successfully."
