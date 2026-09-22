function Clear-CuratedSkillPythonCache {
    param([Parameter(Mandatory = $true)][string]$CuratedRoot)

    $root = [System.IO.Path]::GetFullPath($CuratedRoot).TrimEnd('\', '/')
    if (-not (Test-Path -LiteralPath $root)) {
        return
    }
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        throw "Curated Skill root is not a directory: $root"
    }
    if ((Get-Item -LiteralPath $root -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Curated Skill root is a reparse point: $root"
    }

    $prefix = $root + [System.IO.Path]::DirectorySeparatorChar
    $targets = @(Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object {
        ($_.PSIsContainer -and $_.Name -eq '__pycache__') -or
        (-not $_.PSIsContainer -and $_.Extension -in @('.pyc', '.pyo'))
    })
    foreach ($target in $targets) {
        $path = [System.IO.Path]::GetFullPath($target.FullName)
        if (-not $path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Python cache path is outside the curated Skill root: $path"
        }
        if ($target.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "Python cache deletion target is a reparse point: $path"
        }
    }

    foreach ($target in $targets | Sort-Object { $_.FullName.Length } -Descending) {
        Write-Host "Removing transient Python cache: $($target.FullName)"
        Remove-Item -LiteralPath $target.FullName -Recurse:$target.PSIsContainer -Force
    }
}
