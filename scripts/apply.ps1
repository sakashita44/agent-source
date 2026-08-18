$ErrorActionPreference = 'Stop'

# Load Node environment
. D:\UserData\Workspace\tools\Set-Env.ps1

$repoRoot = "D:\UserData\Workspace\repos\agent-source"
Set-Location $repoRoot

Write-Host "Running rulesync doctor --strict..."
npx --yes rulesync doctor --strict

Write-Host "Running rulesync generate --global --dry-run..."
npx --yes rulesync generate --global --dry-run

Write-Host "Applying global changes..."
npx --yes rulesync generate --global

Write-Host "Verifying completeness..."
npx --yes rulesync generate --global --check

Write-Host "Apply completed successfully."
